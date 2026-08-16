import VanillaTest from 'vanilla-test';
import Message, { Message as NamedMessage } from '../index.js';
import LegacyPathMessage from '../Message.js';
import '../js-message-vanilla.js';

const GlobalMessage = globalThis.Message;

function assert(condition, message = 'Expected condition to be true.') {
    if (!condition) {
        throw new Error(message);
    }
}

function equal(actual, expected, message = 'Values are not equal.') {
    if (!Object.is(actual, expected)) {
        throw new Error(`${message} Expected ${String(expected)}, received ${String(actual)}.`);
    }
}

function throws(callback, ErrorType) {
    let caught;

    try {
        callback();
    } catch (error) {
        caught = error;
    }

    assert(caught, `Expected ${ErrorType.name} to be thrown.`);
    assert(caught instanceof ErrorType, `Expected ${ErrorType.name}, received ${caught.constructor.name}.`);
    return caught;
}

export default async function run() {
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

    await check('root, named, and legacy module exports share one Message class', () => {
        equal(Message, NamedMessage);
        equal(Message, LegacyPathMessage);
    });

    await check('new messages expose independent enumerable defaults', () => {
        const first = new Message();
        const second = new Message();
        equal(first.type, '');
        equal(Object.keys(first).sort().join(','), 'data,type');
        assert(first.data !== second.data, 'Default data objects must not be shared.');
        first.data.changed = true;
        equal(second.data.changed, undefined);
    });

    await check('JSON emits only the normalized type and data envelope', () => {
        const message = new Message();
        message.type = 'user.updated';
        message.data = { id: 42, roles: ['admin'] };
        message.internal = 'ignored';
        const expected = '{"type":"user.updated","data":{"id":42,"roles":["admin"]}}';
        equal(message.JSON, expected);
        equal(JSON.stringify(message), expected);
        equal(Object.keys(message.toJSON()).join(','), 'type,data');
    });

    await check('load parses a JSON string and preserves nested JSON values', () => {
        const message = new Message();
        const returned = message.load('{"type":"batch.ready","data":{"items":[1,null,{"ok":true}]},"ignored":true}');
        equal(returned, undefined);
        equal(message.type, 'batch.ready');
        equal(message.JSON, '{"type":"batch.ready","data":{"items":[1,null,{"ok":true}]}}');
    });

    await check('load and the constructor accept an existing message object', () => {
        const source = { type: 'cache.hit', data: { key: 'alpha' } };
        const loaded = new Message();
        loaded.load(source);
        equal(loaded.type, source.type);
        equal(loaded.data, source.data, 'Object input should preserve the data reference.');

        const constructed = new Message(source);
        equal(constructed.type, source.type);
        equal(constructed.data, source.data);
    });

    await check('load preserves legacy JSON-coercible text inputs', () => {
        const json = '{"type":"coerced","data":{"ok":true}}';
        const stringObject = new String(json);
        const byteView = new Uint8Array();
        byteView.toString = () => json;
        const custom = {
            toString() {
                return json;
            }
        };
        const primitiveOnly = {
            [Symbol.toPrimitive]() {
                return json;
            }
        };
        const partialEnvelope = {
            type: 'coerce-this-value',
            [Symbol.toPrimitive]() {
                return json;
            }
        };

        for (const MessageType of [Message, GlobalMessage]) {
            for (const input of [stringObject, byteView, custom, primitiveOnly, partialEnvelope]) {
                const message = new MessageType();
                message.load(input);
                equal(message.type, 'coerced');
                equal(message.JSON, json);
            }
        }
    });

    await check('malformed JSON produces a serializable error envelope', () => {
        const raw = '{not json';
        const message = new Message();
        message.load(raw);
        equal(message.type, 'error');
        equal(message.data.message, 'Invalid JSON response format');
        equal(message.data.response, raw);
        assert(message.data.err instanceof SyntaxError);

        const serialized = JSON.parse(message.JSON);
        equal(serialized.data.err.name, 'SyntaxError');
        assert(serialized.data.err.message.length > 0);
    });

    await check('valid JSON with an invalid envelope shape is rejected', () => {
        const invalid = [
            null,
            [],
            0,
            true,
            'text',
            {},
            { type: 'missing-data' },
            { data: {} }
        ];

        for (const value of invalid) {
            const input = typeof value === 'string' ? JSON.stringify(value) : value;
            const message = new Message();
            message.load(input);
            equal(message.type, 'error');
            assert(message.data.err instanceof TypeError);
            equal(message.data.response, input);
        }
    });

    await check('a message can recover after a failed load', () => {
        const message = new Message('{broken');
        equal(message.type, 'error');
        message.load({ type: 'recovered', data: { ok: true } });
        equal(message.type, 'recovered');
        equal(message.JSON, '{"type":"recovered","data":{"ok":true}}');
    });

    await check('primitive and frozen thrown values still become error envelopes', () => {
        for (const MessageType of [Message, GlobalMessage]) {
            const primitiveInput = { data: {} };
            Object.defineProperty(primitiveInput, 'type', {
                get() {
                    throw 'primitive failure';
                }
            });

            const primitiveMessage = new MessageType();
            primitiveMessage.load(primitiveInput);
            equal(primitiveMessage.type, 'error');
            assert(primitiveMessage.data.err instanceof Error);
            equal(primitiveMessage.data.err.message, 'primitive failure');

            const frozenError = Object.freeze(new TypeError('frozen failure'));
            const frozenInput = { data: {} };
            Object.defineProperty(frozenInput, 'type', {
                get() {
                    throw frozenError;
                }
            });

            const frozenMessage = new MessageType();
            frozenMessage.load(frozenInput);
            equal(frozenMessage.type, 'error');
            assert(frozenMessage.data.err instanceof Error);
            equal(frozenMessage.data.err.name, 'TypeError');
            equal(frozenMessage.data.err.message, 'frozen failure');

            const lockedError = new RangeError('locked serializer');
            Object.defineProperty(lockedError, 'toJSON', {
                configurable: false,
                value() {
                    return 'legacy serializer';
                }
            });
            const lockedInput = { data: {} };
            Object.defineProperty(lockedInput, 'type', {
                get() {
                    throw lockedError;
                }
            });

            const lockedMessage = new MessageType();
            lockedMessage.load(lockedInput);
            equal(lockedMessage.type, 'error');
            assert(lockedMessage.data.err instanceof Error);
            equal(lockedMessage.data.err.name, 'RangeError');
            equal(JSON.parse(lockedMessage.JSON).data.err.message, 'locked serializer');

            const oddError = { name: 7, message: false };
            const oddInput = { data: {} };
            Object.defineProperty(oddInput, 'type', {
                get() {
                    throw oddError;
                }
            });

            const oddMessage = new MessageType();
            oddMessage.load(oddInput);
            equal(oddMessage.data.err.name, 'Error');
            equal(oddMessage.data.err.message, '[object Object]');

            const hostile = Proxy.revocable({}, {});
            hostile.revoke();
            const hostileInput = { data: {} };
            Object.defineProperty(hostileInput, 'type', {
                get() {
                    throw hostile.proxy;
                }
            });

            const hostileMessage = new MessageType();
            hostileMessage.load(hostileInput);
            const hostileDetails = hostileMessage.data.err.toJSON();
            equal(hostileDetails.name, 'Error');
            equal(hostileDetails.message, 'Unknown error');
        }
    });

    await check('direct type and data assignment keeps native JSON semantics', () => {
        const message = new Message();
        message.type = 7;
        message.data = null;
        equal(message.JSON, '{"type":7,"data":null}');

        message.data = 1n;
        throws(() => message.JSON, TypeError);

        const circular = {};
        circular.self = circular;
        message.data = circular;
        throws(() => message.JSON, TypeError);
    });

    await check('the browser-global entry matches the module contract', () => {
        assert(typeof GlobalMessage === 'function');
        const fromString = new GlobalMessage('{"type":"global.ready","data":{"ok":true}}');
        equal(fromString.JSON, '{"type":"global.ready","data":{"ok":true}}');
        equal(JSON.stringify(fromString), fromString.JSON);

        const fromObject = new GlobalMessage({ type: 'global.object', data: [1, 2] });
        equal(fromObject.JSON, '{"type":"global.object","data":[1,2]}');
        equal(Object.prototype.hasOwnProperty.call(fromObject, 'JSON'), false);
        equal(Object.prototype.hasOwnProperty.call(fromObject, 'load'), false);
        equal(Object.getOwnPropertyDescriptor(GlobalMessage.prototype, 'JSON').enumerable, false);
        equal(Object.getOwnPropertyDescriptor(GlobalMessage.prototype, 'load').enumerable, false);

        const invalidValues = [[], { type: 'missing-data' }, { data: {} }];
        for (const value of invalidValues) {
            fromObject.load(value);
            equal(fromObject.type, 'error');
            assert(fromObject.data.err instanceof TypeError);
        }

        fromObject.load('{broken');
        equal(fromObject.type, 'error');
        const errorEnvelope = JSON.parse(fromObject.JSON);
        equal(errorEnvelope.data.err.name, 'SyntaxError');
    });

    return test.report();
}
