#!/usr/bin/env tsx
/*
 * cms-parity — keep the Veil and NCSS Decap configs on one skeleton, and keep
 * the content inside what the CMS can edit.
 *
 * Rules:
 *   1. Settings outside `collections` match across brands, except the brand
 *      URLs and paths (base_url, site_url, display_url, media_folder).
 *   2. File entries that use the same layout (the hidden `layout` field's
 *      default) match across brands and within a brand. Folder collections
 *      with the same name match across brands. "Match" ignores file, folder,
 *      filter, label, label_singular, default, and a file entry's name.
 *   3. Every entry's file and every media_folder exists.
 *   4. Every content markdown file belongs to an entry (Home is out of the
 *      CMS on purpose, see the configs).
 *   5. Every frontmatter key in a content file is a field of its entry, at
 *      every depth. A field the content lacks is fine. A non-empty markdown
 *      body needs a top-level `body` field, or Decap drops it on save.
 */

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRANDS = ['veil', 'ncss'] as const;
type Brand = (typeof BRANDS)[number];

// Content files intentionally outside the CMS, relative to sites/<brand>/.
const NOT_IN_CMS = new Set(['src/content/index.md']);

// Keys that may differ between paired entries.
const IGNORED_KEYS = new Set(['file', 'folder', 'filter', 'label', 'label_singular', 'default']);
// Settings that may differ between the two configs.
const BRAND_SETTINGS = new Set(['base_url', 'site_url', 'display_url', 'media_folder']);

interface Field {
  name: string;
  label?: string;
  widget?: string;
  multiple?: boolean;
  default?: unknown;
  fields?: Field[];
  field?: Field;
  types?: Field[];
  typeKey?: string;
}

interface FileEntry {
  file: string;
  name: string;
  fields: Field[];
}

interface Collection {
  name: string;
  folder?: string;
  filter?: { field: string; value: unknown };
  files?: FileEntry[];
  fields?: Field[];
}

interface CmsConfig {
  media_folder: string;
  collections: Collection[];
  [key: string]: unknown;
}

type Plain = Record<string, unknown>;

function isPlain(v: unknown): v is Plain {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

const errors: string[] = [];
const fail = (msg: string): void => {
  errors.push(msg);
};

async function loadConfig(brand: Brand): Promise<CmsConfig> {
  const file = path.join(REPO_ROOT, `sites/${brand}/src/admin/config.yml`);
  const parsed = yaml.load(await readFile(file, 'utf8'));
  if (!isPlain(parsed) || !Array.isArray(parsed.collections) || typeof parsed.media_folder !== 'string') {
    throw new Error(`${brand}: config.yml has no collections or media_folder`);
  }
  return parsed as CmsConfig;
}

// Drop the keys that may differ, at every depth.
function normalize(v: unknown, ignored: Set<string>): unknown {
  if (Array.isArray(v)) return v.map((x) => normalize(x, ignored));
  if (!isPlain(v)) return v;
  const out: Plain = {};
  for (const [k, x] of Object.entries(v)) {
    if (!ignored.has(k)) out[k] = normalize(x, ignored);
  }
  return out;
}

const nameOf = (v: unknown): string | undefined =>
  isPlain(v) && typeof v.name === 'string' ? v.name : undefined;

// First differences between two normalized trees, as readable paths. Lists
// of named items (fields, types) pair up by name, so one added field reads
// as one difference and not as a shift of every field after it.
function diff(a: unknown, b: unknown, at: string, out: string[]): void {
  if (out.length >= 5) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    const aNames = a.map(nameOf);
    const bNames = b.map(nameOf);
    if (![...aNames, ...bNames].every((n) => n !== undefined)) {
      for (let i = 0; i < Math.max(a.length, b.length); i++) diff(a[i], b[i], `${at}[${i}]`, out);
      return;
    }
    for (const n of new Set([...aNames, ...bNames])) {
      diff(a.find((x) => nameOf(x) === n), b.find((x) => nameOf(x) === n), `${at}[${n}]`, out);
    }
    const sameSet = [...aNames].sort().join() === [...bNames].sort().join();
    if (out.length < 5 && sameSet && aNames.join() !== bNames.join()) {
      out.push(`${at}: field order ${aNames.join(', ')} vs ${bNames.join(', ')}`);
    }
    return;
  }
  if (isPlain(a) && isPlain(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${at}.${k}`, out);
    return;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push(`${at}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  }
}

function compare(label: string, left: [string, unknown], right: [string, unknown]): void {
  const found: string[] = [];
  diff(left[1], right[1], '', found);
  for (const d of found) fail(`${label}: ${left[0]} and ${right[0]} differ at ${d}`);
}

function layoutOf(fields: Field[]): string | undefined {
  const layout = fields.find((f) => f.name === 'layout');
  return typeof layout?.default === 'string' ? layout.default : undefined;
}

function checkSkeleton(configs: Record<Brand, CmsConfig>): void {
  const settings = BRANDS.map((brand): [string, unknown] => {
    const rest: Plain = { ...configs[brand] };
    delete rest.collections;
    return [brand, normalize(rest, BRAND_SETTINGS)];
  });
  compare('settings', settings[0]!, settings[1]!);

  const byLayout = new Map<string, [string, unknown][]>();
  const byFolder = new Map<string, [string, unknown][]>();
  for (const brand of BRANDS) {
    for (const c of configs[brand].collections) {
      if (c.folder) {
        const list = byFolder.get(c.name) ?? [];
        list.push([`${brand}:${c.name}`, normalize(c, IGNORED_KEYS)]);
        byFolder.set(c.name, list);
      }
      for (const entry of c.files ?? []) {
        const layout = layoutOf(entry.fields);
        if (!layout) {
          fail(`${brand}:${entry.name}: no hidden layout field with a default`);
          continue;
        }
        // The entry name differs by brand (services vs capabilities); field
        // names below it must not, so only drop the top-level one.
        const { name: _name, ...rest } = entry;
        const list = byLayout.get(layout) ?? [];
        list.push([`${brand}:${entry.name}`, normalize(rest, IGNORED_KEYS)]);
        byLayout.set(layout, list);
      }
    }
  }
  for (const [layout, entries] of byLayout) {
    for (const other of entries.slice(1)) compare(layout, entries[0]!, other);
  }
  for (const [name, entries] of byFolder) {
    for (const other of entries.slice(1)) compare(`collection ${name}`, entries[0]!, other);
  }
}

function checkValue(value: unknown, field: Field, at: string, out: string[]): void {
  if (value === null || value === undefined) return;
  const widget = field.widget ?? 'string';

  if (widget === 'object') {
    if (!isPlain(value)) { out.push(`${at}: expected an object for the "${field.name}" object field`); return; }
    return checkObject(value, field.fields ?? [], at, out);
  }

  if (widget === 'list') {
    if (!Array.isArray(value)) { out.push(`${at}: expected a list for the "${field.name}" list field`); return; }
    value.forEach((item: unknown, i) => {
      const itemAt = `${at}[${i}]`;
      if (field.types) {
        const typeKey = field.typeKey ?? 'type';
        if (!isPlain(item)) { out.push(`${itemAt}: expected an object`); return; }
        const type = field.types.find((t) => t.name === item[typeKey]);
        if (!type) { out.push(`${itemAt}.${typeKey}: "${String(item[typeKey])}" is not a type in the CMS config`); return; }
        const { [typeKey]: _type, ...rest } = item;
        return checkObject(rest, type.fields ?? [], itemAt, out);
      }
      if (field.fields) {
        if (!isPlain(item)) { out.push(`${itemAt}: expected an object`); return; }
        return checkObject(item, field.fields, itemAt, out);
      }
      if (field.field) return checkValue(item, field.field, itemAt, out);
      if (isPlain(item) || Array.isArray(item)) out.push(`${itemAt}: expected a plain value`);
    });
    return;
  }

  if (Array.isArray(value)) {
    if (!field.multiple) { out.push(`${at}: a list is stored in the single-value "${field.name}" ${widget} field`); return; }
    if (value.some((x) => isPlain(x) || Array.isArray(x))) out.push(`${at}: expected plain values`);
    return;
  }
  if (isPlain(value)) out.push(`${at}: an object is stored in the "${field.name}" ${widget} field`);
}

function checkObject(obj: Plain, fields: Field[], at: string, out: string[]): void {
  for (const [key, value] of Object.entries(obj)) {
    const field = fields.find((f) => f.name === key);
    const keyAt = at ? `${at}.${key}` : key;
    if (!field) {
      out.push(`${keyAt}: not a field in the CMS config`);
      continue;
    }
    checkValue(value, field, keyAt, out);
  }
}

async function markdownFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await markdownFiles(full)));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function splitFrontmatter(text: string): { data: Plain; body: string } | null {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const data = yaml.load(m[1] ?? '');
  return { data: isPlain(data) ? data : {}, body: m[2] ?? '' };
}

function entryFor(config: CmsConfig, rel: string, data: Plain): { name: string; fields: Field[] } | null {
  for (const c of config.collections) {
    const entry = c.files?.find((e) => e.file === rel);
    if (entry) return entry;
  }
  for (const c of config.collections) {
    if (!c.folder || !c.fields || path.dirname(rel) !== c.folder) continue;
    if (c.filter && data[c.filter.field] !== c.filter.value) continue;
    return { name: c.name, fields: c.fields };
  }
  return null;
}

async function checkContent(brand: Brand, config: CmsConfig): Promise<number> {
  const siteRoot = path.join(REPO_ROOT, 'sites', brand);

  if (!existsSync(path.join(REPO_ROOT, config.media_folder))) {
    fail(`${brand}: media_folder ${config.media_folder} does not exist`);
  }
  for (const c of config.collections) {
    for (const e of c.files ?? []) {
      if (!existsSync(path.join(REPO_ROOT, e.file))) fail(`${brand}:${e.name}: ${e.file} does not exist`);
    }
  }

  const files = await markdownFiles(path.join(siteRoot, 'src/content'));
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file);
    if (NOT_IN_CMS.has(path.relative(siteRoot, file))) continue;
    const parsed = splitFrontmatter(await readFile(file, 'utf8'));
    if (!parsed) {
      fail(`${rel}: no frontmatter`);
      continue;
    }
    const entry = entryFor(config, rel, parsed.data);
    if (!entry) {
      fail(`${rel}: no CMS entry edits this file`);
      continue;
    }
    const frontmatterFields = entry.fields.filter((f) => f.name !== 'body');
    const problems: string[] = [];
    checkObject(parsed.data, frontmatterFields, '', problems);
    for (const p of problems) fail(`${rel}: ${p}`);
    if (parsed.body.trim() && !entry.fields.some((f) => f.name === 'body')) {
      fail(`${rel}: has a markdown body, but ${brand}:${entry.name} has no body field`);
    }
  }
  return files.length;
}

async function main(): Promise<void> {
  const configs = { veil: await loadConfig('veil'), ncss: await loadConfig('ncss') };
  checkSkeleton(configs);
  let scanned = 0;
  for (const brand of BRANDS) scanned += await checkContent(brand, configs[brand]);

  if (errors.length === 0) {
    console.log(`cms-parity: OK (2 configs, ${scanned} content files)`);
    process.exit(0);
  }
  console.error(`cms-parity: ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
