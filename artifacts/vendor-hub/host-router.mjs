/**
 * Host-based static router for production.
 *
 * awajimaaappstore.com / www.awajimaaappstore.com
 *   → serves artifacts/app-store/dist/standalone  (built with BASE_PATH=/)
 *
 * everything else (awajimaaai.com, *.replit.app, etc.)
 *   → serves artifacts/vendor-hub/dist/public      (Awa Biz Suite)
 *
 * Both serve as SPAs: any unmatched path falls back to index.html.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = parseInt(process.env.PORT || '22220', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.eot':  'application/vnd.ms-fontobject',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.txt':  'text/plain',
  '.xml':  'application/xml',
};

const APP_STORE_ROOT = resolve(__dirname, '..', 'app-store', 'dist', 'standalone');
const BIZ_SUITE_ROOT = resolve(__dirname, 'dist', 'public');

function serveStatic(root, reqUrl, res) {
  // Decode URL and strip query string
  let urlPath = decodeURIComponent((reqUrl || '/').split('?')[0]);
  if (!urlPath.startsWith('/')) urlPath = '/' + urlPath;

  // Resolve to absolute path and guard against traversal
  const abs = resolve(join(root, urlPath));
  if (!abs.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let filePath = abs;

  // Directory → try index.html inside it
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const mime = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    createReadStream(filePath).pipe(res);
  } else {
    // SPA fallback — serve root index.html for all unmatched paths
    const idx = join(root, 'index.html');
    if (existsSync(idx)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      createReadStream(idx).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }
}

const server = createServer((req, res) => {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  const isAppStore =
    host === 'awajimaaappstore.com' ||
    host === 'www.awajimaaappstore.com';

  serveStatic(isAppStore ? APP_STORE_ROOT : BIZ_SUITE_ROOT, req.url, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Host router listening on :${PORT}`);
  console.log(`  awajimaaappstore.com  → ${APP_STORE_ROOT}`);
  console.log(`  * (default)           → ${BIZ_SUITE_ROOT}`);
});
