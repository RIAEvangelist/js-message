import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import VanillaTest from 'vanilla-test';
import siteFiles from '../scripts/site-manifest.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicPages = [
    'index.html',
    'guide/index.html',
    'api/index.html',
    'protocol/index.html',
    'browser/index.html',
    'examples/index.html',
    'testing/index.html',
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

    await check('README links the header and every focused documentation route', () => {
        const readme = read('README.md');
        assert(readme.startsWith('![js-message'), 'README must start with the generated header.');
        assert(readme.includes('https://raw.githubusercontent.com/RIAEvangelist/js-message/main/assets/js-message-header.png'), 'README header path is missing.');
        for (const route of ['guide/', 'api/', 'protocol/', 'browser/', 'examples/', 'testing/', 'migration/']) {
            assert(readme.includes(`https://riaevangelist.github.io/js-message/${route}`), `README is missing ${route}.`);
        }
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
        for (const required of ['npm test', 'coverage', 'package-smoke', 'upload-pages-artifact', 'deploy-pages', '_site']) {
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
