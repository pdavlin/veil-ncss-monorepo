import { describe, it, expect } from 'vitest';
import { contrastRatio, meetsAA, resolve, adjustLightness } from './contrast.js';

describe('contrastRatio', () => {
  it('returns 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
  it('returns 1 for identical colors', () => {
    expect(contrastRatio('#7f7f7f', '#7f7f7f')).toBeCloseTo(1, 2);
  });
  it('is symmetric', () => {
    const a = contrastRatio('#123456', '#abcdef');
    const b = contrastRatio('#abcdef', '#123456');
    expect(a).toBeCloseTo(b, 5);
  });
});

describe('meetsAA', () => {
  it('treats 4.5 as the small-text bar', () => {
    expect(meetsAA(4.5, false)).toBe(true);
    expect(meetsAA(4.49, false)).toBe(false);
  });
  it('treats 3 as the large-text bar', () => {
    expect(meetsAA(3, true)).toBe(true);
    expect(meetsAA(2.99, true)).toBe(false);
  });
});

describe('adjustLightness', () => {
  it('shifts toward darker when asked', () => {
    const before = '#888888';
    const after = adjustLightness(before, 'darker', 0.2);
    expect(contrastRatio('#ffffff', after)).toBeGreaterThan(contrastRatio('#ffffff', before));
  });
});

describe('resolve', () => {
  const noOverrides = { lockedBackgrounds: [], lockedForegrounds: [] };

  it('returns no-change-needed for already-passing pair', () => {
    const d = resolve({ pairKey: 'k', fg: '#000', bg: '#fff', role: 't' }, noOverrides);
    expect(d.strategy).toBe('no-change-needed');
  });

  it('adjusts foreground by default for a failing pair', () => {
    const d = resolve({ pairKey: 'k', fg: '#aaaaaa', bg: '#ffffff', role: 'meta' }, noOverrides);
    expect(d.strategy).toBe('adjust-fg');
    expect(d.ratioAdjusted).toBeGreaterThanOrEqual(4.5);
    expect(d.fgAdjusted).not.toEqual(d.fgOriginal);
    expect(d.bgAdjusted).toEqual(d.bgOriginal);
  });

  it('adjusts background when fg is locked', () => {
    const d = resolve(
      { pairKey: 'k', fg: '#0000ee', bg: '#3030ee', role: 'link' },
      { lockedBackgrounds: [], lockedForegrounds: ['#0000ee'] },
    );
    expect(d.strategy).toBe('adjust-bg');
    expect(d.bgAdjusted).not.toEqual(d.bgOriginal);
    expect(d.ratioAdjusted).toBeGreaterThanOrEqual(4.5);
  });

  it('honors the large-text bar', () => {
    const d = resolve(
      { pairKey: 'k', fg: '#888888', bg: '#ffffff', role: 'accent', large: true },
      noOverrides,
    );
    expect(d.strategy === 'adjust-fg' || d.strategy === 'no-change-needed').toBe(true);
    expect(d.ratioAdjusted).toBeGreaterThanOrEqual(3);
  });
});
