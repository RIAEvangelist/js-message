import run from './CI.js';

const result = await run();
process.exitCode = result.ok ? 0 : 1;
