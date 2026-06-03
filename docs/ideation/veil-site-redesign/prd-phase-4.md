---
name: Phase 4 PRD — NCSS Site Rollout
description: Ship the NCSS site reusing the shared component package and tokens-base, with an NCSS-specific brand token layer and content.
---

# PRD: Veil + NCSS Site System — Phase 4

**Contract**: ./contract.md
**Phase**: 4 of 4
**Focus**: Replace the NCSS-stub brand layer with the real NCSS palette, port NCSS content, and ship the NCSS site to Netlify on its own domain.

## Phase Overview

Phase 4 stands up the second site on top of the system Phase 2 and Phase 3 built. By the time Phase 4 starts, the heavy lifting is done: `tokens-base` is shared, `packages/components` is brand-agnostic, the Eleventy + Decap + Netlify pattern is proven, and the OAuth proxy is deployed. Phase 4 is mostly:

1. Replace `packages/tokens-ncss` stub values with the real NCSS palette and fonts.
2. Resolve any NCSS-specific contrast failures (same Phase 2 process, narrower scope).
3. Scaffold `sites/ncss/` from `sites/veil/`, swap the brand token import, port NCSS content.
4. Configure Decap for NCSS collections.
5. Deploy to Netlify on the NCSS domain.

If Phase 1 audited an existing NCSS site, content port is straightforward. If NCSS is greenfield, the client provides copy and imagery — that's the gating dependency.

This phase exists to prove the multi-brand system delivers on its premise. If Phase 4 requires changing `packages/components`, that's a signal Phase 3 leaked Veil-specific assumptions and we have refactoring to do.

## User Stories

1. As an NCSS site visitor, I want every page to render correctly at 320px through 1920px viewports with no horizontal scroll or clipped content.
2. As an NCSS site visitor using a screen reader or keyboard-only navigation, I want proper landmarks, focus order, and labels — the same as Veil.
3. As the NCSS brand owner, I want to log in to a CMS dashboard and edit any page's content without touching code or git.
4. As the implementing engineer, I want NCSS to come up by scaffolding from `sites/veil/`, swapping the brand token import, and adding NCSS content — no changes to `packages/components` or `tokens-base`.

## Functional Requirements

### Real NCSS Brand Layer

- **FR-4.1**: Replace stub colors in `packages/tokens-ncss/dist/index.css` with the real NCSS palette.
- **FR-4.2**: Replace stub font stack in `packages/tokens-ncss/dist/index.css` with NCSS's chosen typefaces (self-hosted, licensed).
- **FR-4.3**: Run the Phase 2 contrast resolution pass against the NCSS palette. Adjust failing pairs; produce `docs/color-decisions-ncss.md`.
- **FR-4.4**: Confirm every documented NCSS pairing passes WCAG 2.2 AA via the existing automated check.

### NCSS Site Setup

- **FR-4.5**: Create `sites/ncss` by scaffolding from `sites/veil` (script or manual checklist; manual is fine for one site).
- **FR-4.6**: Swap the brand token import in `sites/ncss/src/styles/site.css` from `tokens-veil` to `tokens-ncss`.
- **FR-4.7**: Configure `sites/ncss/netlify.toml` for the NCSS domain and build.
- **FR-4.8**: Confirm no file under `sites/ncss/src/_includes/` (layouts, components reused from packages) imports anything Veil-specific. If something does, fix the leak in `packages/components`, not in `sites/ncss`.

### NCSS Content

- **FR-4.9**: Establish `sites/ncss/src/content/` with markdown files matching the templates the NCSS site needs. If NCSS reuses every Veil template, the file structure mirrors `sites/veil/src/content/`.
- **FR-4.10**: If NCSS needs templates Veil does not (or vice versa), build those layouts in `sites/ncss/src/_includes/layouts/` using existing components — do not invent NCSS-only components in `packages/components` unless they're genuinely reusable.
- **FR-4.11**: Port (or receive) NCSS copy and imagery into the content directory. Image assets self-hosted in `sites/ncss/src/assets/`.

### Decap CMS Integration (NCSS)

- **FR-4.12**: Configure `sites/ncss/src/admin/config.yml` with collections matching the NCSS content structure.
- **FR-4.13**: Reuse the OAuth proxy from Phase 3. NCSS's `config.yml` points at the same proxy URL; NCSS user accounts get added to the GitHub OAuth app's allowed list.
- **FR-4.14**: Verify every NCSS template's content fields are editable through Decap by a non-git-literate user.

### NCSS Deployment

- **FR-4.15**: Configure Netlify for the NCSS domain. Client adds CNAME/A record at their registrar.
- **FR-4.16**: Provide a rollback plan documented in `docs/launch-runbook-ncss.md`. (If NCSS replaces an existing site, rollback means reverting DNS to the prior provider. If NCSS is new, rollback means temporarily redirecting to a holding page.)

### Validation

- **FR-4.17**: axe-core runs against every NCSS template; zero critical/serious violations gate the build.
- **FR-4.18**: Lighthouse CI checks accessibility and performance on NCSS templates.
- **FR-4.19**: Manual viewport sweep (320/768/1024/1440) on every NCSS template.
- **FR-4.20**: Confirm the two-brand smoke test from Phase 3 still passes after Phase 4's token updates.

## Non-Functional Requirements

- **NFR-4.1**: Zero changes to `packages/components` source files should be required by Phase 4. Any change there is a Phase 3 regression flagged as a defect.
- **NFR-4.2**: Zero changes to `tokens-base` should be required by Phase 4. NCSS-only structural needs land in `tokens-ncss`.
- **NFR-4.3**: NCSS site stays within Netlify free-tier limits independently of Veil. (Two free Netlify sites are allowed; build minutes are per-account.)
- **NFR-4.4**: Self-hosted fonts only. No external CDN dependencies beyond what Decap and Netlify require.
- **NFR-4.5**: WCAG 2.2 AA conformance with zero critical/serious axe-core violations on every NCSS template.

## Dependencies

### Prerequisites

- Phase 3 complete: shared components, OAuth proxy, Veil site live, monorepo working.
- NCSS brand assets in hand: palette hex values, font files + license, logo files, copy, imagery.
- NCSS domain registered and DNS controlled by the client.
- Decision on whether NCSS replaces an existing site (and if so, rollback plan accounts for that).

### Outputs

- A deployed NCSS site on Netlify at the NCSS domain.
- Real `packages/tokens-ncss` (no longer a stub).
- `docs/color-decisions-ncss.md` (client sign-off artifact).
- `docs/launch-runbook-ncss.md`.

## Acceptance Criteria

- [ ] `packages/tokens-ncss` contains the real NCSS palette and fonts, with every documented pairing passing WCAG 2.2 AA.
- [ ] `sites/ncss/` builds on Netlify free tier from a `git push` to main.
- [ ] NCSS domain points at Netlify via DNS the client controls; HTTPS works end-to-end.
- [ ] Decap admin loads for NCSS, OAuth works (reusing the Phase 3 proxy), non-engineer can edit and publish.
- [ ] axe-core reports zero critical/serious violations on every NCSS template.
- [ ] Lighthouse accessibility score ≥ 95 on every NCSS template.
- [ ] Viewport sweep (320/768/1024/1440) clean on every NCSS template.
- [ ] Zero source changes to `packages/components` and `packages/tokens-base` were needed in this phase (verified by git log scoped to those paths from Phase 3 launch to Phase 4 launch).
- [ ] Two-brand smoke test still passes.
- [ ] Veil site (now in production) has not regressed during Phase 4 work — automated checks against `sites/veil/` still pass.
- [ ] `docs/launch-runbook-ncss.md` documents deploy, rollback, and CMS admin handoff.
- [ ] Client signs off on NCSS visual identity.

## Open Questions

- Does NCSS replace an existing site (DNS cutover) or launch greenfield (no prior URL to redirect from)?
- Does NCSS share any templates with Veil that should be sourced from the same content, or is content fully independent?
- Are there NCSS-specific page types Veil doesn't have (case studies, product catalog, dealer locator)? If so, do those components belong in `packages/components` (because they're generally useful) or in `sites/ncss/src/_includes/components/` (because they're truly NCSS-only)?
- Image licensing for NCSS — does the client own all imagery, or are there stock/licensed images to track?
- Should Veil and NCSS share any cross-promotional links (e.g. footer "also from the same company") or stay visibly independent?

---

*Review this PRD and provide feedback before spec generation.*
