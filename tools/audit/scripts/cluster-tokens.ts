import fs from 'node:fs';
import path from 'node:path';
import { config, parseOriginsFromArgv, outputDirFor, type OriginConfig } from '../config.ts';
import { parseColor, hslDistance, toHex, type Hsl } from '../lib/color.ts';
import { openLogger } from '../lib/logger.ts';
import type { RawToken } from './extract-tokens.ts';

export interface ColorCluster {
  representative: string;
  members: Array<{ value: string; occurrences: number }>;
  maxHslDelta: number;
  totalOccurrences: number;
}

export interface ClusterReport {
  generatedAt: string;
  hslThreshold: number;
  colors: ColorCluster[];
  exactGroups: Record<string, Array<{ value: string; occurrences: number }>>;
}

export function clusterColors(colors: RawToken[], threshold: number): ColorCluster[] {
  const byValue = new Map<string, { hsl: Hsl; value: string; occurrences: number }>();
  for (const c of colors) {
    const hsl = parseColor(c.value);
    if (!hsl) continue;
    if (hsl.a === 0) continue;
    const existing = byValue.get(c.value);
    if (existing) {
      existing.occurrences += c.occurrences;
    } else {
      byValue.set(c.value, { hsl, value: c.value, occurrences: c.occurrences });
    }
  }
  const parsed = [...byValue.values()];
  parsed.sort((a, b) => b.occurrences - a.occurrences);

  const clusters: Array<{
    members: typeof parsed;
    centroid: Hsl;
    maxHslDelta: number;
  }> = [];

  for (const item of parsed) {
    let best: { idx: number; dist: number } | null = null;
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      if (!cluster) continue;
      const dist = hslDistance(item.hsl, cluster.centroid);
      if (dist <= threshold && (best === null || dist < best.dist)) {
        best = { idx: i, dist };
      }
    }
    if (best) {
      const target = clusters[best.idx]!;
      target.members.push(item);
      target.maxHslDelta = Math.max(target.maxHslDelta, best.dist);
    } else {
      clusters.push({ members: [item], centroid: item.hsl, maxHslDelta: 0 });
    }
  }

  return clusters
    .map((cluster) => {
      const top = cluster.members.reduce((acc, m) => (m.occurrences > acc.occurrences ? m : acc));
      const rep = parseColor(top.value);
      return {
        representative: rep ? toHex(rep) : top.value,
        members: cluster.members.map((m) => ({ value: m.value, occurrences: m.occurrences })),
        maxHslDelta: Number(cluster.maxHslDelta.toFixed(4)),
        totalOccurrences: cluster.members.reduce((s, m) => s + m.occurrences, 0),
      };
    })
    .sort((a, b) => b.totalOccurrences - a.totalOccurrences);
}

export function groupExact(tokens: RawToken[]): Record<string, Array<{ value: string; occurrences: number }>> {
  const groups = new Map<string, Map<string, number>>();
  for (const t of tokens) {
    if (t.category === 'color') continue;
    const m = groups.get(t.category) ?? new Map<string, number>();
    m.set(t.value, (m.get(t.value) ?? 0) + t.occurrences);
    groups.set(t.category, m);
  }
  const out: Record<string, Array<{ value: string; occurrences: number }>> = {};
  for (const [cat, vals] of groups) {
    out[cat] = [...vals.entries()]
      .map(([value, occurrences]) => ({ value, occurrences }))
      .sort((a, b) => b.occurrences - a.occurrences);
  }
  return out;
}

async function clusterForOrigin(origin: OriginConfig): Promise<void> {
  const dir = outputDirFor(origin.origin);
  const log = openLogger(dir, 'cluster-tokens');
  const rawPath = path.join(dir, 'tokens.raw.json');
  if (!fs.existsSync(rawPath)) throw new Error(`Missing ${rawPath}. Run audit:tokens first.`);
  const tokens = JSON.parse(fs.readFileSync(rawPath, 'utf-8')) as RawToken[];
  const colors = tokens.filter((t) => t.category === 'color');
  const colorClusters = clusterColors(colors, config.clustering.hslThreshold);
  const exact = groupExact(tokens);
  const report: ClusterReport = {
    generatedAt: new Date().toISOString(),
    hslThreshold: config.clustering.hslThreshold,
    colors: colorClusters,
    exactGroups: exact,
  };
  fs.writeFileSync(path.join(dir, 'tokens.clusters.json'), JSON.stringify(report, null, 2));
  log.info(`Wrote tokens.clusters.json (${colorClusters.length} color clusters)`);
  log.close();
}

async function main(): Promise<void> {
  const origins = parseOriginsFromArgv(process.argv.slice(2));
  for (const origin of origins) {
    await clusterForOrigin(origin);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
