import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import Message from '../Message.js';

const baselineVersion = '3.0.0';
const iterations = Number(process.env.BENCHMARK_ITERATIONS || 1000000);
const samples = Number(process.env.BENCHMARK_SAMPLES || 21);
const packageData = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
let constructionSink;

if (!Number.isSafeInteger(iterations) || iterations < 1) {
    throw new TypeError('BENCHMARK_ITERATIONS must be a positive integer.');
}

if (!Number.isSafeInteger(samples) || samples < 3) {
    throw new TypeError('BENCHMARK_SAMPLES must be an integer of at least 3.');
}

async function loadBaseline() {
    const source = execFileSync('git', ['show', `${baselineVersion}:Message.js`], {
        cwd: new URL('../', import.meta.url),
        encoding: 'utf8'
    });
    const moduleURL = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    return (await import(moduleURL)).default;
}

const jsonInput = '{"type":"benchmark","data":{"id":7,"active":true}}';
const objectInput = Object.freeze({
    data: Object.freeze({ active: true, id: 7 }),
    type: 'benchmark'
});
const expectedChecksum = iterations * 16;

function construct(Type, count) {
    const messages = new Array(count);

    for (let index = 0; index < count; index += 1) {
        messages[index] = new Type();
    }

    let checksum = 0;
    for (const message of messages) {
        checksum += Number(message.type === '');
    }

    constructionSink = messages;
    return checksum;
}

function loadJSON(Type, count) {
    const message = new Type();
    let checksum = 0;

    for (let index = 0; index < count; index += 1) {
        message.load(jsonInput);
        checksum += message.type.length + message.data.id;
    }

    return checksum;
}

function loadObject(Type, count) {
    const message = new Type();
    let checksum = 0;

    for (let index = 0; index < count; index += 1) {
        message.load(objectInput);
        checksum += message.type.length + message.data.id;
    }

    return checksum;
}

function duration(action) {
    constructionSink = undefined;
    global.gc?.();
    const started = performance.now();
    const checksum = action();
    return {
        checksum,
        milliseconds: performance.now() - started
    };
}

function median(values) {
    const ordered = [...values].sort((left, right) => left - right);
    const midpoint = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[midpoint] : (ordered[midpoint - 1] + ordered[midpoint]) / 2;
}

function compare(BaselineMessage, label, action, expected = expectedChecksum) {
    const baseline = [];
    const candidate = [];
    const warmupIterations = Math.max(1000, Math.floor(iterations / 10));

    for (let index = 0; index < 3; index += 1) {
        action(BaselineMessage, warmupIterations);
        action(Message, warmupIterations);
    }

    for (let index = 0; index < samples; index += 1) {
        const order = index % 2
            ? [[Message, candidate], [BaselineMessage, baseline]]
            : [[BaselineMessage, baseline], [Message, candidate]];

        for (const [Type, results] of order) {
            const measured = duration(() => action(Type, iterations));

            if (measured.checksum !== expected) {
                throw new Error(`${label} produced an invalid checksum.`);
            }

            results.push(measured.milliseconds);
        }
    }

    const baselineMedian = median(baseline);
    const candidateMedian = median(candidate);
    return {
        baseline: Number(baselineMedian.toFixed(2)),
        baselinePerSecond: Math.round(iterations / (baselineMedian / 1000)),
        candidate: Number(candidateMedian.toFixed(2)),
        candidatePerSecond: Math.round(iterations / (candidateMedian / 1000)),
        iterations,
        label,
        speedup: Number((baselineMedian / candidateMedian).toFixed(2)),
        unit: 'milliseconds'
    };
}

const BaselineMessage = await loadBaseline();
const results = {
    baseline: `${baselineVersion} strict envelope checks`,
    candidate: `${packageData.version} assignment semantics`,
    methodology: `Median of ${samples} alternating samples; lower is faster.`,
    metrics: [
        compare(BaselineMessage, 'Construct empty messages', construct, iterations),
        compare(BaselineMessage, 'Load JSON messages', loadJSON),
        compare(BaselineMessage, 'Load object messages', loadObject)
    ],
    package: packageData.name,
    platform: `${process.platform} ${process.arch}`,
    processor: os.cpus()[0]?.model || 'unknown',
    runtime: process.version
};

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
