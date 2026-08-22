import {
    assert,
    equal,
    implementations,
    testCase,
    testSuite,
    throwingInput,
    throws
} from './helpers.js';
import { prepareSource, serializeOutput } from '../../playground/runtime.js';

const json = '{"type":"regression.coerced","data":{"ok":true}}';

function assertCoercion(context, input) {
    for (const MessageType of implementations(context)) {
        const message = new MessageType(input);
        equal(message.JSON, json);
    }
}

function assertInvalid(context, input) {
    for (const MessageType of implementations(context)) {
        const message = new MessageType(input);
        equal(message.type, 'error');
        assert(message.data.err instanceof TypeError);
        equal(message.data.response, input);
    }
}

function assertOptional(context, input, type, data, wire) {
    for (const MessageType of implementations(context)) {
        const message = new MessageType(input);
        equal(message.type, type);
        equal(message.data, data);
        equal(message.JSON, wire);
    }
}

const cases = [
    testCase('REG-01', 'boxed JSON strings remain loadable', (context) => {
        assertCoercion(context, new String(json));
    }),
    testCase('REG-02', 'typed views with JSON text coercion remain loadable', (context) => {
        const input = new Uint8Array();
        input.toString = () => json;
        assertCoercion(context, input);
    }),
    testCase('REG-03', 'custom toString JSON inputs remain loadable', (context) => {
        assertCoercion(context, {
            toString() {
                return json;
            }
        });
    }),
    testCase('REG-04', 'Symbol.toPrimitive JSON inputs remain loadable', (context) => {
        assertCoercion(context, {
            [Symbol.toPrimitive]() {
                return json;
            }
        });
    }),
    testCase('REG-05', 'partial envelopes may still coerce to JSON text', (context) => {
        assertCoercion(context, {
            type: 'coerce-this-value',
            [Symbol.toPrimitive]() {
                return json;
            }
        });
    }),
    testCase('REG-06', 'null is rejected as an envelope', (context) => {
        assertInvalid(context, null);
    }),
    testCase('REG-07', 'array input keeps native JSON coercion failure behavior', (context) => {
        for (const MessageType of implementations(context)) {
            const input = [];
            const message = new MessageType(input);
            equal(message.type, 'error');
            assert(message.data.err instanceof SyntaxError);
            equal(message.data.response, input);
        }
    }),
    testCase('REG-08', 'parsed numbers preserve missing message fields', (context) => {
        assertOptional(context, 0, undefined, undefined, '{}');
    }),
    testCase('REG-09', 'parsed booleans preserve missing message fields', (context) => {
        assertOptional(context, true, undefined, undefined, '{}');
    }),
    testCase('REG-10', 'parsed string primitives preserve missing message fields', (context) => {
        assertOptional(context, '"text"', undefined, undefined, '{}');
    }),
    testCase('REG-11', 'empty objects preserve missing message fields', (context) => {
        assertOptional(context, {}, undefined, undefined, '{}');
    }),
    testCase('REG-12', 'object messages may omit data', (context) => {
        assertOptional(context, { type: 'missing-data' }, 'missing-data', undefined, '{"type":"missing-data"}');
    }),
    testCase('REG-13', 'JSON messages may omit data', (context) => {
        assertOptional(context, '{"type":"missing-data-json"}', 'missing-data-json', undefined, '{"type":"missing-data-json"}');
    }),
    testCase('REG-14', 'primitive thrown values become Error details', (context) => {
        for (const MessageType of implementations(context)) {
            const message = new MessageType(throwingInput('primitive failure'));
            assert(message.data.err instanceof Error);
            equal(message.data.err.message, 'primitive failure');
        }
    }),
    testCase('REG-15', 'frozen thrown errors remain serializable', (context) => {
        const frozen = Object.freeze(new TypeError('frozen failure'));
        for (const MessageType of implementations(context)) {
            const message = new MessageType(throwingInput(frozen));
            equal(message.data.err.name, 'TypeError');
            equal(message.data.err.message, 'frozen failure');
        }
    }),
    testCase('REG-16', 'locked error serializers cannot escape load', (context) => {
        const locked = new RangeError('locked serializer');
        Object.defineProperty(locked, 'toJSON', {
            configurable: false,
            value() {
                return 'legacy serializer';
            }
        });

        for (const MessageType of implementations(context)) {
            const message = new MessageType(throwingInput(locked));
            const serialized = JSON.parse(message.JSON);
            equal(serialized.data.err.name, 'RangeError');
            equal(serialized.data.err.message, 'locked serializer');
        }
    }),
    testCase('REG-17', 'non-string error metadata falls back safely', (context) => {
        const odd = { name: 7, message: false };
        for (const MessageType of implementations(context)) {
            const message = new MessageType(throwingInput(odd));
            equal(message.data.err.name, 'Error');
            equal(message.data.err.message, '[object Object]');
        }
    }),
    testCase('REG-18', 'revoked proxies become unknown serializable errors', (context) => {
        const hostile = Proxy.revocable({}, {});
        hostile.revoke();
        for (const MessageType of implementations(context)) {
            const message = new MessageType(throwingInput(hostile.proxy));
            const details = message.data.err.toJSON();
            equal(details.name, 'Error');
            equal(details.message, 'Unknown error');
        }
    }),
    testCase('REG-19', 'BigInt data keeps native JSON failure semantics', (context) => {
        for (const MessageType of implementations(context)) {
            const message = new MessageType();
            message.data = 1n;
            throws(() => message.JSON, TypeError);
        }
    }),
    testCase('REG-20', 'circular data keeps native JSON failure semantics', (context) => {
        const circular = {};
        circular.self = circular;
        for (const MessageType of implementations(context)) {
            const message = new MessageType();
            message.data = circular;
            throws(() => message.JSON, TypeError);
        }
    }),
    testCase('REG-21', 'hostile console values cannot escape output serialization', () => {
        const hostile = Proxy.revocable({}, {});
        hostile.revoke();
        equal(serializeOutput(hostile.proxy), '[Unserializable value]');
    }),
    testCase('REG-22', 'undefined custom JSON output receives a readable fallback', () => {
        equal(serializeOutput({
            toJSON() {
                return undefined;
            }
        }), '[Unserializable value]');
    }),
    testCase('REG-23', 'string-named imports cannot masquerade as module specifiers', () => {
        const moduleURL = 'https://example.test/js-message/index.js';
        const first = `import { from, "js-message" as message } from 'https://example.test/mod.js';`;
        const source = [first, "import Message from 'js-message';"].join('\n');
        const prepared = prepareSource(source, moduleURL);
        equal(prepared.split('\n')[0], first);
        assert(prepared.endsWith(`import Message from '${moduleURL}';`), 'The actual package specifier was not resolved.');
    }),
    testCase('REG-24', 'multiline import comments preserve text and preamble state', () => {
        const moduleURL = 'https://example.test/js-message/index.js';
        const commented = "import Message from 'js-message'; // documentation only";
        const source = [
            "import 'https://example.test/setup.js'; /*",
            commented,
            '*/',
            "import Message from 'js-message';"
        ].join('\n');
        const prepared = prepareSource(source, moduleURL);
        equal(prepared.split('\n')[1], commented);
        assert(prepared.endsWith(`import Message from '${moduleURL}';`), 'The import after the multiline comment was not resolved.');
    }),
    testCase('REG-25', 'object messages may omit type', (context) => {
        const data = { ok: true };
        assertOptional(context, { data }, undefined, data, '{"data":{"ok":true}}');
    }),
    testCase('REG-26', 'JSON messages may omit type', (context) => {
        for (const MessageType of implementations(context)) {
            const message = new MessageType('{"data":{"ok":true}}');
            equal(message.type, undefined);
            equal(message.data.ok, true);
            equal(message.JSON, '{"data":{"ok":true}}');
        }
    }),
    testCase('REG-27', 'hostile Error accessors stay contained during serialization', (context) => {
        const hostile = new Error('hostile metadata');
        Object.defineProperties(hostile, {
            message: {
                configurable: true,
                get() {
                    throw new Error('message getter escaped');
                }
            },
            name: {
                configurable: true,
                get() {
                    throw new Error('name getter escaped');
                }
            }
        });

        for (const MessageType of implementations(context)) {
            const message = new MessageType(throwingInput(hostile));
            const serialized = JSON.parse(message.JSON);
            equal(serialized.data.err.name, 'Error');
            equal(serialized.data.err.message, 'Unknown error');
        }
    })
];

export default testSuite('regression', 'Regression', cases);
