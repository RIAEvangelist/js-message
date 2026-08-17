import VanillaTest from 'vanilla-test';
import Message, { Message as NamedMessage } from '../index.js';
import LegacyPathMessage from '../Message.js';
import '../js-message-vanilla.js';
import { suites } from './suites/index.js';

const requested = process.argv[2];
const suite = suites.find(({ id }) => id === requested);

if (!suite) {
    throw new TypeError(`Expected one suite name: ${suites.map(({ id }) => id).join(', ')}.`);
}

const context = Object.freeze({
    GlobalMessage: globalThis.Message,
    LegacyPathMessage,
    Message,
    NamedMessage
});
const test = new VanillaTest();

for (const current of suite.cases) {
    const description = `${suite.name} · ${current.id} · ${current.description}`;
    test.expects(description);

    try {
        await current.run(context);
        test.pass();
    } catch (error) {
        console.error(`${description}:`, error);
        test.fail();
    }

    test.done();
}

const result = await test.report();
process.exitCode = result.ok ? 0 : 1;
