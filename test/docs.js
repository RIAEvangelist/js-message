import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import VanillaTest from 'vanilla-test';
import siteFiles from '../scripts/site-manifest.js';
import recipeSources from '../playground/recipes.js';
import integrationBrowser from './suites/integration-browser.js';
import { catalog } from './suites/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicPages = [
    'index.html',
    'guide/index.html',
    'api/index.html',
    'protocol/index.html',
    'browser/index.html',
    'examples/index.html',
    'playground/index.html',
    'playground/recipes/round-trip/index.html',
    'playground/recipes/recovery/index.html',
    'playground/recipes/boundary/index.html',
    'testing/index.html',
    'testing/unit/index.html',
    'testing/functional/index.html',
    'testing/integration/index.html',
    'testing/regression/index.html',
    'migration/index.html'
];

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function read(relativePath) {
    return readFileSync(join(root, relativePath), 'utf8');
}

function localTarget(page, reference) {
    const clean = reference.split('#')[0].split('?')[0];

    if (!clean || /^(?:[a-z]+:|\/\/)/i.test(clean)) {
        return null;
    }

    const target = resolve(dirname(join(root, page)), decodeURIComponent(clean));

    if (target !== root && !target.startsWith(`${root}${sep}`)) {
        throw new Error(`${page} contains a local reference outside the repository: ${reference}`);
    }

    return existsSync(target) && statSync(target).isDirectory() ? join(target, 'index.html') : target;
}

function collectSourceFiles(directory, files = []) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'coverage' || entry.name === '_site') {
            continue;
        }

        const absolute = join(directory, entry.name);

        if (entry.isDirectory()) {
            collectSourceFiles(absolute, files);
        } else {
            files.push(absolute);
        }
    }

    return files;
}

async function run() {
    const test = new VanillaTest();

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

    await check('all focused documentation pages exist', () => {
        for (const page of publicPages) {
            assert(existsSync(join(root, page)), `Missing documentation page: ${page}`);
        }
    });

    await check('every page has complete metadata and accessibility landmarks', () => {
        for (const page of publicPages) {
            const html = read(page);
            assert(html.includes('<html lang="en">'), `${page} is missing a language.`);
            assert(html.includes('name="description"'), `${page} is missing a description.`);
            assert(html.includes('property="og:title"'), `${page} is missing an Open Graph title.`);
            assert(html.includes('property="og:image"'), `${page} is missing an Open Graph image.`);
            assert(html.includes('property="og:image:alt"'), `${page} is missing Open Graph image alt text.`);
            assert(html.includes('name="twitter:card"'), `${page} is missing Twitter card metadata.`);
            assert(html.includes('name="twitter:image:alt"'), `${page} is missing Twitter image alt text.`);
            assert(html.includes('rel="canonical"'), `${page} is missing a canonical URL.`);
            assert(html.includes('class="skip-link"'), `${page} is missing a skip link.`);
            assert(html.includes('id="main-content"'), `${page} is missing the main target.`);
            assert(html.includes('aria-label="Primary navigation"'), `${page} is missing labeled navigation.`);
            assert((html.match(/aria-current="page"/g) ?? []).length === 1, `${page} needs one current nav item.`);
            assert(html.includes('>Playground</a>'), `${page} is missing Playground from primary navigation.`);
            assert(html.includes('>Migration</a>'), `${page} is missing Migration from primary navigation.`);
            assert(html.includes('assets/site.css'), `${page} is missing shared CSS.`);
            assert(html.includes('assets/site.js'), `${page} is missing shared JavaScript.`);
        }
    });

    await check('all local page links and assets resolve', () => {
        for (const page of publicPages) {
            const html = read(page);
            const documentMarkup = html.replace(/<pre[\s\S]*?<\/pre>/g, '');
            const references = documentMarkup.matchAll(/(?:href|src)="([^"]+)"/g);

            for (const match of references) {
                const target = localTarget(page, match[1]);

                if (target) {
                    assert(existsSync(target), `${page} links to missing ${match[1]}.`);
                }
            }
        }
    });

    await check('testing pages publish the complete nonduplicated suite catalog', () => {
        const overview = read('testing/index.html');
        const expectedTotals = {
            functional: 8,
            integration: 9,
            regression: 24,
            unit: 31
        };
        const allIds = catalog.flatMap((suite) => suite.cases.map((testCase) => testCase.id));
        const browserIds = integrationBrowser.cases.map((testCase) => testCase.id);

        assert(catalog.length === 4, 'Testing documentation requires four focused suites.');
        assert(new Set(allIds).size === allIds.length, 'A test ID appears in more than one suite.');
        assert(allIds.length === 72, `Expected 72 shared checks, found ${allIds.length}.`);
        assert(overview.includes('72 nonduplicated shared checks'), 'Testing overview is missing the shared check total.');

        for (const suite of catalog) {
            const expected = expectedTotals[suite.id];
            const pagePath = `testing/${suite.id}/index.html`;
            const page = read(pagePath);
            const documentedIds = page.match(/\b(?:UNIT|FUNC|INT|REG)-\d{2}\b/g) ?? [];
            const expectedIds = suite.cases.map((testCase) => testCase.id);

            assert(suite.total === expected, `${suite.name} catalog count changed from ${expected}.`);
            assert(overview.includes(`href="./${suite.id}/"`), `Testing overview does not link ${suite.name}.`);
            assert(overview.includes(`${suite.total} checks`), `Testing overview is missing the ${suite.name} count.`);
            assert(JSON.stringify(documentedIds) === JSON.stringify(expectedIds), `${pagePath} does not publish its exact ordered case catalog.`);
        }

        const integrationPage = read('testing/integration/index.html');
        const documentedBrowserIds = integrationPage.match(/\bINT-BROWSER-\d{2}\b/g) ?? [];
        assert(browserIds.length === 11, `Expected 11 Chrome-only checks, found ${browserIds.length}.`);
        assert(new Set([...allIds, ...browserIds]).size === allIds.length + browserIds.length, 'A Chrome-only ID duplicates a shared suite ID.');
        assert(JSON.stringify(documentedBrowserIds) === JSON.stringify(browserIds), 'Integration documentation does not publish its exact ordered Chrome-only catalog.');
        assert(overview.includes('without inflating the shared count'), 'Testing overview does not distinguish Chrome-only checks from the shared total.');
    });

    await check('the API and protocol pages cover the complete public contract', () => {
        const api = read('api/index.html');
        const protocol = read('protocol/index.html');
        for (const term of ['new Message([input])', 'message.type', 'message.data', 'message.JSON', 'message.toJSON()', 'message.load(input)']) {
            assert(api.includes(term), `API page is missing ${term}.`);
        }
        for (const term of ['type', 'data', 'SyntaxError', 'TypeError', 'BigInt']) {
            assert(protocol.includes(term), `Protocol page is missing ${term}.`);
        }
    });

    await check('the playground shows editable code and isolates each run', () => {
        const page = read('playground/index.html');
        const frame = read('playground/frame.html');
        const runner = read('playground/runner.js');
        const runtime = read('playground/runtime.js');
        const siteScript = read('assets/site.js');

        assert(page.includes('id="playground-frame"'), 'Playground page is missing its live frame.');
        assert(page.includes('sandbox="allow-scripts allow-same-origin"'), 'Playground frame does not match the worker-compatible sandbox contract.');
        for (const recipe of ['./recipes/round-trip/', './recipes/recovery/', './recipes/boundary/']) {
            assert(page.includes(`href="${recipe}"`), `Playground is missing focused recipe ${recipe}.`);
        }
        for (const [recipe, source] of Object.entries(recipeSources)) {
            const recipePage = read(`playground/recipes/${recipe}/index.html`);
            const visibleSource = recipePage.match(/<div class="code-block"><pre><code>([\s\S]*?)<\/code><\/pre><\/div>/)?.[1].replace(/\r\n/g, '\n');
            assert(visibleSource === source, `${recipe} recipe page differs from its runnable source.`);
            assert(recipePage.includes(`href="../../?recipe=${recipe}#workbench"`), `${recipe} does not load itself in the live workbench.`);
        }
        for (const control of ['id="source"', 'id="run"', 'id="reset"', 'id="copy"', 'id="clear"', 'id="output"', 'id="run-status"']) {
            assert(frame.includes(control), `Playground frame is missing ${control}.`);
        }
        for (const policy of ["worker-src blob:", "connect-src 'none'", "object-src 'none'"]) {
            assert(frame.includes(policy), `Playground frame CSP is missing ${policy}.`);
        }
        assert(runner.includes('new Worker('), 'Playground does not isolate runs in a worker.');
        assert(runner.includes('new MessageChannel('), 'Playground output does not use a private worker channel.');
        assert(runner.includes('limits.runMilliseconds'), 'Playground does not enforce its run timeout.');
        assert(runner.includes('event.origin !== parentOrigin'), 'Playground accepts messages from a foreign embedding origin.');
        assert(!runner.includes("}, '*')"), 'Playground sends messages to an unrestricted parent origin.');
        assert(siteScript.includes("event.data.type === 'js-message:ready'"), 'Documentation does not wait for the playground before loading a recipe.');
        assert(siteScript.includes("playgroundFrame.addEventListener('load'"), 'Documentation does not recover when the playground ready signal arrives early.');
        assert(siteScript.includes("type: 'js-message:load'"), 'Documentation does not send selected recipe source to the playground.');
        assert(siteScript.includes('event.origin !== siteOrigin'), 'Documentation accepts playground messages from a foreign origin.');
        assert(!siteScript.includes("}, '*')"), 'Documentation sends playground messages to an unrestricted origin.');
        assert(frame.includes('role="log"'), 'Playground output is not exposed as an accessible live log.');
        assert(frame.includes('Package imports first'), 'Playground does not explain its leading import preamble.');
        assert(frame.includes('Shift+Tab or Esc then Tab leaves'), 'Playground does not explain how keyboard users leave the editor.');
        assert(runtime.includes("import Message from 'js-message';"), 'Visible default source is missing the package import.');
        for (const forbidden of ['eval(', 'new Function(', '.innerHTML', 'srcdoc']) {
            assert(!runner.includes(forbidden) && !runtime.includes(forbidden), `Playground runtime contains forbidden ${forbidden}.`);
        }
    });

    await check('README links the header and every focused documentation route', () => {
        const readme = read('README.md');
        assert(readme.startsWith('![js-message'), 'README must start with the generated header.');
        assert(readme.includes('https://raw.githubusercontent.com/RIAEvangelist/js-message/main/assets/js-message-header.png'), 'README header path is missing.');
        assert(readme.includes('npm install js-message'), 'README must install the published npm package.');
        for (const route of ['guide/', 'api/', 'protocol/', 'browser/', 'examples/', 'playground/', 'testing/', 'migration/']) {
            assert(readme.includes(`https://riaevangelist.github.io/js-message/${route}`), `README is missing ${route}.`);
        }
    });

    await check('release documentation identifies published version 3.0.0', () => {
        const releaseDocuments = [
            'README.md',
            'index.html',
            'guide/index.html',
            'migration/index.html'
        ];

        for (const document of releaseDocuments) {
            const content = read(document);
            assert(content.includes('3.0.0'), `${document} does not identify version 3.0.0.`);
            assert(!content.includes('github:RIAEvangelist/js-message#main'), `${document} still installs from GitHub main.`);
            assert(!/not (?:yet )?published|v3 preview|until a separate release/i.test(content), `${document} still describes a preview release.`);
        }

        const changelog = read('CHANGELOG.md');
        assert(changelog.includes('## 3.0.0 - 2026-08-16'), 'Changelog release date is missing.');
        assert(!changelog.includes('## 3.0.0 - Unreleased'), 'Changelog still marks 3.0.0 as unreleased.');
    });

    await check('package metadata preserves every supported entry and has no runtime dependency', () => {
        const manifest = JSON.parse(read('package.json'));
        assert(manifest.version === '3.0.0', 'Modernized source version must be 3.0.0.');
        assert(manifest.type === 'module', 'Package must remain native ESM.');
        assert(manifest.exports['.'] === './index.js', 'Root export is incorrect.');
        assert(manifest.exports['./Message.js'] === './Message.js', 'Legacy module export is missing.');
        assert(manifest.exports['./js-message-vanilla.js'] === './js-message-vanilla.js', 'Global export is missing.');
        assert(!manifest.dependencies || Object.keys(manifest.dependencies).length === 0, 'Runtime dependencies must stay empty.');
        assert(manifest.devDependencies['vanilla-test'] === '2.1.1', 'vanilla-test must stay exactly pinned.');
        for (const suite of ['unit', 'functional', 'integration', 'regression']) {
            assert(manifest.scripts[`test:${suite}`] === `node ./test/run-suite.js ${suite}`, `Missing focused ${suite} test command.`);
        }
        assert(manifest.scripts['test:playground'] === 'node ./test/browser.js', 'Real-Chrome playground command is missing.');
    });

    await check('the generated repository header is a bounded three-to-one PNG', () => {
        const image = readFileSync(join(root, 'assets/js-message-header.png'));
        assert(image.length > 100000 && image.length < 3000000, 'Header file size is outside the expected range.');
        assert(image.subarray(1, 4).toString('ascii') === 'PNG', 'Header is not a PNG.');
        const width = image.readUInt32BE(16);
        const height = image.readUInt32BE(20);
        assert(width / height >= 2.9 && width / height <= 3.1, `Header aspect ratio is ${width}:${height}.`);
    });

    await check('CI verifies the package before deploying an allowlisted Pages artifact', () => {
        const workflow = read('.github/workflows/ci.yml');
        for (const required of ['npm test', 'coverage', 'test:playground', 'package-smoke', 'upload-pages-artifact', 'deploy-pages', '_site']) {
            assert(workflow.includes(required), `CI workflow is missing ${required}.`);
        }
    });

    await check('the Pages manifest is an exact public-file allowlist', () => {
        const expected = [
            '.nojekyll',
            'index.html',
            'assets/js-message-header.png',
            'assets/site.css',
            'assets/site.js',
            'index.js',
            'Message.js',
            'playground/frame.html',
            'playground/playground.css',
            'playground/recipes.js',
            'playground/runtime.js',
            'playground/runner.js',
            ...publicPages.filter((page) => page !== 'index.html')
        ].sort();
        const actual = [...siteFiles].sort();
        assert(JSON.stringify(actual) === JSON.stringify(expected), 'Pages manifest differs from the expected public files.');

        for (const relative of actual) {
            assert(existsSync(join(root, relative)), `Pages manifest source is missing: ${relative}`);
            assert(!relative.includes('package.json') && !relative.startsWith('test/'), `Private file entered Pages manifest: ${relative}`);
        }
    });

    await check('the repository contains no TypeScript sources or toolchain', () => {
        const sourceFiles = collectSourceFiles(root);
        const forbidden = sourceFiles.filter((file) => ['.ts', '.tsx'].includes(extname(file).toLowerCase()));
        assert(forbidden.length === 0, `Unexpected TypeScript files: ${forbidden.join(', ')}`);
        const manifest = read('package.json').toLowerCase();
        assert(!manifest.includes('typescript') && !manifest.includes('tsx'), 'TypeScript tooling is present.');
    });

    return test.report();
}

const result = await run();
process.exitCode = result.ok ? 0 : 1;
