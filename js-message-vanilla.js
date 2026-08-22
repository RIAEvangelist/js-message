(function exposeMessage(scope) {
    const errorDetails = new WeakMap();

    function errorToJSON() {
        return errorDetails.get(this);
    }

    function makeSerializable(error) {
        let name = 'Error';
        let message = 'Unknown error';

        try {
            message = String(error);
        } catch {}

        if (error !== null && (typeof error === 'object' || typeof error === 'function')) {
            try {
                name = typeof error.name === 'string' ? error.name : name;
            } catch {}

            try {
                message = typeof error.message === 'string' ? error.message : message;
            } catch {}
        }

        try {
            if (error instanceof Error && Object.isExtensible(error)) {
                Object.defineProperty(error, 'toJSON', {
                    configurable: true,
                    value: errorToJSON
                });
                errorDetails.set(error, { name, message });
                return error;
            }
        } catch {}

        const replacement = new Error(message);
        replacement.name = name;
        Object.defineProperty(replacement, 'toJSON', {
            value: errorToJSON
        });
        errorDetails.set(replacement, { name, message });
        return replacement;
    }

    function parse(message) {
        if (typeof message === 'string') {
            return JSON.parse(message);
        }

        if (
            message !== null &&
            typeof message === 'object' &&
            !Array.isArray(message)
        ) {
            if (
                typeof message[Symbol.toPrimitive] !== 'function' &&
                (
                    message.toString === undefined ||
                    message.toString === Object.prototype.toString
                )
            ) {
                return message;
            }
        }

        return JSON.parse(message);
    }

    class Message {
        type = '';
        data = {};

        constructor(message) {
            if (arguments.length > 0) {
                this.load(message);
            }
        }

        get JSON() {
            return JSON.stringify({
                type: this.type,
                data: this.data
            });
        }

        toJSON() {
            return {
                type: this.type,
                data: this.data
            };
        }

        load(message) {
            try {
                const parsed = parse(message);
                this.type = parsed.type;
                this.data = parsed.data;
            } catch (error) {
                this.type = 'error';
                this.data = {
                    message: 'Invalid JSON response format',
                    err: makeSerializable(error),
                    response: message
                };
            }
        }
    }

    scope.Message = Message;
}(globalThis));
