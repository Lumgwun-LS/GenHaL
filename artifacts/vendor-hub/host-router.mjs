/**
 * Host-based static router for production.
 *
 * awajimaaappstore.com / www.awajimaaappstore.com
 *   → serves artifacts/app-store/dist/standalone  (built with BASE_PATH=/)
 *
 * everything else (awajimaaai.com, *.replit.app, etc.)
 *   → serves artifacts/vendor-hub/dist/public      (Awa Biz Suite)
 *
 * /api/__clerk (any host)
 *   → proxied to api.awajimaaai.com/api/__clerk    (Clerk Frontend API proxy)
 *
 * Both static roots serve as SPAs: any unmatched path falls back to index.html.
 */

import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = parseInt(process.env.PORT || '22220', 10);

const CLERK_PROXY_PATH  = '/api/__clerk';
// clerk.awajimaaai.com is the Clerk custom FAPI domain (encoded in pk_live key).
// api.awajimaaai.com is a different host that serves HTML — do NOT use it for Clerk.
const CLERK_FAPI_HOST   = 'clerk.awajimaaai.com';

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

/**
 * Proxy a request to the Clerk FAPI (clerk.awajimaaai.com).
 * Strips the /api/__clerk prefix so that, e.g.:
 *   incoming: /api/__clerk/v1/environment
 *   forwarded: /v1/environment
 */
function proxyClerk(req, res) {
  const incomingHost = req.headers['x-forwarded-host'] || req.headers['host'] || '';

  // Strip the /api/__clerk mount-point so Clerk FAPI receives the bare /v1/... path.
  const clerkPath = (req.url || '/').replace(/^\/api\/__clerk/, '') || '/';

  const headers = {
    ...req.headers,
    host: CLERK_FAPI_HOST,
    'x-forwarded-host': incomingHost,
    'x-forwarded-proto': 'https',
  };
  delete headers['connection'];
  delete headers['keep-alive'];

  const options = {
    hostname: CLERK_FAPI_HOST,
    port: 443,
    method: req.method,
    path: clerkPath,   // /v1/... (prefix stripped)
    headers,
  };

  const proxyReq = httpsRequest(options, (proxyRes) => {
    const resHeaders = { ...proxyRes.headers };
    delete resHeaders['connection'];
    delete resHeaders['keep-alive'];
    delete resHeaders['transfer-encoding'];

    res.writeHead(proxyRes.statusCode || 502, resHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[clerk-proxy] upstream error:', err.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  });

  req.pipe(proxyReq, { end: true });
}

const server = createServer((req, res) => {
  // Route Clerk proxy requests regardless of host.
  if (req.url && (req.url === CLERK_PROXY_PATH || req.url.startsWith(CLERK_PROXY_PATH + '/'))) {
    proxyClerk(req, res);
    return;
  }

  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  const isAppStore =
    host === 'awajimaaappstore.com' ||
    host === 'www.awajimaaappstore.com';

  serveStatic(isAppStore ? APP_STORE_ROOT : BIZ_SUITE_ROOT, req.url, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Host router listening on :${PORT}`);
  console.log(`  /api/__clerk/*        → proxy (prefix stripped) → ${CLERK_FAPI_HOST}`);
  console.log(`  awajimaaappstore.com  → ${APP_STORE_ROOT}`);
  console.log(`  * (default)           → ${BIZ_SUITE_ROOT}`);
});
