import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { config, parseOriginsFromArgv, outputDirFor, type OriginConfig } from '../config.ts';
import { openLogger } from '../lib/logger.ts';

export interface UrlEntry {
  url: string;
  discoveredVia: 'sitemap' | 'crawl';
  depth: number;
}

const parser = new XMLParser({ ignoreAttributes: false });

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function extractUrls(xml: unknown): string[] {
  const urls: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'loc' && typeof value === 'string') urls.push(value.trim());
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(xml);
  return urls;
}

function shouldExclude(url: string, excludePatterns: RegExp[]): boolean {
  return excludePatterns.some((p) => p.test(url));
}

function sameOrigin(url: string, originUrl: string): boolean {
  try {
    const a = new URL(url);
    const b = new URL(originUrl);
    return a.host === b.host || a.host === b.host.replace(/^www\./, '') || `www.${a.host}` === b.host;
  } catch {
    return false;
  }
}

function normalize(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch {
    return url;
  }
}

async function discoverViaSitemap(origin: OriginConfig, log: ReturnType<typeof openLogger>): Promise<UrlEntry[]> {
  const seen = new Set<string>();
  const out: UrlEntry[] = [];
  const queue = [...origin.sitemaps];
  while (queue.length) {
    const sm = queue.shift()!;
    const text = await fetchText(sm, config.crawl.requestTimeoutMs);
    if (!text) {
      log.warn(`Sitemap fetch failed: ${sm}`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = parser.parse(text);
    } catch (e) {
      log.warn(`Sitemap parse failed: ${sm} (${(e as Error).message})`);
      continue;
    }
    const urls = extractUrls(parsed);
    for (const u of urls) {
      const norm = normalize(u);
      if (!sameOrigin(norm, origin.origin)) continue;
      if (shouldExclude(norm, origin.excludePatterns)) continue;
      if (/sitemap.*\.xml$/i.test(norm)) {
        if (!queue.includes(norm)) queue.push(norm);
        continue;
      }
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push({ url: norm, discoveredVia: 'sitemap', depth: 0 });
    }
  }
  return out;
}

async function crawlSameOrigin(origin: OriginConfig, log: ReturnType<typeof openLogger>): Promise<UrlEntry[]> {
  const seen = new Set<string>();
  const out: UrlEntry[] = [];
  const queue: { url: string; depth: number }[] = [{ url: origin.origin, depth: 0 }];
  while (queue.length && out.length < config.crawl.maxUrls) {
    const { url, depth } = queue.shift()!;
    const norm = normalize(url);
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (!sameOrigin(norm, origin.origin)) continue;
    if (shouldExclude(norm, origin.excludePatterns)) continue;
    const html = await fetchText(norm, config.crawl.requestTimeoutMs);
    if (!html) {
      log.warn(`Crawl fetch failed: ${norm}`);
      continue;
    }
    out.push({ url: norm, discoveredVia: 'crawl', depth });
    if (depth >= config.crawl.maxDepth) continue;
    const hrefRe = /href\s*=\s*["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = hrefRe.exec(html))) {
      const raw = m[1];
      if (!raw) continue;
      try {
        const resolved = new URL(raw, norm).toString();
        const nresolved = normalize(resolved);
        if (sameOrigin(nresolved, origin.origin) && !seen.has(nresolved)) {
          queue.push({ url: nresolved, depth: depth + 1 });
        }
      } catch {
        // ignore malformed hrefs
      }
    }
  }
  return out;
}

export async function discoverUrls(origin: OriginConfig): Promise<UrlEntry[]> {
  const dir = outputDirFor(origin.origin);
  fs.mkdirSync(dir, { recursive: true });
  const log = openLogger(dir, 'crawl');
  log.info(`Discovering URLs for ${origin.origin}`);

  const fromSitemap = await discoverViaSitemap(origin, log);
  let entries: UrlEntry[];
  if (fromSitemap.length > 0) {
    log.info(`Sitemap yielded ${fromSitemap.length} URLs`);
    entries = fromSitemap;
  } else {
    log.warn('Sitemap empty or unreachable; falling back to BFS crawl');
    entries = await crawlSameOrigin(origin, log);
    log.info(`Crawl yielded ${entries.length} URLs (maxDepth=${config.crawl.maxDepth})`);
  }

  entries.sort((a, b) => a.url.localeCompare(b.url));
  fs.writeFileSync(path.join(dir, 'urls.json'), JSON.stringify(entries, null, 2));
  log.info(`Wrote ${entries.length} URLs to ${path.join(dir, 'urls.json')}`);
  log.close();
  return entries;
}

async function main(): Promise<void> {
  const origins = parseOriginsFromArgv(process.argv.slice(2));
  for (const origin of origins) {
    await discoverUrls(origin);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
