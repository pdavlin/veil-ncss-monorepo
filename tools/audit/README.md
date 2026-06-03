# @veil/audit

Playwright-driven extraction pipeline producing design-token, template, and accessibility artifacts from a live site. Phase 1 of the Veil + NCSS site system rebuild.

## Install

```bash
cd tools/audit
pnpm install
pnpm exec playwright install chromium
```

Lighthouse runs through the `lighthouse` npm package invoked programmatically; no global install required.

## Run

The pipeline is origin-parameterized. Pass one or more `--origin` flags or omit to run all required origins from `config.ts`.

```bash
# Full pipeline (default origin set)
pnpm run audit:all

# Single origin, full pipeline
pnpm run audit:all -- --origin veilengineering.com

# Individual passes
pnpm run audit:urls -- --origin veilengineering.com
pnpm run audit:tokens -- --origin veilengineering.com
pnpm run audit:cluster -- --origin veilengineering.com
pnpm run audit:screenshots -- --origin veilengineering.com
pnpm run audit:a11y -- --origin veilengineering.com
pnpm run audit:curate -- --origin veilengineering.com
```

## Output Layout

```
audit-output/{origin-slug}/
├── urls.json                  # URL discovery output
├── tokens.byUrl.json          # raw computed styles per URL
├── tokens.raw.json            # deduplicated + clustered tokens
├── tokens.summary.md          # curated canonical token set (regenerated)
├── templates.md               # template inventory with screenshots
├── a11y-issues.json           # axe + Lighthouse findings, structured
├── a11y-audit.md              # human-readable a11y report
├── run.log                    # pipeline log (fallbacks, retries, skips)
└── screenshots/
    └── {template-slug}/
        ├── 320.png
        ├── 768.png
        ├── 1024.png
        └── 1440.png
```

## Validation

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
```

## Design Notes

- **Sitemap-first URL discovery**; BFS fallback at `maxDepth: 4`. Filters asset URLs.
- **Default-state styles only** in Phase 1. Hover/focus capture deferred to Phase 2 spot-checks.
- **Visible elements only** — `display: none` subtrees are skipped to reduce noise.
- **HSL-distance clustering** for colors, exact-match for everything else. Clusters surface as suggestions; never auto-collapsed in `tokens.raw.json`.
- **One representative URL per template** for screenshots — full-page at 320/768/1024/1440.
- **axe-core** runs against `wcag2a`, `wcag2aa`, `wcag22aa` tags. Contrast issues get a structured `{ fg, bg, ratio, required }` payload for Phase 2 token adjustments.
