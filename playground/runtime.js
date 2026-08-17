const limits = Object.freeze({
    lineBytes: 8192,
    outputBytes: 65536,
    outputLines: 100,
    runMilliseconds: 3000,
    sourceBytes: 32768
});
const defaultSource = `import Message from 'js-message';

const outgoing = new Message({
    type: 'user.updated',
    data: {
        id: 42,
        active: true
    }
});

console.log('object', outgoing.toJSON());
console.log('wire', outgoing.JSON);

const incoming = new Message(outgoing.JSON);
console.log('received', incoming.toJSON());`;

function skipImportTrivia(source, start) {
    let index = start;

    while (index < source.length) {
        if (/\s/.test(source[index])) {
            index += 1;
            continue;
        }

        if (source.startsWith('/*', index)) {
            const end = source.indexOf('*/', index + 2);

            if (end === -1) {
                return { blockCommentOpen: true, index: source.length };
            }

            index = end + 2;
            continue;
        }

        break;
    }

    return { blockCommentOpen: false, index };
}

function readImportString(source, start) {
    const quote = source[start];
    let index = start + 1;

    while (index < source.length) {
        if (source[index] === '\\') {
            index += 2;
            continue;
        }

        if (source[index] === quote) {
            return {
                end: index + 1,
                start,
                value: source.slice(start + 1, index)
            };
        }

        index += 1;
    }

    return null;
}

function inspectImport(statement) {
    const next = statement[6] ?? '';
    const staticStart = /\s/.test(next)
        || next === "'"
        || next === '"'
        || next === '*'
        || next === '{'
        || statement.startsWith('/*', 6);

    if (!statement.startsWith('import') || !staticStart) {
        return null;
    }

    let trivia = skipImportTrivia(statement, 6);
    let index = trivia.index;

    if (trivia.blockCommentOpen) {
        return { blockCommentOpen: true, complete: false, specifier: null };
    }

    if (statement[index] === '(' || statement[index] === '.') {
        return null;
    }

    let firstToken = true;
    let fromSeen = false;

    while (index < statement.length) {
        trivia = skipImportTrivia(statement, index);
        index = trivia.index;

        if (trivia.blockCommentOpen) {
            return { blockCommentOpen: true, complete: false, specifier: null };
        }

        if (index >= statement.length || statement.startsWith('//', index)) {
            break;
        }

        const character = statement[index];

        if (character === "'" || character === '"') {
            const specifier = readImportString(statement, index);

            if (!specifier) {
                break;
            }

            if (firstToken || fromSeen) {
                trivia = skipImportTrivia(statement, specifier.end);
                let suffix = trivia.index;

                if (!trivia.blockCommentOpen && statement[suffix] === ';') {
                    trivia = skipImportTrivia(statement, suffix + 1);
                    suffix = trivia.index;
                }

                return {
                    blockCommentOpen: trivia.blockCommentOpen,
                    complete: trivia.blockCommentOpen || suffix >= statement.length || statement.startsWith('//', suffix),
                    specifier
                };
            }

            index = specifier.end;
            firstToken = false;
            continue;
        }

        if (/[A-Za-z_$]/.test(character)) {
            const start = index;

            while (/[\w$]/.test(statement[index] ?? '')) {
                index += 1;
            }

            fromSeen = statement.slice(start, index) === 'from';
            firstToken = false;
            continue;
        }

        firstToken = false;
        fromSeen = false;
        index += 1;
    }

    return { blockCommentOpen: false, complete: false, specifier: null };
}

function prepareSource(source, moduleURL) {
    if (typeof source !== 'string') {
        throw new TypeError('Playground source must be a string.');
    }

    if (source.length > limits.sourceBytes) {
        throw new RangeError(`Playground source is limited to ${limits.sourceBytes} characters.`);
    }

    const resolved = new URL(moduleURL).href;
    const imports = new Map([
        ['js-message', resolved],
        ['js-message/Message.js', new URL('./Message.js', resolved).href]
    ]);
    let blockCommentOpen = false;
    let preambleOpen = true;

    return source.split(/(\r?\n)/).map((part) => {
        if (part === '\n' || part === '\r\n') {
            return part;
        }

        if (!preambleOpen) {
            return part;
        }

        let index = 0;

        while (index < part.length) {
            if (blockCommentOpen) {
                const commentEnd = part.indexOf('*/', index);

                if (commentEnd === -1) {
                    return part;
                }

                blockCommentOpen = false;
                index = commentEnd + 2;
                continue;
            }

            while (/\s/.test(part[index] ?? '')) {
                index += 1;
            }

            if (index >= part.length || part.startsWith('//', index)) {
                return part;
            }

            if (part.startsWith('/*', index)) {
                blockCommentOpen = true;
                index += 2;
                continue;
            }

            break;
        }

        if (index >= part.length) {
            return part;
        }

        const prefix = part.slice(0, index);
        const statement = part.slice(index);
        const inspected = inspectImport(statement);

        if (inspected?.blockCommentOpen) {
            blockCommentOpen = true;
        }

        if (inspected?.specifier) {
            const { complete, specifier } = inspected;
            const replacement = imports.get(specifier.value);

            if (!complete) {
                preambleOpen = false;
            }

            if (replacement) {
                return `${prefix}${statement.slice(0, specifier.start + 1)}${replacement}${statement.slice(specifier.end - 1)}`;
            }

            return part;
        }

        preambleOpen = false;
        return part;
    }).join('');
}

function serializeOutput(value, maximumLength = 8192) {
    function truncate(text) {
        if (text.length <= maximumLength) {
            return text;
        }

        return `${text.slice(0, Math.max(0, maximumLength - 1))}…`;
    }

    try {
        if (typeof value === 'string') {
            return truncate(value);
        }

        if (typeof value === 'bigint') {
            return truncate(`${value}n`);
        }

        if (typeof value === 'symbol' || typeof value === 'function') {
            return truncate(String(value));
        }

        if (value instanceof Error) {
            return truncate(`${value.name}: ${value.message}`);
        }

        if (value === undefined) {
            return 'undefined';
        }

        if (value === null || typeof value !== 'object') {
            return truncate(String(value));
        }

        const seen = new WeakSet();
        const serialized = JSON.stringify(value, (key, current) => {
            if (typeof current === 'bigint') {
                return `${current}n`;
            }

            if (current instanceof Error) {
                return {
                    name: current.name,
                    message: current.message
                };
            }

            if (current instanceof Map) {
                return {
                    type: 'Map',
                    entries: [...current]
                };
            }

            if (current instanceof Set) {
                return {
                    type: 'Set',
                    values: [...current]
                };
            }

            if (current !== null && typeof current === 'object') {
                if (seen.has(current)) {
                    return '[Circular]';
                }

                seen.add(current);
            }

            return current;
        }, 2);

        return typeof serialized === 'string'
            ? truncate(serialized)
            : '[Unserializable value]';
    } catch {
        return '[Unserializable value]';
    }
}

export {
    defaultSource,
    limits,
    prepareSource,
    serializeOutput
};
