import VanillaTest from 'vanilla-test';
import Message, { Message as NamedMessage } from '../index.js';
import LegacyPathMessage from '../Message.js';
import '../js-message-vanilla.js';
import {
    catalog,
    suites
} from './suites/index.js';

const context = Object.freeze({
    GlobalMessage: globalThis.Message,
    LegacyPathMessage,
    Message,
    NamedMessage
});

export default async function run() {
    const test = new VanillaTest();
    const seen = new Set();

    async function check(description, callback) {
        test.expects(description);

        try {
            await callback();
            test.pass();
        } catch (error) {
            console.error(`${description}:`, error);
            test.fail();
        }

        test.done();
    }

    for (const suite of suites) {
        for (const current of suite.cases) {
            if (seen.has(current.id)) {
                throw new Error(`Duplicate test case ID: ${current.id}`);
            }

            seen.add(current.id);
            await check(`${suite.name} · ${current.id} · ${current.description}`, () => current.run(context));
        }
    }

    const result = await test.report();

    return {
        ...result,
        suites: catalog
    };
}
