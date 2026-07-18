#!/usr/bin/env tsx
/*
 * WARNING: already run — do not rerun. The scrape JSONs this reads still
 * contain static.wixstatic.com image URLs; rerunning would reintroduce the
 * dead-CDN hotlinks that tools/localize-wix-images.ts removed.
 *
 * fill-portfolio — one-off, deterministic backfill of the 12 stub portfolio
 * markdown pages on BOTH sites (veil + ncss) from the scraped live-site JSON in
 * tools/content-port/output/portfolio--<slug>.json.
 *
 * For each stub it:
 *   - lifts the description prose VERBATIM (only structural cleanup: strip the
 *     leading location prefix and re-split flattened paragraph breaks),
 *   - maps the "Architect: / Engineer: / General Contractor: …" credit tail into
 *     the `metadata` frontmatter list (any "Project Awards:" section becomes
 *     `{ label: "Award", value }` rows),
 *   - maps an "Image Credit(s): X" line into `mediaCredit`,
 *   - merges scraped project photos into `media` (existing video/gallery entries
 *     kept first, chrome + the golf-sim gif skipped, deduped by wix media id).
 *
 * Preserves layout/title/date/location/brands/cardImage untouched. Writes the
 * identical result to both sites. Idempotent. Leaves catalyst.md + index.md alone.
 *
 * Usage: tsx tools/fill-portfolio.ts
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SITE_DIRS = [
  path.resolve('sites/veil/src/content/portfolio'),
  path.resolve('sites/ncss/src/content/portfolio'),
] as const;
const JSON_DIR = path.resolve('tools/content-port/output');
const SKIP = new Set(['catalyst', 'index']);

interface ScrapedImage {
  src: string;
  alt: string;
}
interface Scraped {
  paragraphs: string[];
  images: ScrapedImage[];
  videos: { src: string; poster?: string }[];
  rawTextBlocks: string[];
}
interface MetaRow {
  label: string;
  value: string;
}
interface MediaItem {
  type: 'image' | 'video';
  src: string;
  poster?: string;
  alt: string;
}
interface SlugReport {
  slug: string;
  words: number;
  paragraphs: number;
  credits: number;
  awards: number;
  videosKept: number;
  imagesAdded: number;
  mediaCredit: string | null;
  strippedPrefix: string | null;
  notes: string[];
}

const WIX_MEDIA_PREFIX = 'https://static.wixstatic.com/media/';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Strip the "City, ST" (or "Multiple Locations") prefix the scrape concatenates
 * onto the first body word. Prefer the frontmatter location; fall back to a
 * pattern match (needed for pinnacle, whose prose says "Multiple Locations"
 * while frontmatter says "Omaha, NE"). */
function stripLocationPrefix(
  prose: string,
  fmLocation: string,
): { rest: string; stripped: string | null } {
  if (fmLocation && prose.startsWith(fmLocation)) {
    return { rest: prose.slice(fmLocation.length).replace(/^\s+/, ''), stripped: fmLocation };
  }
  const m = prose.match(/^(Multiple Locations|[A-Z][A-Za-z. ]*?,\s*[A-Z]{2})(?=[A-Z])/);
  if (m) {
    return { rest: prose.slice(m[0].length).replace(/^\s+/, ''), stripped: m[0] };
  }
  return { rest: prose, stripped: null };
}

const CREDIT_ANCHOR =
  /(Project Team:|Design Architect:|Architect of Record:|MEP Engineer:|Structural Engineer:|General Contractor:|Architects:|Architect:|Engineers:|Engineer:)/;
const CREDIT_LABEL =
  /(Design Architect|Architect of Record|MEP Engineer|Structural Engineer|General Contractor|Architects|Architect|Engineers|Engineer):/g;

/** Split the location-stripped prose into { body, credits, awards }. */
function splitBodyAndTail(descAndTail: string): {
  body: string;
  credits: MetaRow[];
  awards: string[];
} {
  const anchorIdx = descAndTail.search(CREDIT_ANCHOR);
  if (anchorIdx < 0) {
    return { body: descAndTail.trim(), credits: [], awards: [] };
  }
  const body = descAndTail.slice(0, anchorIdx).trim();
  let tail = descAndTail.slice(anchorIdx);

  // Peel off any "Project Awards:" section.
  const awards: string[] = [];
  const awardsIdx = tail.search(/Project Awards:/);
  if (awardsIdx >= 0) {
    const awardsSection = tail.slice(awardsIdx).replace(/^Project Awards:\s*/, '');
    tail = tail.slice(0, awardsIdx);
    const awMatches = awardsSection.match(/.+?\(\d{4}\)/g) ?? [];
    for (const a of awMatches) awards.push(a.trim());
  }

  // Drop a leading "Project Team:" wrapper before the credit pairs.
  const creditsSection = tail.replace(/^Project Team:\s*/, '');

  const credits: MetaRow[] = [];
  const anchors: { label: string; end: number; start: number }[] = [];
  for (const m of creditsSection.matchAll(CREDIT_LABEL)) {
    anchors.push({ label: m[1]!, start: m.index!, end: m.index! + m[0]!.length });
  }
  for (let i = 0; i < anchors.length; i++) {
    const from = anchors[i]!.end;
    const to = i + 1 < anchors.length ? anchors[i + 1]!.start : creditsSection.length;
    const value = creditsSection.slice(from, to).trim();
    if (value) credits.push({ label: anchors[i]!.label, value });
  }
  return { body, credits, awards };
}

/** Re-split prose paragraphs that the scrape flattened. A sentence-ending
 * punctuation mark immediately followed (no space) by a capital letter marks a
 * lost block boundary; normal in-sentence breaks keep their space. */
function splitParagraphs(body: string): string[] {
  return body
    .split(/(?<=[.!?])(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function findMediaCredit(scraped: Scraped): string | null {
  const pool = [...scraped.paragraphs, ...scraped.rawTextBlocks];
  for (const p of pool) {
    const m = p.match(/^Image Credits?:\s*(.+)$/);
    if (m) return m[1]!.trim();
  }
  return null;
}

function wixId(src: string): string | null {
  const m = src.match(/\/media\/([^/]+)/);
  return m ? m[1]! : null;
}

function isChrome(img: ScrapedImage): boolean {
  if (/^(Veil Logo|LinkedIn)$/i.test(img.alt)) return true;
  if (/logo/i.test(img.src)) return true;
  if (img.src.includes('6ea5b4a88f0b4f91945b40499aa0af00')) return true; // LinkedIn icon
  return false;
}

/** Parse the existing `media:` frontmatter block into MediaItem[]. */
function parseExistingMedia(fmLines: string[], mediaIdx: number): MediaItem[] {
  if (/^media:\s*\[\]\s*$/.test(fmLines[mediaIdx]!)) return [];
  const items: MediaItem[] = [];
  let cur: MediaItem | null = null;
  for (let i = mediaIdx + 1; i < fmLines.length; i++) {
    const l = fmLines[i]!;
    if (/^\S/.test(l)) break; // next top-level key
    const t = l.match(/^\s*-\s*type:\s*(image|video)\s*$/);
    if (t) {
      if (cur) items.push(cur);
      cur = { type: t[1] as 'image' | 'video', src: '', alt: '' };
      continue;
    }
    if (!cur) continue;
    const s = l.match(/^\s*src:\s*"?(.*?)"?\s*$/);
    if (s) {
      cur.src = s[1]!;
      continue;
    }
    const p = l.match(/^\s*poster:\s*"?(.*?)"?\s*$/);
    if (p) {
      cur.poster = p[1]!;
      continue;
    }
    const a = l.match(/^\s*alt:\s*"?(.*?)"?\s*$/);
    if (a) {
      cur.alt = a[1]!;
      continue;
    }
  }
  if (cur) items.push(cur);
  return items;
}

async function main(): Promise<void> {
  const reports: SlugReport[] = [];

  // Enumerate stubs from the veil copy (veil + ncss are byte-identical).
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(SITE_DIRS[0]))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .filter((slug) => !SKIP.has(slug))
    .sort();

  for (const slug of files) {
    const jsonPath = path.join(JSON_DIR, `portfolio--${slug}.json`);
    let scraped: Scraped;
    try {
      scraped = JSON.parse(await readFile(jsonPath, 'utf8')) as Scraped;
    } catch {
      console.warn(`SKIP ${slug}: no scraped JSON at ${jsonPath}`);
      continue;
    }

    const srcMdPath = path.join(SITE_DIRS[0], `${slug}.md`);
    const raw = await readFile(srcMdPath, 'utf8');
    const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!fm) {
      console.warn(`SKIP ${slug}: no frontmatter`);
      continue;
    }
    const fmLines = fm[1]!.split('\n');
    const metaIdx = fmLines.findIndex((l) => /^metadata:/.test(l));
    const mediaIdx = fmLines.findIndex((l) => /^media:/.test(l));
    const preserved = fmLines.slice(0, metaIdx); // layout..cardImage (+brands)

    const locLine = fmLines.find((l) => /^location:/.test(l));
    const fmLocation = locLine
      ? locLine.replace(/^location:\s*/, '').replace(/^"|"$/g, '')
      : '';

    const notes: string[] = [];

    // --- description prose (paragraphs[4] is the project description block) ---
    const proseRaw = scraped.paragraphs[4] ?? '';
    const { rest, stripped } = stripLocationPrefix(proseRaw, fmLocation);
    if (!stripped) notes.push('could not detect location prefix — left prose as-is');
    else if (stripped !== fmLocation)
      notes.push(`scraped prefix "${stripped}" != frontmatter location "${fmLocation}"`);

    const { body, credits, awards } = splitBodyAndTail(rest);
    const paragraphs = splitParagraphs(body);

    // --- metadata: credits then awards ---
    const metadata: MetaRow[] = [
      ...credits,
      ...awards.map((value) => ({ label: 'Award', value })),
    ];

    // --- mediaCredit ---
    const mediaCredit = findMediaCredit(scraped);

    // --- media merge ---
    const existing = parseExistingMedia(fmLines, mediaIdx);
    const seen = new Set<string>();
    for (const e of existing) {
      const id = wixId(e.src);
      if (id) seen.add(id);
    }
    let imagesAdded = 0;
    const additions: MediaItem[] = [];
    for (const img of scraped.images) {
      if (isChrome(img)) continue;
      if (!img.src.startsWith(WIX_MEDIA_PREFIX)) continue;
      if (/\.gif(\/|$)/i.test(img.src)) {
        notes.push('skipped golf-sim gif (already shown as local video)');
        continue;
      }
      const id = wixId(img.src);
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      additions.push({ type: 'image', src: img.src, alt: img.alt || titleOf(preserved) });
      imagesAdded++;
    }
    const media = [...existing, ...additions];
    const videosKept = existing.filter((m) => m.type === 'video').length;

    // --- serialize ---
    const out: string[] = ['---', ...preserved];
    if (metadata.length) {
      out.push('metadata:');
      for (const row of metadata) {
        out.push(`  - label: "${esc(row.label)}"`);
        out.push(`    value: "${esc(row.value)}"`);
      }
    } else {
      out.push('metadata: []');
    }
    if (media.length) {
      out.push('media:');
      for (const m of media) {
        out.push(`  - type: ${m.type}`);
        out.push(`    src: "${esc(m.src)}"`);
        if (m.poster) out.push(`    poster: "${esc(m.poster)}"`);
        out.push(`    alt: "${esc(m.alt)}"`);
      }
    } else {
      out.push('media: []');
    }
    if (mediaCredit) out.push(`mediaCredit: "${esc(mediaCredit)}"`);
    out.push('---');
    out.push('');
    out.push(paragraphs.join('\n\n'));
    out.push('');
    const text = out.join('\n');

    for (const dir of SITE_DIRS) {
      await writeFile(path.join(dir, `${slug}.md`), text, 'utf8');
    }

    reports.push({
      slug,
      words: body.split(/\s+/).filter(Boolean).length,
      paragraphs: paragraphs.length,
      credits: credits.length,
      awards: awards.length,
      videosKept,
      imagesAdded,
      mediaCredit,
      strippedPrefix: stripped,
      notes: [...new Set(notes)],
    });
    console.log(`wrote ${slug}.md`);
  }

  // --- report ---
  console.log('\nslug | words | paras | credits | awards | vids | imgs | credit');
  for (const r of reports) {
    console.log(
      `${r.slug} | ${r.words} | ${r.paragraphs} | ${r.credits} | ${r.awards} | ${r.videosKept} | ${r.imagesAdded} | ${r.mediaCredit ?? '-'}`,
    );
    for (const n of r.notes) console.log(`    note: ${n}`);
  }
}

/** Pull the title value out of the preserved frontmatter lines (image alt fallback). */
function titleOf(preserved: string[]): string {
  const t = preserved.find((l) => /^title:/.test(l));
  return t ? t.replace(/^title:\s*/, '').replace(/^"|"$/g, '') : '';
}

void main();
