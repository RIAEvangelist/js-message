import VanillaTest from 'vanilla-test';
import BarePackageMessage, { Message as NamedMessage } from 'js-message';
import IndexMessage from 'js-message/index.js';
import LegacyPathMessage from 'js-message/Message.js';
import 'js-message/js-message-vanilla.js';
import { suites } from './suites/index.js';

const requested = process.argv[2];
const suite = suites.find(({ id }) => id === requested);

if (!suite) {
    throw new TypeError(`Expected one suite name: ${suites.map(({ id }) => id).join(', ')}.`);
}

const context = Object.freeze({
    BarePackageMessage,
    GlobalMessage: globalThis.Message,
    IndexMessage,
    LegacyPathMessage,
    Message: BarePackageMessage,
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
