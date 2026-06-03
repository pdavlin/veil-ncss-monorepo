import fs from 'node:fs';
import path from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { parseOriginsFromArgv, outputDirFor, type OriginConfig } from '../config.ts';
import { openBrowser, gotoStable } from '../lib/playwright-context.ts';
import { openLogger } from '../lib/logger.ts';
import { extractContrast, type ContrastDetail } from './audit-a11y-extract.ts';
import type { UrlEntry } from './crawl.ts';

export type { ContrastDetail };

export interface A11yIssue {
  url: string;
  source: 'axe' | 'lighthouse';
  rule: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | 'unknown';
  description: string;
  helpUrl?: string;
  nodes: Array<{ html: string; target: string[]; failureSummary?: string | undefined }>;
  contrast?: ContrastDetail;
}

export interface LighthouseScore {
  url: string;
  accessibility: number | null;
  performance: number | null;
  bestPractices: number | null;
  seo: number | null;
  audits: Array<{ id: string; title: string; score: number | null; displayValue?: string | undefined }>;
}

export interface A11yReport {
  generatedAt: string;
  issues: A11yIssue[];
  lighthouse: LighthouseScore[];
}

function loadUrls(dir: string): UrlEntry[] {
  const p = path.join(dir, 'urls.json');
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}. Run audit:urls first.`);
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as UrlEntry[];
}

async function runLighthouseForUrl(url: string): Promise<LighthouseScore | null> {
  const chromeLauncher = await import('chrome-launcher');
  const lighthouseModule = (await import('lighthouse')).default as unknown as (
    url: string,
    options: { port: number; output: string; onlyCategories: string[]; logLevel: string; maxWaitForLoad: number },
  ) => Promise<{ lhr: unknown } | undefined>;

  let chrome: Awaited<ReturnType<typeof chromeLauncher.launch>> | undefined;
  try {
    chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
      logLevel: 'silent',
    });
    const result = await lighthouseModule(url, {
      port: chrome.port,
      output: 'json',
      onlyCategories: ['accessibility', 'performance', 'best-practices', 'seo'],
      logLevel: 'silent',
      maxWaitForLoad: 60_000,
    });
    if (!result) return null;
    const lhr = result.lhr as {
      categories: Record<string, { score: number | null }>;
      audits: Record<string, { id: string; title: string; score: number | null; displayValue?: string }>;
    };
    const auditEntries = Object.values(lhr.audits)
      .filter((a) => a.score !== null && a.score < 1)
      .map((a) => ({ id: a.id, title: a.title, score: a.score, displayValue: a.displayValue }));
    return {
      url,
      accessibility: lhr.categories.accessibility?.score ?? null,
      performance: lhr.categories.performance?.score ?? null,
      bestPractices: lhr.categories['best-practices']?.score ?? null,
      seo: lhr.categories.seo?.score ?? null,
      audits: auditEntries,
    };
  } catch (e) {
    console.error(`Lighthouse failed for ${url}: ${(e as Error).message}`);
    return null;
  } finally {
    if (chrome) {
      try {
        await chrome.kill();
      } catch {
        // ignore kill failures
      }
    }
  }
}

async function auditOrigin(origin: OriginConfig, options: { skipLighthouse?: boolean }): Promise<void> {
  const dir = outputDirFor(origin.origin);
  const log = openLogger(dir, 'audit-a11y');
  const urls = loadUrls(dir);
  const session = await openBrowser();
  const issues: A11yIssue[] = [];

  for (const { url } of urls) {
    const page = await session.context.newPage();
    try {
      await gotoStable(page, url);
      await page.waitForTimeout(2500);
      const builder = new AxeBuilder({ page }).options({
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
      });
      const results = await builder.analyze();
      for (const v of results.violations) {
        for (const node of v.nodes) {
          const contrast = v.id === 'color-contrast' ? extractContrast(node.failureSummary ?? '') : undefined;
          const issue: A11yIssue = {
            url,
            source: 'axe',
            rule: v.id,
            impact: (v.impact ?? 'unknown') as A11yIssue['impact'],
            description: v.description,
            nodes: [{ html: node.html, target: node.target as string[], failureSummary: node.failureSummary }],
          };
          if (v.helpUrl) issue.helpUrl = v.helpUrl;
          if (contrast) issue.contrast = contrast;
          issues.push(issue);
        }
      }
      log.info(`Axe ${url}: ${results.violations.length} violations`);
    } catch (e) {
      log.error(`Axe failed for ${url}: ${(e as Error).message}`);
    } finally {
      await page.close().catch(() => {});
    }
  }

  await session.close();

  const lighthouse: LighthouseScore[] = [];
  if (!options.skipLighthouse) {
    for (const { url } of urls) {
      const score = await runLighthouseForUrl(url);
      if (score) {
        lighthouse.push(score);
        log.info(`Lighthouse ${url}: a11y=${score.accessibility}, perf=${score.performance}`);
      }
    }
  } else {
    log.warn('Lighthouse skipped via --skip-lighthouse');
  }

  const report: A11yReport = {
    generatedAt: new Date().toISOString(),
    issues,
    lighthouse,
  };
  fs.writeFileSync(path.join(dir, 'a11y-issues.json'), JSON.stringify(report, null, 2));
  log.info(`Wrote a11y-issues.json (${issues.length} issues)`);
  log.close();
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const skipLighthouse = argv.includes('--skip-lighthouse');
  const origins = parseOriginsFromArgv(argv);
  for (const origin of origins) {
    await auditOrigin(origin, { skipLighthouse });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
