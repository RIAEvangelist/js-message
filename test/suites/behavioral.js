import {
    assert,
    equal,
    testCase,
    testSuite
} from './helpers.js';

const cases = [
    testCase('BEHAV-01', 'given a request, when it crosses two JSON boundaries, then its reply keeps the correlation ID', ({ Message }) => {
        const outgoing = new Message({
            type: 'profile.get',
            data: {
                requestId: 'request-17',
                userId: 42
            }
        });
        outgoing.sentAt = 1735689600000;

        const request = new Message(outgoing.JSON);
        const reply = new Message({
            type: 'profile.result',
            data: {
                name: 'Ada',
                requestId: request.data.requestId
            }
        });
        const received = new Message(reply.JSON);

        equal(received.type, 'profile.result');
        equal(received.data.requestId, 'request-17');
        equal(received.data.name, 'Ada');
        assert(!Object.hasOwn(request, 'sentAt'), 'Sender-only metadata crossed the request boundary.');
    }),
    testCase('BEHAV-02', 'given an object-transport snapshot, when the sender mutates later, then the receiver stays unchanged', ({ Message }) => {
        const payload = {
            id: 9,
            status: 'queued'
        };
        const outgoing = new Message({
            type: 'job.updated',
            data: payload
        });
        const snapshot = structuredClone(outgoing.toJSON());

        outgoing.type = 'job.completed';
        payload.status = 'running';

        const received = new Message(snapshot);
        equal(received.type, 'job.updated');
        equal(received.data.status, 'queued');
        assert(received.data !== payload, 'The transport snapshot retained the sender payload reference.');
    }),
    testCase('BEHAV-03', 'given a payload-free signal, when the consumer routes it, then the acknowledgement fabricates no data', ({ Message }) => {
        const signal = new Message({ type: 'heartbeat' });
        const received = new Message(signal.JSON);
        let acknowledgement;

        if (received.type === 'heartbeat') {
            equal(received.data, undefined);
            acknowledgement = new Message({ type: 'heartbeat.ack' });
        }

        assert(acknowledgement instanceof Message, 'The heartbeat handler was not selected.');
        equal(acknowledgement.JSON, '{"type":"heartbeat.ack"}');
    }),
    testCase('BEHAV-04', 'given malformed inbound text, when its diagnostic crosses a second boundary, then it stays readable', ({ Message }) => {
        const raw = '{not valid json';
        const diagnostic = new Message(raw);
        const observed = new Message(diagnostic.JSON);

        equal(observed.type, 'error');
        equal(observed.data.response, raw);
        equal(observed.data.err.name, 'SyntaxError');
        assert(observed.data.err.message.length > 0, 'The transported diagnostic lost its error message.');
    }),
    testCase('BEHAV-05', 'given a long-lived receiver, when payloadless and invalid frames arrive, then later messages remain clean', ({ Message }) => {
        const receiver = new Message();
        const observed = [];

        for (const frame of [
            '{"type":"queue.item","data":{"id":1}}',
            '{"type":"queue.idle"}',
            '{broken',
            '{"type":"queue.item","data":{"id":2}}'
        ]) {
            receiver.load(frame);
            observed.push({
                type: receiver.type,
                id: receiver.data?.id
            });
        }

        equal(JSON.stringify(observed), JSON.stringify([
            { type: 'queue.item', id: 1 },
            { type: 'queue.idle' },
            { type: 'error' },
            { type: 'queue.item', id: 2 }
        ]));
    }),
    testCase('BEHAV-06', 'given module and browser-global peers, when they exchange a request, then the reply returns bidirectionally', ({ GlobalMessage, Message }) => {
        const moduleRequest = new Message({
            type: 'session.open',
            data: { clientId: 'client-4' }
        });
        const globalRequest = new GlobalMessage(moduleRequest.JSON);
        const globalReply = new GlobalMessage({
            type: 'session.ready',
            data: {
                clientId: globalRequest.data.clientId,
                sessionId: 'session-12'
            }
        });
        const moduleReply = new Message(globalReply.JSON);

        equal(globalRequest.type, 'session.open');
        equal(moduleReply.type, 'session.ready');
        equal(moduleReply.data.clientId, 'client-4');
        equal(moduleReply.data.sessionId, 'session-12');
    })
];

export default testSuite('behavioral', 'Behavioral', cases);
