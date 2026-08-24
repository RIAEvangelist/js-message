import {
    assert,
    equal,
    testCase,
    testSuite
} from './helpers.js';
import recipeSources from '../../playground/recipes.js';

const READY_TIMEOUT = 5000;
const RUN_TIMEOUT = 5000;
let fixturePromise;

function waitFor(predicate, label, timeout = READY_TIMEOUT) {
    const started = Date.now();

    return new Promise((resolve, reject) => {
        function check() {
            try {
                const value = predicate();

                if (value) {
                    resolve(value);
                    return;
                }
            } catch (error) {
                reject(error);
                return;
            }

            if (Date.now() - started >= timeout) {
                reject(new Error(`Timed out waiting for ${label}.`));
                return;
            }

            globalThis.setTimeout(check, 20);
        }

        check();
    });
}

async function createFixture() {
    const iframe = document.createElement('iframe');
    iframe.title = 'js-message playground Chrome integration fixture';
    iframe.sandbox = 'allow-scripts allow-same-origin';
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:800px;border:0;';
    document.body.append(iframe);

    let nativeImportProbe;
    let readyOrigin;
    const ready = new Promise((resolve) => {
        function onMessage(event) {
            if (event.source !== iframe.contentWindow
                || event.data?.type !== 'js-message:ready') {
                return;
            }

            globalThis.removeEventListener('message', onMessage);
            nativeImportProbe = event.data.nativeImportProbe;
            readyOrigin = event.origin;
            resolve();
        }

        globalThis.addEventListener('message', onMessage);
    });

    iframe.src = '/playground/frame.html';
    await Promise.race([
        ready,
        new Promise((resolve, reject) => {
            globalThis.setTimeout(() => reject(new Error('Timed out waiting for the playground ready handshake.')), READY_TIMEOUT);
        })
    ]);

    const frameDocument = iframe.contentDocument;
    assert(frameDocument, 'Expected a same-origin playground frame document.');

    const fixture = {
        dispose() {
            iframe.remove();
        },
        iframe,
        nativeImportProbe,
        output: frameDocument.querySelector('#output'),
        readyOrigin,
        reset: frameDocument.querySelector('#reset'),
        run: frameDocument.querySelector('#run'),
        source: frameDocument.querySelector('#source'),
        status: frameDocument.querySelector('#run-status')
    };

    for (const [name, element] of Object.entries(fixture)) {
        if (name !== 'dispose' && name !== 'iframe' && name !== 'nativeImportProbe' && name !== 'readyOrigin') {
            assert(element, `Expected the playground ${name} control.`);
        }
    }

    return fixture;
}

function getFixture() {
    fixturePromise ??= createFixture();
    return fixturePromise;
}

async function loadSource(fixture, source) {
    fixture.iframe.contentWindow.postMessage({
        source,
        type: 'js-message:load'
    }, location.origin);

    await waitFor(
        () => fixture.status.textContent === 'Example loaded' && fixture.source.value === source,
        'the same-origin source load handshake'
    );
}

async function runSource(fixture, source, expectedStatus, timeout = RUN_TIMEOUT) {
    fixture.source.value = source;
    fixture.run.click();

    equal(fixture.status.textContent, 'Running', 'Expected the Run control to start the module Worker.');

    await waitFor(
        () => fixture.status.textContent !== 'Running',
        'a terminal playground status',
        timeout
    );

    const lines = [...fixture.output.children].map((item) => item.textContent);

    if (fixture.status.textContent !== expectedStatus) {
        throw new Error(`Expected playground status ${JSON.stringify(expectedStatus)}, received ${JSON.stringify(fixture.status.textContent)} with output ${JSON.stringify(lines)}.`);
    }

    return lines;
}

function disposeFixture() {
    if (!fixturePromise) {
        return;
    }

    fixturePromise.then((fixture) => fixture.dispose()).catch(() => {});
    fixturePromise = undefined;
}

const cases = [
    testCase('INT-BROWSER-01', 'the playground completes its same-origin ready and load handshake', async ({ BrowserTestMessage }) => {
        const fixture = await getFixture();
        const loadedSource = "console.log('origin handshake');";
        const testPageProbe = new BrowserTestMessage({
            type: 'test-page.native-import',
            data: { ok: true }
        });

        equal(testPageProbe.JSON, '{"type":"test-page.native-import","data":{"ok":true}}');
        equal(fixture.readyOrigin, location.origin);
        equal(fixture.nativeImportProbe, '{"type":"playground.native-import","data":{"ok":true}}');
        await loadSource(fixture, loadedSource);
        equal(fixture.source.value, loadedSource);
    }),
    testCase('INT-BROWSER-02', 'the default playground module completes with visible round-trip output', async () => {
        const fixture = await getFixture();
        fixture.reset.click();
        const lines = await runSource(fixture, fixture.source.value, 'Completed');

        assert(lines.some((line) => line.startsWith('object ')), 'Expected the default object output.');
        assert(lines.some((line) => line.startsWith('wire ')), 'Expected the default wire output.');
        assert(lines.some((line) => line.startsWith('received ')), 'Expected the default received output.');
        equal(lines.at(-1), 'Module completed');
    }),
    testCase('INT-BROWSER-03', 'a snippet cannot spoof runner messages through the Worker global channel', async () => {
        const fixture = await getFixture();
        const lines = await runSource(fixture, `globalThis.postMessage({
    type: 'failure',
    text: 'spoofed failure'
});
console.log('trusted output');`, 'Completed');

        assert(lines.includes('trusted output'), 'Expected output sent over the private runner channel.');
        assert(!lines.some((line) => line.includes('spoofed failure')), 'A global Worker message spoofed the runner protocol.');
        equal(lines.at(-1), 'Module completed');
    }),
    testCase('INT-BROWSER-04', 'revoked Proxy logging is contained and later console output survives', async () => {
        const fixture = await getFixture();
        const lines = await runSource(fixture, `const revoked = Proxy.revocable({}, {});
revoked.revoke();
console.log(revoked.proxy);
console.log('after revoked proxy');`, 'Completed');

        assert(lines.includes('after revoked proxy'), 'Expected logging to continue after the revoked Proxy value.');
        equal(lines.at(-1), 'Module completed');
    }),
    testCase('INT-BROWSER-05', 'an infinite module is terminated at the playground run limit', async () => {
        const fixture = await getFixture();
        const lines = await runSource(
            fixture,
            'for (;;) {}',
            'Stopped after 3 seconds',
            RUN_TIMEOUT
        );

        assert(lines.some((line) => line.includes('3 second limit')), 'Expected the trusted run-limit warning.');
    }),
    testCase('INT-BROWSER-06', 'excess console lines terminate the module at the output limit', async () => {
        const fixture = await getFixture();
        const lines = await runSource(fixture, `for (let index = 0; index < 101; index += 1) {
    console.log('line', index);
}`, 'Output limit reached');

        assert(lines.length <= 101, 'The runner rendered more than its bounded output plus one trusted notice.');
    }),
    testCase('INT-BROWSER-07', 'loading source during a run restores the editor controls', async () => {
        const fixture = await getFixture();
        fixture.source.value = 'for (;;) {}';
        fixture.run.click();
        equal(fixture.status.textContent, 'Running');

        await loadSource(fixture, "console.log('replacement source');");
        equal(fixture.run.disabled, false);
        equal(fixture.run.textContent, 'Run Ctrl/⌘↵');
    }),
    testCase('INT-BROWSER-08', 'the editor does not cancel keyboard exit commands', async () => {
        const fixture = await getFixture();
        fixture.source.focus();
        const shiftTabAllowed = fixture.source.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Tab',
            shiftKey: true
        }));
        fixture.source.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Escape'
        }));
        const escapeTabAllowed = fixture.source.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Tab'
        }));

        assert(shiftTabAllowed, 'Shift+Tab was canceled by the source editor.');
        assert(escapeTabAllowed, 'Esc then Tab was canceled by the source editor.');
    }),
    testCase('INT-BROWSER-09', 'large primitive console strings are bounded before rendering', async () => {
        const fixture = await getFixture();
        const lines = await runSource(fixture, `console.log('x'.repeat(1_000_000));
console.log('after large output');`, 'Completed');

        equal(lines[0].length, 8192);
        assert(lines[0].endsWith('…'), 'Expected a truncation marker on the bounded line.');
        assert(lines.includes('after large output'), 'Expected the module to continue after bounded output.');
    }),
    testCase('INT-BROWSER-10', 'undefined custom JSON output fails promptly with a readable value', async () => {
        try {
            const fixture = await getFixture();
            const lines = await runSource(fixture, `throw {
    toJSON() {
        return undefined;
    }
};`, 'Failed');

            assert(lines.includes('[Unserializable value]'), 'Expected a readable failure value instead of a timeout.');
        } finally {
            disposeFixture();
        }
    }),
    testCase('INT-BROWSER-11', 'a focused recipe opens its exact source in the live workbench', async () => {
        const page = document.createElement('iframe');
        page.title = 'js-message selected recipe integration fixture';
        page.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:800px;border:0;';
        document.body.append(page);

        try {
            page.src = '/playground/?recipe=recovery#workbench';
            const frame = await waitFor(
                () => page.contentDocument?.querySelector('#playground-frame'),
                'the selected recipe playground frame'
            );
            const frameDocument = await waitFor(
                () => frame.contentDocument?.querySelector('#source')?.value === recipeSources.recovery && frame.contentDocument,
                'the selected recipe source handoff'
            );

            equal(frameDocument.querySelector('#source').value, recipeSources.recovery);
            equal(frameDocument.querySelector('#run-status').textContent, 'Example loaded');
        } finally {
            page.remove();
        }
    }),
    testCase('INT-BROWSER-12', 'the recovery recipe executes malformed JSON as a successful error envelope', async () => {
        const page = document.createElement('iframe');
        page.title = 'js-message recovery recipe execution fixture';
        page.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:800px;border:0;';
        document.body.append(page);

        try {
            page.src = '/playground/?recipe=recovery#workbench';
            const frame = await waitFor(
                () => page.contentDocument?.querySelector('#playground-frame'),
                'the recovery recipe playground frame'
            );
            const frameDocument = await waitFor(
                () => frame.contentDocument?.querySelector('#source')?.value === recipeSources.recovery && frame.contentDocument,
                'the recovery recipe source handoff',
                READY_TIMEOUT * 2
            );
            const lines = await runSource({
                output: frameDocument.querySelector('#output'),
                run: frameDocument.querySelector('#run'),
                source: frameDocument.querySelector('#source'),
                status: frameDocument.querySelector('#run-status')
            }, recipeSources.recovery, 'Completed', RUN_TIMEOUT * 2);
            const envelope = lines.find((line) => line.startsWith('envelope '));

            assert(lines.includes('type error'), 'Expected the malformed input to become an error message.');
            assert(lines.some((line) => line.startsWith('error SyntaxError:')), 'Expected the recovery payload to expose its SyntaxError.');
            assert(envelope, 'Expected the recovery recipe to print its serialized error envelope.');
            assert(envelope.includes('"type": "error"'), 'Expected the serialized envelope to preserve the error type.');
            assert(envelope.includes('"name": "SyntaxError"'), 'Expected the serialized envelope to preserve the error name.');
            assert(envelope.includes('"response": "{not valid json"'), 'Expected the serialized envelope to preserve the malformed response.');
            equal(lines.at(-1), 'Module completed');
        } finally {
            page.remove();
        }
    })
];

export default testSuite('integration-browser', 'Integration · Chrome playground', cases);
