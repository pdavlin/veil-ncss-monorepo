---
name: Phase 3 PRD — Shared Components + Veil Site
description: Build the shared component package and ship veilengineering.com on Eleventy, consuming Phase 2 tokens. NCSS site is Phase 4.
---

# PRD: Veil + NCSS Site System — Phase 3

**Contract**: ./contract.md
**Phase**: 3 of 4
**Focus**: Ship the new veilengineering.com on a static stack consuming Phase 2's token system. Build the shared component package that Phase 4 will reuse for NCSS.

## Phase Overview

Phase 3 turns the audit and the token system into a running Veil site, and lays down the shared component package that Phase 4 will reuse for NCSS. Two outputs:

- **`packages/components`**: a Nunjucks include set + scoped CSS, brand-agnostic. Consumes only `tokens-base` semantic aliases. Has no Veil-specific assumptions in markup or styles.
- **`sites/veil`**: an Eleventy 3.x project that imports `tokens-base` + `tokens-veil` + `packages/components`, renders Veil's content from markdown, and ships to Netlify with Decap CMS.

This phase is sequenced third because component design depends on Phase 1's template inventory and Phase 2's token aliases, and shipping Veil first proves the system before NCSS reuses it. Eleventy stays the default; an alternative SSG only comes into play if a constraint emerges (e.g. component-level interactivity requirements that don't fit Eleventy's model).

The biggest unknowns at the start of this phase are CMS auth strategy (Netlify Identity is in maintenance mode, so Decap auth on free tier needs a Cloudflare Workers OAuth proxy or equivalent) and discipline around keeping `packages/components` brand-agnostic — any Veil-specific class or asset that leaks in becomes a refactor when Phase 4 starts.

## User Stories

1. As a Veil site visitor, I want every page to render correctly at 320px through 1920px viewports with no horizontal scroll or clipped content, so the site works on whatever device I'm using.
2. As a site visitor with a screen reader or keyboard-only navigation, I want every page to expose proper landmarks, focus order, and labels, so I can use the site as intended.
3. As the Veil brand owner, I want to log in to a CMS dashboard and edit any page's content without touching code or git, so updates don't require the engineer.
4. As the implementing engineer, I want every component to consume Phase 2 semantic tokens via CSS custom properties, so applying a different brand layer in Phase 4 produces the NCSS site without any component changes.
5. As the implementing engineer, I want `packages/components` to have zero Veil-specific markup, classes, or asset references, so Phase 4 can scaffold NCSS by adding only a content/brand directory.

## Functional Requirements

### Monorepo Setup

- **FR-3.1**: Establish pnpm workspaces at the repo root with `packages/*` and `sites/*` globs. Phase 2 packages (`tokens-base`, `tokens-veil`, `tokens-ncss`) already live under `packages/`.
- **FR-3.2**: Each site under `sites/` is an independent Eleventy project with its own `package.json`, `.eleventy.js`, and `netlify.toml`.

### Shared Component Package

- **FR-3.3**: Create `packages/components` containing Nunjucks includes (`*.njk`) and scoped CSS (`*.css`) for every reusable section identified in Phase 1's `templates.md` (e.g. hero, feature grid, cta-band, footer, header-nav, prose, button).
- **FR-3.4**: Every component CSS file references only `tokens-base` semantic aliases. No hardcoded hex, px, rem-with-magic-numbers, or font-family literals. Lint rule enforces this.
- **FR-3.5**: Components accept content via data, not hardcoded copy. The same hero renders different headings depending on the page.
- **FR-3.6**: No component references Veil-specific class names, asset paths, or brand strings. Brand identity is conveyed through tokens and content, not component code. Lint rule (e.g. forbidden strings: `veil`, `ncss` in `packages/components`) catches accidental leakage.
- **FR-3.7**: Produce `packages/components/README.md` documenting each component's data contract, slots, and usage example.

### Veil Site Setup

- **FR-3.8**: Create `sites/veil` as an Eleventy 3.x project.
- **FR-3.9**: Configure Eleventy to import `packages/components` includes via `eleventyConfig.addPlugin` or a passthrough/symlink, so the site picks up component updates without copy-paste.
- **FR-3.10**: Import `tokens-base/dist/index.css` and `tokens-veil/dist/index.css` (in that order) as the first stylesheets, followed by component-scoped CSS.
- **FR-3.11**: Output static HTML to `sites/veil/_site/` with asset hashing for cache-busting.
- **FR-3.12**: Provide a brief evaluation of alternative SSGs (Astro, Hugo) in `docs/stack-decision.md` and document why Eleventy was kept (or why we pivoted).

### Veil Layouts and Content

- **FR-3.13**: Build one Eleventy layout per distinct template from Phase 1, in `sites/veil/src/_includes/layouts/`.
- **FR-3.14**: Layouts compose shared components from `packages/components` and pass page-level data to them.
- **FR-3.15**: Port existing content from veilengineering.com into markdown files under `sites/veil/src/content/`, preserving copy and image references.
- **FR-3.16**: Set up image handling (`@11ty/eleventy-img` or equivalent) to generate responsive `<picture>` markup with appropriate formats and sizes. The image plugin lives in `packages/components` if shared logic is needed, but per-site image directories stay under `sites/{brand}/`.

### Decap CMS Integration (Veil)

- **FR-3.17**: Configure Decap CMS at `sites/veil/src/admin/config.yml` with collections matching the Veil markdown content structure.
- **FR-3.18**: Resolve Decap auth strategy on free tier and implement it. Plan A: Cloudflare Workers OAuth proxy at `auth/cf-worker/`, shared across both brands. Plan B: Netlify Functions broker. Plan C: a different auth path that works at the time. Document the decision in `docs/cms-decision.md`.
- **FR-3.19**: The OAuth proxy supports multi-site reuse (Phase 4's NCSS Decap admin uses the same proxy or an instance of it).
- **FR-3.20**: Verify every Veil template's content fields are editable through the Decap UI by a non-git-literate user.

### Veil Deployment

- **FR-3.21**: Configure Netlify build settings (build command, publish directory, Node version) via `sites/veil/netlify.toml`. Build command runs from the monorepo root so workspace dependencies resolve.
- **FR-3.22**: Coordinate DNS cutover with the client for veilengineering.com. Client adds CNAME/A record at their registrar; Netlify handles TLS via Let's Encrypt.
- **FR-3.23**: Provide a rollback plan (DNS revert to Wix) in case of post-launch issues, documented in `docs/launch-runbook-veil.md`.

### Accessibility and Responsiveness Validation

- **FR-3.24**: Wire axe-core into the Veil site build (or CI) to run against every rendered page; fail the build on critical/serious violations.
- **FR-3.25**: Wire Lighthouse CI (or equivalent) to check accessibility and performance scores per template.
- **FR-3.26**: Manually verify every template at 320px, 768px, 1024px, and 1440px before launch sign-off.
- **FR-3.27**: A "two-brand smoke test" script renders a single representative Veil page swapped to the NCSS-stub brand layer and runs axe-core; this catches accidental brand-coupling in components before Phase 4.

## Non-Functional Requirements

- **NFR-3.1**: Total page weight stays modest. No external font CDNs; self-host or use system stacks. No analytics or chat widgets by default.
- **NFR-3.2**: Lighthouse performance score ≥ 90 on home and one services page (sample target, not blocking on every template).
- **NFR-3.3**: Build time on Netlify free tier stays well within the 300-build-minutes-per-month limit (incremental builds preferred).
- **NFR-3.4**: Site works with JavaScript disabled. Decap admin requires JS, but public pages do not.
- **NFR-3.5**: WCAG 2.2 AA conformance with zero critical/serious axe-core violations on every template.

## Dependencies

### Prerequisites

- Phase 2 complete: `tokens.css` and supporting files available for import.
- Phase 1 template inventory and screenshots available as reference.
- Client available for content review and DNS cutover coordination.
- Decision on Decap auth strategy (made during this phase, but a known unknown going in).

### Outputs for Next Phase

- A deployed Veil site at veilengineering.com on Netlify.
- `packages/components` — battle-tested on Veil, ready for Phase 4 to consume for NCSS.
- A reference Eleventy site structure (`sites/veil/`) that Phase 4 can clone as the starting point for `sites/ncss/`.
- A working Decap auth path (OAuth proxy or equivalent) reusable for NCSS.
- Documentation: `packages/components/README.md`, `docs/cms-decision.md`, `docs/stack-decision.md`, `docs/launch-runbook-veil.md`.
- Confirmation that the two-brand smoke test passes — components do not leak Veil identity.

## Acceptance Criteria

- [ ] Every template from Phase 1's `templates.md` has a corresponding Eleventy layout in `sites/veil/` that renders existing content.
- [ ] Every component in `packages/components` consumes Phase 2 semantic tokens exclusively (verified by lint).
- [ ] No component file in `packages/components` contains the strings `veil` or `ncss` (verified by lint).
- [ ] Two-brand smoke test: a sample Veil page rendered with NCSS-stub brand tokens has no layout breakage and passes axe-core.
- [ ] Veil site builds on Netlify free tier from a `git push` to main.
- [ ] veilengineering.com points at Netlify via DNS the client controls; HTTPS works end-to-end.
- [ ] Decap CMS UI loads at `/admin`, auth works, and a non-engineer can edit and publish a content change.
- [ ] axe-core reports zero critical/serious violations on every shipped Veil template.
- [ ] Lighthouse accessibility score ≥ 95 on every shipped Veil template.
- [ ] Manual viewport sweep (320/768/1024/1440) shows no horizontal scroll or content clipping.
- [ ] Side-by-side comparison (new Veil vs. old Veil) shows visual identity preserved; client signs off.
- [ ] `docs/launch-runbook-veil.md` documents deploy, rollback, and CMS admin handoff.
- [ ] Monorepo structure is set up so Phase 4 can scaffold `sites/ncss/` by cloning `sites/veil/` and swapping the brand token import + content directory.

## Open Questions

- Decap CMS auth on free tier: which path actually works in 2026, given Netlify Identity's maintenance status?
- Are there any Wix-hosted assets (forms, scheduling widgets) the current site depends on that we need to either replace or document as out-of-scope?
- Does the client need any email/contact form handling (Netlify Forms is free up to a low limit)?
- Image licensing — do we have rights to all images on the current site, or does porting need a quick audit?
- URL structure preservation for SEO — do we need redirects from any old Wix URLs to new ones?

---

*Review this PRD and provide feedback before spec generation.*
