---
name: Veil + NCSS Site System Contract
description: Lean contract for migrating veilengineering.com off Wix and building a shared design token + component system that also drives the NCSS site.
---

# Veil + NCSS Site System Contract

**Created**: 2026-05-21
**Confidence Score**: 95/100
**Status**: Draft

## Problem Statement

veilengineering.com is currently built on Wix. The site has two recurring problems that affect every visitor: it does not meet modern accessibility expectations (no defined WCAG conformance, contrast and semantic issues likely), and it does not respond cleanly to viewport changes (layouts break or degrade at common screen sizes).

These problems compound: Wix's templated CSS and shadow-DOM-style structure make targeted fixes brittle, and the platform constrains how far the client can move toward a defined design system. Continuing to patch Wix keeps both the visual debt and the accessibility risk in place.

The client owns the Veil domain and wants the visual identity preserved. They also own a second brand, National Commercial Shading Solutions (NCSS), which needs an equivalent site built on the same foundations. The work is to extract what the current Veil site already communicates (colors, type, spacing, layout patterns), rebuild those primitives as a responsive, accessible, **brand-themeable** token system, ship the Veil site on a static stack with a headless CMS, then reuse the same token + component system for the NCSS site with different brand assets and content.

The architectural target is one shared system, two sites. Shared: base scales (type, space, radii, motion, breakpoints), component library, layout grammar, build/CMS plumbing. Per-brand: color palette, font-family choices, copy, imagery, domain configuration.

## Goals

1. Produce a machine-readable inventory of veilengineering.com's design tokens (color, type, spacing, radii, shadows, motion) and page templates, extracted via automated tooling rather than eyeballing. If NCSS has an existing site, audit it on the same pipeline.
2. Deliver a fluid token system using Utopia-style scales for type and space, split into a **shared base layer** (scales, radii, motion, breakpoints) and **per-brand layers** (color palette, fonts) so a single component library can render either brand.
3. Every default token pairing in both brand themes passes WCAG 2.2 AA contrast.
4. Ship a static Veil site (Eleventy preferred, alternatives evaluated only if a hard constraint emerges) that visually matches the existing Veil site, consuming the shared component library themed for Veil.
5. Ship a static NCSS site on the same foundations, themed for NCSS, with its own content and copy.
6. Wire Decap CMS (git-backed) per site so each brand owner can update content through a web UI without needing git access.
7. Pass automated accessibility checks (axe-core, Lighthouse) with no critical or serious violations across every shipped template on both sites.

## Success Criteria

- [ ] Phase 1 produces `tokens.raw.json` with all extracted Veil tokens, plus a page/template inventory listing every distinct layout on veilengineering.com. NCSS audit produced too if an NCSS site exists.
- [ ] Phase 1 produces an accessibility audit identifying contrast failures, missing landmarks, focus issues, and unlabeled controls on each audited site.
- [ ] Phase 2 produces a base token package (fluid type + space scales, radii, motion, breakpoints) and a Veil brand token package (palette, fonts), both as CSS custom properties.
- [ ] Phase 2 brand layers are swappable — switching from `tokens-veil` to `tokens-ncss` (stub) in a test page changes only color and font without breaking layout.
- [ ] Phase 2 resolves every Phase 1 contrast failure in the Veil brand layer, with a documented diff between original and accessible values.
- [ ] Phase 3 ships an Eleventy-based Veil site consuming the shared component package and Veil brand tokens.
- [ ] Phase 3 components consume only semantic tokens. No hardcoded colors, sizes, fonts, or spacing values in component CSS. No Veil-specific assumptions in component markup.
- [ ] Phase 3 Veil site passes axe-core and Lighthouse a11y checks with no critical/serious violations on every template.
- [ ] Phase 3 Veil site renders cleanly at 320px, 768px, 1024px, and 1440px viewports with no horizontal scroll or content clipping.
- [ ] Phase 4 ships an NCSS site reusing the same component package and a new NCSS brand token layer, with its own content, on its own domain.
- [ ] Phase 4 NCSS site passes the same a11y, responsive, and visual-fidelity gates as Veil.
- [ ] Decap CMS is wired per site so each brand owner can edit content through a web UI, with auth that does not require a paid tier.
- [ ] Both sites are deployed to Netlify with their respective domains pointed at them via DNS records the client controls.
- [ ] Free-tier limits (Netlify build minutes, bandwidth, Decap auth) are documented and both sites operate within them.
- [ ] Side-by-side comparison of new Veil vs. existing Veil shows clear identity preservation; client sign-off captured.

## Scope Boundaries

### In Scope

- Automated extraction of design tokens from the live Veil Wix site. If NCSS has a live site, audit it on the same pipeline.
- Page/template inventory of the existing Veil site (and NCSS site if it exists) as a Phase 1 deliverable.
- Accessibility audit of the existing site(s) (informs token adjustments).
- Utopia-based fluid scaling for type and space, in a shared base token package.
- Brand token layers — one for Veil (Phase 2), one for NCSS (Phase 4) — that override semantic color and font tokens without touching base scales.
- Semantic token aliasing (`--color-surface-brand`, `--color-text-on-brand`, etc.) so components are brand-agnostic.
- CSS custom property architecture with a documented layer/cascade strategy.
- Adjustment of brand tokens that fail WCAG 2.2 AA contrast (accessibility wins; visual drift accepted and documented).
- Eleventy implementation (default) per site, each consuming the shared component package.
- Shared component library (Nunjucks includes + scoped CSS) used by both sites.
- Per-template layouts honoring the Phase 1 inventory.
- Decap CMS integration per site, git-backed, with a shared auth approach (Cloudflare Workers OAuth proxy or equivalent).
- Direct port of existing Veil copy and imagery, structure preserved. NCSS content provided by the client.
- Automated a11y checks (axe-core, Lighthouse) wired into each site's build/CI.
- Netlify deployment per site, with the client's DNS for each domain pointed at Netlify via CNAME/A record.
- Self-hosted fonts and assets per brand (no external CDN dependencies beyond what Decap and Netlify already require).
- Monorepo structure (pnpm workspaces) holding shared packages and per-site projects.

### Out of Scope

- Content rewrites, copy edits, or information architecture changes. Content ports as-is; rework is a separate engagement.
- Net-new pages or features not present on the existing site.
- SEO strategy beyond preserving existing URL structure and meta tags where reasonable.
- Analytics, marketing automation, or third-party integrations beyond what the current site already uses.
- Server-side rendering, edge functions, or any dynamic backend. Static output only.
- Brand identity work (logo, photography direction, illustration). Existing assets ported as-is.
- WCAG 2.2 AAA conformance. AA is the bar; AAA is not promised.
- Internationalization or multi-language support unless the current site already has it.
- Paid CMS or hosting tiers. Decap is free; Netlify free tier is the cap. If usage exceeds free-tier limits, the project pauses for a paid-tier conversation, not a silent upgrade.
- Domain transfer. The client keeps DNS control at their existing registrar; only DNS records change.
- Third-party scripts beyond what Decap and Netlify require (no analytics, chat widgets, external font CDNs by default).

### Future Considerations

- Content audit and rewrite engagement for either brand (parked for a follow-on).
- Adding new page types (case studies, blog, hiring) once the system is in place.
- Visual regression testing harness (e.g. Playwright snapshots), per brand.
- Performance budget enforcement in CI beyond a Lighthouse pass.
- Migrating the headless CMS to a different provider if the initial choice doesn't fit.
- Design system documentation site (Storybook or similar) showing both brand themes side by side.
- Additional brand themes beyond Veil and NCSS if the client adds business units.
- Cross-site shared content (e.g. shared blog or team pages rendered into both sites).

---

*This contract was generated from brain dump input. Review and approve before proceeding to PRD generation.*
