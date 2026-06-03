import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = join(__dirname, '..');
const DIST = join(PKG, 'dist');
const FONTS_DIST = join(DIST, 'fonts');

describe('tokens-ncss build (e2e)', () => {
  beforeAll(() => {
    execSync('pnpm run build', { cwd: PKG, stdio: 'inherit' });
  });

  it('emits the expected files', () => {
    for (const f of ['index.css', 'model.json']) {
      expect(existsSync(join(DIST, f)), `${f} missing`).toBe(true);
    }
  });

  it('copies all 8 woff2 fonts into dist/fonts/', () => {
    for (const f of [
      'AvenirNextWorld-Thin.woff2',
      'AvenirNextWorld-ThinIt.woff2',
      'AvenirNextWorld-Regular.woff2',
      'AvenirNextWorld-Italic.woff2',
      'AvenirNextWorld-Demi.woff2',
      'AvenirNextWorld-DemiIt.woff2',
      'AvenirNextWorld-Bold.woff2',
      'AvenirNextWorld-BoldIt.woff2',
    ]) {
      expect(existsSync(join(FONTS_DIST, f)), `${f} missing`).toBe(true);
    }
  });

  it('is idempotent', () => {
    const before = readFileSync(join(DIST, 'index.css'), 'utf8');
    execSync('pnpm run build', { cwd: PKG, stdio: 'pipe' });
    const after = readFileSync(join(DIST, 'index.css'), 'utf8');
    expect(after).toBe(before);
  });

  it('scopes brand CSS with the compound selector', () => {
    const content = readFileSync(join(DIST, 'index.css'), 'utf8');
    expect(content).toContain(':root, :root[data-brand="ncss"]');
  });

  it('emits @font-face for Avenir Next World', () => {
    const content = readFileSync(join(DIST, 'index.css'), 'utf8');
    expect(content).toContain('@font-face');
    expect(content).toContain('Avenir Next World');
  });
});
