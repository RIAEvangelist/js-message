import {
    defaultSource,
    limits,
    prepareSource,
    serializeOutput
} from '../../playground/runtime.js';
import {
    assert,
    equal,
    testCase,
    testSuite
} from './helpers.js';

const cases = [
    testCase('UNIT-01', 'a new message starts with an empty type', ({ Message }) => {
        equal(new Message().type, '');
    }),
    testCase('UNIT-02', 'default data objects are independent', ({ Message }) => {
        const first = new Message();
        const second = new Message();
        assert(first.data !== second.data, 'Default data objects must not be shared.');
        first.data.changed = true;
        equal(second.data.changed, undefined);
    }),
    testCase('UNIT-03', 'type and data are the enumerable instance fields', ({ Message }) => {
        equal(Object.keys(new Message()).sort().join(','), 'data,type');
    }),
    testCase('UNIT-04', 'the JSON getter emits the exact envelope', ({ Message }) => {
        const message = new Message();
        message.type = 'unit.json';
        message.data = { id: 42, roles: ['admin'] };
        equal(message.JSON, '{"type":"unit.json","data":{"id":42,"roles":["admin"]}}');
    }),
    testCase('UNIT-05', 'the JSON getter excludes local properties', ({ Message }) => {
        const message = new Message({ type: 'unit.extra', data: true });
        message.internal = 'ignored';
        equal(Object.prototype.hasOwnProperty.call(JSON.parse(message.JSON), 'internal'), false);
    }),
    testCase('UNIT-06', 'toJSON returns only type and data', ({ Message }) => {
        const message = new Message({ type: 'unit.object', data: { ok: true } });
        const plain = message.toJSON();
        equal(Object.keys(plain).join(','), 'type,data');
        equal(plain.type, message.type);
        equal(plain.data, message.data);
    }),
    testCase('UNIT-07', 'JSON.stringify uses the normalized envelope', ({ Message }) => {
        const message = new Message({ type: 'unit.stringify', data: [1, 2] });
        equal(JSON.stringify(message), message.JSON);
    }),
    testCase('UNIT-08', 'direct fields retain JSON-safe native values', ({ Message }) => {
        const message = new Message();
        message.type = 7;
        message.data = null;
        equal(message.JSON, '{"type":7,"data":null}');
    }),
    testCase('UNIT-09', 'the default playground source shows a complete round trip', () => {
        assert(defaultSource.includes("import Message from 'js-message';"), 'Default source must show the package import.');
        assert(defaultSource.includes('outgoing.JSON'), 'Default source must show wire JSON.');
        assert(defaultSource.includes('new Message(outgoing.JSON)'), 'Default source must load the wire value.');
    }),
    testCase('UNIT-10', 'playground root imports resolve to the canonical module', () => {
        const moduleURL = 'https://example.test/js-message/index.js';
        const source = [
            "import Message from 'js-message';",
            "import 'js-message';"
        ].join('\n');
        const prepared = prepareSource(source, moduleURL);
        equal((prepared.match(/https:\/\/example\.test\/js-message\/index\.js/g) ?? []).length, 2);
        assert(!prepared.includes("'js-message'"), 'A bare package import remains.');
    }),
    testCase('UNIT-11', 'playground deep imports resolve to Message.js', () => {
        const prepared = prepareSource(
            "import Message from/* supported comment */'js-message/Message.js';",
            'https://example.test/js-message/index.js'
        );
        equal(prepared, "import Message from/* supported comment */'https://example.test/js-message/Message.js';");
    }),
    testCase('UNIT-12', 'playground import text outside static declarations is unchanged', () => {
        const source = [
            "const text = \"from 'js-message'\";",
            "// import Message from 'js-message';",
            "const template = `import Message from 'js-message';`;",
            "const loaded = import('js-message');"
        ].join('\n');
        equal(prepareSource(source, 'https://example.test/index.js'), source);
    }),
    testCase('UNIT-13', 'playground source must be text', () => {
        let typeError = false;

        try {
            prepareSource(null, 'https://example.test/index.js');
        } catch (error) {
            typeError = error instanceof TypeError;
        }

        assert(typeError, 'Non-text source did not throw TypeError.');
    }),
    testCase('UNIT-14', 'playground source has a fixed size limit', () => {
        let rangeError = false;

        try {
            prepareSource('x'.repeat(limits.sourceBytes + 1), 'https://example.test/index.js');
        } catch (error) {
            rangeError = error instanceof RangeError;
        }

        assert(rangeError, 'Oversized source did not throw RangeError.');
    }),
    testCase('UNIT-15', 'package imports after executable code remain unchanged', () => {
        const source = [
            'const matcher = /["`]/;',
            "import Message from 'js-message';"
        ].join('\n');
        equal(prepareSource(source, 'https://example.test/js-message/index.js'), source);
    }),
    testCase('UNIT-16', 'comments and blank lines may precede package imports', () => {
        const moduleURL = 'https://example.test/js-message/index.js';
        const prepared = prepareSource([
            '// Keep the package import in the leading preamble.',
            '',
            "import Message from 'js-message';"
        ].join('\n'), moduleURL);

        assert(prepared.includes(`import Message from '${moduleURL}';`), 'The import after leading trivia was not resolved.');
    }),
    testCase('UNIT-17', 'other absolute static imports may precede package imports', () => {
        const moduleURL = 'https://example.test/js-message/index.js';
        const prepared = prepareSource([
            "import 'https://example.test/setup.js';",
            "import Message from 'js-message';"
        ].join('\n'), moduleURL);

        assert(prepared.startsWith("import 'https://example.test/setup.js';"), 'The preceding static import changed.');
        assert(prepared.includes(`import Message from '${moduleURL}';`), 'The package import after another import was not resolved.');
    }),
    testCase('UNIT-18', 'block comments may precede package imports', () => {
        const moduleURL = 'https://example.test/js-message/index.js';
        const prepared = prepareSource([
            '/*',
            ' * Leading package notes.',
            ' */',
            "import Message from 'js-message';"
        ].join('\n'), moduleURL);

        assert(prepared.includes(`import Message from '${moduleURL}';`), 'The import after a block comment was not resolved.');
    }),
    testCase('UNIT-19', 'leading package imports may carry trailing line comments', () => {
        const moduleURL = 'https://example.test/js-message/index.js';
        const prepared = prepareSource("import Message from 'js-message'; // package entry", moduleURL);
        equal(prepared, `import Message from '${moduleURL}'; // package entry`);
    }),
    testCase('UNIT-20', 'compact leading package imports resolve without added whitespace', () => {
        const moduleURL = 'https://example.test/js-message/index.js';
        const prepared = prepareSource("import{default as Message}from'js-message'", moduleURL);
        equal(prepared, `import{default as Message}from'${moduleURL}'`);
    }),
    testCase('UNIT-21', 'inline block comments may separate the import keyword', () => {
        const moduleURL = 'https://example.test/js-message/index.js';
        const prepared = prepareSource("import/* package */ Message from 'js-message';", moduleURL);
        equal(prepared, `import/* package */ Message from '${moduleURL}';`);
    }),
    testCase('UNIT-22', 'comment-heavy import preambles remain responsive', () => {
        const source = `import${'/*a*/'.repeat(1000)} MissingSpecifier`;
        const started = Date.now();
        equal(prepareSource(source, 'https://example.test/js-message/index.js'), source);
        assert(Date.now() - started < 1000, 'Comment-heavy input exceeded the bounded scan budget.');
    }),
    testCase('UNIT-23', 'Unicode import-prefix identifiers remain unchanged', () => {
        const source = "importé = from + 'js-message';";
        equal(prepareSource(source, 'https://example.test/js-message/index.js'), source);
    }),
    testCase('UNIT-24', 'escaped import-prefix identifiers remain unchanged', () => {
        const source = "import\\u0065d = from + 'js-message';";
        equal(prepareSource(source, 'https://example.test/js-message/index.js'), source);
    }),
    testCase('UNIT-25', 'playground output serializes BigInt', () => {
        equal(serializeOutput(12n), '12n');
    }),
    testCase('UNIT-26', 'playground output serializes undefined', () => {
        equal(serializeOutput(undefined), 'undefined');
    }),
    testCase('UNIT-27', 'playground output serializes errors', () => {
        equal(serializeOutput(new TypeError('invalid')), 'TypeError: invalid');
    }),
    testCase('UNIT-28', 'playground output labels maps', () => {
        assert(serializeOutput(new Map([['ready', true]])).includes('"type": "Map"'), 'Map output is not labeled.');
    }),
    testCase('UNIT-29', 'playground output labels sets', () => {
        assert(serializeOutput(new Set(['ready'])).includes('"type": "Set"'), 'Set output is not labeled.');
    }),
    testCase('UNIT-30', 'playground output marks circular references', () => {
        const circular = {};
        circular.self = circular;
        assert(serializeOutput(circular).includes('[Circular]'), 'Circular output is not bounded.');
    }),
    testCase('UNIT-31', 'playground output truncates primitive strings before transfer', () => {
        const serialized = serializeOutput('x'.repeat(limits.lineBytes + 100), limits.lineBytes);
        equal(serialized.length, limits.lineBytes);
        assert(serialized.endsWith('…'), 'Truncated output is missing its marker.');
    })
];

export default testSuite('unit', 'Unit', cases);
