import fs from 'node:fs';
import path from 'node:path';
import { parseOriginsFromArgv, outputDirFor, type OriginConfig } from '../config.ts';
import { openLogger } from '../lib/logger.ts';
import { templateSlugForUrl } from '../lib/template-slug.ts';
import type { RawToken } from './extract-tokens.ts';
import type { ClusterReport } from './cluster-tokens.ts';
import type { A11yReport, A11yIssue } from './audit-a11y.ts';
import type { UrlEntry } from './crawl.ts';

interface TemplateGroupSerialized {
  template: string;
  representativeUrl: string;
  urls: string[];
}

function readJsonIfExists<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

interface DisplayToken {
  category: string;
  value: string;
  occurrences: number;
  properties: string[];
  sampleSelectors: string[];
}

function dedupeByValue(tokens: RawToken[]): DisplayToken[] {
  const map = new Map<string, DisplayToken>();
  for (const t of tokens) {
    if (t.value === 'none' || t.value === 'normal' || t.value === 'transparent' || t.value === 'rgba(0, 0, 0, 0)') continue;
    const key = `${t.category}|${t.value}`;
    const existing = map.get(key);
    if (existing) {
      existing.occurrences += t.occurrences;
      if (!existing.properties.includes(t.property)) existing.properties.push(t.property);
      for (const s of t.sampleSelectors) {
        if (existing.sampleSelectors.length < 3 && !existing.sampleSelectors.includes(s)) {
          existing.sampleSelectors.push(s);
        }
      }
    } else {
      map.set(key, {
        category: t.category,
        value: t.value,
        occurrences: t.occurrences,
        properties: [t.property],
        sampleSelectors: [...t.sampleSelectors.slice(0, 3)],
      });
    }
  }
  return [...map.values()];
}

function tokensSummary(tokens: RawToken[], clusters: ClusterReport | null): string {
  const display = dedupeByValue(tokens);
  const byCat = new Map<string, DisplayToken[]>();
  for (const t of display) {
    const arr = byCat.get(t.category) ?? [];
    arr.push(t);
    byCat.set(t.category, arr);
  }
  for (const arr of byCat.values()) arr.sort((a, b) => b.occurrences - a.occurrences);

  const lines: string[] = [];
  lines.push('# Token Summary');
  lines.push('');
  lines.push('_Generated from `tokens.raw.json`. Curate by editing this file or extracting to `tokens-veil` / `tokens-ncss` in Phase 2._');
  lines.push('');

  if (clusters && clusters.colors.length > 0) {
    lines.push('## Color Clusters');
    lines.push('');
    lines.push(`HSL threshold: \`${clusters.hslThreshold}\`. Clusters are suggestions — engineer reviews before collapsing.`);
    lines.push('');
    lines.push('| Representative | Members | Total occurrences | Max HSL delta |');
    lines.push('|---|---|---|---|');
    for (const c of clusters.colors.slice(0, 60)) {
      const members = c.members
        .slice(0, 6)
        .map((m) => `\`${escapeMd(m.value)}\` (${m.occurrences})`)
        .join('<br>');
      lines.push(`| \`${c.representative}\` | ${members} | ${c.totalOccurrences} | ${c.maxHslDelta} |`);
    }
    lines.push('');
  }

  const order: Array<RawToken['category']> = [
    'color',
    'fontFamily',
    'fontSize',
    'lineHeight',
    'fontWeight',
    'letterSpacing',
    'spacing',
    'borderRadius',
    'boxShadow',
    'transition',
  ];

  for (const cat of order) {
    const list = byCat.get(cat);
    if (!list || list.length === 0) continue;
    lines.push(`## ${cat} (${list.length} distinct values)`);
    lines.push('');
    lines.push('| Value | Occurrences | Properties | Sample selectors |');
    lines.push('|---|---|---|---|');
    for (const t of list.slice(0, 40)) {
      const sels = t.sampleSelectors.slice(0, 2).map((s) => `\`${escapeMd(s)}\``).join('<br>');
      const props = t.properties.map((p) => `\`${p}\``).join(', ');
      lines.push(`| \`${escapeMd(t.value)}\` | ${t.occurrences} | ${props} | ${sels} |`);
    }
    if (list.length > 40) lines.push(`\n_…and ${list.length - 40} more in tokens.raw.json._\n`);
    lines.push('');
  }
  return lines.join('\n');
}

interface TemplateNotes {
  [templateSlug: string]: {
    intent?: string;
    structuralSections?: string[];
    responsiveNotes?: string;
    reuseAcrossTemplates?: string[];
  };
}

function templatesMd(
  origin: string,
  urls: UrlEntry[],
  groups: TemplateGroupSerialized[] | null,
  viewports: readonly number[],
  notes: TemplateNotes,
): string {
  const lines: string[] = [];
  lines.push(`# Template Inventory — ${origin}`);
  lines.push('');
  lines.push(`URL count: ${urls.length}. Templates: ${groups?.length ?? 0}.`);
  lines.push('');

  if (!groups || groups.length === 0) {
    const synthetic = new Map<string, string[]>();
    for (const u of urls) {
      const slug = templateSlugForUrl(u.url);
      synthetic.set(slug, [...(synthetic.get(slug) ?? []), u.url]);
    }
    for (const [tmpl, urls] of synthetic) {
      lines.push(`## ${tmpl}`);
      lines.push('');
      lines.push(urls.map((u) => `- ${u}`).join('\n'));
      lines.push('');
    }
    return lines.join('\n');
  }

  for (const g of groups) {
    lines.push(`## ${g.template}`);
    lines.push('');
    lines.push(`Representative: ${g.representativeUrl}`);
    lines.push('');
    lines.push('URLs:');
    lines.push(g.urls.map((u) => `- ${u}`).join('\n'));
    lines.push('');
    lines.push('Screenshots:');
    for (const w of viewports) {
      lines.push(`- ${w}px: ![${g.template} @ ${w}](./screenshots/${g.template}/${w}.png)`);
    }
    lines.push('');
    const note = notes[g.template];
    if (note) {
      if (note.intent) {
        lines.push(`**Intent:** ${note.intent}`);
        lines.push('');
      }
      if (note.structuralSections && note.structuralSections.length > 0) {
        lines.push('**Structural sections:**');
        for (const section of note.structuralSections) {
          lines.push(`- ${section}`);
        }
        lines.push('');
      }
      if (note.responsiveNotes) {
        lines.push(`**Responsive observations:** ${note.responsiveNotes}`);
        lines.push('');
      }
      if (note.reuseAcrossTemplates && note.reuseAcrossTemplates.length > 0) {
        lines.push(`**Reused elements:** ${note.reuseAcrossTemplates.join(', ')}`);
        lines.push('');
      }
    } else {
      lines.push('Structural notes: _add observations to templates-notes.json under this template slug._');
      lines.push('');
    }
  }
  return lines.join('\n');
}

function a11yMd(report: A11yReport): string {
  const lines: string[] = [];
  lines.push('# Accessibility Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  if (report.lighthouse.length > 0) {
    lines.push('## Lighthouse Scores');
    lines.push('');
    lines.push('| URL | Accessibility | Performance | Best Practices | SEO |');
    lines.push('|---|---|---|---|---|');
    for (const lh of report.lighthouse) {
      const fmt = (n: number | null) => (n === null ? '—' : Math.round(n * 100).toString());
      lines.push(`| ${lh.url} | ${fmt(lh.accessibility)} | ${fmt(lh.performance)} | ${fmt(lh.bestPractices)} | ${fmt(lh.seo)} |`);
    }
    lines.push('');
  }

  const bySeverity = new Map<string, A11yIssue[]>();
  for (const issue of report.issues) {
    const arr = bySeverity.get(issue.impact) ?? [];
    arr.push(issue);
    bySeverity.set(issue.impact, arr);
  }
  const severityOrder = ['critical', 'serious', 'moderate', 'minor', 'unknown'];
  for (const sev of severityOrder) {
    const list = bySeverity.get(sev);
    if (!list || list.length === 0) continue;
    lines.push(`## ${sev} (${list.length})`);
    lines.push('');
    const byRule = new Map<string, A11yIssue[]>();
    for (const issue of list) {
      const arr = byRule.get(issue.rule) ?? [];
      arr.push(issue);
      byRule.set(issue.rule, arr);
    }
    for (const [rule, issues] of byRule) {
      lines.push(`### ${rule} (${issues.length})`);
      lines.push('');
      const sample = issues[0]!;
      lines.push(`${sample.description}`);
      if (sample.helpUrl) lines.push(`Reference: ${sample.helpUrl}`);
      lines.push('');
      lines.push('Affected URLs:');
      for (const i of issues.slice(0, 10)) {
        const contrast = i.contrast
          ? ` (contrast ${i.contrast.ratio} vs required ${i.contrast.required}, fg \`${i.contrast.fg}\`, bg \`${i.contrast.bg}\`)`
          : '';
        lines.push(`- ${i.url}${contrast}`);
      }
      if (issues.length > 10) lines.push(`- …and ${issues.length - 10} more.`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

async function curateOrigin(origin: OriginConfig): Promise<void> {
  const dir = outputDirFor(origin.origin);
  const log = openLogger(dir, 'curate');
  const tokens = readJsonIfExists<RawToken[]>(path.join(dir, 'tokens.raw.json')) ?? [];
  const clusters = readJsonIfExists<ClusterReport>(path.join(dir, 'tokens.clusters.json'));
  const urls = readJsonIfExists<UrlEntry[]>(path.join(dir, 'urls.json')) ?? [];
  const groups = readJsonIfExists<TemplateGroupSerialized[]>(path.join(dir, 'templates.json'));
  const a11y = readJsonIfExists<A11yReport>(path.join(dir, 'a11y-issues.json'));
  const notes = readJsonIfExists<TemplateNotes>(path.join(dir, 'templates-notes.json')) ?? {};

  const viewports = (await import('../config.ts')).config.viewports;

  fs.writeFileSync(path.join(dir, 'tokens.summary.md'), tokensSummary(tokens, clusters));
  log.info('Wrote tokens.summary.md');

  fs.writeFileSync(path.join(dir, 'templates.md'), templatesMd(origin.origin, urls, groups, viewports, notes));
  log.info('Wrote templates.md');

  if (a11y) {
    fs.writeFileSync(path.join(dir, 'a11y-audit.md'), a11yMd(a11y));
    log.info('Wrote a11y-audit.md');
  } else {
    log.warn('No a11y-issues.json found; skipping a11y-audit.md');
  }
  log.close();
}

async function main(): Promise<void> {
  const origins = parseOriginsFromArgv(process.argv.slice(2));
  for (const origin of origins) {
    await curateOrigin(origin);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
