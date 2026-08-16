import { copyFileSync, existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import siteFiles from './site-manifest.js';

const root = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const target = resolve(root, '_site');

if (target !== join(root, '_site')) {
    throw new Error('Refusing to assemble outside the repository _site directory.');
}

if (existsSync(target)) {
    rmSync(target, { force: true, recursive: true });
}

mkdirSync(target);

for (const relative of siteFiles) {
    const source = realpathSync(join(root, relative));

    if (source !== root && !source.startsWith(`${root}${sep}`)) {
        throw new Error(`Site source escapes the repository: ${relative}`);
    }

    const destination = join(target, relative);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
}

console.log(`Assembled ${siteFiles.length} allowlisted files in _site.`);
