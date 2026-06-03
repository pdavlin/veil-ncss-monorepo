import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { parseOriginsFromArgv, outputDirFor, type OriginConfig } from '../config.ts';
import { openLogger } from '../lib/logger.ts';

async function pdfForOrigin(origin: OriginConfig): Promise<void> {
  const dir = outputDirFor(origin.origin);
  const log = openLogger(dir, 'report-pdf');

  const sitePath = path.join(dir, 'site', 'index.html');
  if (!fs.existsSync(sitePath)) {
    throw new Error(
      `Default site not found at ${sitePath}. Run \`pnpm run audit:report\` first.`,
    );
  }

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1024 } });
    const page = await context.newPage();
    await page.goto(`file://${sitePath}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    // Expand every collapsed <details> so portfolio URL lists, etc., show up.
    // Also strip lazy-loading so every screenshot is actually rendered in the PDF.
    await page.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLDetailsElement>('details')).forEach((d) => {
        d.open = true;
      });
      Array.from(document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')).forEach((img) => {
        img.loading = 'eager';
      });
    });

    // Force every image to finish decoding before we print.
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          });
        }),
      );
    });

    await page.emulateMedia({ media: 'print' });

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0.6in', bottom: '0.6in', left: '0.6in', right: '0.6in' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width: 100%; font-size: 9px; color: #6b6b6b; padding: 0 0.6in; display: flex; justify-content: space-between; font-family: ui-sans-serif, system-ui, sans-serif;">
          <span>Phase 1 audit · veilengineering.com</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`,
    });

    const outputs = [
      path.join(dir, 'site', 'audit-report.pdf'),
      path.join(dir, 'site-davlin', 'audit-report.pdf'),
    ];
    for (const out of outputs) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, pdf);
      log.info(`Wrote ${out} (${(pdf.length / 1024).toFixed(1)} KB)`);
    }
  } finally {
    await browser.close();
  }

  log.close();
}

async function main(): Promise<void> {
  const origins = parseOriginsFromArgv(process.argv.slice(2));
  for (const origin of origins) {
    await pdfForOrigin(origin);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
