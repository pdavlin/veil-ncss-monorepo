---
name: Phase 2 Spec — Responsive Token System
description: Build Utopia-based fluid token system as CSS custom properties, resolve contrast failures, and ship a validation harness.
---

# Implementation Spec: Veil Site Redesign — Phase 2

**PRD**: ./prd-phase-2.md
**Estimated Effort**: M (1–2 weeks elapsed, including client review cycle on color adjustments)

## Technical Approach

Stand up a pnpm-workspace monorepo with three token packages under `packages/`: `tokens-base`, `tokens-veil`, `tokens-ncss`. Each package has its own `package.json` and `build.ts`; they share TypeScript config and the contrast-resolution library via a small `packages/_lib/` (or `packages/tokens-shared/`) module.

`tokens-base` is brand-agnostic: it reads Phase 1's curated scales and emits fluid type, fluid space, radii, motion, breakpoints, semantic aliases with fallback values, and a CSS reset. `tokens-veil` reads Phase 1's Veil palette and font metadata, runs contrast resolution against the Veil-specific contrast failures, and emits brand-layer CSS that overrides semantic aliases. `tokens-ncss` is a stub in Phase 2: same shape as `tokens-veil` but with placeholder values (hue-shifted palette, system fonts) sufficient to prove the swap works.

Type and space scales come from `utopia-core` (the headless library, not the web UI), invoked from `tokens-base/build.ts`. Color adjustments happen in `packages/_lib/contrast.ts`: for each Phase 1 contrast failure, an automated pass darkens or lightens the smaller-surface side until the pair meets WCAG 2.2 AA, with manual override hooks for brand colors the client wants to protect.

The validation harness is a single HTML file with a brand-toggle attribute on `<html>`. It imports `tokens-base` plus both brand layers (with the inactive one disabled via `media="not all"` or similar), then a small script flips `data-brand` between `veil` and `ncss` on demand. It renders every scale step and every documented color pair under both brands and runs axe-core in the browser. Phase 3 replaces this harness with real components.

## File Changes

### New Files

| File Path | Purpose |
|-----------|---------|
| `package.json` | Monorepo root: pnpm workspaces, shared scripts. |
| `pnpm-workspace.yaml` | Workspaces: `packages/*`, `sites/*` (sites empty until Phase 3). |
| `tsconfig.base.json` | Shared TS config extended by each package. |
| `packages/_lib/package.json` | Shared utilities consumed by token packages. |
| `packages/_lib/src/contrast.ts` | WCAG 2.2 ratio math, OKLCH adjustment helpers. |
| `packages/_lib/src/utopia.ts` | Wrapper around `utopia-core` returning shape we emit. |
| `packages/_lib/src/emit-css.ts` | Generic CSS emitter consuming a normalized token model. |
| `packages/tokens-base/package.json` | Base token package. |
| `packages/tokens-base/build.ts` | Builds fluid scales, semantic aliases, reset, misc tokens. |
| `packages/tokens-base/config/scales.ts` | Viewport min/max, base font sizes, step counts. |
| `packages/tokens-base/config/aliases.ts` | Declarations for semantic aliases (name + fallback value). |
| `packages/tokens-base/dist/index.css` | Output: entry file `@import`ing the others. |
| `packages/tokens-base/dist/scales.css` | Output: fluid type and space scales. |
| `packages/tokens-base/dist/aliases.css` | Output: semantic aliases with fallback values. |
| `packages/tokens-base/dist/misc.css` | Output: radii, shadows, motion, breakpoint variables. |
| `packages/tokens-base/dist/reset.css` | Modern CSS reset, scoped to `@layer reset`. |
| `packages/tokens-base/README.md` | Alias contract documentation. |
| `packages/tokens-veil/package.json` | Veil brand layer package. |
| `packages/tokens-veil/build.ts` | Reads Phase 1 Veil outputs, runs contrast resolution, emits brand CSS. |
| `packages/tokens-veil/config/palette.ts` | Source-of-truth Veil palette and font metadata. |
| `packages/tokens-veil/config/color-overrides.ts` | Manual overrides for client-protected Veil brand colors. |
| `packages/tokens-veil/dist/index.css` | Output: Veil palette + font + alias overrides, scoped to `:root, [data-brand="veil"]`. |
| `packages/tokens-veil/dist/fonts/*` | Self-hosted Veil font files (placed here once licensing resolved). |
| `packages/tokens-ncss/package.json` | NCSS brand layer (stub in Phase 2). |
| `packages/tokens-ncss/build.ts` | Same shape as Veil build; stub config in Phase 2. |
| `packages/tokens-ncss/config/palette.ts` | Stub palette (hue-shifted) in Phase 2, replaced in Phase 4. |
| `packages/tokens-ncss/dist/index.css` | Output: stub NCSS layer, scoped to `:root, [data-brand="ncss"]`. |
| `docs/color-decisions.md` | Original → adjusted Veil color diff with rationale, for client sign-off. |
| `docs/architecture.md` | Layer strategy, naming conventions, breakpoint names, alias contract, brand layer rules. |
| `harness/index.html` | Validation page with runtime brand toggle. |
| `harness/harness.css` | Minimal styles for the harness itself (not part of the token system). |
| `harness/harness.js` | Toggles `data-brand` on `<html>`, runs axe-core against current state. |

### Modified Files

None — Phase 2 is greenfield against Phase 1's outputs.

### Deleted Files

None.

## Implementation Details

### Token Models

**Overview**: Two model shapes — one for the base package, one for brand packages.

```typescript
// packages/tokens-base
interface BaseModel {
  fluid: {
    type: Record<string, FluidValue>;
    space: Record<string, FluidValue>;
  };
  aliases: Record<string, { fallback: string }>;  // semantic aliases + default value
  misc: {
    radii: Record<string, string>;
    shadows: Record<string, string>;
    motion: Record<string, string>;
    breakpoints: Record<string, string>;
  };
}

// packages/tokens-veil and packages/tokens-ncss
interface BrandModel {
  brand: 'veil' | 'ncss';
  palette: Record<string, string>;
  fonts: Record<string, string>;
  aliasOverrides: Record<string, string>;          // alias name -> brand value
  pairings: Array<{ fg: string; bg: string; role: string; ratio: number; large?: boolean }>;
}

type FluidValue = { min: string; max: string; minVw: number; maxVw: number };
```

**Key decisions**:
- Base model knows nothing about colors. Aliases declare *names* with fallback values; brand layers fill them.
- Brand model emits a single `:root, [data-brand="<brand>"] { ... }` block so both import-only and runtime-toggle scenarios work.
- Pairings live in the brand model. Base has no opinion on which color combinations exist.

### Fluid Scale Generation

**Pattern to follow**: `utopia-core` README examples.

**Overview**: Generate clamp-based type and space scales between defined viewport min and max.

```typescript
import { calculateTypeScale, calculateSpaceScale } from 'utopia-core';

const config = {
  minWidth: 320,
  maxWidth: 1440,
  minFontSize: 16,
  maxFontSize: 19,
  minTypeScale: 1.2,
  maxTypeScale: 1.333,
  positiveSteps: 5,
  negativeSteps: 2,
};

const typeSteps = calculateTypeScale(config);
// Output: [{ step, minFontSize, maxFontSize, clamp, ... }]
```

**Key decisions**:
- `utopia-core` as a dev dependency, not a runtime one. The output is plain CSS.
- Base font size and ratio come from `tokens/config/scales.ts`, defaulted to values inferred from Phase 1 and tunable.
- Step naming uses size-relative tokens (`--text-step-1`, `--space-l`) plus semantic aliases (`--text-body`, `--space-section`) in a second layer.

### Contrast Resolution

**Pattern to follow**: WCAG 2.2 contrast formula; libraries: `culori` for color math, `apca-w3` if APCA is ever wanted later.

**Overview**: For each failing pair from Phase 1, adjust the smaller-surface side toward black or white in OKLCH until the pair passes AA, unless the engineer (or client) has marked the token immutable in `color-overrides.ts`.

```typescript
interface ContrastDecision {
  pairKey: string;            // 'text-on-brand'
  fgOriginal: string; fgAdjusted: string;
  bgOriginal: string; bgAdjusted: string;
  ratioOriginal: number; ratioAdjusted: number;
  strategy: 'adjust-fg' | 'adjust-bg' | 'manual-override' | 'no-change-needed';
  rationale: string;
}

function resolve(pair: FailingPair, overrides: ColorOverrides): ContrastDecision {
  if (overrides.locked.includes(pair.bg)) return adjustFg(pair);
  return adjustFg(pair); // default: adjust foreground first
}
```

**Key decisions**:
- Adjust foreground (text) by default. Brand background colors get preserved unless explicitly opted in to adjustment.
- OKLCH for adjustment — better perceptual uniformity than RGB nudging.
- Output `color-decisions.md` as the client-facing artifact. The client signs off on this markdown, not the JSON.
- Hard rule: a pair documented as "valid" in the final pairings list MUST pass automated AA check. Build fails otherwise.

**Implementation steps**:
1. Load `a11y-issues.json` from Phase 1; filter to contrast failures.
2. For each failure, run `resolve()` with override config.
3. Generate `color-decisions.md` from the decisions array.
4. Update token model with adjusted values.

### CSS Emission

**Overview**: Each package emits its own files; consuming sites import them in order.

```css
/* packages/tokens-base/dist/index.css */
@layer reset, tokens, base, components, utilities;
@import url('./reset.css') layer(reset);
@import url('./scales.css') layer(tokens);
@import url('./aliases.css') layer(tokens);
@import url('./misc.css') layer(tokens);

/* packages/tokens-base/dist/scales.css */
:root {
  --text-step--1: clamp(0.83rem, 0.78rem + 0.26vw, 0.94rem);
  --text-step-0:  clamp(1.00rem, 0.95rem + 0.27vw, 1.19rem);
  /* ... */
  --space-3xs: clamp(0.25rem, 0.22rem + 0.13vw, 0.31rem);
  /* ... */
}

/* packages/tokens-base/dist/aliases.css */
:root {
  /* Semantic aliases with sensible fallbacks; brand layers override. */
  --color-surface-default: #ffffff;
  --color-surface-brand: #555555;        /* placeholder; brand layer overrides */
  --color-text-default: #111111;
  --color-text-on-brand: #ffffff;        /* placeholder */
  --color-border-subtle: #e5e5e5;
  --font-sans: ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-sans);
  /* ... */
}

/* packages/tokens-veil/dist/index.css */
:root, [data-brand="veil"] {
  /* Veil palette */
  --color-veil-ink: #0b1d2e;
  --color-veil-mist: #f4f6f8;
  --color-veil-accent: #2f6fa1;
  /* Alias overrides */
  --color-surface-brand: var(--color-veil-ink);
  --color-text-on-brand: #f6f8fa;        /* adjusted from #e0e6eb (was 4.2:1) */
  --font-display: 'Veil Display', var(--font-sans);
}

/* packages/tokens-ncss/dist/index.css (stub in Phase 2) */
:root, [data-brand="ncss"] {
  --color-ncss-deep: #1f3a2a;            /* hue-shifted placeholder */
  --color-ncss-light: #f0f4ef;
  --color-surface-brand: var(--color-ncss-deep);
  --color-text-on-brand: #f4f8f4;
  --font-display: var(--font-sans);      /* stub: system stack */
}
```

**Key decisions**:
- `@layer` declared once in `tokens-base/index.css`. Brand layers do *not* re-declare; they just emit selectors that land in the existing `tokens` layer when imported after base.
- Brand layers scope to both `:root` and `[data-brand="<brand>"]`. The first wins by default if only one brand is imported (single-site production). The attribute scope lets the validation harness toggle at runtime when both are loaded.
- Semantic names over palette names in the exported surface (`--color-text-on-brand`, not `--color-blue-50`). Components reach for aliases only.
- Brand layers may expose raw palette tokens (`--color-veil-ink`) for use inside the brand layer itself, but components must not reference them — lint enforces.

### Validation Harness

**Pattern to follow**: Plain HTML page; no framework.

**Overview**: Single `harness/index.html` that imports `tokens-base` plus both brand layers and toggles between them at runtime via `data-brand` on `<html>`.

```html
<!doctype html>
<html lang="en" data-brand="veil">
<head>
  <link rel="stylesheet" href="../packages/tokens-base/dist/index.css" />
  <link rel="stylesheet" href="../packages/tokens-veil/dist/index.css" />
  <link rel="stylesheet" href="../packages/tokens-ncss/dist/index.css" />
  <link rel="stylesheet" href="./harness.css" />
</head>
<body>
  <header class="harness-controls">
    <button data-brand-set="veil">Veil</button>
    <button data-brand-set="ncss">NCSS</button>
  </header>
  <section id="type-scale">...</section>
  <section id="space-scale">...</section>
  <section id="color-pairings">...</section>
  <pre id="axe-output"></pre>
  <script type="module" src="./harness.js"></script>
</body>
</html>
```

**Key decisions**:
- Both brand layers loaded simultaneously. The `[data-brand="..."]` scope means only the active one resolves; flipping the attribute is the swap.
- `harness.js` listens on the toggle buttons, updates `data-brand`, then re-runs `axe-core` and updates the output `<pre>`.
- No framework — the harness exists to prove the CSS works in isolation.

**Implementation steps**:
1. Build harness markup that exercises every fluid step and every documented pairing.
2. Wire brand toggle: clicking `Veil` sets `data-brand="veil"`; same for NCSS.
3. Wire axe-core to scan after each brand change and on resize.
4. Add a `pnpm run harness` script that serves the harness on `localhost:8080` for review.

### Contrast CI Check

**Overview**: A test that asserts every documented pairing passes AA, so a future token edit can't silently break the system.

```typescript
import { describe, it, expect } from 'vitest';
import { contrastRatio } from './lib/contrast';
import { tokenModel } from '../dist/token-model.json';

describe('color pairings', () => {
  for (const pair of tokenModel.color.pairings) {
    it(`${pair.role}: ${pair.fg} on ${pair.bg} meets AA`, () => {
      const ratio = contrastRatio(pair.fg, pair.bg);
      expect(ratio).toBeGreaterThanOrEqual(pair.large ? 3 : 4.5);
    });
  }
});
```

**Key decisions**:
- Pairings come from the JSON-serialized model, not re-derived in tests. Tests check the published artifact.

## Data Model

Not applicable — JSON intermediate, CSS output.

## API Design

Not applicable.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `tokens/scripts/resolve-contrast.test.ts` | OKLCH adjustment converges; override config respected; no-change-needed path. |
| `tokens/scripts/build-fluid.test.ts` | `utopia-core` invocation produces expected clamp() strings for known config. |
| `tokens/lib/contrast.test.ts` | WCAG 2.2 ratio math matches reference cases. |

**Key test cases**:
- Failing pair gets adjusted; resulting pair passes 4.5:1 (or 3:1 for `large`).
- Locked background prevents adjustment of bg; fg adjusts instead.
- Already-passing pair returns `no-change-needed` strategy.
- Fluid step math: at viewport `minWidth`, computed font-size equals `minFontSize`.

### Integration Tests

| Test File | Coverage |
|-----------|----------|
| `tokens/scripts/build.e2e.test.ts` | Full build from synthetic Phase 1 inputs produces every expected output file. |
| `tokens/pairings.contract.test.ts` | Every documented pairing in `tokens.color.css` passes AA. |

**Key scenarios**:
- Empty Phase 1 inputs produce empty output without crashing.
- Re-running the build is idempotent; outputs are byte-identical.
- A deliberately broken override (assigns a failing color as locked) surfaces in `color-decisions.md` with a warning.

### Manual Testing

- [ ] Open `harness/index.html` at viewport widths 320, 768, 1024, 1440 — fluid scales transition smoothly.
- [ ] Review `color-decisions.md` with the client; capture sign-off in the PR description.
- [ ] Confirm `tokens.css` can be imported from a fresh HTML file with no other config.

## Error Handling

| Error Scenario | Handling Strategy |
|----------------|-------------------|
| Phase 1 inputs missing | Fail fast at build start with a clear message pointing at expected paths. |
| Contrast resolution can't reach AA (e.g. extreme inputs) | Surface in `color-decisions.md` as `strategy: 'manual-override'` and fail the build. |
| Locked override conflicts with AA target | Build warns and refuses to mark that pairing as "valid". |
| utopia-core API change | Version-pin the dependency; major-version bumps require explicit upgrade. |

## Validation Commands

```bash
# Install (from repo root, sets up the workspace)
pnpm install

# Type checking (all packages)
pnpm -r run typecheck

# Lint
pnpm -r run lint

# Unit + integration tests
pnpm -r run test

# Build all token packages from Phase 1 outputs
pnpm -r run build
# or per package:
pnpm --filter @veil-ncss/tokens-base run build
pnpm --filter @veil-ncss/tokens-veil run build
pnpm --filter @veil-ncss/tokens-ncss run build

# Serve the validation harness with runtime brand toggle
pnpm run harness   # opens harness/index.html on localhost:8080
```

## Rollout Considerations

Not applicable — Phase 2 produces a token package, no deployment.

- **Monitoring**: N/A
- **Alerting**: N/A
- **Rollback plan**: Token outputs are checked in; reverting is `git revert`.

## Open Items

- [ ] Lock decision: utopia-core dependency vs. one-time clamp() generation (lean toward dependency).
- [ ] Container query units (cqi/cqb) — introduce now in `tokens-base/dist/misc.css` or defer to Phase 3 when we know component scopes?
- [ ] Semantic alias layer scope: how many aliases ship in `tokens-base` vs. let brand layers extend? (Lean: a tight opinionated set in base, brand only overrides.)
- [ ] Workspace naming: `@veil-ncss/*` scope or something brand-neutral the client prefers (e.g. `@studio/*`).

---

*This spec is ready for implementation. Follow the patterns and validate at each step.*
