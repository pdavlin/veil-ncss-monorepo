import fs from 'node:fs';
import path from 'node:path';
import { parseOriginsFromArgv, outputDirFor, config, type OriginConfig } from '../config.ts';
import { openLogger } from '../lib/logger.ts';
import { parseColor, toHex, contrastRatio, type Hsl } from '../lib/color.ts';
import type { RawToken } from './extract-tokens.ts';
import type { ClusterReport, ColorCluster } from './cluster-tokens.ts';
import type { A11yReport } from './audit-a11y.ts';
import type { UrlEntry } from './crawl.ts';
import { loadRecommendationsHtml } from '../lib/recommendations.ts';

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
  const black = parseColor('#000000')!;
  const white = parseColor('#ffffff')!;
  return contrastRatio(bg, black) > contrastRatio(bg, white) ? '#000000' : '#ffffff';
}

function renderColorPalette(clusters: ClusterReport | null): string {
  if (!clusters || clusters.colors.length === 0) {
    return '<p class="empty">No color data available.</p>';
  }
  const cards: string[] = [];
  const visible = (clusters.colors as ColorCluster[]).filter(
    (c) => !HIDDEN_SWATCHES.has(c.representative.toLowerCase()),
  );
  for (const c of visible) {
    const hsl = parseColor(c.representative);
    const text = hsl ? pickTextOn(hsl) : '#000';
    const name = readableColorName(c.representative);
    const memberCount = c.members.length;
    const memberSummary = memberCount > 1 ? `${memberCount} variants` : '1 value';
    cards.push(`
      <div class="swatch" style="background: ${escapeHtml(c.representative)}; color: ${text};">
        <div class="swatch-hex">${escapeHtml(c.representative)}</div>
        ${name ? `<div class="swatch-name">${escapeHtml(name)}</div>` : ''}
        <div class="swatch-meta">${c.totalOccurrences.toLocaleString()} uses · ${memberSummary}</div>
      </div>
    `);
  }
  return `<div class="swatches">${cards.join('')}</div>`;
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
    @font-face {
      font-family: 'Roboto';
      src: url('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-100-normal.woff2') format('woff2');
      font-weight: 100;
      font-display: swap;
    }
    @font-face {
      font-family: 'Roboto';
      src: url('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-300-normal.woff2') format('woff2');
      font-weight: 300;
      font-display: swap;
    }
    @font-face {
      font-family: 'Roboto';
      src: url('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-400-normal.woff2') format('woff2');
      font-weight: 400;
      font-display: swap;
    }
    @font-face {
      font-family: 'Roboto';
      src: url('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-700-normal.woff2') format('woff2');
      font-weight: 700;
      font-display: swap;
    }
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
  if (families.length === 0) return '<p class="empty">No font data available.</p>';
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
      </tr>
    `;
    })
    .join('');
  const hasUnbundled = families.some((f) => !isFontBundled(f.value));
  const note = hasUnbundled
    ? '<p class="meta"><span class="warn" aria-hidden="true">⚠</span> Custom web font not included in this report — sample shown in fallback font.</p>'
    : '';
  return `<table class="table"><thead><tr><th>Sample</th><th>Stack</th><th>Uses</th></tr></thead><tbody>${rows}</tbody></table>${note}`;
}

function renderFontSizes(tokens: RawToken[]): string {
  const sizes = dedupeByValue(tokens.filter((t) => t.category === 'fontSize'));
  if (sizes.length === 0) return '<p class="empty">No font size data available.</p>';
  const rows = sizes
    .map(
      (s) => `
      <tr>
        <td><span class="size-sample" style="font-size: ${escapeHtml(s.value)};">Aa</span></td>
        <td class="mono">${escapeHtml(s.value)}</td>
        <td class="num">${s.occurrences.toLocaleString()}</td>
      </tr>
    `,
    )
    .join('');
  return `<table class="table"><thead><tr><th>Sample</th><th>Size</th><th>Uses</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderSimpleTokenTable(tokens: RawToken[], category: string, label: string): string {
  const list = dedupeByValue(tokens.filter((t) => t.category === category));
  if (list.length === 0) return `<p class="empty">No ${label.toLowerCase()} data.</p>`;
  const rows = list
    .slice(0, 25)
    .map(
      (t) => `<tr><td class="mono">${escapeHtml(t.value)}</td><td class="num">${t.occurrences.toLocaleString()}</td></tr>`,
    )
    .join('');
  return `<table class="table"><thead><tr><th>${escapeHtml(label)}</th><th>Uses</th></tr></thead><tbody>${rows}</tbody></table>`;
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
        ? `<h4>Layout sections</h4><ul class="bullet">${note.structuralSections.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
        : '';
      const responsive = note.responsiveNotes
        ? `<h4>Responsive behavior at 320px</h4><p>${escapeHtml(note.responsiveNotes)}</p>`
        : '';
      const reuse = note.reuseAcrossTemplates && note.reuseAcrossTemplates.length > 0
        ? `<p class="meta">Shared with other templates: ${note.reuseAcrossTemplates.map((r) => `<code>${escapeHtml(r)}</code>`).join(', ')}</p>`
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
            <figcaption>${w}px viewport</figcaption>
          </figure>
        `,
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
          </figure>
        `,
        )
        .join('');
      const shotsBlock = mobileShots
        ? `<p class="meta shots-label"><strong>Desktop user-agent</strong></p>
           <div class="shots">${desktopShots}</div>
           <p class="meta shots-label"><strong>Mobile user-agent</strong> (alternate Wix template)</p>
           <div class="shots">${mobileShots}</div>`
        : `<div class="shots">${desktopShots}</div>`;

      return `
        <section class="template" id="template-${escapeHtml(g.template)}">
          <h3>${escapeHtml(g.template)}</h3>
          ${intent}
          ${urlList}
          ${sections}
          ${responsive}
          ${reuse}
          ${shotsBlock}
        </section>
      `;
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
        <div class="scorecard"><div class="num">${avg('accessibility')}</div><div class="label">Accessibility</div></div>
        <div class="scorecard"><div class="num">${avg('performance')}</div><div class="label">Performance</div></div>
        <div class="scorecard"><div class="num">${avg('bestPractices')}</div><div class="label">Best practices</div></div>
        <div class="scorecard"><div class="num">${avg('seo')}</div><div class="label">SEO</div></div>
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
      <li>
        <strong>${escapeHtml(rule)}</strong>
        <span class="impact impact-${escapeHtml(info.impact)}">${escapeHtml(info.impact)}</span>
        — ${escapeHtml(info.description)}
        ${info.helpUrl ? ` <a href="${escapeHtml(info.helpUrl)}">Reference</a>` : ''}
        <div class="meta">Affected pages: ${[...info.urls].map((u) => `<a href="${escapeHtml(u)}">${escapeHtml(new URL(u).pathname || '/')}</a>`).join(', ')}</div>
      </li>
    `,
    )
    .join('');
  const issuesBlock = report.issues.length === 0
    ? '<p class="empty">No axe-core violations detected at the default page state.</p>'
    : `<ul class="issue-list">${issuesList}</ul>`;

  return `${scores}<h3>Issues found</h3>${issuesBlock}<p class="meta">Note: this audit captures the default page state. Hover, focus, and lazy-loaded states may have additional issues to investigate.</p>`;
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

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Site audit — ${escapeHtml(origin)}</title>
  <style>
${FONT_ALIAS_CSS}
    :root {
      --ink: #1a1a1a;
      --muted: #6b6b6b;
      --line: #e5e5e5;
      --bg: #fafafa;
      --card: #ffffff;
      --accent: #de5021;
      --critical: #c92020;
      --serious: #d97706;
      --moderate: #ca8a04;
      --minor: #6b6b6b;
    }
    * { box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
      color: var(--ink);
      background: var(--bg);
      margin: 0;
      line-height: 1.55;
    }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }
    header.site {
      background: #1a1a1a;
      color: #fff;
      padding: 2.5rem 0;
      border-bottom: 4px solid var(--accent);
    }
    header.site h1 { margin: 0 0 0.5rem; font-size: 1.75rem; }
    header.site p { margin: 0; color: #cfcfcf; }
    main { padding: 2.5rem 0 4rem; }
    section.block {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 2rem;
      margin-bottom: 2rem;
    }
    h2 { margin-top: 0; font-size: 1.5rem; border-bottom: 1px solid var(--line); padding-bottom: 0.75rem; }
    h3 { margin-top: 2rem; font-size: 1.15rem; }
    h4 { margin: 1.25rem 0 0.4rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
    p { margin: 0 0 1rem; }
    .lede { font-size: 1.05rem; color: var(--ink); }
    .meta { color: var(--muted); font-size: 0.9rem; }
    .empty { color: var(--muted); font-style: italic; }
    code, .mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: 0.875em; }

    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; }
    .stat {
      background: #fff; border: 1px solid var(--line); border-radius: 6px;
      padding: 1rem; text-align: center;
    }
    .stat .n { font-size: 1.75rem; font-weight: 700; }
    .stat .l { color: var(--muted); font-size: 0.85rem; }

    .swatches {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
      gap: 0.5rem;
    }
    .swatch {
      border-radius: 6px;
      padding: 1rem;
      min-height: 110px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      border: 1px solid rgba(0,0,0,0.05);
    }
    .swatch-hex { font-family: ui-monospace, monospace; font-weight: 600; font-size: 0.95rem; }
    .swatch-name { font-size: 0.85rem; font-weight: 500; }
    .swatch-meta { font-size: 0.75rem; opacity: 0.8; }

    .table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1rem; }
    .table th, .table td { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line); }
    .table th { background: #f3f3f3; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
    .num { text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
    .font-sample { font-size: 1.2rem; }
    .warn {
      display: inline-block;
      margin-left: 0.5rem;
      color: #d97706;
      font-size: 0.95rem;
      cursor: help;
      vertical-align: baseline;
    }
    .size-sample { display: inline-block; line-height: 1; vertical-align: middle; }

    .scorecards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; }
    .scorecard { background: #fff; border: 1px solid var(--line); border-radius: 6px; padding: 1rem; text-align: center; }
    .scorecard .num { font-size: 2.5rem; font-weight: 700; text-align: center; color: var(--ink); }
    .scorecard .label { color: var(--muted); font-size: 0.85rem; }

    .issue-list { padding-left: 1.25rem; }
    .issue-list li { margin-bottom: 0.75rem; }
    .impact {
      display: inline-block;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      margin: 0 0.4rem;
      color: #fff;
    }
    .impact-critical { background: var(--critical); }
    .impact-serious { background: var(--serious); }
    .impact-moderate { background: var(--moderate); }
    .impact-minor { background: var(--minor); }
    .impact-unknown { background: var(--minor); }

    .template { padding: 1.5rem 0; border-top: 1px solid var(--line); }
    .template:first-of-type { border-top: 0; }
    .template h3 { font-size: 1.25rem; margin: 0 0 0.5rem; text-transform: capitalize; }
    .bullet { padding-left: 1.25rem; margin: 0 0 1rem; }
    .bullet li { margin-bottom: 0.3rem; }
    .urls { padding-left: 1.25rem; margin: 0.5rem 0; font-size: 0.9rem; }
    .urls a { word-break: break-all; }

    .shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-top: 1rem; }
    .shots figure { margin: 0; }
    .shots img { width: 100%; height: auto; border: 1px solid var(--line); border-radius: 4px; display: block; }
    .shots figcaption { font-size: 0.8rem; color: var(--muted); margin-top: 0.25rem; text-align: center; }
    .shots-label { margin: 1.25rem 0 0.4rem; color: var(--ink); font-size: 0.95rem; }
    .callout {
      background: #fff7ed;
      border: 1px solid var(--accent);
      border-radius: 6px;
      padding: 1rem 1.25rem;
      margin: 1rem 0 1.5rem;
    }
    .callout h4 { margin: 0 0 0.5rem; color: var(--accent); }
    .callout p:last-child { margin-bottom: 0; }

    .recommendations > h1 { display: none; }
    .recommendations > h2 {
      font-size: 1.4rem;
      margin: 2.5rem 0 0.75rem;
      padding-bottom: 0.4rem;
      border-bottom: 1px solid var(--line);
      color: var(--accent);
    }
    .recommendations > h2:first-of-type { margin-top: 0; }
    .recommendations > h3 {
      font-size: 1.1rem;
      margin: 1.75rem 0 0.4rem;
      color: var(--ink);
    }
    .recommendations > h2 + p { color: var(--muted); }
    .recommendations hr { border: 0; border-top: 1px solid var(--line); margin: 1.5rem 0; }
    .recommendations ul { padding-left: 1.5em; }
    .recommendations li { margin-bottom: 0.25rem; }

    .page-toc {
      display: none;
      position: fixed;
      top: 2.5rem;
      right: 1.5rem;
      z-index: 10;
      max-width: 14rem;
      font-size: 0.85rem;
    }
    .page-toc-inner {
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(8px);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0.75rem 0.9rem;
    }
    .page-toc-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 0.4rem;
      font-weight: 600;
    }
    .page-toc ul { list-style: none; padding: 0; margin: 0; }
    .page-toc li { margin: 0.15rem 0; }
    .page-toc a {
      color: var(--ink);
      text-decoration: none;
      display: block;
      padding: 0.15rem 0 0.15rem 0.5rem;
      border-left: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s;
    }
    .page-toc a:hover { color: var(--accent); }
    .page-toc a.active {
      color: var(--accent);
      border-left-color: var(--accent);
    }
    @media (min-width: 1180px) {
      .page-toc { display: block; }
    }

    @page { size: Letter; margin: 0.6in; }
    @media print {
      :root { --bg: #ffffff; }
      body { background: #ffffff; }
      header.site {
        background: #ffffff;
        color: var(--ink);
        border-bottom: 3px solid var(--accent);
        padding: 0 0 1rem;
        break-after: avoid;
        page-break-after: avoid;
      }
      header.site h1 { color: var(--ink); }
      header.site p { color: var(--muted); }
      main { padding: 0; }
      .container { padding: 0; max-width: none; }
      .page-toc, nav.toc, .callout details > summary { display: none !important; }
      details { display: block; }
      details > summary { display: none !important; }
      details > *:not(summary) { display: revert !important; }
      section.block {
        border: 1px solid var(--line);
        background: #ffffff;
        box-shadow: none;
        padding: 1rem 1.25rem;
        margin: 0 0 1rem;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      section.block#section-recommendations { break-before: page; page-break-before: always; }
      .recommendations > h2 { break-before: page; page-break-before: always; break-after: avoid; page-break-after: avoid; }
      .recommendations > h2:first-of-type { break-before: avoid; page-break-before: avoid; }
      .recommendations > h3 { break-after: avoid; page-break-after: avoid; }
      h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
      .swatch, .scorecard, .stat, .template, fieldset.issue, .shots figure, table.t tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .swatches { grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
      .swatch { min-height: auto; padding: 0.4rem 0.5rem 0.5rem; }
      .swatch-hex { font-size: 0.7rem; }
      .swatch-name { font-size: 0.7rem; }
      .swatch-meta { font-size: 0.55rem; }
      .stats { grid-template-columns: repeat(6, 1fr); gap: 0.5rem; }
      .stat .n { font-size: 1.4rem; }
      .stat .l { font-size: 0.65rem; }
      .scorecards { grid-template-columns: repeat(4, 1fr); }
      .scorecard .num { font-size: 1.75rem; }
      .shots { grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
      .shots img { max-height: 2.5in; object-fit: cover; }
      .shots figcaption { font-size: 0.6rem; }
      table.t { font-size: 0.75rem; }
      table.t th, table.t td { padding: 0.25rem 0.4rem; }
      footer.site { padding: 0.5rem 0; font-size: 0.7rem; }
      a { color: var(--ink); text-decoration: none; }
      .callout { background: #fff7ed; }
    }

    .toc { margin: 0 0 1rem; font-size: 0.9rem; }
    .toc a { color: var(--accent); text-decoration: none; text-transform: capitalize; }
    .toc a:hover { text-decoration: underline; }

    footer.site { color: var(--muted); font-size: 0.85rem; text-align: center; padding: 2rem 0; }

    @media (max-width: 600px) {
      header.site h1 { font-size: 1.35rem; }
      section.block { padding: 1.25rem; }
      h2 { font-size: 1.25rem; }
    }
  </style>
</head>
<body>
  <header class="site">
    <div class="container">
      <h1>Site audit</h1>
      <p>Prepared for Adam and Ben · ${escapeHtml(origin)} · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
  </header>
  <main>
    <div class="container">

      <section class="block" id="section-glance" data-toc-label="At a glance">
        <h2>At a glance</h2>
        <p class="lede">A guided review of veilengineering.com to inventory its visual building blocks, page templates, and accessibility posture. A snapshot of what's on the live site today, and the basis for the rebuild proposed at the end of this report.</p>
        <div class="stats">
          <div class="stat"><div class="n">${urls.length}</div><div class="l">Pages scanned</div></div>
          <div class="stat"><div class="n">${templateCount}</div><div class="l">Page templates</div></div>
          <div class="stat"><div class="n">${colorCount}</div><div class="l">Distinct colors</div></div>
          <div class="stat"><div class="n">${familyCount}</div><div class="l">Type families</div></div>
          <div class="stat"><div class="n">${sizeCount}</div><div class="l">Type sizes</div></div>
          ${lhAvg !== null ? `<div class="stat"><div class="n">${lhAvg}</div><div class="l">A11y score (avg)</div></div>` : ''}
        </div>
      </section>

      <section class="block" id="section-palette" data-toc-label="Color palette">
        <h2>Color palette</h2>
        <p>Every distinct color on the live site, grouped by near-identical neighbors. The rebuild will trim this list to a small, deliberate palette while keeping the brand recognizable.</p>
        ${renderColorPalette(clusters)}
      </section>

      <section class="block" id="section-typography" data-toc-label="Typography">
        <h2>Typography</h2>
        <h3>Type families in use</h3>
        ${renderFontFamilies(tokens)}
        <h3>Type sizes</h3>
        ${renderFontSizes(tokens)}
      </section>

      <section class="block" id="section-spacing" data-toc-label="Spacing & shape">
        <h2>Spacing &amp; shape</h2>
        <h3>Border radius</h3>
        ${renderSimpleTokenTable(tokens, 'borderRadius', 'Radius')}
        <h3>Shadows</h3>
        ${renderSimpleTokenTable(tokens, 'boxShadow', 'Shadow')}
      </section>

      <section class="block" id="section-templates" data-toc-label="Page templates">
        <h2>Page templates</h2>
        <p>The site groups into ${templateCount} layouts. Detail pages within a layout (e.g. portfolio entries) share the same template.</p>
        ${tocItems ? `<p class="toc">Jump to: ${tocItems}</p>` : ''}
        <div class="callout">
          <h4>Note · user-agent sniffing</h4>
          <p>The current site uses user-agent sniffing to serve an entirely different HTML document to mobile devices — not just different CSS. Where both layouts exist, the report shows both: the narrow-viewport desktop layout (what visitors see if they shrink a desktop browser) and the alternate mobile-UA template (what a phone sees).</p>
          <p>The rebuild should be <strong>truly responsive</strong> — one HTML document that adapts via CSS — rather than a device-sniffed split. Maintaining two parallel templates doubles the work and lets the two drift apart over time.</p>
        </div>
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

    </div>
  </main>

  <aside class="page-toc" aria-label="Page contents">
    <div class="page-toc-inner">
      <div class="page-toc-label">Contents</div>
      <ul></ul>
    </div>
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
          if (entry.isIntersecting) visible.set(entry.target.id, entry.intersectionRatio);
          else visible.delete(entry.target.id);
        }
        let best = null;
        let bestRatio = -1;
        for (const sec of sections) {
          const r = visible.get(sec.id) ?? -1;
          if (r > bestRatio) { bestRatio = r; best = sec.id; }
        }
        for (const [id, a] of linkMap) a.classList.toggle('active', id === best);
      }, { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-15% 0px -55% 0px' });
      for (const sec of sections) observer.observe(sec);
    })();
  </script>
  <footer class="site">
    <div class="container">
      <p>Phase 1 audit prepared for Adam and Ben · veilengineering.com · ${new Date().getFullYear()}</p>
    </div>
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
    if (entry.isDirectory()) {
      count += copyDirRecursive(sp, dp);
    } else if (entry.isFile()) {
      fs.copyFileSync(sp, dp);
      count++;
    }
  }
  return count;
}

async function reportOrigin(origin: OriginConfig): Promise<void> {
  const dir = outputDirFor(origin.origin);
  const log = openLogger(dir, 'report');
  const tokens = readJsonIfExists<RawToken[]>(path.join(dir, 'tokens.raw.json')) ?? [];
  const clusters = readJsonIfExists<ClusterReport>(path.join(dir, 'tokens.clusters.json'));
  const urls = readJsonIfExists<UrlEntry[]>(path.join(dir, 'urls.json')) ?? [];
  const groups = readJsonIfExists<TemplateGroupSerialized[]>(path.join(dir, 'templates.json'));
  const notes = readJsonIfExists<TemplateNotes>(path.join(dir, 'templates-notes.json')) ?? {};
  const a11y = readJsonIfExists<A11yReport>(path.join(dir, 'a11y-issues.json'));

  const reportDir = path.join(dir, 'site');
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

  const screenshotsSrc = path.join(dir, 'screenshots');
  const screenshotsDest = path.join(reportDir, 'screenshots');
  if (fs.existsSync(screenshotsDest)) {
    fs.rmSync(screenshotsDest, { recursive: true, force: true });
  }
  const copied = copyDirRecursive(screenshotsSrc, screenshotsDest);
  log.info(`Copied ${copied} screenshot file(s) into ${screenshotsDest}`);
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
