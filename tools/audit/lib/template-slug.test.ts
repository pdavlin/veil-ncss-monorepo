import { describe, expect, it } from 'vitest';
import { templateSlugForUrl, groupByTemplate } from './template-slug.ts';

describe('templateSlugForUrl', () => {
  it('returns home for /', () => {
    expect(templateSlugForUrl('https://example.com/')).toBe('home');
    expect(templateSlugForUrl('https://example.com')).toBe('home');
  });

  it('uses first segment for single-level paths', () => {
    expect(templateSlugForUrl('https://example.com/services')).toBe('services');
    expect(templateSlugForUrl('https://example.com/about')).toBe('about');
  });

  it('groups portfolio detail pages', () => {
    expect(templateSlugForUrl('https://example.com/portfolio-1/catalyst')).toBe('portfolio-detail');
    expect(templateSlugForUrl('https://example.com/portfolio-1/joslyn-art-museum')).toBe('portfolio-detail');
  });
});

describe('groupByTemplate', () => {
  it('groups urls under each template slug', () => {
    const groups = groupByTemplate([
      'https://example.com/',
      'https://example.com/services',
      'https://example.com/portfolio-1/a',
      'https://example.com/portfolio-1/b',
    ]);
    const slugs = groups.map((g) => g.template).sort();
    expect(slugs).toEqual(['home', 'portfolio-detail', 'services']);
    const detail = groups.find((g) => g.template === 'portfolio-detail');
    expect(detail?.urls.length).toBe(2);
  });
});
