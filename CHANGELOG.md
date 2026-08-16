# Changelog

All notable changes to js-message are documented here.

## 3.0.0 - 2026-08-16

### Added

- A canonical `index.js` entry with matching default and named `Message` exports.
- Constructor and `load()` support for existing `{ type, data }` objects.
- Compatibility parsing for Buffer, boxed strings, typed views, and other JSON-coercible text inputs accepted by earlier releases.
- A public `toJSON()` method for structured-clone transports and native `JSON.stringify` integration.
- A shared vanilla-test protocol suite for Node and real-browser coverage.
- Package compatibility, documentation, local-link, and packed-artifact verification.
- Focused, accessible GitHub Pages documentation for getting started, API, protocol, browsers, examples, testing, and migration.
- A generated three-to-one repository header and social preview.

### Changed

- Valid JSON values without own `type` and `data` keys now become error envelopes instead of silently producing undefined fields.
- The legacy browser-global implementation now matches the ES-module contract and targets `globalThis`.
- Package metadata uses an explicit file allowlist and supported export map while preserving both legacy deep paths.
- Local documentation serving no longer needs `node-http-server`.

### Fixed

- Serialized parse and validation errors now retain stable `name` and `message` fields when the preserved response is JSON-safe.
- The package lock metadata, scripts, homepage, description, and dependency classification now match `package.json`.
- Browser examples use valid closing script tags and standard WebSocket event APIs.

## 2.1.0 - 2024-01-11

### Changed

- Updated the ES-module release after a message-loading behavior correction.

## 2.0.1 - 2024-01-11

### Fixed

- Corrected README and package-root documentation details.

## 2.0.0 - 2024-01-11

### Changed

- Converted the package to native ES modules for Node.js and browsers.
