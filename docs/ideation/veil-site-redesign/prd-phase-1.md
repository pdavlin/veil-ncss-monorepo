---
name: Phase 1 PRD — Audit, Inventory, Token Extraction
description: Automated extraction of design tokens, template inventory, and accessibility audit from the existing veilengineering.com Wix site.
---

# PRD: Veil Site Redesign — Phase 1

**Contract**: ./contract.md
**Phase**: 1 of 3
**Focus**: Audit the existing Wix site and produce machine-readable inputs for Phase 2 and Phase 3.

## Phase Overview

Phase 1 is pure discovery and extraction. Nothing about the new site gets designed or coded yet. The output is three artifacts that drive every subsequent decision: a raw design-token inventory, a page/template inventory, and an accessibility audit of the existing site.

This phase is sequenced first because Phase 2 cannot adjust tokens it has not yet seen, and Phase 3 cannot scope a component library without knowing how many distinct templates exist. The accessibility audit feeds Phase 2's token adjustments — every contrast failure found here becomes a token fix later.

The work is biased toward automation. Manual eyeballing through devtools is the fallback, not the default. Time spent building a repeatable extraction pass pays off if the site changes again before Phase 3 ships.

## User Stories

1. As the implementing engineer, I want a `tokens.json` (or equivalent) listing every color, font-family, font-size, line-height, font-weight, spacing value, border-radius, and shadow used on the existing site, so Phase 2 can transform them into a fluid system without re-scraping.
2. As the implementing engineer, I want a list of every distinct page template on veilengineering.com with URLs, screenshots at 4 viewport widths, and notes on layout intent, so Phase 3 can scope the component library accurately.
3. As the client (via the engineer), I want a written accessibility audit of the current site so I understand what changes will happen to the visual identity and why.

## Functional Requirements

### Token Extraction

- **FR-1.1**: Crawl veilengineering.com via Playwright (or equivalent headless browser tooling) across every public URL.
- **FR-1.2**: Capture computed styles for every visible DOM node on each page, deduplicating by property.
- **FR-1.3**: Extract distinct values for: color (text, background, border), font-family, font-size, line-height, font-weight, letter-spacing, margin/padding (per side), gap, border-radius, box-shadow, transition duration/easing.
- **FR-1.4**: Cluster near-duplicate values (e.g. `#1a1a1a` vs `#1b1b1b`) and surface clusters for manual review rather than auto-collapsing.
- **FR-1.5**: Output `tokens.raw.json` with categorized, deduplicated tokens, each tagged with sample URLs where they appear.
- **FR-1.6**: Output `tokens.summary.md` listing the proposed canonical token set (a curated subset of raw values), explaining any collapsing decisions.

### Template Inventory

- **FR-1.7**: Enumerate every public URL on the site via sitemap and crawl.
- **FR-1.8**: Group URLs by template (home, services, about, contact, etc.) based on layout signature, not URL.
- **FR-1.9**: For each template, capture full-page screenshots at 320px, 768px, 1024px, and 1440px.
- **FR-1.10**: Document each template's structural sections (hero, feature grid, CTA band, footer, etc.) and note which are reused across templates.
- **FR-1.11**: Output `templates.md` with one section per template: URL list, screenshots referenced by path, structural breakdown, and any observed responsive failures.

### Accessibility Audit

- **FR-1.12**: Run axe-core against every distinct URL using the same Playwright harness.
- **FR-1.13**: Run Lighthouse accessibility audit against every distinct URL.
- **FR-1.14**: Aggregate findings by severity (critical, serious, moderate, minor) and by issue type (contrast, landmarks, labels, keyboard, focus).
- **FR-1.15**: For every contrast failure, capture the offending token pair (foreground + background) and the resulting ratio so Phase 2 has direct inputs.
- **FR-1.16**: Output `a11y-audit.md` summarizing findings, with a structured `a11y-issues.json` for programmatic consumption by Phase 2.

## Non-Functional Requirements

- **NFR-1.1**: Extraction must be re-runnable. A single command regenerates all artifacts so the audit can be repeated if the Wix site changes mid-project.
- **NFR-1.2**: Artifacts live in version control as the project's first commit, so subsequent phases have a stable, reviewable baseline.
- **NFR-1.3**: No artifact requires manual editing of computed-style data. Curation happens in `tokens.summary.md`, not in `tokens.raw.json`.
- **NFR-1.4**: Tooling stays on free tiers (Playwright local, axe-core npm, Lighthouse CLI). No paid scraping services.

## Dependencies

### Prerequisites

- Approved contract.
- Access to veilengineering.com (public site, no auth needed for crawl).
- Local Node.js environment for Playwright/axe-core/Lighthouse.

### Outputs for Next Phase

- `tokens.raw.json` — every distinct style value found on the site.
- `tokens.summary.md` — curated canonical token set.
- `templates.md` — page/template inventory with screenshots.
- `a11y-audit.md` + `a11y-issues.json` — accessibility findings, with contrast failures structured for Phase 2.
- Screenshot archive at the four target viewport widths.

## Acceptance Criteria

- [ ] `tokens.raw.json` exists and includes every category listed in FR-1.3.
- [ ] `tokens.summary.md` proposes a canonical token set with stated rationale for each consolidation.
- [ ] `templates.md` lists every distinct template with URLs, screenshots, and structural notes.
- [ ] Every contrast failure in the existing site is captured in `a11y-issues.json` with foreground, background, and ratio.
- [ ] Extraction pipeline runs end-to-end via a single documented command.
- [ ] All Phase 1 artifacts are committed and reviewable.

## Open Questions

- Should the crawl honor robots.txt or override (we own the client relationship, so override is reasonable)?
- Do we need to capture any state-based styles (hover, focus, active) in the token extraction, or is the default state sufficient for Phase 2?
- How do we handle web fonts loaded from Wix's CDN — are we porting the same fonts (and paying their license if needed), substituting with self-hosted alternatives, or asking the client what's licensed?

---

*Review this PRD and provide feedback before spec generation.*
