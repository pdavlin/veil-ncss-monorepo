import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio } from '@veil-ncss/tokens-shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = join(__dirname, '..', 'dist', 'model.json');

interface Pairing {
  role: string;
  fg: string;
  bg: string;
  large: boolean;
}

interface Model {
  pairings: Pairing[];
}

describe('Veil pairings contract', () => {
  let model: Model;

  beforeAll(async () => {
    if (!existsSync(MODEL_PATH)) {
      throw new Error(
        `model.json not found at ${MODEL_PATH}. Run \`pnpm --filter @veil-ncss/tokens-veil build\` first.`,
      );
    }
    model = JSON.parse(await readFile(MODEL_PATH, 'utf8')) as Model;
  });

  it('has at least one documented pairing', () => {
    expect(model.pairings.length).toBeGreaterThan(0);
  });

  it.each([])('placeholder', () => {});

  it('every pairing meets AA', () => {
    for (const p of model.pairings) {
      const ratio = contrastRatio(p.fg, p.bg);
      const target = p.large ? 3 : 4.5;
      expect(ratio, `${p.role}: ${p.fg} on ${p.bg}`).toBeGreaterThanOrEqual(target);
    }
  });
});
