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

function testCase(id, description, run) {
    return Object.freeze({
        description,
        id,
        run
    });
}

function testSuite(id, name, cases) {
    return Object.freeze({
        cases: Object.freeze(cases),
        id,
        name
    });
}

function implementations(context) {
    return [
        context.Message,
        context.GlobalMessage
    ];
}

function throwingInput(thrown) {
    const input = { data: {} };
    Object.defineProperty(input, 'type', {
        get() {
            throw thrown;
        }
    });
    return input;
}

export {
    assert,
    equal,
    implementations,
    testCase,
    testSuite,
    throwingInput,
    throws
};
