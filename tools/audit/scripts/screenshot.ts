import fs from 'node:fs';
import path from 'node:path';
import { config, parseOriginsFromArgv, outputDirFor, type OriginConfig } from '../config.ts';
import { openBrowser, gotoStable } from '../lib/playwright-context.ts';
import { openLogger } from '../lib/logger.ts';
import { groupByTemplate } from '../lib/template-slug.ts';
import type { UrlEntry } from './crawl.ts';

function loadUrls(dir: string): UrlEntry[] {
  const p = path.join(dir, 'urls.json');
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}. Run audit:urls first.`);
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as UrlEntry[];
}

const MOBILE_VIEWPORTS = new Set([320, 768]);

async function captureAllViewports(
  origin: OriginConfig,
  groups: ReturnType<typeof groupByTemplate>,
  mode: 'desktop' | 'mobile',
  log: ReturnType<typeof openLogger>,
): Promise<void> {
  const dir = outputDirFor(origin.origin);
  const session = await openBrowser(mode);
  const viewports = mode === 'mobile'
    ? config.viewports.filter((w) => MOBILE_VIEWPORTS.has(w))
    : config.viewports;

  for (const group of groups) {
    if (!group.representativeUrl) continue;
    const templateDir = path.join(dir, 'screenshots', group.template);
    fs.mkdirSync(templateDir, { recursive: true });

    for (const width of viewports) {
      const page = await session.context.newPage();
      try {
        await page.setViewportSize({ width, height: 800 });
        await gotoStable(page, group.representativeUrl);
        await page.waitForTimeout(500);
        const suffix = mode === 'mobile' ? '-mobile' : '';
        const outPath = path.join(templateDir, `${width}${suffix}.png`);
        await page.screenshot({ path: outPath, fullPage: true });
        log.info(`Saved ${outPath}`);
      } catch (e) {
        log.error(`Screenshot ${mode} failed for ${group.representativeUrl} @ ${width}: ${(e as Error).message}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  }
  await session.close();
}

async function screenshotForOrigin(origin: OriginConfig): Promise<void> {
  const dir = outputDirFor(origin.origin);
  const log = openLogger(dir, 'screenshot');
  const urls = loadUrls(dir).map((u) => u.url);
  const groups = groupByTemplate(urls);
  log.info(`Capturing desktop-UA screenshots for ${groups.length} templates × ${config.viewports.length} viewports`);
  await captureAllViewports(origin, groups, 'desktop', log);

  log.info(`Capturing mobile-UA screenshots for ${groups.length} templates × ${MOBILE_VIEWPORTS.size} viewports (UA-sniffed mobile DOM)`);
  await captureAllViewports(origin, groups, 'mobile', log);

  fs.writeFileSync(
    path.join(dir, 'templates.json'),
    JSON.stringify(groups, null, 2),
  );
  log.info(`Wrote templates.json (${groups.length} templates)`);
  log.close();
}

async function main(): Promise<void> {
  const origins = parseOriginsFromArgv(process.argv.slice(2));
  for (const origin of origins) {
    await screenshotForOrigin(origin);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
