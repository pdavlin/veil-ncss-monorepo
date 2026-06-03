#!/usr/bin/env node
/*
 * serve-rebuild — tiny no-cache static server for the rebuild.
 *
 * Python's http.server defaults to no cache headers at all, which lets
 * browsers heuristically cache HTML and serve stale markup. That's been
 * masking my code changes as "intermittent nav disappearance" — the user
 * was getting cached HTML from earlier builds that didn't have the new
 * markup.
 *
 * This server sets `Cache-Control: no-store` on every response so the
 * browser never holds onto anything from this dev origin. Pair with hard
 * refresh once to clear what's already in cache.
 *
 * Usage:
 *   node tools/serve-rebuild.mjs            # port 8080, sites/veil/_site
 *   node tools/serve-rebuild.mjs 8090 /tmp  # custom port + root
 */

import http from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';

const PORT = Number(process.argv[2] || 8080);
const ROOT = path.resolve(process.argv[3] || 'sites/veil/_site');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const handler = async (req, res) => {
  const url = new URL(req.url || '/', 'http://x/');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  let filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    res.statusCode = 403;
    res.end('forbidden');
    return;
  }
  let info;
  try {
    info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      info = await stat(filePath);
    }
  } catch {
    res.statusCode = 404;
    res.setHeader('cache-control', 'no-store');
    res.end('not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('content-type', MIME[ext] || 'application/octet-stream');
  res.setHeader('cache-control', 'no-store, no-cache, must-revalidate');
  res.setHeader('pragma', 'no-cache');
  res.setHeader('expires', '0');
  createReadStream(filePath).pipe(res);
};

const server = http.createServer(handler);

// macOS resolves `localhost` to `::1` first (IPv6 preference), so a server
// bound only to `127.0.0.1` gets shadowed if anything else has grabbed the
// IPv6 address — and binding to `::1` alone doesn't accept IPv4 loopback on
// darwin. Listening on both loopbacks is the only reliable way to make
// http://localhost:PORT work regardless of the resolver's order.
const server6 = http.createServer(handler);
server6.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`port ${PORT} (::1) already in use — IPv6 listener skipped`);
  } else throw err;
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`serve-rebuild → http://127.0.0.1:${PORT} (root: ${ROOT})`);
});
server6.listen(PORT, '::1', () => {
  console.log(`serve-rebuild → http://[::1]:${PORT}`);
  console.log('All responses sent with Cache-Control: no-store — browser will never cache.');
});
