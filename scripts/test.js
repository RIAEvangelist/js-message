import { spawnSync } from 'node:child_process';

const entries = [
    './test/node.js',
    './test/docs.js',
    './test/server.js',
    './test/compatibility.js'
];

for (const entry of entries) {
    const result = spawnSync(process.execPath, [entry], {
        stdio: 'inherit'
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
        break;
    }
}
