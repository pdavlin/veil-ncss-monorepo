#!/usr/bin/env tsx
/*
 * port-content — visit each live veilengineering.com page with Playwright,
 * extract structured text content (headings + paragraphs + link labels + image srcs),
 * and write per-template JSON files to tools/content-port/output/.
 *
 * Source of truth: the live site, which the client owns and has asked us to migrate.
 *
 * Usage:
 *   tsx tools/port-content.ts            # all pages
 *   tsx tools/port-content.ts home about # subset
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

const BASE = 'https://www.veilengineering.com';

interface Target {
  slug: string;
  url: string;
}

const TARGETS: Target[] = [
  { slug: 'home', url: `${BASE}/` },
  { slug: 'about', url: `${BASE}/about` },
  { slug: 'contact', url: `${BASE}/contact` },
  { slug: 'services', url: `${BASE}/services` },
  { slug: 'team', url: `${BASE}/team` },
  { slug: 'innovation', url: `${BASE}/innovation` },
  { slug: 'sustainability', url: `${BASE}/sustainability` },
  { slug: 'portfolio', url: `${BASE}/portfolio-10` },
  { slug: 'joslyn-art-museum-page', url: `${BASE}/joslyn-art-museum` },
  // portfolio-detail (13)
  { slug: 'portfolio--baxter-auto-group-headquarters', url: `${BASE}/portfolio-1/baxter-auto-group-headquarters` },
  { slug: 'portfolio--catalyst', url: `${BASE}/portfolio-1/catalyst` },
  { slug: 'portfolio--joslyn-art-museum', url: `${BASE}/portfolio-1/joslyn-art-museum` },
  { slug: 'portfolio--memphis-brooks-museum-of-art', url: `${BASE}/portfolio-1/memphis-brooks-museum-of-art` },
  { slug: 'portfolio--merriam-plaza-library', url: `${BASE}/portfolio-1/merriam-plaza-library` },
  { slug: 'portfolio--pinnacle-bank', url: `${BASE}/portfolio-1/pinnacle-bank` },
  { slug: 'portfolio--rtg-medical-headquarters', url: `${BASE}/portfolio-1/rtg-medical-headquarters` },
  { slug: 'portfolio--university-of-alabama-at-birmingham', url: `${BASE}/portfolio-1/university-of-alabama-at-birmingham---inpatient-rehabilitaion-` },
  { slug: 'portfolio--university-of-nebraska-kiewit-hall', url: `${BASE}/portfolio-1/university-of-nebraska---kiewit-hall` },
  { slug: 'portfolio--university-of-nebraska-osborne-legacy-complex', url: `${BASE}/portfolio-1/university-of-nebraska-osborne-legacy-complex` },
  { slug: 'portfolio--university-of-nebraska-scott-engineering-center', url: `${BASE}/portfolio-1/university-of-nebraska-scott-engineering-center` },
  { slug: 'portfolio--university-of-nebraska-strauss-performing-arts-center', url: `${BASE}/portfolio-1/university-of-nebraska-strauss-performing-arts-center` },
  { slug: 'portfolio--wichita-state-university-woolsey-hall', url: `${BASE}/portfolio-1/wichita-state-university-woolsey-hall` },
];

interface Extracted {
  url: string;
  title: string;
  headings: { level: string; text: string }[];
  paragraphs: string[];
  links: { text: string; href: string }[];
  images: { src: string; alt: string }[];
  videos: { src: string; poster?: string }[];
  rawTextBlocks: string[];
}

async function extract(page: Page): Promise<Extracted> {
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  // Wix sometimes lazy-renders; scroll to force layout
  await page.evaluate(async () => {
    const step = window.innerHeight;
    const total = document.documentElement.scrollHeight;
    for (let y = 0; y < total; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);

  // Pass as a string to avoid tsx/swc helper injection into page.evaluate.
  const browserCode = `(() => {
    function text(n) { return (n && n.textContent || '').replace(/\\s+/g, ' ').trim(); }
    const main = document.querySelector('main, #SITE_CONTAINER, #SITE_PAGES, body');
    const root = main || document.body;
    const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .map(function (h) { return { level: h.tagName.toLowerCase(), text: text(h) }; })
      .filter(function (h) { return h.text.length > 0; });
    const paragraphs = Array.from(root.querySelectorAll('p'))
      .map(function (p) { return text(p); })
      .filter(function (t) { return t.length > 0; });
    const links = Array.from(root.querySelectorAll('a[href]'))
      .map(function (a) { return { text: text(a), href: a.href }; })
      .filter(function (l) { return l.text.length > 0 && l.href.indexOf('javascript:') !== 0; });
    const images = Array.from(root.querySelectorAll('img[src]'))
      .map(function (img) { return { src: img.src, alt: img.alt || '' }; })
      .filter(function (i) { return i.src.length > 0; });
    const videos = Array.from(root.querySelectorAll('video[src], video source[src]'))
      .map(function (v) { return { src: v.src, poster: (v.poster) || undefined }; })
      .filter(function (v) { return v.src && v.src.length > 0; });
    const bgImages = Array.from(root.querySelectorAll('[style*="background-image"]'))
      .map(function (el) {
        const m = el.style.backgroundImage.match(/url\\(['"]?([^'")]+)['"]?\\)/);
        return m ? { src: m[1] || '', alt: text(el).slice(0, 80) } : null;
      })
      .filter(function (x) { return !!x; });
    const richTextBlocks = Array.from(root.querySelectorAll('.wixui-rich-text__text, [class*="rich-text"]'))
      .map(function (n) { return text(n); })
      .filter(function (t) { return t.length > 20; })
      .filter(function (t, i, arr) { return arr.indexOf(t) === i; });
    return {
      url: window.location.href,
      title: document.title,
      headings: headings,
      paragraphs: paragraphs,
      links: links,
      images: images.concat(bgImages),
      videos: videos,
      rawTextBlocks: richTextBlocks
    };
  })()`;
  return (await page.evaluate(browserCode)) as Extracted;
}

async function main(): Promise<void> {
  const want = process.argv.slice(2);
  const targets = want.length
    ? TARGETS.filter((t) => want.includes(t.slug))
    : TARGETS;

  const outDir = path.resolve('tools/content-port/output');
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (compatible; veilengineering-migration/1.0)',
  });

  for (const target of targets) {
    process.stdout.write(`fetching ${target.slug}… `);
    const page = await context.newPage();
    try {
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const data = await extract(page);
      await writeFile(
        path.join(outDir, `${target.slug}.json`),
        JSON.stringify(data, null, 2),
        'utf8',
      );
      console.log(`OK (${data.headings.length} headings, ${data.paragraphs.length} paragraphs, ${data.images.length} images)`);
    } catch (err) {
      console.log(`FAIL — ${(err as Error).message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log(`\nOutput written to ${outDir}`);
}

void main();
