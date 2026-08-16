import Message, { Message as NamedMessage } from '../index.js';
import LegacyPathMessage from '../Message.js';
import '../js-message-vanilla.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

assert(Message === NamedMessage, 'Named and default exports diverged.');
assert(Message === LegacyPathMessage, 'The legacy module path diverged.');

const message = new Message('{"type":"compatibility","data":{"ok":true}}');
assert(message.JSON === '{"type":"compatibility","data":{"ok":true}}', 'Module JSON changed.');

const buffered = new Message(Buffer.from('{"type":"buffer","data":{"ok":true}}'));
assert(buffered.JSON === '{"type":"buffer","data":{"ok":true}}', 'Buffer coercion changed.');

const GlobalMessage = globalThis.Message;
const globalMessage = new GlobalMessage({ type: 'global', data: [1, 2, 3] });
assert(globalMessage.JSON === '{"type":"global","data":[1,2,3]}', 'Global JSON changed.');

message.load('{broken');
assert(message.type === 'error', 'Malformed JSON did not produce an error envelope.');
assert(message.data.response === '{broken', 'Malformed input was not preserved.');

console.log('js-message compatibility smoke: PASS');
