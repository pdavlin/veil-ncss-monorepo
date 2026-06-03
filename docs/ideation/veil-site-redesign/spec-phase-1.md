---
name: Phase 1 Spec — Audit and Token Extraction
description: Playwright-driven extraction pipeline producing token, template, and a11y artifacts from veilengineering.com.
---

# Implementation Spec: Veil Site Redesign — Phase 1

**PRD**: ./prd-phase-1.md
**Estimated Effort**: M (1–2 weeks elapsed, mostly automation work + curation review)

## Technical Approach

Build a single Node.js project under `tools/audit/` that orchestrates Playwright, axe-core, and Lighthouse against one or more origins. The pipeline is origin-parameterized: pass `--origin veilengineering.com` or `--origin ncss.example.com` (or both) and outputs land in per-origin subdirectories. This keeps Phase 1 useful for both brands without duplicating tooling.

The architecture is intentionally script-driven, not framework-driven. A `scripts/` directory with discrete, composable steps (`crawl.ts`, `extract-tokens.ts`, `audit-a11y.ts`, `screenshot.ts`, `curate.ts`) that share a config listing origins, URL exclusions per origin, and target viewport widths. Re-running individual passes is cheap when something changes.

Token clustering is the only non-trivial algorithm. Use HSL-distance for color clustering (threshold ~ΔE < 2 or HSL delta tuned by inspection) and exact-match for non-color values, since fonts/spacing usually have a small finite set. Cluster output goes to disk for review, not auto-collapse. Per-origin token outputs feed Phase 2's brand-layer construction: Veil's raw tokens drive `tokens-veil`; NCSS's drive `tokens-ncss` (real, not stub) if NCSS has a live site.

## File Changes

### New Files

| File Path | Purpose |
|-----------|---------|
| `tools/audit/package.json` | Node project for the audit tooling, separate from any future site code. |
| `tools/audit/tsconfig.json` | TypeScript config (strict mode, ESM). |
| `tools/audit/config.ts` | List of origins to audit (Veil required, NCSS optional), per-origin URL exclusions, target viewport widths, output paths. |
| `tools/audit/scripts/crawl.ts` | Discover URLs via sitemap.xml and link traversal. |
| `tools/audit/scripts/extract-tokens.ts` | Playwright pass collecting computed styles per URL. |
| `tools/audit/scripts/cluster-tokens.ts` | Deduplicate and cluster raw style values into a canonical set proposal. |
| `tools/audit/scripts/screenshot.ts` | Capture full-page screenshots at 320/768/1024/1440 widths. |
| `tools/audit/scripts/audit-a11y.ts` | Run axe-core and Lighthouse against every URL. |
| `tools/audit/scripts/curate.ts` | Produce the human-readable `*.md` artifacts from JSON outputs. |
| `tools/audit/lib/playwright-context.ts` | Shared Playwright browser/context factory. |
| `tools/audit/lib/style-collector.ts` | Page-side script injected to walk the DOM and report computed styles. |
| `audit-output/{origin}/tokens.raw.json` | Output: every distinct style value with sample URLs. |
| `audit-output/{origin}/tokens.summary.md` | Output: curated canonical token set. |
| `audit-output/{origin}/templates.md` | Output: page inventory grouped by template. |
| `audit-output/{origin}/a11y-audit.md` | Output: human-readable a11y findings. |
| `audit-output/{origin}/a11y-issues.json` | Output: structured a11y findings for Phase 2 consumption. |
| `audit-output/{origin}/screenshots/{template}/{width}.png` | Output: per-template screenshots at each viewport. |
| `tools/audit/README.md` | How to run the audit end-to-end. |

### Modified Files

None — Phase 1 is greenfield.

### Deleted Files

None.

## Implementation Details

### URL Discovery

**Overview**: Build the URL list from `https://veilengineering.com/sitemap.xml` if available, falling back to BFS crawl from the homepage with same-origin filtering.

```typescript
interface UrlEntry {
  url: string;
  discoveredVia: 'sitemap' | 'crawl';
  depth: number;
}

async function discoverUrls(origin: string): Promise<UrlEntry[]> {
  const fromSitemap = await tryFetchSitemap(origin);
  if (fromSitemap.length) return fromSitemap;
  return crawlSameOrigin(origin, { maxDepth: 4 });
}
```

**Key decisions**:
- Sitemap first; crawl only as fallback. Wix usually publishes one.
- Cap crawl depth at 4 to avoid runaway link traversal.
- Filter out asset URLs (images, fonts, scripts) — we want HTML routes only.

**Implementation steps**:
1. Fetch `/sitemap.xml` and `/sitemap-pages.xml` (Wix variant); parse to URL list.
2. If empty, do BFS from `/` collecting `<a href>` same-origin links to depth 4.
3. Dedupe; persist to `audit-output/{origin}/urls.json` for downstream steps.

### Token Extraction

**Overview**: For each URL, open in Playwright at 1440px (canonical desktop), walk every visible element, and report relevant computed style properties.

```typescript
interface RawToken {
  category: 'color' | 'fontFamily' | 'fontSize' | 'lineHeight' | 'fontWeight'
          | 'spacing' | 'borderRadius' | 'boxShadow' | 'transition' | 'letterSpacing';
  property: string;
  value: string;
  occurrences: number;
  sampleUrls: string[];
  sampleSelectors: string[];
}

async function extractTokensForUrl(page: Page, url: string): Promise<RawToken[]> {
  await page.goto(url, { waitUntil: 'networkidle' });
  return page.evaluate(/* injected style-collector.ts */);
}
```

**Key decisions**:
- Default state only — no hover/focus capture in Phase 1 (flagged in Open Items).
- Visible elements only — skip `display: none` subtrees to reduce noise.
- Color extraction includes `color`, `background-color`, `border-color` per side, and `box-shadow` color components.
- Spacing extraction includes `margin`, `padding` per side, and `gap`.

**Implementation steps**:
1. Page.evaluate injects DOM walker that collects styles from `getComputedStyle()`.
2. Aggregate across pages into `audit-output/{origin}/tokens.byUrl.json` (intermediate).
3. `cluster-tokens.ts` reads that, dedupes by exact value first, then clusters colors by HSL distance.
4. Output `tokens.raw.json` with clusters surfaced but not auto-collapsed.

### Token Clustering

**Overview**: Near-duplicate detection so the engineer can decide what counts as "the same" token.

```typescript
interface ColorCluster {
  representative: string; // hex
  members: Array<{ value: string; occurrences: number }>;
  maxHslDelta: number;
}

function clusterColors(colors: RawToken[], threshold = 0.05): ColorCluster[] {
  // Convert to HSL, single-linkage cluster by HSL distance below threshold
}
```

**Key decisions**:
- HSL distance over RGB distance — closer to perceptual similarity without ΔE complexity.
- Threshold starts conservative (0.05), tunable per project.
- Clusters surface as suggestions in `tokens.summary.md`, never silently collapsed in `tokens.raw.json`.

**Implementation steps**:
1. Parse every color value to HSL.
2. Single-linkage cluster with configurable threshold.
3. Pick the most-occurrent member as the cluster representative.
4. Emit clusters in `tokens.summary.md` as a markdown table for engineer review.

### Screenshot Capture

**Overview**: Full-page screenshots at the four viewport widths so Phase 3 has visual references and Phase 1 can flag responsive failures.

```typescript
const VIEWPORTS = [320, 768, 1024, 1440] as const;

async function screenshotTemplate(page: Page, url: string, templateSlug: string) {
  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({
      path: `audit-output/{origin}/screenshots/${templateSlug}/${width}.png`,
      fullPage: true,
    });
  }
}
```

**Key decisions**:
- One representative URL per template (not every URL) — keeps screenshot count manageable.
- Full-page screenshots, not viewport-only, so Phase 3 sees layout flow.
- PNG over JPEG to preserve UI detail.

### A11y Audit

**Overview**: axe-core via `@axe-core/playwright`, plus Lighthouse via `lighthouse` CLI invoked per URL.

```typescript
interface A11yIssue {
  url: string;
  rule: string;             // axe rule id
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  nodes: Array<{ html: string; target: string[] }>;
  // populated for contrast rule specifically:
  contrast?: { fg: string; bg: string; ratio: number; required: number };
}

async function auditUrl(page: Page, url: string): Promise<A11yIssue[]> {
  await page.goto(url, { waitUntil: 'networkidle' });
  const results = await new AxeBuilder({ page })
    .options({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] } })
    .analyze();
  return normalize(results);
}
```

**Key decisions**:
- axe runs against WCAG 2.2 AA tags only — matches the contract target.
- Contrast issues get extracted into a structured shape Phase 2 can consume directly (the `contrast` field).
- Lighthouse runs as a separate pass — its scoring is the headline number; axe provides per-rule detail.

**Implementation steps**:
1. For each URL, run axe and emit normalized issues.
2. For each URL, invoke Lighthouse CLI with `--only-categories=accessibility,performance` and parse JSON.
3. Merge into `audit-output/{origin}/a11y-issues.json`.
4. `curate.ts` produces `a11y-audit.md` grouped by severity and rule.

### Curation Step

**Overview**: Read all intermediate JSON and produce the markdown artifacts that humans read.

**Key decisions**:
- Markdown is generated, not hand-written. Re-running the pipeline updates docs.
- The curated `tokens.summary.md` is the only file where engineer judgment lives — and even there, the engineer edits a sibling `tokens.curation.ts` config and re-runs, rather than editing markdown by hand.

## Data Model

Not applicable — file-based intermediate JSON, no database.

## API Design

Not applicable — local tooling, no API surface.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `tools/audit/scripts/cluster-tokens.test.ts` | HSL clustering produces expected groupings on synthetic input. |
| `tools/audit/lib/style-collector.test.ts` | Style-collector logic against a fixture HTML page. |

**Key test cases**:
- Two near-identical hex colors cluster together; two distinct ones don't.
- A page with no `display: none` elements yields the same token count as the DOM size.
- Sitemap parser handles both `<urlset>` and Wix's `<sitemap>` index format.
- Empty sitemap falls back to crawl without error.

### Integration Tests

| Test File | Coverage |
|-----------|----------|
| `tools/audit/scripts/audit.e2e.test.ts` | Full pipeline against a small static fixture site served locally. |

**Key scenarios**:
- Pipeline runs end-to-end on a 3-page fixture and produces all output files.
- A known contrast failure in the fixture appears in `a11y-issues.json` with correct fg/bg/ratio.

### Manual Testing

- [ ] Run full pipeline against live veilengineering.com.
- [ ] Eyeball `tokens.summary.md` — do the clusters look right?
- [ ] Open every screenshot at every width — note any layout that looks broken in the source (not our problem to fix, but worth flagging).
- [ ] Spot-check 3 a11y issues by opening the cited URL in a browser and confirming the issue.

## Error Handling

| Error Scenario | Handling Strategy |
|----------------|-------------------|
| Wix site returns 5xx mid-crawl | Retry the URL up to 3x with backoff; log and skip on persistent failure. |
| Sitemap missing or malformed | Fall back to BFS crawl; log the fallback in `audit-output/{origin}/run.log`. |
| Playwright timeout on a URL | Log with the URL and continue; don't fail the whole run. |
| Lighthouse CLI not installed | Fail fast with a clear install message at script startup. |
| Network failure | Hard fail — no point continuing without site access. |

## Validation Commands

```bash
# Install
cd tools/audit && pnpm install

# Type checking
pnpm run typecheck

# Lint
pnpm run lint

# Unit tests
pnpm run test

# Run the full audit pipeline for a single origin
pnpm run audit:all -- --origin veilengineering.com

# Run for both origins
pnpm run audit:all -- --origin veilengineering.com --origin ncss.example.com

# Run individual passes (origin flag works the same)
pnpm run audit:urls -- --origin veilengineering.com
pnpm run audit:tokens -- --origin veilengineering.com
pnpm run audit:screenshots -- --origin veilengineering.com
pnpm run audit:a11y -- --origin veilengineering.com
pnpm run audit:curate -- --origin veilengineering.com
```

## Rollout Considerations

Not applicable — Phase 1 produces local artifacts only. Nothing is deployed.

- **Monitoring**: N/A
- **Alerting**: N/A
- **Rollback plan**: If artifacts are wrong, re-run the pipeline. No external state.

## Open Items

- [ ] Confirm we can ignore robots.txt for the client's own sites.
- [ ] Decide whether to add hover/focus state capture or defer to Phase 2 spot-checks.
- [ ] Resolve font licensing per brand — what's each site using and can we self-host it?
- [ ] Confirm whether NCSS has a live site to audit, or whether the audit is Veil-only and NCSS is greenfield. (Pipeline supports either; this decides scope of this phase's work.)

---

*This spec is ready for implementation. Follow the patterns and validate at each step.*
