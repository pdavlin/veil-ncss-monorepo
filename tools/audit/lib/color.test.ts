import { describe, expect, it } from 'vitest';
import { parseColor, hslDistance, contrastRatio, toHex } from './color.ts';

describe('parseColor', () => {
  it('parses hex shorthand', () => {
    const c = parseColor('#fff');
    expect(c).not.toBeNull();
    expect(c?.l).toBeCloseTo(1, 3);
    expect(c?.a).toBe(1);
  });

  it('parses full hex', () => {
    const c = parseColor('#1a1a1a');
    expect(c).not.toBeNull();
    expect(c?.l).toBeLessThan(0.2);
  });

  it('parses hex with alpha', () => {
    const c = parseColor('#000000ff');
    expect(c?.a).toBe(1);
    const c2 = parseColor('#00000080');
    expect(c2?.a).toBeCloseTo(128 / 255, 3);
  });

  it('parses rgba()', () => {
    const c = parseColor('rgba(255, 0, 0, 0.5)');
    expect(c).not.toBeNull();
    expect(c?.a).toBe(0.5);
  });

  it('returns null for invalid input', () => {
    expect(parseColor('not-a-color')).toBeNull();
  });
});

describe('hslDistance + toHex', () => {
  it('finds near-identical colors close', () => {
    const a = parseColor('#1a1a1a')!;
    const b = parseColor('#1b1b1b')!;
    expect(hslDistance(a, b)).toBeLessThan(0.01);
  });

  it('finds distinct colors far', () => {
    const a = parseColor('#000')!;
    const b = parseColor('#fff')!;
    expect(hslDistance(a, b)).toBeGreaterThan(0.5);
  });

  it('round-trips hex', () => {
    const c = parseColor('#3366cc')!;
    expect(toHex(c)).toBe('#3366cc');
  });
});

describe('contrastRatio', () => {
  it('returns 21 for black on white', () => {
    const fg = parseColor('#000')!;
    const bg = parseColor('#fff')!;
    expect(contrastRatio(fg, bg)).toBeCloseTo(21, 0);
  });

  it('returns 1 for identical colors', () => {
    const c = parseColor('#888')!;
    expect(contrastRatio(c, c)).toBeCloseTo(1, 2);
  });
});
