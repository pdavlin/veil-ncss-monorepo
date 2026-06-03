import { describe, it, expect } from 'vitest';
import { checkBrandLeak } from './brand-leak.js';

const aliasWhitelist = ['--color-surface-brand', '--color-text-on-brand', '--font-display'];

describe('checkBrandLeak', () => {
  it('returns no reports for a clean brand layer', () => {
    const css = `
      :root, :root[data-brand="veil"] {
        --color-veil-ink: #0b0b0b;
        --color-surface-brand: var(--color-veil-ink);
        --color-text-on-brand: #fff;
        --font-display: "X", sans-serif;
      }
    `;
    const reports = checkBrandLeak({
      aliasWhitelist,
      paletteNamespaces: ['color-veil'],
      css,
    });
    expect(reports).toEqual([]);
  });

  it('flags overrides of base internals', () => {
    const css = `
      :root, :root[data-brand="veil"] {
        --space-l: 9000px;
        --color-surface-brand: #000;
      }
    `;
    const reports = checkBrandLeak({
      aliasWhitelist,
      paletteNamespaces: ['color-veil'],
      css,
    });
    expect(reports.length).toBe(1);
    expect(reports[0]?.declaration).toBe('--space-l');
  });

  it('flags palette tokens from the wrong brand namespace', () => {
    const css = `
      :root, :root[data-brand="ncss"] {
        --color-veil-ink: #0b0b0b;
      }
    `;
    const reports = checkBrandLeak({
      aliasWhitelist,
      paletteNamespaces: ['color-ncss'],
      css,
    });
    expect(reports.length).toBe(1);
    expect(reports[0]?.declaration).toBe('--color-veil-ink');
  });

  it('ignores @font-face blocks', () => {
    const css = `
      @font-face {
        font-family: "X";
        src: url('./x.woff2') format('woff2');
        font-weight: 400;
      }
      :root, :root[data-brand="ncss"] {
        --color-ncss-paper: #fff;
      }
    `;
    const reports = checkBrandLeak({
      aliasWhitelist,
      paletteNamespaces: ['color-ncss'],
      css,
    });
    expect(reports).toEqual([]);
  });
});
