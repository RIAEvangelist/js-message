# Migrating to js-message 3.1

js-message 3.1 keeps the mutable `Message` surface, restores optional message fields, and lets ESM and CommonJS load one synchronous source file. It has no runtime dependency or build step.

js-message works with bundlers and without a bundler. Bundlers resolve the bare package import normally. Native browser ESM uses a standard import map with no build or transpilation step.

## Move Node.js to 22.13 or newer

Version 3.1 raises the declared runtime floor:

```json
{
    "engines": {
        "node": ">=22.13.0"
    }
}
```

Node 22.13 is the first 22.x release where synchronous `require(ESM)` no longer emits an experimental warning by default.

## Preserved behavior

- `import Message from 'js-message'`
- `const Message = require('js-message')`
- `import Message from 'js-message/Message.js'`
- `js-message/js-message-vanilla.js` assigning `globalThis.Message`
- Mutable, enumerable `type` and `data` fields
- The `JSON` getter
- `load()` returning `undefined`
- JSON-coercible Buffer, boxed-string, typed-view, and custom text inputs
- JSON values with missing `type` or `data` fields assigning `undefined`

## New conveniences

Construct from JSON or an existing envelope:

```js
const fromJSON = new Message('{"type":"ready","data":{"ok":true}}');

const fromObject = new Message({
    type: 'ready',
    data: { ok: true }
});
```

Use a plain object at structured-clone boundaries:

```js
worker.postMessage(fromObject.toJSON());
```

Native stringification now uses the same exact envelope:

```js
JSON.stringify(fromObject) === fromObject.JSON; // true
```

## Optional fields are restored

Version 3.0 treated missing keys as a schema failure. Version 3.1 returns to the original assignment contract:

```js
const ping = new Message('{"type":"ping"}');

ping.type === 'ping';
ping.data === undefined;
ping.JSON === '{"type":"ping"}';
```

The same rule applies to direct object input. `type` and `data` are conventions, not a schema imposed by this package. Malformed JSON still becomes a recoverable `type: 'error'` message.

## ESM and CommonJS share one constructor

New ESM code remains unchanged:

```js
import Message from 'js-message';
```

CommonJS is synchronous on Node 22.13 and newer:

```js
const Message = require('js-message');
```

Both forms resolve to `Message.js`. No parallel `.cjs` implementation is shipped.

## Native browser ESM without a bundler

Put a complete import map before the module script:

```html
<script type="importmap">
{
    "imports": {
        "js-message": "./node_modules/js-message/index.js"
    }
}
</script>
<script type="module">
    import Message from 'js-message';
</script>
```

The mapped path is relative to the HTML document. Serve the application over HTTP(S), and configure the server to expose the referenced `node_modules` file; `file://` is not supported. Version 3.1.1 has zero runtime dependencies, so there are no dependency or scoped-map entries to add. A future runtime dependency would need its own bare-name mapping and, when npm nests a conflicting version, a scope under `./node_modules/js-message/` that preserves the same package boundary used by Node and bundlers.

## Serializable errors

The live error remains a native `SyntaxError` or `TypeError`, but the JSON envelope now keeps its useful details:

```js
const message = new Message('{broken');

message.data.err instanceof SyntaxError; // true
JSON.parse(message.JSON).data.err;
// { name: 'SyntaxError', message: '...' }
```

The original input remains available at `data.response`. If that response is cyclic or contains `BigInt`, serializing the complete error envelope still follows native JSON behavior and throws.

## Browser-global descriptor changes

The v3 browser-global class now matches the ES-module class: `JSON` and `load` are non-enumerable prototype members instead of own properties. `JSON.stringify(globalMessage)` therefore emits the normalized two-key envelope through `toJSON()`. Code that inspected legacy property descriptors should migrate to the public fields and methods.

## Development requirements

The package, repository tests, benchmark, and native coverage require Node.js 22.13 or newer.

See the focused [migration page](https://riaevangelist.github.io/js-message/migration/), [decision guide](https://riaevangelist.github.io/js-message/why/), and [performance evidence](https://riaevangelist.github.io/js-message/performance/) for the complete 3.1 story.
