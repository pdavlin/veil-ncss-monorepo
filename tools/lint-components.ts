#!/usr/bin/env tsx
/*
 * lint-components — fail on brand strings or hardcoded values in packages/components/.
 *
 * Rules:
 *   1. Forbid the case-insensitive strings "veil" or "ncss" anywhere in source.
 *   2. In CSS: forbid hex/rgb/hsl color literals.
 *   3. In CSS: forbid <number>px / <number>rem with the allowlist {0, 1px, 100%, auto, transparent, currentColor}.
 *   4. Forbid references to --color-veil-* and --color-ncss-* palette tokens.
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

interface Finding {
  file: string;
  line: number;
  col: number;
  rule: string;
  excerpt: string;
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT_ROOT = path.join(REPO_ROOT, 'packages/components');

const FORBIDDEN_BRAND_STRING = /\b(veil|ncss)\b/i;
const FORBIDDEN_BRAND_TOKEN = /--color-(veil|ncss)-[a-z0-9-]+/i;
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
const FUNC_COLOR = /\b(rgb|rgba|hsl|hsla)\s*\(/;

// matches numeric literals followed by px or rem
const PX_REM_LITERAL = /(?<![a-zA-Z_-])(-?\d*\.?\d+)(px|rem)\b/g;

// allowed exact literals (lowercased for compare)
const ALLOWLIST = new Set(['0', '1px', '100%', 'auto', 'transparent', 'currentcolor']);

function isAllowedLiteral(value: number, unit: string): boolean {
  if (value === 0) return true;
  if (value === 1 && unit === 'px') return true;
  return false;
}

function stripMultilineComments(text: string): string {
  // Replace inside /* ... */ comments (possibly multi-line) with spaces while preserving newlines.
  let out = '';
  let inComment = false;
  for (let i = 0; i < text.length; i++) {
    if (!inComment && text[i] === '/' && text[i + 1] === '*') {
      inComment = true;
      out += '  ';
      i++;
      continue;
    }
    if (inComment && text[i] === '*' && text[i + 1] === '/') {
      inComment = false;
      out += '  ';
      i++;
      continue;
    }
    if (inComment) {
      out += text[i] === '\n' ? '\n' : ' ';
    } else {
      out += text[i];
    }
  }
  return out;
}

async function lintFile(file: string, findings: Finding[]): Promise<void> {
  const text = await readFile(file, 'utf8');
  const relPath = path.relative(REPO_ROOT, file);
  const isCss = file.endsWith('.css');
  // README is allowed to mention brand for documentation context, except it shouldn't reference brand tokens directly
  const isReadme = file.endsWith('README.md');

  const stripped_text = isCss ? stripMultilineComments(text) : text;
  const lines = text.split('\n');
  const strippedLines = stripped_text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    if (raw.includes('lint-allow')) continue;
    const stripped = (strippedLines[i] ?? '')
      .replace(/\{#.*?#\}/g, '');

    // Media queries must use literal lengths (custom properties don't work in @media values).
    // Exempt these specific lines from the px/rem rule but still apply brand-string rule.
    const isMediaQueryLine = /@media\b/.test(stripped);

    if (!isReadme) {
      const brand = stripped.match(FORBIDDEN_BRAND_STRING);
      if (brand && brand.index !== undefined) {
        findings.push({
          file: relPath,
          line: i + 1,
          col: brand.index + 1,
          rule: 'brand-string',
          excerpt: raw.trim(),
        });
      }
    }

    const brandToken = stripped.match(FORBIDDEN_BRAND_TOKEN);
    if (brandToken && brandToken.index !== undefined) {
      findings.push({
        file: relPath,
        line: i + 1,
        col: brandToken.index + 1,
        rule: 'brand-token',
        excerpt: raw.trim(),
      });
    }

    if (!isCss) continue;

    const hex = stripped.match(HEX_COLOR);
    if (hex && hex.index !== undefined) {
      findings.push({
        file: relPath,
        line: i + 1,
        col: hex.index + 1,
        rule: 'hex-color',
        excerpt: raw.trim(),
      });
    }

    const fn = stripped.match(FUNC_COLOR);
    if (fn && fn.index !== undefined) {
      findings.push({
        file: relPath,
        line: i + 1,
        col: fn.index + 1,
        rule: 'color-function',
        excerpt: raw.trim(),
      });
    }

    if (isMediaQueryLine) continue;

    PX_REM_LITERAL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PX_REM_LITERAL.exec(stripped)) !== null) {
      const value = Number(m[1]);
      const unit = m[2] ?? '';
      if (isAllowedLiteral(value, unit)) continue;
      findings.push({
        file: relPath,
        line: i + 1,
        col: m.index + 1,
        rule: `px-rem-literal (${m[0]})`,
        excerpt: raw.trim(),
      });
    }
  }
}

async function walk(dir: string, accept: (p: string) => boolean, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'coverage') continue;
      await walk(full, accept, out);
    } else if (entry.isFile() && accept(full)) {
      out.push(full);
    }
  }
}

async function main(): Promise<void> {
  const files: string[] = [];
  await walk(
    path.join(COMPONENT_ROOT, 'src'),
    (p) => p.endsWith('.njk') || p.endsWith('.html'),
    files,
  );
  await walk(
    path.join(COMPONENT_ROOT, 'styles'),
    (p) => p.endsWith('.css'),
    files,
  );
  files.push(path.join(COMPONENT_ROOT, 'README.md'));

  const findings: Finding[] = [];
  for (const file of files) {
    await lintFile(file, findings);
  }

  if (findings.length === 0) {
    console.log(`lint-components: OK (${files.length} files scanned)`);
    process.exit(0);
  }

  console.error(`lint-components: ${findings.length} violation(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}:${f.col}  [${f.rule}]`);
    console.error(`    > ${f.excerpt}`);
  }
  process.exit(1);
}

void main();
