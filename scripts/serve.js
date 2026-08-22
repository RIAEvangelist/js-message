import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import siteFiles from './site-manifest.js';

const root = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const host = '127.0.0.1';
const requestedPort = Number.parseInt(process.env.JS_MESSAGE_PORT ?? '8000', 10);
const allowedFiles = new Set(siteFiles);
const types = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml'],
    ['', 'text/plain; charset=utf-8']
]);

if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
    throw new TypeError('JS_MESSAGE_PORT must be an integer from 0 through 65535.');
}

function resolveRequest(requestUrl) {
    const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}`).pathname);
    const withIndex = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const relative = normalize(withIndex).replace(/^[/\\]+/, '').split(sep).join('/');

    if (!allowedFiles.has(relative)) {
        return null;
    }

    const target = resolve(root, relative);

    if (target !== root && !target.startsWith(`${root}${sep}`)) {
        return null;
    }

    if (!existsSync(target) || !statSync(target).isFile()) {
        return null;
    }

    const realTarget = realpathSync(target);
    return realTarget === root || realTarget.startsWith(`${root}${sep}`) ? realTarget : null;
}

const server = createServer((request, response) => {
    const address = server.address();
    const authority = address && typeof address === 'object' ? `${host}:${address.port}` : null;

    if (request.headers.host !== authority) {
        response.writeHead(421, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Misdirected request\n');
        return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { allow: 'GET, HEAD' });
        response.end();
        return;
    }

    let target;

    try {
        target = resolveRequest(request.url ?? '/');
    } catch {
        target = null;
    }

    if (!target) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found\n');
        return;
    }

    const relativeTarget = target.slice(root.length + 1).split(sep).join('/');
    const frameTarget = relativeTarget === 'playground/frame.html';
    const crossOriginResource = relativeTarget.startsWith('playground/') || relativeTarget === 'index.js' || relativeTarget === 'Message.js';
    const headers = {
        'content-security-policy': frameTarget
            ? "default-src 'none'; style-src 'self'; script-src 'self' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; font-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'self'"
            : "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; worker-src 'none'; frame-src 'self'; connect-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'",
        'content-type': types.get(extname(target).toLowerCase()) ?? 'application/octet-stream',
        'cross-origin-resource-policy': crossOriginResource ? 'cross-origin' : 'same-origin',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff'
    };

    if (extname(target).toLowerCase() === '.js') {
        headers['access-control-allow-origin'] = '*';
    }

    response.writeHead(200, headers);

    if (request.method === 'HEAD') {
        response.end();
        return;
    }

    createReadStream(target).pipe(response);
});

server.listen(requestedPort, host, () => {
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : requestedPort;
    console.log(`js-message documentation: http://${host}:${port}/`);
});
