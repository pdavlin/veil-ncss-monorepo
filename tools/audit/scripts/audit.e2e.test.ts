import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AddressInfo } from 'node:net';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { extractContrast as _extract } from './audit-a11y-extract.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'fixtures');

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url === '/' ? '/index.html' : req.url ?? '/index.html';
    const filePath = path.join(FIXTURES, url.replace(/^\//, ''));
    if (!filePath.startsWith(FIXTURES) || !fs.existsSync(filePath)) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(filePath));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('a11y fixture audit', () => {
  it('detects the known contrast failure on the homepage', async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
      const results = await new AxeBuilder({ page })
        .options({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] } })
        .analyze();
      const contrastViolation = results.violations.find((v) => v.id === 'color-contrast');
      expect(contrastViolation).toBeDefined();
      const node = contrastViolation!.nodes[0]!;
      expect(node.failureSummary).toContain('contrast');
      const detail = _extract(node.failureSummary ?? '');
      expect(detail).toBeDefined();
      expect(detail!.ratio).toBeLessThan(detail!.required);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
