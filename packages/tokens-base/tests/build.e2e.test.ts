import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = join(__dirname, '..');
const DIST = join(PKG, 'dist');

describe('tokens-base build (e2e)', () => {
  beforeAll(() => {
    execSync('pnpm run build', { cwd: PKG, stdio: 'inherit' });
  });

  it('emits the expected files', () => {
    for (const f of ['index.css', 'reset.css', 'scales.css', 'aliases.css', 'misc.css', 'model.json']) {
      expect(existsSync(join(DIST, f)), `${f} missing`).toBe(true);
    }
  });

  it('is idempotent', () => {
    const before = readFileSync(join(DIST, 'scales.css'), 'utf8');
    execSync('pnpm run build', { cwd: PKG, stdio: 'pipe' });
    const after = readFileSync(join(DIST, 'scales.css'), 'utf8');
    expect(after).toBe(before);
  });

  it('declares the @layer order in index.css', () => {
    const content = readFileSync(join(DIST, 'index.css'), 'utf8');
    expect(content).toMatch(/@layer reset, tokens, base, components, utilities/);
  });
});
