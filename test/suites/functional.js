import {
    assert,
    equal,
    testCase,
    testSuite
} from './helpers.js';

const cases = [
    testCase('FUNC-01', 'the constructor parses JSON text', ({ Message }) => {
        const message = new Message('{"type":"functional.construct","data":{"ok":true}}');
        equal(message.type, 'functional.construct');
        equal(message.data.ok, true);
    }),
    testCase('FUNC-02', 'load preserves nested values and ignores extra keys', ({ Message }) => {
        const message = new Message();
        const returned = message.load('{"type":"functional.load","data":{"items":[1,null,{"ok":true}]},"ignored":true}');
        equal(returned, undefined);
        equal(message.JSON, '{"type":"functional.load","data":{"items":[1,null,{"ok":true}]}}');
    }),
    testCase('FUNC-03', 'load preserves an object data reference', ({ Message }) => {
        const source = { type: 'functional.load-object', data: { key: 'alpha' } };
        const message = new Message();
        message.load(source);
        equal(message.data, source.data);
    }),
    testCase('FUNC-04', 'the constructor preserves an object data reference', ({ Message }) => {
        const source = { type: 'functional.construct-object', data: { key: 'beta' } };
        const message = new Message(source);
        equal(message.data, source.data);
    }),
    testCase('FUNC-05', 'a serialized message round-trips through the constructor', ({ Message }) => {
        const outgoing = new Message({ type: 'functional.round-trip', data: { id: 8 } });
        const incoming = new Message(outgoing.JSON);
        equal(incoming.JSON, outgoing.JSON);
    }),
    testCase('FUNC-06', 'malformed JSON becomes a recoverable error envelope', ({ Message }) => {
        const raw = '{not json';
        const message = new Message(raw);
        equal(message.type, 'error');
        equal(message.data.message, 'Invalid JSON response format');
        equal(message.data.response, raw);
        assert(message.data.err instanceof SyntaxError);
    }),
    testCase('FUNC-07', 'malformed errors remain informative after serialization', ({ Message }) => {
        const message = new Message('[not json');
        const serialized = JSON.parse(message.JSON);
        equal(serialized.data.err.name, 'SyntaxError');
        assert(serialized.data.err.message.length > 0);
    }),
    testCase('FUNC-08', 'a message recovers after a failed load', ({ Message }) => {
        const message = new Message('{broken');
        message.load({ type: 'functional.recovered', data: { ok: true } });
        equal(message.JSON, '{"type":"functional.recovered","data":{"ok":true}}');
    })
];

export default testSuite('functional', 'Functional', cases);
