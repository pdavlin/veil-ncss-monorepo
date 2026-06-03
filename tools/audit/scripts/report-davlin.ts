import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOriginsFromArgv, outputDirFor, config, type OriginConfig } from '../config.ts';
import { openLogger } from '../lib/logger.ts';
import { parseColor, contrastRatio, type Hsl } from '../lib/color.ts';
import { loadRecommendationsHtml } from '../lib/recommendations.ts';
import type { RawToken } from './extract-tokens.ts';
import type { ClusterReport, ColorCluster } from './cluster-tokens.ts';
import type { A11yReport } from './audit-a11y.ts';
import type { UrlEntry } from './crawl.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TemplateGroupSerialized {
  template: string;
  representativeUrl: string;
  urls: string[];
}

interface TemplateNote {
  intent?: string;
  structuralSections?: string[];
  responsiveNotes?: string;
  reuseAcrossTemplates?: string[];
}

type TemplateNotes = Record<string, TemplateNote>;

function readJsonIfExists<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const HIDDEN_SWATCHES = new Set([
  '#0000ee',
  '#b0a986',
  '#de5021',
  '#ed1566',
  '#f4c0af',
]);

function readableColorName(hex: string): string {
  const map: Record<string, string> = {
    '#000000': 'Black',
    '#ffffff': 'White',
    '#ffffffd9': 'White, transparency-adjusted',
    '#605e5e': 'Mid gray',
    '#2f2e2e': 'Near-black',
    '#a0a09f': 'Light gray',
    '#c7c7c7': 'Pale gray',
    '#d9d9d9': 'Very pale gray',
    '#d9d9d933': 'Very pale gray, transparency-adjusted',
  };
  return map[hex.toLowerCase()] ?? '';
}

function pickTextOn(bg: Hsl): string {
  const black = parseColor('#1b1818')!;
  const white = parseColor('#f4ecec')!;
  return contrastRatio(bg, black) > contrastRatio(bg, white) ? '#1b1818' : '#f4ecec';
}

interface DisplayToken {
  value: string;
  occurrences: number;
}

function dedupeByValue(tokens: RawToken[]): DisplayToken[] {
  const map = new Map<string, DisplayToken>();
  for (const t of tokens) {
    if (t.value === 'none' || t.value === 'normal' || t.value === 'transparent' || t.value === 'rgba(0, 0, 0, 0)') continue;
    const existing = map.get(t.value);
    if (existing) {
      existing.occurrences += t.occurrences;
    } else {
      map.set(t.value, { value: t.value, occurrences: t.occurrences });
    }
  }
  return [...map.values()].sort((a, b) => b.occurrences - a.occurrences);
}

function renderPalette(clusters: ClusterReport | null): string {
  if (!clusters || clusters.colors.length === 0) return '<p class="empty">No color data.</p>';
  return `<div class="swatches">${(clusters.colors as ColorCluster[])
    .filter((c) => !HIDDEN_SWATCHES.has(c.representative.toLowerCase()))
    .map((c) => {
      const hsl = parseColor(c.representative);
      const text = hsl ? pickTextOn(hsl) : '#1b1818';
      const name = readableColorName(c.representative);
      const memberCount = c.members.length;
      const memberSummary = memberCount > 1 ? `${memberCount} variants` : '1 value';
      return `
        <div class="swatch" style="background: ${escapeHtml(c.representative)}; color: ${text}; border-color: ${text};">
          <div class="swatch-hex">${escapeHtml(c.representative)}</div>
          ${name ? `<div class="swatch-name">${escapeHtml(name)}</div>` : '<div class="swatch-name swatch-name-empty">&nbsp;</div>'}
          <div class="swatch-meta">${c.totalOccurrences.toLocaleString()} uses · ${memberSummary}</div>
        </div>`;
    })
    .join('')}</div>`;
}

const PLATFORM_SAFE_FONTS = new Set([
  'arial', 'helvetica', 'helvetica neue',
  'times', 'times new roman',
  'courier', 'courier new',
  'georgia', 'verdana', 'tahoma', 'trebuchet ms',
  'palatino', 'palatino linotype', 'garamond',
  'comic sans ms', 'impact',
  'system-ui', '-apple-system', 'blinkmacsystemfont',
  'ui-sans-serif', 'ui-monospace', 'ui-serif',
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
  'berkeleymono',
  // Aliased via FONT_ALIAS_CSS below
  'roboto', 'roboto-thin', 'roboto-light',
  'wfont_02bfd7_21a855f4e50446ed9d2b04a8cbaea352',
  'wf_21a855f4e50446ed9d2b04a8c',
  'orig_roboto_light',
  'helveticaneuew01-45ligh',
  'helveticaneuew02-45ligh',
  'helveticaneuew10-45ligh',
]);

const FONT_ALIAS_CSS = `
    /* Roboto loaded from Fontsource (NPM mirror of Google Fonts) */
    @font-face {
      font-family: 'Roboto';
      src: url('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-100-normal.woff2') format('woff2');
      font-weight: 100;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Roboto';
      src: url('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-300-normal.woff2') format('woff2');
      font-weight: 300;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Roboto';
      src: url('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-400-normal.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Roboto';
      src: url('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-700-normal.woff2') format('woff2');
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }

    /* Aliases for Wix-served Roboto variants */
    @font-face {
      font-family: 'roboto-thin';
      src: url('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-100-normal.woff2') format('woff2');
      font-display: swap;
    }
    @font-face {
      font-family: 'wfont_02bfd7_21a855f4e50446ed9d2b04a8cbaea352';
      src: url('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-300-normal.woff2') format('woff2');
      font-display: swap;
    }
    @font-face {
      font-family: 'wf_21a855f4e50446ed9d2b04a8c';
      src: url('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-300-normal.woff2') format('woff2');
      font-display: swap;
    }
    @font-face {
      font-family: 'orig_roboto_light';
      src: url('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-300-normal.woff2') format('woff2');
      font-display: swap;
    }

    /* Helvetica Neue aliases — use system install if available */
    @font-face {
      font-family: 'HelveticaNeueW01-45Ligh';
      src: local('Helvetica Neue Light'), local('HelveticaNeue-Light'), local('Helvetica Neue'), local('Helvetica');
      font-weight: 300;
    }
    @font-face {
      font-family: 'HelveticaNeueW02-45Ligh';
      src: local('Helvetica Neue Light'), local('HelveticaNeue-Light'), local('Helvetica Neue'), local('Helvetica');
      font-weight: 300;
    }
    @font-face {
      font-family: 'HelveticaNeueW10-45Ligh';
      src: local('Helvetica Neue Light'), local('HelveticaNeue-Light'), local('Helvetica Neue'), local('Helvetica');
      font-weight: 300;
    }
`;

function firstFamily(stack: string): string {
  const first = stack.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '').toLowerCase() ?? '';
  return first;
}

function isFontBundled(stack: string): boolean {
  return PLATFORM_SAFE_FONTS.has(firstFamily(stack));
}

function renderFontFamilies(tokens: RawToken[]): string {
  const families = dedupeByValue(tokens.filter((t) => t.category === 'fontFamily'));
  if (families.length === 0) return '<p class="empty">No font data.</p>';
  const rows = families
    .map((f) => {
      const bundled = isFontBundled(f.value);
      const warn = bundled
        ? ''
        : `<span class="warn" role="img" aria-label="Custom web font not included — sample shown in fallback font" title="Custom web font not included — sample shown in fallback font">⚠</span>`;
      return `
      <tr>
        <td><span class="font-sample" style="font-family: ${escapeHtml(f.value)};">Engineered shading</span>${warn}</td>
        <td class="mono">${escapeHtml(f.value)}</td>
        <td class="num">${f.occurrences.toLocaleString()}</td>
      </tr>`;
    })
    .join('');
  const hasUnbundled = families.some((f) => !isFontBundled(f.value));
  const note = hasUnbundled
    ? '<p class="meta"><span class="warn" aria-hidden="true">⚠</span> Custom web font not included in this report — sample shown in fallback font.</p>'
    : '';
  return `<table class="t"><thead><tr><th>Sample</th><th>Stack</th><th>Uses</th></tr></thead><tbody>${rows}</tbody></table>${note}`;
}

function renderFontSizes(tokens: RawToken[]): string {
  const sizes = dedupeByValue(tokens.filter((t) => t.category === 'fontSize'));
  if (sizes.length === 0) return '<p class="empty">no font size data.</p>';
  const rows = sizes
    .map(
      (s) => `
      <tr>
        <td><span class="size-sample" style="font-size: ${escapeHtml(s.value)};">Aa</span></td>
        <td class="mono">${escapeHtml(s.value)}</td>
        <td class="num">${s.occurrences.toLocaleString()}</td>
      </tr>`,
    )
    .join('');
  return `<table class="t"><thead><tr><th>Sample</th><th>Size</th><th>Uses</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderSimpleTokenTable(tokens: RawToken[], category: string, label: string): string {
  const list = dedupeByValue(tokens.filter((t) => t.category === category));
  if (list.length === 0) return `<p class="empty">No ${label.toLowerCase()} data.</p>`;
  const rows = list
    .slice(0, 25)
    .map((t) => `<tr><td class="mono">${escapeHtml(t.value)}</td><td class="num">${t.occurrences.toLocaleString()}</td></tr>`)
    .join('');
  return `<table class="t"><thead><tr><th>${escapeHtml(label)}</th><th>Uses</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function renderTemplates(
  groups: TemplateGroupSerialized[] | null,
  notes: TemplateNotes,
  viewports: readonly number[],
  dir: string,
): string {
  if (!groups || groups.length === 0) return '<p class="empty">No template data.</p>';
  const mobileWidths = [320, 768];
  return groups
    .map((g) => {
      const note = notes[g.template] ?? {};
      const intent = note.intent ? `<p class="lede">${escapeHtml(note.intent)}</p>` : '';
      const sections = note.structuralSections && note.structuralSections.length > 0
        ? `<fieldset><legend>Layout sections</legend><ul class="bullet">${note.structuralSections.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul></fieldset>`
        : '';
      const responsive = note.responsiveNotes
        ? `<fieldset><legend>Responsive at 320px</legend><p>${escapeHtml(note.responsiveNotes)}</p></fieldset>`
        : '';
      const reuse = note.reuseAcrossTemplates && note.reuseAcrossTemplates.length > 0
        ? `<p class="meta">Shared with: ${note.reuseAcrossTemplates.map((r) => `<code>${escapeHtml(r)}</code>`).join(', ')}</p>`
        : '';
      const urlList = g.urls.length > 1
        ? `<details><summary>${g.urls.length} URLs use this template</summary><ul class="urls">${g.urls.map((u) => `<li><a href="${escapeHtml(u)}">${escapeHtml(u)}</a></li>`).join('')}</ul></details>`
        : `<p class="meta"><a href="${escapeHtml(g.representativeUrl)}">${escapeHtml(g.representativeUrl)}</a></p>`;

      const desktopShots = viewports
        .map(
          (w) => `
          <figure>
            <a href="screenshots/${escapeHtml(g.template)}/${w}.png">
              <img src="screenshots/${escapeHtml(g.template)}/${w}.png" alt="${escapeHtml(g.template)} at ${w}px" loading="lazy" />
            </a>
            <figcaption>${w}px</figcaption>
          </figure>`,
        )
        .join('');

      const existingMobile = mobileWidths.filter((w) =>
        fs.existsSync(path.join(dir, 'screenshots', g.template, `${w}-mobile.png`)),
      );
      const mobileShots = existingMobile
        .map(
          (w) => `
          <figure>
            <a href="screenshots/${escapeHtml(g.template)}/${w}-mobile.png">
              <img src="screenshots/${escapeHtml(g.template)}/${w}-mobile.png" alt="${escapeHtml(g.template)} mobile UA at ${w}px" loading="lazy" />
            </a>
            <figcaption>${w}px (mobile UA)</figcaption>
          </figure>`,
        )
        .join('');
      const mobileBlock = mobileShots
        ? `<p class="meta shots-label">Desktop user-agent</p>
           <div class="shots">${desktopShots}</div>
           <p class="meta shots-label">Mobile user-agent (Wix serves an alternate template)</p>
           <div class="shots">${mobileShots}</div>`
        : `<div class="shots">${desktopShots}</div>`;

      return `
        <fieldset class="template" id="template-${escapeHtml(g.template)}">
          <legend>${escapeHtml(titleCase(g.template))}</legend>
          ${intent}
          ${urlList}
          ${sections}
          ${responsive}
          ${reuse}
          ${mobileBlock}
        </fieldset>`;
    })
    .join('');
}

function renderA11y(report: A11yReport | null): string {
  if (!report) return '<p class="empty">No accessibility data.</p>';
  const lighthouse = report.lighthouse;
  const avg = (key: 'accessibility' | 'performance' | 'bestPractices' | 'seo'): number => {
    const vals = lighthouse.map((l) => l[key]).filter((v): v is number => v !== null);
    if (vals.length === 0) return 0;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100);
  };

  const scores = lighthouse.length === 0
    ? ''
    : `
      <div class="scorecards">
        <fieldset class="score"><legend>Accessibility</legend><div class="num">${avg('accessibility')}</div></fieldset>
        <fieldset class="score"><legend>Performance</legend><div class="num">${avg('performance')}</div></fieldset>
        <fieldset class="score"><legend>Best practices</legend><div class="num">${avg('bestPractices')}</div></fieldset>
        <fieldset class="score"><legend>SEO</legend><div class="num">${avg('seo')}</div></fieldset>
      </div>
      <p class="meta">Lighthouse averages across ${lighthouse.length} pages.</p>
    `;

  const issuesByRule = new Map<string, { count: number; impact: string; description: string; helpUrl?: string; urls: Set<string> }>();
  for (const issue of report.issues) {
    const existing = issuesByRule.get(issue.rule);
    if (existing) {
      existing.count++;
      existing.urls.add(issue.url);
    } else {
      const entry: { count: number; impact: string; description: string; helpUrl?: string; urls: Set<string> } = {
        count: 1,
        impact: issue.impact,
        description: issue.description,
        urls: new Set([issue.url]),
      };
      if (issue.helpUrl) entry.helpUrl = issue.helpUrl;
      issuesByRule.set(issue.rule, entry);
    }
  }
  const issuesList = [...issuesByRule.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(
      ([rule, info]) => `
        <fieldset class="issue">
          <legend>${escapeHtml(rule)} · ${escapeHtml(info.impact)}</legend>
          <p>${escapeHtml(info.description)}${info.helpUrl ? ` <a href="${escapeHtml(info.helpUrl)}">Reference</a>` : ''}</p>
          <p class="meta">Affected pages: ${[...info.urls].map((u) => `<a href="${escapeHtml(u)}">${escapeHtml(new URL(u).pathname || '/')}</a>`).join(', ')}</p>
        </fieldset>`,
    )
    .join('');
  const issuesBlock = report.issues.length === 0
    ? '<p class="empty">No axe-core violations detected at the default page state.</p>'
    : issuesList;

  return `${scores}<h3>Issues found</h3>${issuesBlock}<p class="meta">This audit captures the default page state. Hover, focus, and lazy-loaded states may have additional issues to investigate.</p>`;
}

function renderHtml(args: {
  origin: string;
  urls: UrlEntry[];
  tokens: RawToken[];
  clusters: ClusterReport | null;
  groups: TemplateGroupSerialized[] | null;
  notes: TemplateNotes;
  a11y: A11yReport | null;
  viewports: readonly number[];
  dir: string;
}): string {
  const { origin, urls, tokens, clusters, groups, notes, a11y, viewports, dir } = args;
  const colorCount = clusters?.colors.length ?? 0;
  const familyCount = new Set(tokens.filter((t) => t.category === 'fontFamily').map((t) => t.value)).size;
  const sizeCount = new Set(tokens.filter((t) => t.category === 'fontSize').map((t) => t.value)).size;
  const templateCount = groups?.length ?? 0;
  const issueCount = a11y?.issues.length ?? 0;
  const lhAvg = a11y && a11y.lighthouse.length > 0
    ? Math.round((a11y.lighthouse.map((l) => l.accessibility ?? 0).reduce((a, b) => a + b, 0) / a11y.lighthouse.length) * 100)
    : null;

  const tocItems = (groups ?? []).map((g) => `<a href="#template-${escapeHtml(g.template)}">${escapeHtml(g.template)}</a>`).join(' · ');

  const dateStr = new Date().toISOString().slice(0, 10);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>site audit for ${escapeHtml(origin)}</title>
  <style>
    @font-face {
      font-family: 'BerkeleyMono';
      src: url('fonts/BerkeleyMono-Regular.woff') format('woff');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }
${FONT_ALIAS_CSS}

    :root {
      --base_00: #1b1818;
      --base_01: #292424;
      --base_02: #585050;
      --base_03: #655d5d;
      --base_04: #7e7777;
      --base_05: #8a8585;
      --base_06: #e7dfdf;
      --base_07: #f4ecec;
      --base_08: #ca4949;
      --base_09: #b45a3c;
      --base_0a: #a06e3b;
      --base_0b: #4b8b8b;
      --base_0c: #5485b6;
      --base_0d: #7272ca;
      --base_0e: #8464c4;
      --base_0f: #bd5187;

      --space_3xs: clamp(0.25rem, 0.2283rem + 0.1087vw, 0.3125rem);
      --space_2xs: clamp(0.5rem, 0.4783rem + 0.1087vw, 0.5625rem);
      --space_xs: clamp(0.75rem, 0.7065rem + 0.2174vw, 0.875rem);
      --space_s: clamp(1rem, 0.9565rem + 0.2174vw, 1.125rem);
      --space_m: clamp(1.5rem, 1.4348rem + 0.3261vw, 1.6875rem);
      --space_l: clamp(2rem, 1.913rem + 0.4348vw, 2.25rem);
      --space_xl: clamp(3rem, 2.8696rem + 0.6522vw, 3.375rem);
      --space_2xl: clamp(4rem, 3.8261rem + 0.8696vw, 4.5rem);
      --space_3xl: clamp(5rem, 4.7826rem + 1.087vw, 5.625rem);

      --page_gutters: clamp(var(--space_m), 3vw, var(--space_xl));
      --page-max: 56rem;

      --color-bg: var(--base_07);
      --color-text: var(--base_01);
      --accent-color: var(--base_0b);
      --color-bg-accent: color-mix(in oklch, var(--accent-color) 15%, var(--color-bg));
      --color-text-accent: var(--accent-color);
      --color-theme-offset: color-mix(in oklch, var(--accent-color) 80%, var(--color-text));
      --color-theme-muted: color-mix(in oklch, var(--accent-color) 20%, var(--color-bg));
      --color-highlight: color-mix(in oklch, var(--accent-color) 30%, var(--color-bg));
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --color-bg: var(--base_01);
        --color-text: var(--base_07);
      }
    }

    *, *::before, *::after { box-sizing: border-box; }
    html { font-size: 16px; }
    body {
      margin: 0;
      background: var(--color-bg);
      color: var(--color-text);
      font-family: 'BerkeleyMono', ui-monospace, SFMono-Regular, Menlo, monospace;
      line-height: 1.5;
    }
    ::selection { background: var(--color-highlight); color: var(--color-text); }

    a { color: currentcolor; text-decoration-color: var(--accent-color); }
    a:hover { text-decoration-color: var(--color-text-accent); }

    fieldset {
      border: 1px solid var(--base_03);
      padding: var(--space_s) var(--space_m);
      margin: 0;
      transition: border-color 0.15s ease-out;
    }
    fieldset:hover, fieldset:focus-within { border-color: var(--accent-color); }
    fieldset legend {
      padding: 0 0.5em;
      color: var(--base_02);
      font-weight: bold;
      font-size: 0.75rem;
      letter-spacing: 0.04em;
      transition: color 0.15s ease-out;
    }
    fieldset:hover legend, fieldset:focus-within legend { color: var(--accent-color); }

    main {
      max-width: var(--page-max);
      margin: 0 auto;
      padding: var(--page_gutters);
    }

    .flow > * + * { margin-block-start: var(--flow-space, var(--space_m)); }

    h1.title {
      font-size: clamp(1.5rem, 1.2rem + 1.5vw, 2.5rem);
      letter-spacing: 0.02em;
      margin: 0 0 var(--space_s);
    }
    h1.title .accent { color: var(--accent-color); }

    h2 {
      font-size: 1.5rem;
      letter-spacing: 0.02em;
      margin: 0 0 var(--space_s);
    }
    h3 {
      font-size: 1.05rem;
      letter-spacing: 0.02em;
      margin: var(--space_m) 0 var(--space_xs);
      color: var(--color-theme-offset);
    }

    p { margin: 0 0 var(--space_s); }
    .lede { color: var(--color-theme-offset); }
    .meta { color: var(--base_03); font-size: 0.85rem; }
    .empty { color: var(--base_03); font-style: italic; }
    code, .mono { font-family: 'BerkeleyMono', ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--color-theme-muted); padding: 0.05em 0.4em; border-radius: 2px; font-size: 0.9em; }
    code a, .mono a { color: inherit; }

    header.site {
      max-width: var(--page-max);
      margin: 0 auto;
      padding: var(--space_xl) var(--page_gutters) var(--space_l);
    }
    header.site .meta { margin-top: var(--space_2xs); }
    .site-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space_m);
      flex-wrap: wrap;
    }
    .pdf-link {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.5rem 0.85rem;
      border: 1px solid var(--base_03);
      background: var(--color-bg);
      color: var(--color-text);
      text-decoration: none;
      font-size: 0.85rem;
      letter-spacing: 0.02em;
      transition: border-color 0.15s ease-out, color 0.15s ease-out;
      white-space: nowrap;
    }
    .pdf-link:hover, .pdf-link:focus-visible {
      border-color: var(--accent-color);
      color: var(--accent-color);
    }
    .pdf-link span { font-size: 0.95em; }

    nav.toc {
      display: flex;
      gap: var(--space_s);
      flex-wrap: wrap;
      max-width: var(--page-max);
      margin: 0 auto;
      padding: 0 var(--page_gutters);
      font-size: 0.85rem;
    }
    nav.toc a {
      color: var(--color-theme-offset);
      text-decoration: none;
      letter-spacing: 0.02em;
      border-bottom: 1px dashed transparent;
      padding-bottom: 1px;
    }
    nav.toc a:hover { border-bottom-color: var(--accent-color); color: var(--accent-color); }

    section.block { padding: var(--space_l) 0; }
    section.block > fieldset + fieldset { margin-top: var(--space_l); }
    section.block > h3 + fieldset { margin-top: var(--space_xs); }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space_s);
    }
    .stat { text-align: left; }
    .stat .n { font-size: 2rem; line-height: 1; color: var(--color-text); }
    .stat .l { color: var(--base_03); font-size: 0.8rem; letter-spacing: 0.02em; margin-top: var(--space_2xs); }

    .swatches {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: var(--space_s);
    }
    .swatch {
      min-height: 160px;
      display: flex;
      flex-direction: column;
      gap: var(--space_3xs);
      padding: var(--space_s) var(--space_s) var(--space_m);
      border: 1px solid currentColor;
      transition: transform 0.15s ease-out;
    }
    .swatch:hover { transform: translateY(-2px); }
    .swatch-hex {
      font-family: 'BerkeleyMono', monospace;
      font-weight: bold;
      font-size: 0.95rem;
      letter-spacing: 0.02em;
    }
    .swatch-name {
      font-size: 1rem;
      font-weight: bold;
      margin: 0;
      line-height: 1.25;
    }
    .swatch-name-empty { visibility: hidden; }
    .swatch-meta { font-size: 0.8rem; opacity: 0.9; margin-top: auto; }

    table.t { width: 100%; border-collapse: collapse; margin: 0 0 var(--space_s); }
    table.t th, table.t td {
      text-align: left;
      padding: var(--space_xs) var(--space_s);
      border-bottom: 1px solid var(--base_06);
      vertical-align: middle;
    }
    table.t th {
      font-size: 0.75rem;
      letter-spacing: 0.02em;
      color: var(--base_03);
      border-bottom-color: var(--base_03);
      font-weight: bold;
    }
    @media (prefers-color-scheme: dark) {
      table.t th, table.t td { border-bottom-color: var(--base_03); }
    }
    .num { text-align: right; font-variant-numeric: tabular-nums; color: var(--base_03); }
    .font-sample { font-size: 1.15rem; }
    .warn {
      display: inline-block;
      margin-left: 0.5rem;
      color: var(--base_09);
      font-size: 0.95rem;
      cursor: help;
      vertical-align: baseline;
    }
    .size-sample { display: inline-block; line-height: 1; vertical-align: middle; }

    .scorecards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space_s);
    }
    .scorecards .score { text-align: center; padding: var(--space_m) var(--space_s); }
    .scorecards .score .num { font-size: 2.5rem; line-height: 1; }

    fieldset.issue { margin: var(--space_s) 0; }
    fieldset.issue legend { font-family: 'BerkeleyMono', monospace; }
    fieldset.issue p { margin: 0 0 var(--space_2xs); }

    .bullet { padding-left: 1.5em; margin: 0; }
    .bullet li { margin-bottom: var(--space_2xs); }

    .urls { padding-left: 1.5em; margin: var(--space_xs) 0; font-size: 0.85rem; }
    .urls a { word-break: break-all; }

    details { margin: var(--space_xs) 0; }
    details summary { cursor: pointer; color: var(--color-theme-offset); font-size: 0.9rem; }
    details summary:hover { color: var(--accent-color); }

    fieldset.template { margin: var(--space_l) 0; }
    fieldset.template legend { font-size: 0.95rem; }
    fieldset.template > * + * { margin-top: var(--space_s); }
    fieldset.template fieldset { margin: var(--space_xs) 0; }

    .shots-label { margin: var(--space_s) 0 var(--space_2xs); font-weight: bold; color: var(--color-text); }

    .recommendations { font-family: 'BerkeleyMono', ui-monospace, monospace; }
    .recommendations > h1 { display: none; }
    .recommendations > h2 {
      font-size: 1.4rem;
      letter-spacing: 0.02em;
      margin: var(--space_xl) 0 var(--space_s);
      padding-bottom: var(--space_xs);
      border-bottom: 1px solid var(--base_03);
      color: var(--accent-color);
    }
    .recommendations > h2:first-of-type { margin-top: 0; }
    .recommendations > h3 {
      font-size: 1.1rem;
      margin: var(--space_l) 0 var(--space_xs);
      color: var(--color-text);
    }
    .recommendations > h2 + p { color: var(--color-theme-offset); }
    .recommendations hr { border: 0; border-top: 1px solid var(--base_06); margin: var(--space_l) 0; }
    .recommendations ul { padding-left: 1.5em; }
    .recommendations li { margin-bottom: var(--space_2xs); }
    .recommendations code { font-family: 'BerkeleyMono', ui-monospace, monospace; }
    .recommendations p { margin: 0 0 var(--space_s); }

    fieldset.callout {
      background: var(--color-bg-accent);
      border-color: var(--accent-color);
      margin: var(--space_s) 0 var(--space_l);
    }
    fieldset.callout legend { color: var(--accent-color); }
    fieldset.callout p:last-child { margin-bottom: 0; }

    .shots {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--space_s);
      margin-top: var(--space_s);
    }
    .shots figure { margin: 0; }
    .shots img {
      width: 100%;
      height: auto;
      border: 1px solid var(--base_06);
      display: block;
      transition: border-color 0.15s ease-out;
    }
    .shots a:hover img { border-color: var(--accent-color); }
    .shots figcaption {
      font-size: 0.75rem;
      color: var(--base_03);
      margin-top: var(--space_3xs);
      text-align: center;
      letter-spacing: 0.02em;
    }

    footer.site {
      max-width: var(--page-max);
      margin: 0 auto;
      padding: var(--space_xl) var(--page_gutters);
      color: var(--base_03);
      font-size: 0.85rem;
    }

    .page-toc {
      display: none;
      position: fixed;
      top: var(--space_xl);
      right: var(--page_gutters);
      z-index: 10;
      max-width: 14rem;
      font-size: 0.8rem;
      pointer-events: auto;
    }
    .page-toc fieldset {
      background: color-mix(in oklch, var(--color-bg) 90%, transparent);
      backdrop-filter: blur(6px);
      padding: 0.5rem 0.75rem;
    }
    .page-toc legend {
      font-size: 0.7rem;
    }
    .page-toc ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .page-toc li { margin: 0.15rem 0; }
    .page-toc a {
      color: var(--color-theme-offset);
      text-decoration: none;
      display: block;
      padding: 0.1rem 0;
      border-left: 2px solid transparent;
      padding-left: 0.5rem;
      transition: color 0.15s ease-out, border-color 0.15s ease-out;
    }
    .page-toc a:hover { color: var(--accent-color); }
    .page-toc a.active {
      color: var(--accent-color);
      border-left-color: var(--accent-color);
    }

    @media (min-width: 1180px) {
      .page-toc { display: block; }
    }
  </style>
</head>
<body>
  <header class="site">
    <div class="site-head">
      <div>
        <h1 class="title">Site audit</h1>
        <p class="meta">Prepared for Adam and Ben · ${escapeHtml(origin)} · ${escapeHtml(dateStr)}</p>
      </div>
      <a class="pdf-link" href="audit-report.pdf" download>
        <span aria-hidden="true">↓</span> Download as PDF
      </a>
    </div>
  </header>

  ${tocItems
    ? `<nav class="toc" aria-label="Templates"><span class="meta">Templates:</span>${groups!.map((g) => `<a href="#template-${escapeHtml(g.template)}">${escapeHtml(titleCase(g.template))}</a>`).join('')}</nav>`
    : ''}

  <main class="flow">

    <section class="block" id="section-glance" data-toc-label="At a glance">
      <fieldset>
        <legend>At a glance</legend>
        <p class="lede">A guided review of veilengineering.com to inventory its visual building blocks, page templates, and accessibility posture. A snapshot of what's on the live site today, and the basis for the rebuild proposed at the end of this report.</p>
        <div class="stats">
          <div class="stat"><div class="n">${urls.length}</div><div class="l">Pages scanned</div></div>
          <div class="stat"><div class="n">${templateCount}</div><div class="l">Page templates</div></div>
          <div class="stat"><div class="n">${colorCount}</div><div class="l">Distinct colors</div></div>
          <div class="stat"><div class="n">${familyCount}</div><div class="l">Type families</div></div>
          <div class="stat"><div class="n">${sizeCount}</div><div class="l">Type sizes</div></div>
          ${lhAvg !== null ? `<div class="stat"><div class="n">${lhAvg}</div><div class="l">A11y score (avg)</div></div>` : ''}
        </div>
      </fieldset>
    </section>

    <section class="block" id="section-palette" data-toc-label="Color palette">
      <h2>Color palette</h2>
      <p>Every distinct color on the live site, grouped by near-identical neighbors. The rebuild will trim this to a small, deliberate palette while keeping the brand recognizable.</p>
      ${renderPalette(clusters)}
    </section>

    <section class="block" id="section-typography" data-toc-label="Typography">
      <h2>Typography</h2>
      <fieldset>
        <legend>Type families in use</legend>
        ${renderFontFamilies(tokens)}
      </fieldset>
      <fieldset>
        <legend>Type sizes</legend>
        ${renderFontSizes(tokens)}
      </fieldset>
    </section>

    <section class="block" id="section-spacing" data-toc-label="Spacing & shape">
      <h2>Spacing &amp; shape</h2>
      <fieldset>
        <legend>Border radius</legend>
        ${renderSimpleTokenTable(tokens, 'borderRadius', 'Radius')}
      </fieldset>
      <fieldset>
        <legend>Shadows</legend>
        ${renderSimpleTokenTable(tokens, 'boxShadow', 'Shadow')}
      </fieldset>
    </section>

    <section class="block" id="section-templates" data-toc-label="Page templates">
      <h2>Page templates</h2>
      <p>The site groups into ${templateCount} layouts. Detail pages within a layout (e.g. portfolio entries) share the same template.</p>
      <fieldset class="callout">
        <legend>Note on user-agent sniffing</legend>
        <p>The current site uses user-agent sniffing to serve an entirely different HTML document to mobile devices. Where both layouts exist, the report shows both: the narrow-viewport desktop layout (what visitors see if they shrink a desktop browser) and the alternate mobile-UA template (what a phone sees).</p>
        <p>The rebuild should be <strong>truly responsive</strong> (one HTML document adapting via CSS) rather than a device-sniffed split. Maintaining two parallel templates doubles the work and lets the two drift apart over time.</p>
      </fieldset>
      ${renderTemplates(groups, notes, viewports, dir)}
    </section>

    <section class="block" id="section-accessibility" data-toc-label="Accessibility">
      <h2>Accessibility</h2>
      <p>Automated check using axe-core and Lighthouse. ${issueCount === 0 ? 'No axe issues at the default page state.' : `${issueCount} axe issues found at the default state.`}</p>
      ${renderA11y(a11y)}
    </section>

    ${loadRecommendationsHtml()
      ? `<section class="block recommendations" id="section-recommendations" data-toc-label="Recommendations">${loadRecommendationsHtml()}</section>`
      : ''}

  </main>

  <aside class="page-toc" aria-label="Page contents">
    <fieldset>
      <legend>Contents</legend>
      <ul></ul>
    </fieldset>
  </aside>

  <script>
    (function () {
      const aside = document.querySelector('.page-toc');
      if (!aside) return;
      const ul = aside.querySelector('ul');
      const sections = Array.from(document.querySelectorAll('section.block[id]'));
      if (sections.length === 0) {
        aside.remove();
        return;
      }
      const linkMap = new Map();
      for (const sec of sections) {
        const label = sec.getAttribute('data-toc-label') || sec.id;
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + sec.id;
        a.textContent = label;
        li.appendChild(a);
        ul.appendChild(li);
        linkMap.set(sec.id, a);
      }
      const visible = new Map();
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.intersectionRatio);
          } else {
            visible.delete(entry.target.id);
          }
        }
        let best = null;
        let bestRatio = -1;
        for (const sec of sections) {
          const r = visible.get(sec.id) ?? -1;
          if (r > bestRatio) {
            bestRatio = r;
            best = sec.id;
          }
        }
        for (const [id, a] of linkMap) {
          a.classList.toggle('active', id === best);
        }
      }, { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-15% 0px -55% 0px' });
      for (const sec of sections) observer.observe(sec);
    })();
  </script>

  <footer class="site">
    <fieldset>
      <legend>Footer</legend>
      <p>Phase 1 audit prepared for Adam and Ben · veilengineering.com · ${new Date().getFullYear()}</p>
    </fieldset>
  </footer>
</body>
</html>`;
}

function copyDirRecursive(src: string, dest: string): number {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, entry.name);
    const dp = path.join(dest, entry.name);
    if (entry.isDirectory()) count += copyDirRecursive(sp, dp);
    else if (entry.isFile()) {
      fs.copyFileSync(sp, dp);
      count++;
    }
  }
  return count;
}

async function reportOrigin(origin: OriginConfig): Promise<void> {
  const dir = outputDirFor(origin.origin);
  const log = openLogger(dir, 'report-davlin');
  const tokens = readJsonIfExists<RawToken[]>(path.join(dir, 'tokens.raw.json')) ?? [];
  const clusters = readJsonIfExists<ClusterReport>(path.join(dir, 'tokens.clusters.json'));
  const urls = readJsonIfExists<UrlEntry[]>(path.join(dir, 'urls.json')) ?? [];
  const groups = readJsonIfExists<TemplateGroupSerialized[]>(path.join(dir, 'templates.json'));
  const notes = readJsonIfExists<TemplateNotes>(path.join(dir, 'templates-notes.json')) ?? {};
  const a11y = readJsonIfExists<A11yReport>(path.join(dir, 'a11y-issues.json'));

  const reportDir = path.join(dir, 'site-davlin');
  fs.mkdirSync(reportDir, { recursive: true });

  const html = renderHtml({
    origin: origin.origin,
    urls,
    tokens,
    clusters,
    groups,
    notes,
    a11y,
    viewports: config.viewports,
    dir,
  });
  const outputPath = path.join(reportDir, 'index.html');
  fs.writeFileSync(outputPath, html);
  log.info(`Wrote ${outputPath}`);

  const fontSrc = path.resolve(__dirname, '..', '..', '..', '..', 'davlin.io', 'public', 'fonts', 'BerkeleyMono-Regular.woff');
  if (fs.existsSync(fontSrc)) {
    const fontDestDir = path.join(reportDir, 'fonts');
    fs.mkdirSync(fontDestDir, { recursive: true });
    fs.copyFileSync(fontSrc, path.join(fontDestDir, 'BerkeleyMono-Regular.woff'));
    log.info('Copied BerkeleyMono-Regular.woff');
  } else {
    log.warn(`BerkeleyMono font not found at ${fontSrc} — the page will fall back to ui-monospace.`);
  }

  const screenshotsSrc = path.join(dir, 'screenshots');
  const screenshotsDest = path.join(reportDir, 'screenshots');
  if (fs.existsSync(screenshotsDest)) fs.rmSync(screenshotsDest, { recursive: true, force: true });
  const copied = copyDirRecursive(screenshotsSrc, screenshotsDest);
  log.info(`Copied ${copied} screenshot file(s)`);
  log.close();
}

async function main(): Promise<void> {
  const origins = parseOriginsFromArgv(process.argv.slice(2));
  for (const origin of origins) {
    await reportOrigin(origin);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
