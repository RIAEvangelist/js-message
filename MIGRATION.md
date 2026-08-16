# Migrating to js-message 3

js-message 3 preserves the established mutable `Message` surface and both legacy entry paths. It makes the accepted envelope shape explicit and adds object-friendly construction without adding a runtime dependency.

## Preserved behavior

- `import Message from 'js-message'`
- `import Message from 'js-message/Message.js'`
- `js-message/js-message-vanilla.js` assigning `globalThis.Message`
- Mutable, enumerable `type` and `data` fields
- The `JSON` getter
- `load()` returning `undefined`
- JSON-coercible Buffer, boxed-string, typed-view, and custom text inputs
- The declared Node.js `>=13.2.0` engine floor

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

## Stricter invalid-input handling

Earlier releases could silently accept valid JSON values that were not messages:

```js
const message = new Message();
message.load('{}');

// Earlier: type and data became undefined.
// Modernized: type is 'error' and data.err is a TypeError.
```

A loadable value must now be a non-array object with its own `type` and `data` keys. Audit any sender that intentionally omitted either key.

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

The shipped module retains its legacy Node.js engine declaration. Repository tests and native coverage require Node.js 22.12 or newer because they use vanilla-test v2.

See the focused [migration page](https://riaevangelist.github.io/js-message/migration/) and [protocol contract](https://riaevangelist.github.io/js-message/protocol/) for the complete behavior.
