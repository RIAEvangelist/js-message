(function exposeMessage(scope) {
    const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

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

        function attachSerializer(serializable) {
            Object.defineProperty(serializable, 'toJSON', {
                configurable: true,
                value() {
                    return { name, message };
                }
            });

            return serializable;
        }

        try {
            if (error instanceof Error && Object.isExtensible(error)) {
                return attachSerializer(error);
            }
        } catch {}

        const replacement = new Error(message);
        replacement.name = name;
        return attachSerializer(replacement);
    }

    function parse(message) {
        if (
            message !== null &&
            typeof message === 'object'
        ) {
            if (
                !Array.isArray(message) &&
                hasOwn(message, 'type') &&
                hasOwn(message, 'data')
            ) {
                return message;
            }

            if (
                !Array.isArray(message) &&
                (
                    typeof message[Symbol.toPrimitive] === 'function' ||
                    message.toString !== Object.prototype.toString
                )
            ) {
                return JSON.parse(message);
            }

            return message;
        }

        return JSON.parse(message);
    }

    function requireEnvelope(message) {
        if (message === null || typeof message !== 'object' || Array.isArray(message)) {
            throw new TypeError('Expected a message object.');
        }

        if (!hasOwn(message, 'type') || !hasOwn(message, 'data')) {
            throw new TypeError('Expected own "type" and "data" properties.');
        }

        return message;
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
                const parsed = requireEnvelope(parse(message));
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
