import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import VanillaTest from 'vanilla-test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function startServer() {
    return new Promise((resolveStart, reject) => {
        const child = spawn(process.execPath, ['./scripts/serve.js'], {
            cwd: root,
            env: {
                ...process.env,
                JS_MESSAGE_PORT: '0'
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let diagnostics = '';
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error(`Server startup timed out. ${diagnostics}`));
        }, 5000);

        child.stderr.on('data', (chunk) => {
            diagnostics += chunk;
        });
        child.stdout.on('data', (chunk) => {
            diagnostics += chunk;
            const match = diagnostics.match(/http:\/\/127\.0\.0\.1:(\d+)\//);

            if (match) {
                clearTimeout(timeout);
                resolveStart({ child, port: Number.parseInt(match[1], 10) });
            }
        });
        child.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once('exit', (code) => {
            if (!diagnostics.includes('js-message documentation:')) {
                clearTimeout(timeout);
                reject(new Error(`Server exited before startup with ${code}. ${diagnostics}`));
            }
        });
    });
}

function fetchLocal(port, path, options = {}) {
    return new Promise((resolveResponse, reject) => {
        const outgoing = request({
            host: '127.0.0.1',
            port,
            path,
            method: options.method ?? 'GET',
            headers: options.headers
        }, (incoming) => {
            const chunks = [];
            incoming.on('data', (chunk) => chunks.push(chunk));
            incoming.on('end', () => {
                resolveResponse({
                    body: Buffer.concat(chunks),
                    headers: incoming.headers,
                    status: incoming.statusCode
                });
            });
        });
        outgoing.once('error', reject);
        outgoing.end();
    });
}

async function stopServer(child) {
    if (child.exitCode !== null) {
        return;
    }

    const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
    child.kill();
    await exited;
}

const running = await startServer();
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

function equal(actual, expected) {
    if (!Object.is(actual, expected)) {
        throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
    }
}

try {
    await check('serves allowlisted pages and assets with security headers', async () => {
        const page = await fetchLocal(running.port, '/');
        equal(page.status, 200);
        equal(page.headers['x-content-type-options'], 'nosniff');
        equal(page.headers['cross-origin-resource-policy'], 'same-origin');
        equal(page.headers['content-security-policy'].includes("frame-ancestors 'none'"), true);

        const image = await fetchLocal(running.port, '/assets/js-message-header.png');
        equal(image.status, 200);
        equal(image.headers['content-type'], 'image/png');
    });

    await check('serves the sandboxed playground frame and canonical modules', async () => {
        const page = await fetchLocal(running.port, '/playground/');
        equal(page.status, 200);
        for (const path of ['/playground/recipes/round-trip/', '/playground/recipes/recovery/', '/playground/recipes/boundary/']) {
            equal((await fetchLocal(running.port, path)).status, 200);
        }

        const frame = await fetchLocal(running.port, '/playground/frame.html');
        equal(frame.status, 200);
        equal(frame.headers['content-security-policy'].includes("worker-src blob:"), true);
        equal(frame.headers['content-security-policy'].includes("frame-ancestors 'self'"), true);
        equal(frame.headers['cross-origin-resource-policy'], 'cross-origin');

        for (const path of ['/playground/runtime.js', '/playground/recipes.js', '/playground/runner.js', '/index.js', '/Message.js']) {
            const module = await fetchLocal(running.port, path);
            equal(module.status, 200);
            equal(module.headers['content-type'], 'text/javascript; charset=utf-8');
            equal(module.headers['access-control-allow-origin'], '*');
            equal(module.headers['cross-origin-resource-policy'], 'cross-origin');
        }
    });

    await check('denies repository internals and ignored files', async () => {
        for (const path of ['/.git/config', '/package.json', '/README.md', '/test/CI.js', '/playground/package.json', '/.env']) {
            equal((await fetchLocal(running.port, path)).status, 404);
        }
    });

    await check('rejects a foreign Host authority', async () => {
        const response = await fetchLocal(running.port, '/', {
            headers: { host: 'attacker.example:48123' }
        });
        equal(response.status, 421);
    });

    await check('handles HEAD and rejects unsupported methods', async () => {
        const head = await fetchLocal(running.port, '/api/', { method: 'HEAD' });
        equal(head.status, 200);
        equal(head.body.length, 0);

        const post = await fetchLocal(running.port, '/', { method: 'POST' });
        equal(post.status, 405);
        equal(post.headers.allow, 'GET, HEAD');
    });
} finally {
    await stopServer(running.child);
}

const result = test.report();
process.exitCode = result.ok ? 0 : 1;
