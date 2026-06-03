import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBrandLeak } from '@veil-ncss/tokens-shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const BRAND_CSS = join(__dirname, '..', 'dist', 'index.css');
const BASE_MODEL = join(REPO_ROOT, 'packages', 'tokens-base', 'dist', 'model.json');

interface BaseModel {
  aliases: Record<string, unknown>;
}

describe('NCSS brand-leak guard (PRD NFR-2.5)', () => {
  let css: string;
  let aliasWhitelist: string[];

  beforeAll(async () => {
    if (!existsSync(BRAND_CSS)) {
      throw new Error(`NCSS dist/index.css missing. Run \`pnpm --filter @veil-ncss/tokens-ncss build\` first.`);
    }
    if (!existsSync(BASE_MODEL)) {
      throw new Error(`tokens-base model.json missing. Run \`pnpm --filter @veil-ncss/tokens-base build\` first.`);
    }
    css = await readFile(BRAND_CSS, 'utf8');
    const base = JSON.parse(await readFile(BASE_MODEL, 'utf8')) as BaseModel;
    aliasWhitelist = Object.keys(base.aliases);
  });

  it('only touches base aliases or --color-ncss-* palette tokens', () => {
    const reports = checkBrandLeak({
      aliasWhitelist,
      paletteNamespaces: ['color-ncss'],
      css,
    });
    expect(reports, JSON.stringify(reports, null, 2)).toEqual([]);
  });
});
