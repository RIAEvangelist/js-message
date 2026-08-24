import { createRequire } from 'node:module';
import Message, { Message as NamedMessage } from 'js-message';
import IndexMessage from 'js-message/index.js';
import LegacyPathMessage from 'js-message/Message.js';
import 'js-message/js-message-vanilla.js';

const require = createRequire(import.meta.url);

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

assert(Message === NamedMessage, 'Named and default exports diverged.');
assert(Message === IndexMessage, 'The index compatibility path diverged.');
assert(Message === LegacyPathMessage, 'The legacy module path diverged.');

const CommonMessage = require('js-message');
assert(CommonMessage === Message, 'CommonJS and ESM root entries diverged.');
assert(CommonMessage.Message === Message, 'CommonJS named constructor identity diverged.');
assert(require('js-message/index.js') === Message, 'CommonJS index path diverged.');
assert(require('js-message/Message.js') === Message, 'CommonJS Message path diverged.');

const message = new Message('{"type":"compatibility","data":{"ok":true}}');
assert(message.JSON === '{"type":"compatibility","data":{"ok":true}}', 'Module JSON changed.');

const buffered = new Message(Buffer.from('{"type":"buffer","data":{"ok":true}}'));
assert(buffered.JSON === '{"type":"buffer","data":{"ok":true}}', 'Buffer coercion changed.');

const optional = new CommonMessage('{"type":"optional"}');
assert(optional.type === 'optional', 'Optional-data message type changed.');
assert(optional.data === undefined, 'Optional-data message gained a payload.');
assert(optional.JSON === '{"type":"optional"}', 'Optional-data JSON changed.');

const GlobalMessage = globalThis.Message;
const globalMessage = new GlobalMessage({ type: 'global', data: [1, 2, 3] });
assert(globalMessage.JSON === '{"type":"global","data":[1,2,3]}', 'Global JSON changed.');

message.load('{broken');
assert(message.type === 'error', 'Malformed JSON did not produce an error envelope.');
assert(message.data.response === '{broken', 'Malformed input was not preserved.');

console.log('js-message compatibility smoke: PASS');
