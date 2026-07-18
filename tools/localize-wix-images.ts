#!/usr/bin/env tsx
/*
 * localize-wix-images — one-off migration off the Wix CDN.
 *
 * The portfolio content still hotlinks static.wixstatic.com. Those URLs die with the
 * Wix subscription, so this script pulls every referenced image into the repo and
 * rewrites the content to point at local `/assets/img/portfolio/...` paths (which then
 * flow through the shared eleventy-img `{% image %}` pipeline).
 *
 * URL anatomy:
 *   https://static.wixstatic.com/media/<mediaId>/v1/<transform>/<name>
 *
 * Download source is chosen per transform:
 *   /v1/fill/  → a plain resize. We fetch the ORIGINAL (strip everything from `/v1/`)
 *                so eleventy-img gets the highest-quality source to derive widths from.
 *   /v1/crop/  → an intentional framing decision. parallax-band.njk renders the image
 *                as a CSS `background-image` with `cover` + `center`, which can only
 *                ever show the CENTRE of a source image — it cannot reproduce a crop
 *                taken at an arbitrary y-offset. So we fetch the TRANSFORMED bytes
 *                exactly as served to preserve the framing.
 *
 * Many references share a mediaId across different transforms; those collapse to one
 * file on disk (first reference encountered names it).
 *
 * Idempotent: a valid existing file is never re-downloaded, and already-rewritten
 * content contains no wixstatic URLs left to match.
 */

import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITES = ['ncss', 'veil'] as const;
const ASSET_SUBDIR = 'assets/img/portfolio';
const PUBLIC_PREFIX = `/${ASSET_SUBDIR}`;
const WIX_URL = /https:\/\/static\.wixstatic\.com\/media\/[^\s"'`)]+/g;

type SiteName = (typeof SITES)[number];
type Transform = 'fill' | 'crop' | 'none';
type ImageExt = 'jpg' | 'png';

interface Reference {
  /** absolute path of the content file holding this reference */
  readonly file: string;
  readonly site: SiteName;
  /** the exact URL string as it appears in the file */
  readonly url: string;
  readonly mediaId: string;
  readonly transform: Transform;
  /** filename (no directory), e.g. joslyn-art-museum-3.jpg */
  readonly fileName: string;
  /** URL we actually download from — original for fill, as-served for crop */
  readonly downloadUrl: string;
}

interface DownloadResult {
  readonly fileName: string;
  readonly bytes: number;
  readonly reused: boolean;
  readonly sites: readonly SiteName[];
}

interface Failure {
  readonly fileName: string;
  readonly downloadUrl: string;
  readonly reason: string;
}

/** Magic-byte signatures we accept. Guards against saving an HTML error page as .jpg. */
function sniffExt(bytes: Uint8Array): ImageExt | null {
  if (bytes.length < 8) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => bytes[i] === b)) return 'png';
  return null;
}

function extFromMediaId(mediaId: string): ImageExt {
  const ext = path.extname(mediaId).toLowerCase();
  return ext === '.png' ? 'png' : 'jpg';
}

function parseUrl(url: string): { mediaId: string; transform: Transform; downloadUrl: string } {
  const afterMedia = url.slice('https://static.wixstatic.com/media/'.length);
  const mediaId = afterMedia.split('/')[0] ?? afterMedia;
  const v1 = url.indexOf('/v1/');
  if (v1 === -1) return { mediaId, transform: 'none', downloadUrl: url };
  const kind = url.slice(v1 + 4).split('/')[0];
  const transform: Transform = kind === 'crop' ? 'crop' : 'fill';
  // crop keeps the served bytes; fill goes back to the untransformed original
  const downloadUrl = transform === 'crop' ? url : url.slice(0, v1);
  return { mediaId, transform, downloadUrl };
}

/**
 * Names a reference from its position in the frontmatter. We walk lines rather than
 * parsing YAML so rewriting can be a pure string replacement that preserves the file's
 * exact formatting.
 */
function nameReferences(text: string, slug: string): Map<string, string> {
  const names = new Map<string, string>();
  const lines = text.split('\n');
  let topKey = '';
  let mediaIndex = 0;
  let bandIndex = 0;

  for (const line of lines) {
    const top = /^([A-Za-z][A-Za-z0-9]*):/.exec(line);
    if (top && top[1]) topKey = top[1];

    const matches = line.match(WIX_URL);
    if (!matches) continue;

    for (const url of matches) {
      const { mediaId } = parseUrl(url);
      const ext = extFromMediaId(mediaId);
      let base: string;
      switch (topKey) {
        case 'cardImage':
          base = `${slug}-card`;
          break;
        case 'media':
          base = `${slug}-${++mediaIndex}`;
          break;
        case 'parallaxBands':
          base = `home-parallax-band-${++bandIndex}`;
          break;
        case 'engineeredShading':
          base = 'home-design-team-diagram';
          break;
        default:
          base = `${slug}-${topKey || 'image'}`;
      }
      names.set(url, `${base}.${ext}`);
    }
  }
  return names;
}

async function contentFiles(site: SiteName): Promise<string[]> {
  const contentDir = path.join(REPO_ROOT, 'sites', site, 'src/content');
  const files = [path.join(contentDir, 'index.md')];
  const portfolioDir = path.join(contentDir, 'portfolio');
  for (const entry of (await readdir(portfolioDir)).sort()) {
    if (entry.endsWith('.md')) files.push(path.join(portfolioDir, entry));
  }
  return files;
}

async function collectReferences(): Promise<Reference[]> {
  const refs: Reference[] = [];
  /** mediaId → filename, so the same image never lands on disk twice */
  const byMediaId = new Map<string, string>();

  for (const site of SITES) {
    for (const file of await contentFiles(site)) {
      const text = await readFile(file, 'utf8');
      if (!WIX_URL.test(text)) {
        WIX_URL.lastIndex = 0;
        continue;
      }
      WIX_URL.lastIndex = 0;

      const slug = path.basename(file, '.md') === 'index' ? 'home' : path.basename(file, '.md');
      const names = nameReferences(text, slug);

      for (const [url, proposed] of names) {
        const { mediaId, transform, downloadUrl } = parseUrl(url);
        const existing = byMediaId.get(mediaId);
        const fileName = existing ?? proposed;
        if (!existing) byMediaId.set(mediaId, fileName);
        refs.push({ file, site, url, mediaId, transform, fileName, downloadUrl });
      }
    }
  }
  return refs;
}

async function fileSize(target: string): Promise<number | null> {
  try {
    const info = await stat(target);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

async function download(ref: Reference, sites: readonly SiteName[]): Promise<DownloadResult | Failure> {
  const targets = sites.map((site) =>
    path.join(REPO_ROOT, 'sites', site, 'src', ASSET_SUBDIR, ref.fileName),
  );

  // Idempotency: if every target already holds a non-empty file, do nothing.
  const sizes = await Promise.all(targets.map(fileSize));
  if (sizes.every((size) => size !== null && size > 0)) {
    return { fileName: ref.fileName, bytes: sizes[0] ?? 0, reused: true, sites };
  }

  let body: Uint8Array;
  try {
    const res = await fetch(ref.downloadUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 (localize-wix-images)' },
    });
    if (!res.ok) {
      return { fileName: ref.fileName, downloadUrl: ref.downloadUrl, reason: `HTTP ${res.status}` };
    }
    body = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { fileName: ref.fileName, downloadUrl: ref.downloadUrl, reason };
  }

  if (body.length === 0) {
    return { fileName: ref.fileName, downloadUrl: ref.downloadUrl, reason: 'empty body' };
  }
  const sniffed = sniffExt(body);
  if (sniffed === null) {
    return { fileName: ref.fileName, downloadUrl: ref.downloadUrl, reason: 'not a JPEG/PNG' };
  }
  const declared = path.extname(ref.fileName).slice(1);
  if (sniffed !== declared) {
    return {
      fileName: ref.fileName,
      downloadUrl: ref.downloadUrl,
      reason: `content is ${sniffed}, filename says ${declared}`,
    };
  }

  for (const target of targets) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }
  return { fileName: ref.fileName, bytes: body.length, reused: false, sites };
}

async function rewrite(refs: readonly Reference[]): Promise<string[]> {
  const changed: string[] = [];
  const byFile = new Map<string, Reference[]>();
  for (const ref of refs) {
    const list = byFile.get(ref.file);
    if (list) list.push(ref);
    else byFile.set(ref.file, [ref]);
  }

  for (const [file, fileRefs] of byFile) {
    const before = await readFile(file, 'utf8');
    let after = before;
    for (const ref of fileRefs) {
      after = after.split(ref.url).join(`${PUBLIC_PREFIX}/${ref.fileName}`);
    }
    if (after !== before) {
      await writeFile(file, after);
      changed.push(path.relative(REPO_ROOT, file));
    }
  }
  return changed;
}

async function main(): Promise<void> {
  const refs = await collectReferences();
  if (refs.length === 0) {
    console.log('No wixstatic references found — nothing to do.');
    return;
  }

  // One download per unique filename; it fans out to whichever sites reference it.
  const sitesByFile = new Map<string, Set<SiteName>>();
  const refByFile = new Map<string, Reference>();
  for (const ref of refs) {
    const set = sitesByFile.get(ref.fileName) ?? new Set<SiteName>();
    set.add(ref.site);
    sitesByFile.set(ref.fileName, set);
    if (!refByFile.has(ref.fileName)) refByFile.set(ref.fileName, ref);
  }

  console.log(`${refs.length} references → ${refByFile.size} unique images\n`);

  const results: DownloadResult[] = [];
  const failures: Failure[] = [];
  for (const [fileName, ref] of refByFile) {
    const sites = [...(sitesByFile.get(fileName) ?? [])];
    const outcome = await download(ref, sites);
    if ('reason' in outcome) {
      failures.push(outcome);
      console.log(`  FAIL  ${fileName}  (${outcome.reason})`);
      continue;
    }
    results.push(outcome);
    const tag = outcome.reused ? 'skip' : ' ok ';
    const kb = (outcome.bytes / 1024).toFixed(0).padStart(6);
    console.log(`  ${tag}  ${kb} KB  ${fileName}  [${ref.transform}] → ${sites.join(',')}`);
  }

  // Only rewrite references whose image is actually on disk, so a failed download
  // leaves its reference pointing at the (still-working) remote URL.
  const landed = new Set(results.map((r) => r.fileName));
  const changed = await rewrite(refs.filter((r) => landed.has(r.fileName)));

  const downloaded = results.filter((r) => !r.reused);
  const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
  console.log(`\nunique images:   ${results.length}`);
  console.log(`downloaded:      ${downloaded.length} (${(downloaded.reduce((s, r) => s + r.bytes, 0) / 1048576).toFixed(2)} MB)`);
  console.log(`reused on disk:  ${results.length - downloaded.length}`);
  console.log(`total on disk:   ${(totalBytes / 1048576).toFixed(2)} MB per site`);
  console.log(`dedup:           ${refs.length} refs → ${refByFile.size} files`);
  console.log(`content files rewritten: ${changed.length}`);
  for (const file of changed) console.log(`  ${file}`);
  if (failures.length) {
    console.log(`\n${failures.length} FAILED — these references still point at Wix:`);
    for (const f of failures) console.log(`  ${f.fileName}: ${f.reason}\n    ${f.downloadUrl}`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
