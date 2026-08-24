import VanillaTest from 'vanilla-test';
import BrowserTestMessage from 'js-message';
import browserIntegration from './suites/integration-browser.js';

export default async function run() {
    const test = new VanillaTest();
    const seen = new Set();

    for (const current of browserIntegration.cases) {
        if (seen.has(current.id)) {
            throw new Error(`Duplicate test case ID: ${current.id}`);
        }

        seen.add(current.id);
        const description = `${browserIntegration.name} · ${current.id} · ${current.description}`;
        test.expects(description);

        try {
            await current.run(Object.freeze({ BrowserTestMessage }));
            test.pass();
        } catch (error) {
            console.error(`${description}:`, error);
            test.fail();
        }

        test.done();
    }

    const result = await test.report();

    return {
        ...result,
        suites: Object.freeze([
            Object.freeze({
                cases: Object.freeze(browserIntegration.cases.map(({ description, id }) => Object.freeze({
                    description,
                    id
                }))),
                id: browserIntegration.id,
                name: browserIntegration.name,
                total: browserIntegration.cases.length
            })
        ])
    };
}
