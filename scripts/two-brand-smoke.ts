#!/usr/bin/env tsx
/*
 * two-brand-smoke — rebuilds a representative Veil page with the NCSS-stub brand
 * layer swapped in, then runs axe-core against it. Catches accidental brand
 * coupling in shared components.
 *
 * Assumes the Veil site has already been built into sites/veil/_site.
 */

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

const VEIL_OUT = 'sites/veil/_site';
const SMOKE_DIR = path.join(VEIL_OUT, '.smoke');

interface Violation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  description: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
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
        res.setHeader(
          'content-type',
          MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        );
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

async function main(): Promise<void> {
  const indexHtmlPath = path.join(VEIL_OUT, 'index.html');
  let html: string;
  try {
    html = await readFile(indexHtmlPath, 'utf8');
  } catch {
    console.error(`two-brand-smoke: ${indexHtmlPath} not found. Run the site build first.`);
    process.exit(1);
  }

  const swapped = html
    .replace('data-brand="veil"', 'data-brand="ncss"')
    .replace(/styles\/tokens-veil\//g, 'styles/tokens-ncss/');

  await mkdir(SMOKE_DIR, { recursive: true });
  const smokeIndex = path.join(SMOKE_DIR, 'index.html');
  await writeFile(smokeIndex, swapped, 'utf8');

  let chromium: any;
  let AxeBuilder: any;
  try {
    ({ chromium } = await import('playwright'));
    const axeMod = await import('@axe-core/playwright');
    AxeBuilder = axeMod.default;
  } catch {
    console.error('two-brand-smoke: playwright / @axe-core/playwright not installed.');
    process.exit(2);
  }

  const root = path.resolve(VEIL_OUT);
  const { server, baseUrl } = await makeServer(root);

  try {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/.smoke/index.html`);
    const { violations } = await new AxeBuilder({ page })
      .options({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] } })
      .analyze();
    const blocking = (violations as Violation[]).filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    await browser.close();

    if (blocking.length) {
      console.error('two-brand-smoke: FAIL — components leaked Veil identity or have brand-coupled a11y bugs.');
      for (const v of blocking) {
        console.error(`  - [${v.impact}] ${v.id}: ${v.description}`);
      }
      process.exit(1);
    }
    console.log('two-brand-smoke: OK');
  } finally {
    server.close();
  }
}

void main();
