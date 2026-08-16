![js-message carrying a structured message through a normalization gate between browser and server runtimes](https://raw.githubusercontent.com/RIAEvangelist/js-message/main/assets/js-message-header.png)

# js-message

A tiny, normalized JavaScript and JSON message envelope for every runtime boundary.

[Documentation](https://riaevangelist.github.io/js-message/) · [Get started](https://riaevangelist.github.io/js-message/guide/) · [API](https://riaevangelist.github.io/js-message/api/) · [Protocol](https://riaevangelist.github.io/js-message/protocol/) · [Browser](https://riaevangelist.github.io/js-message/browser/) · [Examples](https://riaevangelist.github.io/js-message/examples/) · [Testing](https://riaevangelist.github.io/js-message/testing/) · [Migration](https://riaevangelist.github.io/js-message/migration/)

[![CI](https://github.com/RIAEvangelist/js-message/actions/workflows/ci.yml/badge.svg)](https://github.com/RIAEvangelist/js-message/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/js-message.svg)](https://www.npmjs.com/package/js-message)
[![Node support](https://img.shields.io/node/v/js-message.svg)](package.json)
[![runtime dependencies](https://img.shields.io/badge/runtime_dependencies-0-7cf2a6)](package.json)
[![license](https://img.shields.io/github/license/RIAEvangelist/js-message.svg)](licence)

> **Current release:** js-message 3.0.0 is available on npm. Existing users should review the [v3 migration guide](https://riaevangelist.github.io/js-message/migration/) before upgrading.

`js-message` keeps the transport contract deliberately small:

```js
{
    type: 'event.or.message.name',
    data: { any: 'JSON-safe payload' }
}
```

Create the same shape in Node.js, browsers, WebSockets, workers, IPC, fetch, Electron, or any other JavaScript host. The package has no runtime dependencies, build, transpiler, or framework binding.

## Install

```sh
npm install js-message
```

## Quick start

```js
import Message from 'js-message';

const outgoing = new Message();
outgoing.type = 'user.updated';
outgoing.data = {
    id: 42,
    active: true
};

socket.send(outgoing.JSON);
```

Load the value at the other boundary:

```js
const incoming = new Message(receivedValue);

if (incoming.type === 'error') {
    console.error(incoming.data.err);
} else {
    route(incoming.type, incoming.data);
}
```

The constructor and `load()` accept either a JSON string or an existing message object.

## Contract

| Surface | Behavior |
| --- | --- |
| `new Message([input])` | Creates fresh `type` and `data` fields; optionally loads an envelope. |
| `message.type` | Mutable message or event discriminator. Defaults to `''`. |
| `message.data` | Mutable payload. Defaults to a fresh `{}` per instance. |
| `message.JSON` | JSON string containing exactly `{ type, data }`. |
| `message.toJSON()` | Plain `{ type, data }` object for structured-clone transports and `JSON.stringify`. |
| `message.load(input)` | Loads a valid envelope; returns `undefined` for legacy compatibility. |

A loadable envelope must be a non-array object with its own `type` and `data` keys. Malformed JSON or an invalid shape produces a recoverable error message:

```js
{
    type: 'error',
    data: {
        message: 'Invalid JSON response format',
        err: new SyntaxError('…'), // shape errors use TypeError
        response: originalInput
    }
}
```

The live `err` remains an `Error`. Its JSON form includes `name` and `message` instead of collapsing to `{}` when the preserved response is JSON-safe. A cyclic or `BigInt` response still follows native JSON behavior and throws.

## Imports

```js
// Canonical ES module
import Message, { Message as NamedMessage } from 'js-message';

// Supported legacy ES-module path
import LegacyMessage from 'js-message/Message.js';
```

For a classic browser script:

```html
<script src="./node_modules/js-message/js-message-vanilla.js"></script>
<script>
    const message = new Message({
        type: 'page.ready',
        data: { ok: true }
    });
</script>
```

The global entry assigns `globalThis.Message` and is tested against the ES-module contract.

## Verification

The protocol suite uses [vanilla-test](https://www.npmjs.com/package/vanilla-test) and runs as one untransformed module in Node.js and Chrome. CI also checks documentation links and metadata, the declared compatibility surface, native coverage, and the packed npm artifact.

```sh
npm ci
npm test
npm run coverage:node
npm run coverage:chrome
npm run test:package
npm start
```

Development and coverage require Node.js 22.12 or newer because vanilla-test v2 targets current Web-standard runtimes. The shipped module retains its existing Node.js `>=13.2.0` engine declaration and has a dependency-free compatibility smoke.

## License

[MIT](licence)
