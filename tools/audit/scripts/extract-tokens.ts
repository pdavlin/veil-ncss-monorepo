import fs from 'node:fs';
import path from 'node:path';
import { parseOriginsFromArgv, outputDirFor, type OriginConfig } from '../config.ts';
import { openBrowser, gotoStable } from '../lib/playwright-context.ts';
import { collectStylesScript, type CollectedSample, type TokenCategory } from '../lib/style-collector.ts';
import { openLogger } from '../lib/logger.ts';
import type { UrlEntry } from './crawl.ts';

export interface UrlTokens {
  url: string;
  samples: CollectedSample[];
  error?: string;
}

export interface RawToken {
  category: TokenCategory;
  property: string;
  value: string;
  occurrences: number;
  sampleUrls: string[];
  sampleSelectors: string[];
}

function loadUrls(dir: string): UrlEntry[] {
  const p = path.join(dir, 'urls.json');
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${p}. Run audit:urls first.`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as UrlEntry[];
}

async function extractTokensForOrigin(origin: OriginConfig): Promise<void> {
  const dir = outputDirFor(origin.origin);
  fs.mkdirSync(dir, { recursive: true });
  const log = openLogger(dir, 'extract-tokens');
  const urls = loadUrls(dir);
  log.info(`Extracting tokens from ${urls.length} URLs`);

  const session = await openBrowser();
  const allByUrl: UrlTokens[] = [];

  for (const { url } of urls) {
    const page = await session.context.newPage();
    try {
      await gotoStable(page, url);
      const samples = (await page.evaluate(collectStylesScript())) as CollectedSample[];
      allByUrl.push({ url, samples });
      log.info(`Collected ${samples.length} samples from ${url}`);
    } catch (e) {
      const msg = (e as Error).message;
      log.error(`Failed ${url}: ${msg}`);
      allByUrl.push({ url, samples: [], error: msg });
    } finally {
      await page.close().catch(() => {});
    }
  }

  await session.close();

  fs.writeFileSync(path.join(dir, 'tokens.byUrl.json'), JSON.stringify(allByUrl, null, 2));
  log.info(`Wrote tokens.byUrl.json (${allByUrl.length} entries)`);

  const aggregated = aggregateSamples(allByUrl);
  fs.writeFileSync(path.join(dir, 'tokens.raw.json'), JSON.stringify(aggregated, null, 2));
  log.info(`Wrote tokens.raw.json (${aggregated.length} distinct tokens)`);
  log.close();
}

export function aggregateSamples(byUrl: UrlTokens[]): RawToken[] {
  const map = new Map<string, RawToken>();
  for (const { url, samples } of byUrl) {
    for (const s of samples) {
      const key = `${s.category}|${s.property}|${s.value}`;
      const existing = map.get(key);
      if (existing) {
        existing.occurrences++;
        if (!existing.sampleUrls.includes(url) && existing.sampleUrls.length < 5) {
          existing.sampleUrls.push(url);
        }
        if (existing.sampleSelectors.length < 3 && !existing.sampleSelectors.includes(s.selectorPath)) {
          existing.sampleSelectors.push(s.selectorPath);
        }
      } else {
        map.set(key, {
          category: s.category,
          property: s.property,
          value: s.value,
          occurrences: 1,
          sampleUrls: [url],
          sampleSelectors: [s.selectorPath],
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return b.occurrences - a.occurrences;
  });
}

async function main(): Promise<void> {
  const origins = parseOriginsFromArgv(process.argv.slice(2));
  for (const origin of origins) {
    await extractTokensForOrigin(origin);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
