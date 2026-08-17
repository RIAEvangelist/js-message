import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChrome } from '../node_modules/vanilla-test/lib/coverage/chrome-session.js';

const root = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const host = '127.0.0.1';
const timeoutMs = 30000;
const allowedFiles = new Set([
    'Message.js',
    'assets/site.css',
    'assets/site.js',
    'index.js',
    'js-message-vanilla.js',
    'node_modules/ansi-colors-es6/index.js',
    'node_modules/strong-type/index.js',
    'node_modules/vanilla-test/index.js',
    'playground/frame.html',
    'playground/index.html',
    'playground/playground.css',
    'playground/recipes.js',
    'playground/runner.js',
    'playground/runtime.js',
    'test/browser-CI.js',
    'test/index.html',
    'test/suites/helpers.js',
    'test/suites/integration-browser.js'
]);
const types = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8']
]);

function parseChromePath(argumentsList) {
    const index = argumentsList.indexOf('--chrome-path');

    if (index === -1) {
        return process.env.CHROME_PATH || null;
    }

    const value = argumentsList[index + 1];

    if (!value || value.startsWith('--')) {
        throw new TypeError('--chrome-path requires a path.');
    }

    return resolve(value);
}

function startServer() {
    let expectedHost;
    const server = createServer((request, response) => {
        if (request.headers.host !== expectedHost) {
            response.writeHead(421, { 'content-type': 'text/plain; charset=utf-8' });
            response.end('Misdirected request');
            return;
        }

        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.writeHead(405, {
                allow: 'GET, HEAD',
                'content-type': 'text/plain; charset=utf-8'
            });
            response.end('Method not allowed');
            return;
        }

        let relative;

        try {
            relative = decodeURIComponent(new URL(request.url, `http://${expectedHost}`).pathname).replace(/^\/+/, '');
        } catch {
            relative = '';
        }

        if (relative.endsWith('/')) {
            relative += 'index.html';
        }

        if (!allowedFiles.has(relative)) {
            response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            response.end('Not found');
            return;
        }

        const target = resolve(root, relative);

        if (!target.startsWith(`${root}${sep}`) || !statSync(target).isFile()) {
            response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            response.end('Not found');
            return;
        }

        const isFrame = relative === 'playground/frame.html';
        const isTestPage = relative === 'test/index.html';
        const headers = {
            'cache-control': 'no-store',
            'content-type': types.get(extname(target)) ?? 'application/octet-stream',
            'cross-origin-resource-policy': relative.startsWith('playground/') || relative === 'index.js' || relative === 'Message.js'
                ? 'cross-origin'
                : 'same-origin',
            'referrer-policy': 'no-referrer',
            'x-content-type-options': 'nosniff'
        };

        if (isFrame) {
            headers['content-security-policy'] = "default-src 'none'; style-src 'self'; script-src 'self' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; font-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'self'";
        } else if (isTestPage) {
            headers['content-security-policy'] = "default-src 'self'; img-src 'none'; style-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'none'; frame-src 'self'; connect-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'";
        }

        if (extname(target) === '.js') {
            headers['access-control-allow-origin'] = '*';
        }

        response.writeHead(200, headers);

        if (request.method === 'HEAD') {
            response.end();
            return;
        }

        createReadStream(target).pipe(response);
    });

    return new Promise((resolvePromise, rejectPromise) => {
        server.once('error', rejectPromise);
        server.listen(0, host, () => {
            const address = server.address();
            expectedHost = `${host}:${address.port}`;
            resolvePromise({
                close: () => new Promise((resolveClose, rejectClose) => {
                    server.close((error) => error ? rejectClose(error) : resolveClose());
                }),
                origin: `http://${expectedHost}`
            });
        });
    });
}

function remoteText(argument) {
    if (Object.hasOwn(argument, 'value')) {
        return typeof argument.value === 'string' ? argument.value : JSON.stringify(argument.value);
    }

    return argument.description ?? argument.unserializableValue ?? argument.type ?? '';
}

let server;
let browser;

try {
    server = await startServer();
    browser = await launchChrome({
        executablePath: parseChromePath(process.argv.slice(2)),
        headless: true,
        timeoutMs,
        viewport: {
            height: 1000,
            width: 1440
        }
    });

    const page = await browser.createPage({
        colorScheme: 'dark',
        timeoutMs,
        viewport: {
            deviceScaleFactor: 1,
            height: 1000,
            width: 1440
        }
    });

    page.on('Runtime.consoleAPICalled', ({ args = [], type }) => {
        const method = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log';
        console[method](`[playground chrome] ${args.map(remoteText).join(' ')}`);
    });
    page.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
        console.error(`[playground chrome error] ${exceptionDetails?.exception?.description || exceptionDetails?.text || 'Unknown error'}`);
    });

    await page.goto(`${server.origin}/test/index.html`, {
        timeoutMs,
        waitUntil: 'load'
    });
    await page.waitForFunction(
        'globalThis.__JS_MESSAGE_TEST_RESULT__ !== undefined || globalThis.__JS_MESSAGE_TEST_ERROR__ !== undefined',
        { timeoutMs }
    );

    const outcome = await page.evaluate(`(() => ({
        error: globalThis.__JS_MESSAGE_TEST_ERROR__ ?? null,
        result: globalThis.__JS_MESSAGE_TEST_RESULT__ ? {
            failed: [...globalThis.__JS_MESSAGE_TEST_RESULT__.failed],
            failureCount: globalThis.__JS_MESSAGE_TEST_RESULT__.failureCount,
            ok: globalThis.__JS_MESSAGE_TEST_RESULT__.ok,
            passed: [...globalThis.__JS_MESSAGE_TEST_RESULT__.passed],
            total: globalThis.__JS_MESSAGE_TEST_RESULT__.total
        } : null
    }))()`, { timeoutMs });

    if (outcome.error) {
        throw new Error(`Playground browser harness failed: ${outcome.error}`);
    }

    if (!outcome.result?.ok) {
        console.error(`Playground Chrome integration failed (${outcome.result?.failureCount ?? 'unknown'} failures).`);
        process.exitCode = 1;
    } else {
        console.log(`Playground Chrome integration passed ${outcome.result.passed.length}/${outcome.result.total} checks.`);
    }
} catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
} finally {
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
}
