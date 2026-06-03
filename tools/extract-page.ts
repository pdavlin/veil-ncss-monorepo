#!/usr/bin/env tsx
/*
 * extract-page — Playwright-based structural extractor for a single page.
 * Used by the page-parity workflow to compare live www.veilengineering.com
 * (desktop and mobile UAs) against the local rebuild.
 *
 * The live site uses User-Agent sniffing to serve a different HTML document
 * to phones — so we need both UAs to compare fairly against a single
 * responsive rebuild.
 *
 * Usage:
 *   pnpm exec tsx tools/extract-page.ts --variant live-desktop --url https://www.veilengineering.com/
 *   pnpm exec tsx tools/extract-page.ts --variant live-mobile  --url https://www.veilengineering.com/ --mobile
 *   pnpm exec tsx tools/extract-page.ts --variant rebuild      --url http://127.0.0.1:8080/
 *
 * Prints a JSON object to stdout:
 *   { variant, url, title, headings[{level,text}], paragraphs[], navLinks[{text,href}], mediaCount }
 */

import process from 'node:process';
import { chromium, devices, type Page } from 'playwright';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

interface Extracted {
  variant: string;
  url: string;
  title: string;
  headings: { level: string; text: string }[];
  paragraphs: string[];
  navLinks: { text: string; href: string }[];
  mediaCount: number;
}

async function scrollAll(page: Page): Promise<void> {
  await page.evaluate(`(async () => {
    const step = window.innerHeight;
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
  const isMobile = has('--mobile');

  if (!url || !variant) {
    console.error('usage: extract-page --variant <name> --url <url> [--mobile]');
    process.exit(2);
  }

  const browser = await chromium.launch();
  const contextOpts = isMobile
    ? { ...devices['iPhone 15'] }
    : { viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15' };
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await scrollAll(page);
    await page.waitForTimeout(500);

    // Run extraction code as a string to avoid swc/tsx helper injection.
    const code = `(() => {
      function text(n) { return (n && n.textContent || '').replace(/\\s+/g, ' ').trim(); }
      const root = document.querySelector('main, #SITE_CONTAINER, body') || document.body;
      const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'))
        .map(function (h) { return { level: h.tagName.toLowerCase(), text: text(h) }; })
        .filter(function (h) { return h.text.length > 0; });
      const paragraphs = Array.from(root.querySelectorAll('p'))
        .map(function (p) { return text(p); })
        .filter(function (t) { return t.length > 0; });
      const navLinks = Array.from(root.querySelectorAll('nav a, header a'))
        .map(function (a) { return { text: text(a), href: a.href || '' }; })
        .filter(function (l) { return l.text.length > 0 && l.href.indexOf('javascript:') !== 0; });
      const mediaCount =
        root.querySelectorAll('img').length +
        root.querySelectorAll('video').length +
        root.querySelectorAll('[style*="background-image"]').length;
      return {
        url: window.location.href,
        title: document.title,
        headings: headings,
        paragraphs: paragraphs,
        navLinks: navLinks,
        mediaCount: mediaCount,
      };
    })()`;
    const data = (await page.evaluate(code)) as Omit<Extracted, 'variant'>;

    const out: Extracted = { variant, ...data };
    process.stdout.write(JSON.stringify(out));
  } finally {
    await browser.close();
  }
}

void main();
