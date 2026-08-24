import { defaultSource } from './runtime.js';

const recipeSources = Object.freeze({
    'round-trip': defaultSource,
    recovery: `import Message from 'js-message';

const incoming = new Message('{not valid json');

console.log('type', incoming.type);
console.error('error', incoming.data.err);
console.log('envelope', incoming.toJSON());`,
    boundary: `import Message from 'js-message';

const message = new Message({
    type: 'job.ready',
    data: { id: 'job_8' }
});

message.transport = 'local only';

console.log('instance', message);
console.log('wire', message.JSON);`
});

export default recipeSources;
