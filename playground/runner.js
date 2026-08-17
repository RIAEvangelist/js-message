import {
    defaultSource,
    limits,
    prepareSource,
    serializeOutput
} from './runtime.js';

const source = document.querySelector('#source');
const output = document.querySelector('#output');
const runButton = document.querySelector('#run');
const runStatus = document.querySelector('#run-status');
const allowedLevels = new Set(['error', 'info', 'log', 'success', 'warn']);
const parentOrigin = new URL(import.meta.url).origin;
let activeRun = null;
let outputBytes = 0;

function appendOutput(level, text) {
    const normalizedLevel = allowedLevels.has(level) ? level : 'log';
    const normalizedText = typeof text === 'string' ? text.slice(0, limits.lineBytes) : '[Unreadable output]';

    if (output.childElementCount >= limits.outputLines || outputBytes + normalizedText.length > limits.outputBytes) {
        return false;
    }

    const item = document.createElement('li');
    item.className = normalizedLevel;
    item.dataset.level = normalizedLevel;
    item.textContent = normalizedText;
    output.append(item);
    outputBytes += normalizedText.length;
    output.scrollTop = output.scrollHeight;
    return true;
}

function clearOutput() {
    output.replaceChildren();
    outputBytes = 0;
}

function stopActiveRun() {
    if (!activeRun) {
        return;
    }

    globalThis.clearTimeout(activeRun.timeout);
    activeRun.port.close();
    activeRun.worker.terminate();
    activeRun = null;
}

function finishRun(status, message, level) {
    if (!activeRun) {
        return;
    }

    stopActiveRun();
    runButton.disabled = false;
    runButton.textContent = 'Run Ctrl/⌘↵';
    runStatus.textContent = status;

    if (message) {
        appendOutput(level, message);
    }
}

function workerModule() {
    const serialize = serializeOutput.toString();

    return `
const __playgroundSerialize = ${serialize};
globalThis.addEventListener('message', async ({ data }) => {
    if (!data || typeof data.source !== 'string' || !data.port || !data.limits) {
        globalThis.close();
        return;
    }

    const __playgroundPort = data.port;
    const __playgroundPost = __playgroundPort.postMessage.bind(__playgroundPort);
    const __playgroundClose = globalThis.close.bind(globalThis);
    const __playgroundCreateURL = URL.createObjectURL.bind(URL);
    const __playgroundRevokeURL = URL.revokeObjectURL.bind(URL);
    const __playgroundBlob = Blob;
    const __playgroundLimits = data.limits;
    let __playgroundBytes = 0;
    let __playgroundLines = 0;
    let __playgroundLimited = false;

    const __playgroundOutput = (level, values) => {
        if (__playgroundLimited) {
            return;
        }

        let text = '';

        for (const value of values) {
            const separator = text ? ' ' : '';
            const available = __playgroundLimits.lineBytes - text.length - separator.length;

            if (available <= 0) {
                break;
            }

            text += separator + __playgroundSerialize(value, available);
        }

        if (__playgroundLines >= __playgroundLimits.outputLines || __playgroundBytes + text.length > __playgroundLimits.outputBytes) {
            __playgroundLimited = true;
            __playgroundPost({ type: 'limit' });
            return;
        }

        __playgroundLines += 1;
        __playgroundBytes += text.length;
        __playgroundPost({ type: 'output', level, text });
    };

    for (const level of ['log', 'info', 'warn', 'error']) {
        console[level] = (...values) => __playgroundOutput(level, values);
    }

    const __playgroundURL = __playgroundCreateURL(new __playgroundBlob([data.source], { type: 'text/javascript' }));

    try {
        await import(__playgroundURL);
        __playgroundPost({ type: 'complete' });
    } catch (error) {
        const text = __playgroundSerialize(error, __playgroundLimits.lineBytes);
        __playgroundPost({ type: 'failure', text });
    } finally {
        __playgroundRevokeURL(__playgroundURL);
        __playgroundPort.close();
        __playgroundClose();
    }
}, { once: true });
`;
}

function restoreControls() {
    runButton.disabled = false;
    runButton.textContent = 'Run Ctrl/⌘↵';
}

function run() {
    stopActiveRun();
    clearOutput();
    runButton.disabled = true;
    runButton.textContent = 'Running…';
    runStatus.textContent = 'Running';

    let channel;
    let worker;
    let workerURL;

    try {
        const moduleURL = new URL('../index.js', import.meta.url).href;
        const prepared = prepareSource(source.value, moduleURL);
        workerURL = URL.createObjectURL(new Blob([workerModule()], { type: 'text/javascript' }));
        worker = new Worker(workerURL, { type: 'module', name: 'js-message-playground' });
        channel = new MessageChannel();

        const timeout = globalThis.setTimeout(() => {
            finishRun('Stopped after 3 seconds', 'Run stopped: the snippet exceeded the 3 second limit.', 'warn');
        }, limits.runMilliseconds);
        activeRun = { port: channel.port1, timeout, worker };

        channel.port1.addEventListener('message', ({ data }) => {
            if (!activeRun || activeRun.worker !== worker || !data || typeof data !== 'object') {
                return;
            }

            if (data.type === 'output') {
                if (!appendOutput(data.level, data.text)) {
                    finishRun('Output limit reached', 'Run stopped: console output exceeded the playground limit.', 'warn');
                }
                return;
            }

            if (data.type === 'limit') {
                finishRun('Output limit reached', 'Run stopped: console output exceeded the playground limit.', 'warn');
                return;
            }

            if (data.type === 'complete') {
                finishRun('Completed', 'Module completed', 'success');
                return;
            }

            if (data.type === 'failure') {
                finishRun('Failed', data.text, 'error');
            }
        });
        channel.port1.addEventListener('messageerror', () => {
            finishRun('Failed', 'The worker returned an unreadable result.', 'error');
        });
        channel.port1.start();

        worker.addEventListener('error', (event) => {
            event.preventDefault();
            finishRun('Failed', event.message || 'The worker could not run this module.', 'error');
        });
        worker.postMessage({
            limits,
            port: channel.port2,
            source: prepared
        }, [channel.port2]);
    } catch (error) {
        if (activeRun) {
            stopActiveRun();
        } else {
            channel?.port1.close();
            channel?.port2.close();
            worker?.terminate();
        }

        restoreControls();
        runStatus.textContent = 'Could not start';
        appendOutput('error', serializeOutput(error));
        return;
    } finally {
        if (workerURL) {
            URL.revokeObjectURL(workerURL);
        }
    }
}

source.value = defaultSource;
runButton.addEventListener('click', run);
document.querySelector('#reset').addEventListener('click', () => {
    stopActiveRun();
    source.value = defaultSource;
    clearOutput();
    restoreControls();
    runStatus.textContent = 'Ready';
    source.focus();
});
document.querySelector('#clear').addEventListener('click', clearOutput);
document.querySelector('#copy').addEventListener('click', () => {
    parent.postMessage({
        type: 'js-message:copy',
        source: source.value
    }, parentOrigin);
});

source.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && (event.shiftKey || source.dataset.tabExit === 'true')) {
        delete source.dataset.tabExit;
        return;
    }

    if (event.key === 'Tab' && !event.shiftKey && source.dataset.tabExit !== 'true') {
        event.preventDefault();
        const start = source.selectionStart;
        source.setRangeText('    ', start, source.selectionEnd, 'end');
    }

    if (event.key === 'Escape') {
        source.dataset.tabExit = 'true';
        runStatus.textContent = 'Tab leaves editor';
    } else if (event.key !== 'Tab') {
        delete source.dataset.tabExit;
    }

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        run();
    }
});

globalThis.addEventListener('message', (event) => {
    if (event.source !== parent || event.origin !== parentOrigin || !event.data || typeof event.data !== 'object') {
        return;
    }

    if (event.data.type === 'js-message:load' && typeof event.data.source === 'string') {
        stopActiveRun();
        restoreControls();

        if (event.data.source.length > limits.sourceBytes) {
            clearOutput();
            appendOutput('error', `Example exceeds the ${limits.sourceBytes} character source limit.`);
            runStatus.textContent = 'Example rejected';
            return;
        }

        source.value = event.data.source;
        clearOutput();
        runStatus.textContent = 'Example loaded';
        source.focus();
    }

    if (event.data.type === 'js-message:copy-result') {
        const copyButton = document.querySelector('#copy');
        copyButton.textContent = event.data.ok ? 'Copied' : 'Copy failed';
        globalThis.setTimeout(() => {
            copyButton.textContent = 'Copy';
        }, 1400);
    }
});

parent.postMessage({ type: 'js-message:ready' }, parentOrigin);
