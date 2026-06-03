#!/usr/bin/env node
/* Minimal static server for harness/. Zero deps. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const PORT = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = decoded === '/' ? '/harness/index.html' : decoded;
  const resolved = normalize(join(ROOT, target));
  if (!resolved.startsWith(ROOT + sep) && resolved !== ROOT) {
    return null;
  }
  return resolved;
}

const server = createServer(async (req, res) => {
  try {
    const path = safeResolve(req.url ?? '/');
    if (!path) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const s = await stat(path).catch(() => null);
    const fileToServe = s?.isDirectory() ? join(path, 'index.html') : path;
    const body = await readFile(fileToServe);
    const type = TYPES[extname(fileToServe)] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  } catch (err) {
    res.writeHead(404);
    res.end(`not found: ${req.url}`);
  }
});

server.listen(PORT, () => {
  console.log(`harness → http://localhost:${PORT}/harness/index.html`);
});
