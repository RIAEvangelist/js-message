import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const workspace = mkdtempSync(join(tmpdir(), 'js-message-package-'));

function run(command, args, cwd = process.cwd()) {
    const useNpmCli = command === 'npm' && process.env.npm_execpath;
    const executable = useNpmCli ? process.execPath : command;
    const commandArgs = useNpmCli ? [process.env.npm_execpath, ...args] : args;
    const result = spawnSync(executable, commandArgs, {
        cwd,
        encoding: 'utf8',
        shell: false
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed.\n${result.stdout}\n${result.stderr}`);
    }

    return result.stdout;
}

try {
    const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', workspace]));
    const metadata = packed[0];
    const required = [
        'index.js',
        'Message.js',
        'js-message-vanilla.js',
        'assets/benchmark-construct.svg',
        'assets/benchmark-json.svg',
        'assets/benchmark-object.svg',
        'package.json',
        'README.md',
        'licence',
        'CHANGELOG.md',
        'MIGRATION.md'
    ];
    const actual = metadata.files.map(({ path }) => path).sort();
    const expected = [...required].sort();

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Packed artifact files differ. Expected ${expected.join(', ')}; received ${actual.join(', ')}.`);
    }

    const tarball = resolve(workspace, metadata.filename);
    writeFileSync(join(workspace, 'package.json'), '{"private":true,"type":"module"}\n');
    run('npm', ['install', '--no-audit', '--no-fund', tarball], workspace);
    writeFileSync(join(workspace, 'smoke.mjs'), `
import { createRequire } from 'node:module';
import Message, { Message as NamedMessage } from 'js-message';
import IndexMessage from 'js-message/index.js';
import LegacyMessage from 'js-message/Message.js';
import 'js-message/js-message-vanilla.js';

const require = createRequire(import.meta.url);
const CommonMessage = require('js-message');

if (Message !== NamedMessage || Message !== IndexMessage || Message !== LegacyMessage) throw new Error('ESM export identity failed.');
if (CommonMessage !== Message || CommonMessage.Message !== Message) throw new Error('CommonJS root identity failed.');
if (require('js-message/index.js') !== Message || require('js-message/Message.js') !== Message) throw new Error('CommonJS deep identity failed.');
const message = new Message({ type: 'packed', data: { ok: true } });
if (message.JSON !== '{"type":"packed","data":{"ok":true}}') throw new Error('Packed module failed.');
const optional = new CommonMessage('{"type":"optional"}');
if (optional.data !== undefined || optional.JSON !== '{"type":"optional"}') throw new Error('Optional payload failed.');
const globalMessage = new globalThis.Message('{"type":"global","data":true}');
if (globalMessage.type !== 'global') throw new Error('Packed global entry failed.');
console.log('packed js-message artifact: PASS');
`.trimStart());
    run(process.execPath, ['smoke.mjs'], workspace);
    console.log(`js-message package smoke: PASS (${metadata.size} bytes packed)`);
} finally {
    const resolvedWorkspace = resolve(workspace);
    const resolvedTemp = resolve(tmpdir());

    if (resolvedWorkspace.startsWith(`${resolvedTemp}\\`) || resolvedWorkspace.startsWith(`${resolvedTemp}/`)) {
        rmSync(resolvedWorkspace, { force: true, recursive: true });
    }
}
