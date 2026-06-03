#!/usr/bin/env tsx
/*
 * screenshot-page — capture a full-page PNG for parity comparison.
 *
 * Usage:
 *   pnpm exec tsx tools/screenshot-page.ts --variant live-desktop --url https://www.veilengineering.com/ --out /tmp/parity/live-desktop.png
 *   pnpm exec tsx tools/screenshot-page.ts --variant live-mobile  --url https://www.veilengineering.com/ --mobile --out /tmp/parity/live-mobile.png
 *
 * Used by the page-parity workflow to feed a multimodal judge.
 */

import process from 'node:process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices, type Page } from 'playwright';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(name: string): boolean {
  return process.argv.includes(name);
}

async function scrollAll(page: Page): Promise<void> {
  await page.evaluate(`(async () => {
    const step = window.innerHeight / 2;
    const total = document.documentElement.scrollHeight;
    for (let y = 0; y < total; y += step) {
      window.scrollTo(0, y);
      await new Promise(function (r) { setTimeout(r, 80); });
    }
    window.scrollTo(0, 0);
  })()`);
}

async function main(): Promise<void> {
  const url = flag('--url');
  const variant = flag('--variant');
  const out = flag('--out');
  const isMobile = has('--mobile');

  if (!url || !variant || !out) {
    console.error('usage: screenshot-page --variant <name> --url <url> --out <path> [--mobile]');
    process.exit(2);
  }

  await mkdir(path.dirname(out), { recursive: true });

  const browser = await chromium.launch();
  const contextOpts = isMobile
    ? { ...devices['iPhone 15'] }
    : { viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15' };
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();

  const label = flag('--label') || variant.toUpperCase();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await scrollAll(page);
    await page.waitForTimeout(800);

    // hide elements with computed position: fixed or sticky so they don't get
    // stamped over scrollable content in the full-page screenshot composite.
    // a viewport-fixed bottom bar like quick-contact-bar otherwise lands at
    // viewport-y on the final stitched PNG, which makes the judge agent
    // think the bar is rendered inline above unrelated content.
    await page.evaluate(`
      (() => {
        const all = document.querySelectorAll('*');
        for (let i = 0; i < all.length; i++) {
          const el = all[i];
          const pos = getComputedStyle(el).position;
          if (pos === 'fixed' || pos === 'sticky') {
            el.setAttribute('data-parity-hidden', 'true');
            el.style.setProperty('display', 'none', 'important');
          }
        }
      })()
    `);
    await page.waitForTimeout(100);

    // Inject a corner watermark BEFORE screenshot so the judge agent can't confuse
    // which variant it's looking at (it gets two long full-page PNGs per pair).
    // Uses position: absolute (not fixed) and high z-index so it survives full-page capture.
    const labelText = label.replace(/[\\'"<>&]/g, '');
    await page.evaluate(`
      (() => {
        const tag = document.createElement('div');
        tag.textContent = ${JSON.stringify(labelText)};
        tag.setAttribute('aria-hidden', 'true');
        tag.style.cssText = [
          'position: absolute',
          'top: 0',
          'left: 0',
          'z-index: 2147483647',
          'background: #ff2e2e',
          'color: #ffffff',
          'padding: 8px 14px',
          'font: 700 14px/1.2 -apple-system, BlinkMacSystemFont, sans-serif',
          'letter-spacing: 0.08em',
          'border-bottom-right-radius: 6px',
          'box-shadow: 0 2px 8px rgba(0,0,0,0.3)',
          'pointer-events: none',
        ].join(';');
        document.documentElement.appendChild(tag);
      })()
    `);
    await page.waitForTimeout(100);
    await page.screenshot({ path: out, fullPage: true, animations: 'disabled' });
    console.log(JSON.stringify({ variant, url, out, label: labelText, ok: true }));
  } finally {
    await browser.close();
  }
}

void main();
