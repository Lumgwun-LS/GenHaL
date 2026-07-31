// cPanel Node.js Application startup file
// This CommonJS wrapper dynamically imports the ESM bundle so LiteSpeed
// Passenger can boot the server regardless of its ESM support level.
//
// In cPanel Node.js Application Manager, set:
//   Application startup file: server.js
//
// Make sure you have run `npm run build` (or `pnpm run build`) BEFORE
// uploading — this file imports from ./dist/index.mjs which is the compiled output.

import("./dist/index.mjs").catch((err) => {
  console.error("[startup] Failed to start API server:", err);
  process.exit(1);
});
