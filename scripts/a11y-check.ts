#!/usr/bin/env tsx
/*
 * a11y-check — serves a built site over localhost and runs axe-core against every
 * index.html. Fails on critical/serious violations.
 *
 * Usage: tsx scripts/a11y-check.ts <site-dir>
 *   e.g. tsx scripts/a11y-check.ts sites/veil/_site
 *
 * We need a real HTTP server (not file://) so root-absolute stylesheet/asset
 * paths resolve and axe sees the styled DOM.
 */

import { createReadStream } from 'node:fs';
import { stat, readdir } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

interface ViolationNode {
  target: string[];
  failureSummary?: string;
}
interface Violation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  description: string;
  nodes?: ViolationNode[];
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function makeServer(root: string): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost/');
        let pathname = decodeURIComponent(url.pathname);
        if (pathname.endsWith('/')) pathname += 'index.html';
        const filePath = path.join(root, pathname);
        if (!filePath.startsWith(root)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        const info = await stat(filePath).catch(() => null);
        if (!info || !info.isFile()) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('content-type', MIME[ext] || 'application/octet-stream');
        res.setHeader('cache-control', 'no-store');
        createReadStream(filePath).pipe(res);
      } catch (err) {
        res.statusCode = 500;
        res.end(String((err as Error)?.message || err));
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function walkHtml(dir: string, root: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // admin/ is the Decap CMS entry — its UI renders client-side, so static
      // a11y analysis isn't meaningful there.
      if (entry.name === 'assets' || entry.name === '.smoke' || entry.name === 'admin') continue;
      await walkHtml(full, root, out);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const rel = '/' + path.relative(root, full).split(path.sep).join('/');
      out.push(rel);
    }
  }
}

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: a11y-check <site-dir>');
    process.exit(2);
  }

  let chromium: any;
  let AxeBuilder: any;
  try {
    ({ chromium } = await import('playwright'));
    const axeMod = await import('@axe-core/playwright');
    AxeBuilder = axeMod.default;
  } catch {
    console.error('a11y-check: playwright or @axe-core/playwright not installed.');
    console.error('  pnpm add -D playwright @axe-core/playwright');
    console.error('  pnpm exec playwright install --with-deps chromium');
    process.exit(2);
  }

  const root = path.resolve(target);
  const urls: string[] = [];
  await walkHtml(root, root, urls);
  if (urls.length === 0) {
    console.error(`a11y-check: no .html files under ${target}`);
    process.exit(1);
  }

  const { server, baseUrl } = await makeServer(root);

  try {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    let failed = 0;

    for (const rel of urls) {
      await page.goto(`${baseUrl}${rel}`);
      const { violations } = await new AxeBuilder({ page })
        .options({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] } })
        .analyze();
      const blocking = (violations as Violation[]).filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      if (blocking.length) {
        console.error(`${rel}: ${blocking.length} blocking violation(s)`);
        for (const v of blocking) {
          console.error(`  - [${v.impact}] ${v.id}: ${v.description}`);
          // surface the first failing node so CI logs actually tell you what
          // selector + failure summary to fix. without this you just know the
          // rule id and have to bisect locally.
          if (v.nodes && v.nodes.length) {
            const n = v.nodes[0];
            console.error(`      target: ${n.target?.join(' ')}`);
            if (n.failureSummary) {
              const summary = n.failureSummary.replace(/\n/g, ' ');
              console.error(`      detail: ${summary}`);
            }
            if (v.nodes.length > 1) {
              console.error(`      (${v.nodes.length - 1} additional node(s))`);
            }
          }
        }
        failed += blocking.length;
      }
    }

    await browser.close();
    if (failed) {
      console.error(`a11y-check: ${failed} blocking violation(s) across ${urls.length} page(s).`);
      process.exit(1);
    }
    console.log(`a11y-check: OK (${urls.length} page(s) scanned).`);
  } finally {
    server.close();
  }
}

void main();
