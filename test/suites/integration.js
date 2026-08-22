import {
    assert,
    equal,
    testCase,
    testSuite
} from './helpers.js';

const cases = [
    testCase('INT-01', 'root default and named exports share one class', ({ Message, NamedMessage }) => {
        equal(Message, NamedMessage);
    }),
    testCase('INT-02', 'the legacy module path shares the root class', ({ LegacyPathMessage, Message }) => {
        equal(Message, LegacyPathMessage);
    }),
    testCase('INT-03', 'the browser-global entry exposes a constructor', ({ GlobalMessage }) => {
        assert(typeof GlobalMessage === 'function');
    }),
    testCase('INT-04', 'the global JSON getter stays on a non-enumerable prototype', ({ GlobalMessage }) => {
        const message = new GlobalMessage();
        equal(Object.prototype.hasOwnProperty.call(message, 'JSON'), false);
        equal(Object.getOwnPropertyDescriptor(GlobalMessage.prototype, 'JSON').enumerable, false);
    }),
    testCase('INT-05', 'the global load method stays on a non-enumerable prototype', ({ GlobalMessage }) => {
        const message = new GlobalMessage();
        equal(Object.prototype.hasOwnProperty.call(message, 'load'), false);
        equal(Object.getOwnPropertyDescriptor(GlobalMessage.prototype, 'load').enumerable, false);
    }),
    testCase('INT-06', 'module and global entries agree on JSON text', ({ GlobalMessage, Message }) => {
        const raw = '{"type":"integration.text","data":{"ok":true}}';
        equal(new GlobalMessage(raw).JSON, new Message(raw).JSON);
    }),
    testCase('INT-07', 'module and global entries agree on object input', ({ GlobalMessage, Message }) => {
        const source = { type: 'integration.object', data: [1, 2] };
        equal(new GlobalMessage(source).JSON, new Message(source).JSON);
    }),
    testCase('INT-08', 'the global entry serializes malformed input errors', ({ GlobalMessage }) => {
        const message = new GlobalMessage(']broken');
        const errorEnvelope = JSON.parse(message.JSON);
        equal(message.type, 'error');
        equal(errorEnvelope.data.err.name, 'SyntaxError');
    }),
    testCase('INT-09', 'the global toJSON method returns the exact envelope', ({ GlobalMessage }) => {
        const message = new GlobalMessage({ type: 'integration.to-json', data: { ok: true } });
        const envelope = message.toJSON();
        equal(Object.keys(envelope).join(','), 'type,data');
        equal(envelope.type, message.type);
        equal(envelope.data, message.data);
    }),
    testCase('INT-10', 'the module constructor exposes its named CommonJS identity', ({ Message }) => {
        equal(Message.Message, Message);
    })
];

export default testSuite('integration', 'Integration', cases);
