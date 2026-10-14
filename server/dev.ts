// `npm run dev`: the server with the demo people on (D2M_DEMO=1), set here so it works the same on
// every OS (Windows has no `VAR=1 cmd`). `npm start` runs server/index.ts without it.

process.env.D2M_DEMO ??= '1';
await import('./index.js');

export {};
