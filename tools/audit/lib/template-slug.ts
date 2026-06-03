export interface TemplateGroup {
  template: string;
  representativeUrl: string;
  urls: string[];
}

export function templateSlugForUrl(url: string): string {
  const u = new URL(url);
  const path = u.pathname.replace(/\/$/, '');
  if (path === '' || path === '/') return 'home';
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 1) return slugify(segments[0] ?? 'page');
  const first = segments[0] ?? 'page';
  if (first.startsWith('portfolio-1')) return 'portfolio-detail';
  if (first.startsWith('portfolio')) return 'portfolio';
  return slugify(first);
}

export function groupByTemplate(urls: string[]): TemplateGroup[] {
  const groups = new Map<string, string[]>();
  for (const url of urls) {
    const slug = templateSlugForUrl(url);
    const existing = groups.get(slug) ?? [];
    existing.push(url);
    groups.set(slug, existing);
  }
  return [...groups.entries()].map(([template, urls]) => ({
    template,
    representativeUrl: urls[0] ?? '',
    urls,
  }));
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
}
