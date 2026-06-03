import { describe, expect, it } from 'vitest';
import { clusterColors, groupExact } from './cluster-tokens.ts';
import type { RawToken } from './extract-tokens.ts';

function colorToken(value: string, occurrences: number): RawToken {
  return {
    category: 'color',
    property: 'color',
    value,
    occurrences,
    sampleUrls: ['https://example.com/'],
    sampleSelectors: ['body'],
  };
}

describe('clusterColors', () => {
  it('groups near-identical hexes', () => {
    const clusters = clusterColors([colorToken('#1a1a1a', 10), colorToken('#1b1b1b', 5)], 0.05);
    expect(clusters.length).toBe(1);
    expect(clusters[0]?.members.length).toBe(2);
    expect(clusters[0]?.totalOccurrences).toBe(15);
  });

  it('keeps clearly different colors apart', () => {
    const clusters = clusterColors([colorToken('#000', 1), colorToken('#fff', 1), colorToken('#f00', 1)], 0.05);
    expect(clusters.length).toBe(3);
  });

  it('picks the most-occurrent member as representative', () => {
    const clusters = clusterColors([colorToken('#1a1a1a', 3), colorToken('#1b1b1b', 50)], 0.05);
    expect(clusters[0]?.representative).toBe('#1b1b1b');
  });

  it('ignores fully transparent colors', () => {
    const clusters = clusterColors(
      [colorToken('rgba(0, 0, 0, 0)', 5), colorToken('#000', 1)],
      0.05,
    );
    expect(clusters.length).toBe(1);
    expect(clusters[0]?.totalOccurrences).toBe(1);
  });
});

describe('groupExact', () => {
  it('groups non-color tokens by category', () => {
    const tokens: RawToken[] = [
      { category: 'fontSize', property: 'font-size', value: '16px', occurrences: 4, sampleUrls: [], sampleSelectors: [] },
      { category: 'fontSize', property: 'font-size', value: '24px', occurrences: 1, sampleUrls: [], sampleSelectors: [] },
      { category: 'fontFamily', property: 'font-family', value: 'Inter', occurrences: 10, sampleUrls: [], sampleSelectors: [] },
    ];
    const groups = groupExact(tokens);
    expect(groups.fontSize?.length).toBe(2);
    expect(groups.fontSize?.[0]?.value).toBe('16px');
    expect(groups.fontFamily?.length).toBe(1);
  });

  it('skips colors', () => {
    const tokens: RawToken[] = [
      { category: 'color', property: 'color', value: '#000', occurrences: 1, sampleUrls: [], sampleSelectors: [] },
    ];
    const groups = groupExact(tokens);
    expect(groups.color).toBeUndefined();
  });
});
