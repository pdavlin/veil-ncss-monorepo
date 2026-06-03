---
name: Phase 3 Spec — Shared Components + Veil Site (revised)
description: Build shared layouts/components/tokens that recreate the existing veilengineering.com design verbatim, with the audit's responsive and a11y failures fixed. Ship to Netlify with Decap CMS.
---

# Implementation Spec: Veil + NCSS Site System — Phase 3 (revised)

**PRD**: ./prd-phase-3.md
**Audit**: ../../../audit-output/www.veilengineering.com/templates.md
**Recommendations**: ../../../audit-output/recommendations.md
**Estimated Effort**: L (3–4 weeks elapsed)

## Hard Contract

> "This rebuild is a structural and accessibility overhaul, **not a content rewrite**. Visual identity stays recognizable: same brand colors, same general layout intent, same imagery. Side-by-side, the new site should read as the same brand at a glance." — `recommendations.md` #11

The implementation MUST hold this contract:

1. **No content changes.** All page copy ports verbatim from the live site. Headings, body, captions, link labels — exactly as published. The CMS is provided so the client can edit later, not as an excuse for invented placeholder copy.
2. **No voice or tone changes.** Lowercase page titles with trailing periods (`about.`, `services.`, `contact.`, `team.`, `innovation.`, `portfolio.`, `sustainable design.`) are preserved as visual identity.
3. **No brand changes.** Color palette, type stacks, layout intent, imagery, and per-page structure match the existing site.
4. **Yes — fix responsive and a11y failures** documented in the audit. That is the only category of change.

Violations of this contract are bugs.

## Technical Approach

Two outputs in the Phase 2 monorepo:

1. **`packages/components`** — Nunjucks includes + scoped CSS keyed to `tokens-base` semantic aliases. Components are brand-agnostic in code (no `veil`/`ncss` strings in source) but their shapes are derived directly from the audit's template inventory. This is the package Phase 4's NCSS site reuses.
2. **`sites/veil`** — an Eleventy 3.x project that imports `tokens-base` + `tokens-veil` + `packages/components`, ports every published page's content into markdown, and ships to Netlify with Decap CMS.

Decap auth: Plan A is a Cloudflare Workers OAuth proxy at brand-neutral `auth.<engineer>.dev`. Same as the original spec; this part is unchanged.

A "two-brand smoke test" runs in CI: a representative Veil page is rendered with `tokens-ncss` swapped in and axe-core runs against it. Catches brand-coupling leaks before Phase 4.

## Templates to Ship (per `templates.md`)

Ten distinct templates, sequenced from highest traffic to lowest:

| Template | URLs | Responsive fixes required |
|---|---|---|
| `home` | `/` | At 320, nav links clip on both sides (`folio.`, `sustaina`). |
| `services` | `/services` | At 320, nav logo + first link clipped. Left-rail technical drawing currently sits **above** the numbered list at narrow widths; correct intent per audit is **beside** the list at desktop, stacked at mobile. |
| `about` | `/about` | At 320, nav logo cropped off left edge, leftmost link partially cut. |
| `contact` | `/contact` | **Worst failure on the site at 320:** two-column layout doesn't stack; form is pushed off the right edge, labels and inputs clipped. Top nav links also bleed past the right edge. |
| `team` | `/team` | At 320, nav logo cropped at left edge. Otherwise readable. |
| `innovation` | `/innovation` | **Worst responsive failure on the site:** article cards' image and text panels render side-by-side at 320, image tiles + headlines clipped (`Healthcare`, `Roller Shad` truncated). |
| `sustainability` | `/sustainability` | Two-column header doesn't stack at 320; both columns compressed to near-unreadable. Inline diagrams and three-up cards stay horizontal and feel cramped. |
| `portfolio-grid` | `/portfolio-10` | Already responsive: collapses to single-column at 320. Nav links clipped at edges. Fix nav, leave grid. |
| `portfolio-detail` | `/portfolio-1/*` (13 URLs) | At 320, image pair stays side-by-side. Acceptable per audit. Fix nav. |
| `joslyn-art-museum` | `/joslyn-art-museum` | Uses portfolio-detail template. URL preserved via Eleventy permalink override. |

## Brand-Specific Components

The component package replaces the generic-shape components an earlier version of this spec called for (hero, feature-grid, cta-band, prose). Those don't match the audited templates. Real component list:

### Navigation + chrome

- **`split-nav`** — centered wordmark with two-row primary nav. Top row: portfolio, services, innovation, sustainability. Bottom row: team, about, contact. Responsive: collapses to a single hamburger-or-dropdown disclosure at narrow widths (fix for 320 clipping). Lives in every layout's header.
- **`site-footer`** — copyright line + LinkedIn icon. Auto-stamps year (`recommendations.md` punch list).
- **`scroll-cue`** — down-arrow on home hero. Decorative only; aria-hidden.
- **`ruler-strip`** — decorative ruler/section-marker divider used between home content bands. Pure CSS; no markup beyond an `<hr>` with role styling.

### Page-level building blocks

- **`page-title`** — renders the lowercase-period title (`about.`, `services.`). Single component, one prop (`text`); applies identity treatment (font-family, size, period color/weight).
- **`hero-overlay`** — full-bleed image (or video — see "Motion") with overlaid heading and short paragraph. Used on `about`, `team`, `home`. Image can be still or motion; component accepts both source types.
- **`hero-blurred`** — variant for `home`: full-bleed blurred image, centered tagline `veil | engineered shading`, scroll-cue underneath. Accepts video or image.
- **`founder-card`** — name, email, phone, LinkedIn icon. Used on home footer block and contact page. Inline or card variants.
- **`bio-block`** — portrait + name + credentials + bio paragraph + signature image + email + phone + LinkedIn. Alternates photo-left / photo-right via prop. Used on team.
- **`numbered-service-card`** — bordered card with numeric prefix (1–8), service title, prose description. Used on services. Variant accepts an icon.
- **`technical-drawing`** — illustrated drawing tile with caption. Used in services left rail.
- **`project-card`** — hero photo + project name + "See Project" link. Used in portfolio grid (three-column at desktop, single at mobile).
- **`project-media`** — adaptive media slot on portfolio-detail. Takes an array of `[{ type: 'image' | 'video', src, poster?, alt }]`. Behavior:
  - **0 items**: render nothing.
  - **1 item**: occupy the slot directly with `<img>` or `<video>` — no carousel UI.
  - **≥ 2 items**: carousel with prev/next controls. Default to two-up at desktop per audit, single-up at narrow widths.
  Replaces the earlier `project-gallery` name; same slot, different name.
- **`project-metadata`** — labeled metadata lines (Architect, Engineer, General Contractor, Project opened). Used on portfolio-detail.
- **`prev-next-pagination`** — full-width Previous / Next links spanning portfolio-detail footer.
- **`back-link`** — `< Back` link at top of portfolio-detail.
- **`article-card`** — image tile + title + author + summary + bullet takeaways. Alternates side-by-side per row. Used on innovation. Stacks at narrow widths (fix for 320 clip).
- **`three-up-cards`** — three-up card grid: image + heading + blurb. Used on sustainability. Stacks at narrow widths.
- **`cta-band-link`** — `let's work together` strip linking to contact. Used on services.
- **`contact-form`** — name, email, phone, message + submit. Used on home and contact. Netlify Forms.
- **`prose`** — long-form content wrapper for sustainability/about story prose. Constrained measure, brand typography.

### Components removed from earlier draft

The original spec called for generic `hero.njk`, `feature-grid.njk`, `cta-band.njk`, `prose.njk`, `button.njk`, `picture.njk`. Of those:
- **Keep `prose.njk`, `button.njk`, `picture.njk`** — atomic pieces composed by the brand-specific components above.
- **Delete `hero.njk`, `feature-grid.njk`, `cta-band.njk`** — replaced by the brand-specific equivalents that match the actual audited templates.

## Identity Tokens

Add to `tokens-veil` (brand layer) — these are the audit's actually-visible palette and the specific type treatment the existing site uses:

```
--color-veil-ink:        #0b0b0b   (already present — body text, headings)
--color-veil-paper:      #ffffff   (already present — surfaces)
--color-veil-mist:       #f5f5f5   (already present — subtle surface)
--color-veil-stone:      #605e5e   (already present — muted text)
--color-veil-stone-light:#a0a09f   (already present)
--color-veil-tan:        #b0a986   (already present — accent on dark)
--color-veil-rust:       #de5021   (already present — accent for borders/decoration; not text+background AA at body sizes)
--color-veil-pink:       #ed1566   (already present — decorative stroke)
--color-veil-link:       #0000ee   (already present — inline links)
```

Typography: keep the existing site's stack as a guide.
- Display: `'Roboto', 'Roboto Light', ui-sans-serif, system-ui, sans-serif` (already set in tokens-veil).
- Body: `'Roboto', 'Helvetica Neue', Arial, sans-serif` (already set).
- Self-host the fonts under `sites/veil/src/assets/fonts/`. License: Roboto is OFL — safe to self-host. (NCSS uses Avenir; tracked separately in Phase 4.)

Identity utility class (in `packages/components/styles/`):
- `.title-mark` — applies the lowercase + trailing period treatment. The period gets `color: var(--color-accent)` as a small identity touch consistent with the rust used on the live site for stylable buttons. Alternative if contrast or visual hierarchy concerns arise: keep both glyphs in `--color-text-default`.

## File Changes

### New files (revised)

#### Shared component package

| File Path | Purpose |
|---|---|
| `packages/components/package.json` | Already exists; no change. |
| `packages/components/eleventy.config.js` | Already exists; no change. |
| `packages/components/src/split-nav.njk` | Two-row centered nav with responsive disclosure. |
| `packages/components/src/site-footer.njk` | Copyright + LinkedIn; year auto-stamped. |
| `packages/components/src/scroll-cue.njk` | Decorative down-arrow; aria-hidden. |
| `packages/components/src/ruler-strip.njk` | Decorative section divider. |
| `packages/components/src/page-title.njk` | Lowercase + period title. |
| `packages/components/src/hero-overlay.njk` | Full-bleed image/video with overlaid copy. |
| `packages/components/src/hero-blurred.njk` | Home variant with blurred bg + tagline + scroll cue. |
| `packages/components/src/founder-card.njk` | Founder contact card. |
| `packages/components/src/bio-block.njk` | Portrait + bio + signature; left/right variant. |
| `packages/components/src/numbered-service-card.njk` | Bordered card with numeric prefix. |
| `packages/components/src/technical-drawing.njk` | Drawing tile with caption. |
| `packages/components/src/project-card.njk` | Portfolio-grid card. |
| `packages/components/src/project-media.njk` | Adaptive media slot: single image/video, or carousel for ≥ 2. |
| `packages/components/src/project-metadata.njk` | Project metadata lines. |
| `packages/components/src/prev-next-pagination.njk` | Full-width prev/next strip. |
| `packages/components/src/back-link.njk` | `< Back` link. |
| `packages/components/src/article-card.njk` | Image + summary + bullets. |
| `packages/components/src/three-up-cards.njk` | Three-up image card grid. |
| `packages/components/src/cta-band-link.njk` | `let's work together` strip. |
| `packages/components/src/contact-form.njk` | Netlify-Forms-wired form. |
| `packages/components/src/prose.njk` | Already exists; keep. |
| `packages/components/src/button.njk` | Already exists; keep. |
| `packages/components/src/picture.njk` | Already exists; keep. |
| `packages/components/styles/<each>.css` | One per component. |
| `packages/components/styles/index.css` | Aggregator; update order. |
| `packages/components/styles/title-mark.css` | Identity title utility. |
| `packages/components/README.md` | Update with new component contracts. |
| `tools/lint-components.ts` | Already exists; no change. |

#### Veil site layouts (10, not 5)

| File Path | Purpose |
|---|---|
| `sites/veil/src/_includes/layouts/base.njk` | Root layout; `<html data-brand="veil">`, skip-link, split-nav, site-footer. |
| `sites/veil/src/_includes/layouts/home.njk` | hero-blurred → recent projects band → engineered-shading explainer → ruler-strip → inline contact-form → founder-card pair. |
| `sites/veil/src/_includes/layouts/services.njk` | page-title `services.` → side-by-side technical-drawing + numbered-service-card list → cta-band-link. |
| `sites/veil/src/_includes/layouts/about.njk` | hero-overlay (dark photo, `about us.`) → prose (the-story long-form). |
| `sites/veil/src/_includes/layouts/contact.njk` | page-title `contact.` → two-column: founder-card pair left, contact-form right. **Stacks at < 768px.** |
| `sites/veil/src/_includes/layouts/team.njk` | page-title `team.` → bio-block list, alternating photo side. |
| `sites/veil/src/_includes/layouts/innovation.njk` | page-title `innovation.` → article-card list, alternating side; stacks at < 768px. |
| `sites/veil/src/_includes/layouts/sustainability.njk` | Two-column header → prose sections with diagrams → three-up-cards. |
| `sites/veil/src/_includes/layouts/portfolio-grid.njk` | page-title `portfolio.` → project-card grid (3-col → 1-col). |
| `sites/veil/src/_includes/layouts/portfolio-detail.njk` | back-link → page-title `portfolio.` → project intro + metadata → project-media → prev-next-pagination. |

#### Veil content (ported verbatim)

| File Path | Purpose |
|---|---|
| `sites/veil/src/content/index.md` | Home; copy ported from live `/`. |
| `sites/veil/src/content/about.md` | About; copy from `/about`. |
| `sites/veil/src/content/contact.md` | Contact; copy from `/contact`. |
| `sites/veil/src/content/services.md` | Services list + intro; from `/services`. |
| `sites/veil/src/content/team.md` | Team page incl. both founders; from `/team`. |
| `sites/veil/src/content/innovation.md` | Innovation index; from `/innovation`. |
| `sites/veil/src/content/sustainability.md` | Sustainability long-form; from `/sustainability`. |
| `sites/veil/src/content/portfolio/index.md` | Portfolio grid; from `/portfolio-10`. |
| `sites/veil/src/content/portfolio/<slug>.md` × 13 | One per live URL under `/portfolio-1/*`. |
| `sites/veil/src/content/joslyn-art-museum.md` | Permalink `/joslyn-art-museum/`; reuses portfolio-detail layout. |
| `sites/veil/src/_data/site.js` | Global data: nav structure (two rows), social, contacts. |
| `sites/veil/src/_data/projects.js` | Project order for prev/next pagination. |

#### Files to delete (from the earlier wrong build)

| File Path | Why |
|---|---|
| `packages/components/src/hero.njk` | Generic; replaced by `hero-overlay` + `hero-blurred`. |
| `packages/components/src/feature-grid.njk` | Generic; replaced by template-specific layouts. |
| `packages/components/src/cta-band.njk` | Generic; replaced by `cta-band-link`. |
| `packages/components/src/site-header.njk` | Single-row generic; replaced by `split-nav`. |
| `packages/components/styles/hero.css` | (same) |
| `packages/components/styles/feature-grid.css` | (same) |
| `packages/components/styles/cta-band.css` | (same) |
| `packages/components/styles/site-header.css` | (same) |
| `sites/veil/src/content/services/*.md` (the 8 invented service detail pages) | Invented copy; services is a single page on the live site, not 8 detail pages. |
| `sites/veil/src/content/services/services.json` | (same — directory data file for the invented detail pages) |
| `sites/veil/src/_includes/layouts/services-detail.njk` | No corresponding template on the live site. |

#### Shared infrastructure — unchanged from earlier

These were built correctly the first pass; do not touch:

| File Path | Status |
|---|---|
| `auth/cf-worker/index.ts` | Keep. |
| `auth/cf-worker/wrangler.toml` | Keep. |
| `auth/cf-worker/package.json` | Keep. |
| `auth/cf-worker/index.test.ts` | Keep. |
| `scripts/a11y-check.ts` | Keep. |
| `scripts/two-brand-smoke.ts` | Keep. |
| `.github/workflows/ci.yml` | Keep. |
| `docs/cms-decision.md` | Keep. |
| `docs/stack-decision.md` | Keep. |
| `docs/launch-runbook-veil.md` | Keep. |
| `tools/lint-components.ts` | Keep. |
| `packages/tokens-base/config/aliases.ts` additions (`--measure-*`, `--leading-*`, `--target-size-min`) | Keep. |
| `sites/veil/netlify.toml` | Keep. |
| `sites/veil/.eleventy.js` | Keep, but extend with collections for `projects`, `articles`. |
| `sites/veil/src/admin/index.html` | Keep. |
| `sites/veil/src/admin/config.yml` | **Rewrite** — collection shape must match the brand-specific frontmatter, not the generic shape currently in place. |

### Modified files

| File Path | Changes |
|---|---|
| `sites/veil/.eleventy.js` | Add collections: `projects` (portfolio-detail), `articles` (innovation). |
| `sites/veil/src/admin/config.yml` | Replace generic-shape collections with collections per template. |
| `sites/veil/src/_data/site.js` | Replace single-row nav with two-row split-nav structure. |
| `sites/veil/src/styles/site.css` | Drop contact-form rules (moves into the component); keep imports. |

### Deleted files

See "Files to delete" above.

## Implementation Details

### Title treatment

Lowercase + trailing period is identity, not decoration. Implementation:

```njk
{# packages/components/src/page-title.njk #}
{# Expects: pageTitle = { text: 'about us', as?: 'h1' | 'h2' } #}
{% set _tag = pageTitle.as or 'h1' %}
<{{ _tag }} class="title-mark">
  <span class="title-mark__text">{{ pageTitle.text }}</span><span class="title-mark__dot">.</span>
</{{ _tag }}>
```

CSS lives in `title-mark.css`. The `.title-mark__text` enforces lowercase via `text-transform: lowercase` so authors can write `About Us` in CMS and the identity treatment is enforced in code, not in data.

### Split nav (responsive disclosure)

The existing site uses two literal rows of links (top: portfolio, services, innovation, sustainability; bottom: team, about, contact). At narrow widths this layout fails — links clip on both sides.

Approach: keep the two-row composition at desktop. Below 768px, collapse to a single button + disclosure panel. No JavaScript dependency for static rendering; use `<details>`/`<summary>` for the disclosure to keep the page functional with JS disabled.

```njk
{# packages/components/src/split-nav.njk #}
<header class="split-nav" data-component="split-nav">
  <div class="split-nav__inner">
    <a class="split-nav__brand" href="/" aria-label="{{ site.name }} — home">
      <span class="split-nav__wordmark">{{ site.name }}</span>
    </a>
    <details class="split-nav__disclosure">
      <summary class="split-nav__toggle" aria-label="Toggle menu">Menu</summary>
      <nav class="split-nav__nav" aria-label="Primary">
        <ul class="split-nav__row">
          {% for item in site.nav.primary %}
            <li><a href="{{ item.href }}"{% if item.href == page.url %} aria-current="page"{% endif %}>{{ item.label }}</a></li>
          {% endfor %}
        </ul>
        <ul class="split-nav__row">
          {% for item in site.nav.secondary %}
            <li><a href="{{ item.href }}"{% if item.href == page.url %} aria-current="page"{% endif %}>{{ item.label }}</a></li>
          {% endfor %}
        </ul>
      </nav>
    </details>
  </div>
</header>
```

CSS uses `@media (min-width: 768px)` to surface the nav inline and hide the `<summary>` toggle.

### Contact layout (worst responsive failure on the live site)

The live site renders two columns side-by-side even at 320, pushing the form off-screen. Fix: stack below 768px.

```css
.contact-page__grid {
  display: grid;
  gap: var(--space-l);
  grid-template-columns: 1fr;
}
@media (min-width: 768px) {
  .contact-page__grid { grid-template-columns: 1fr 1fr; }
}
```

### Innovation cards (worst responsive failure on the live site)

Article cards alternate image-left / image-right at desktop and **must** stack vertically below 768px. Audit observed truncated `Healthcare` and `Roller Shad` text — that is the bug to fix.

```css
.article-card { display: grid; gap: var(--space-m); }
@media (min-width: 768px) {
  .article-card { grid-template-columns: 1fr 1fr; }
  .article-card--reverse { grid-template-columns: 1fr 1fr; }
  .article-card--reverse .article-card__media { order: 2; }
}
```

### Sustainability two-up header

Live site renders side-by-side even at 320, both columns near-unreadable. Fix: stack below 768px. Same pattern as contact.

### Services left-rail drawing

Live site renders the drawing **above** the numbered list at narrow widths instead of beside; per audit observation this is the intended responsive behavior but only triggered at very narrow widths. Codify it: side-by-side at ≥ 1024px, stacked below.

```css
.services-page__grid { display: grid; gap: var(--space-l); grid-template-columns: 1fr; }
@media (min-width: 1024px) {
  .services-page__grid { grid-template-columns: minmax(auto, 24rem) 1fr; align-items: start; }
}
```

### Content port

For each live URL listed under "Templates to Ship," fetch the page via WebFetch and extract:

- `title` (the lowercased visible heading, not `<title>`)
- Visible body copy as markdown (preserve `<h2>`/`<h3>` hierarchy and paragraph breaks; do not summarize)
- Inline links with their actual href values
- Image references (use the live Wix CDN URL in markdown for now; mark for swap to self-hosted in Phase 3.5)
- Per-page-type extras: services list items (1–8 in order), founder cards (name/email/phone), project metadata, prev/next pagination order, etc.

Port script: a one-off Node script (`scripts/port-content.ts`) walks each URL, parses the rendered DOM, and writes markdown frontmatter that matches each layout's contract. Re-runnable.

The lint rule still applies: components cannot mention `veil` or `ncss` in source. Content markdown is exempt (it's content, not code).

### Motion handling (per `recommendations.md` #12)

The home hero is a video/GIF on the live site; we capture it as motion. `hero-blurred` and `hero-overlay` accept either:

- `image: { src, alt }` — still image, renders `<img>` (default).
- `video: { src, poster, alt }` — renders `<video autoplay muted playsinline loop>` with `poster` fallback and `prefers-reduced-motion: reduce` to display the poster only.

```njk
{% if hero.video %}
  <video autoplay muted playsinline loop poster="{{ hero.video.poster }}" aria-label="{{ hero.video.alt }}">
    <source src="{{ hero.video.src }}" type="video/mp4" />
  </video>
{% else %}
  <img src="{{ hero.image.src }}" alt="{{ hero.image.alt }}" loading="eager" decoding="async" />
{% endif %}
```

CSS:

```css
@media (prefers-reduced-motion: reduce) {
  [data-component="hero-blurred"] video,
  [data-component="hero-overlay"] video {
    display: none;
  }
}
```

### Year auto-stamp (per `recommendations.md` punch list)

`site-footer.njk` computes the year at build time:

```njk
{# expects nothing — derives year from Date #}
<footer class="site-footer">
  <p class="site-footer__copyright">© {% year %} {{ site.name }}. All rights reserved.</p>
  ...
</footer>
```

`{% year %}` is a Nunjucks shortcode in `.eleventy.js` returning `new Date().getFullYear()`.

## Acceptance criteria (per template)

Each layout PR is acceptable iff:

1. Content matches the live site verbatim (no invented copy; no removed copy).
2. Renders at 320 / 768 / 1024 / 1440 with no horizontal scroll, no clipped text, no off-viewport content.
3. The specific responsive failure called out in `templates.md` for that template is fixed.
4. axe-core reports zero critical/serious violations against the rendered page.
5. Tabbing through the page produces a sane focus order, visible focus indicator on every interactive control.
6. With JavaScript disabled, the page still works (navigation, form submit, all internal links).
7. Two-brand smoke (Veil page rendered with NCSS brand layer) passes axe-core.

## Validation

Reuse the validation scaffolding from the earlier build pass:

```bash
pnpm install
pnpm -r run typecheck
pnpm -r run lint
pnpm exec tsx tools/lint-components.ts
pnpm -r run test
pnpm -r --filter "./packages/**" run build
pnpm --filter @veil-ncss/site-veil run build
pnpm exec tsx scripts/a11y-check.ts sites/veil/_site
pnpm exec tsx scripts/two-brand-smoke.ts
```

CI workflow `.github/workflows/ci.yml` already wires all of the above.

## Open items

- [ ] Confirm WebFetch is acceptable for content port, vs. you providing a content dump.
- [ ] Confirm Roboto self-hosting is fine (recommendation #2 suggested choosing one display + one body face, and offered alternatives; existing site uses Roboto family).
- [ ] Identify motion assets to keep (home hero video, RTG Medical project tile, sustainability bg). Inventory per `recommendations.md` #12.
- [ ] Old-URL redirect map: `templates.md` URL list is the source. `/portfolio-1/<slug>` is the existing structure — preserve.
- [ ] Identity touch on `.title-mark__dot`: rust period vs. ink period. Rust is on-brand but creates a small contrast checkpoint at the largest title sizes; ink preserves identity treatment without that risk. Default to rust; flag if any specific page requires AA at large sizes.

---

*Revised against `templates.md` and `recommendations.md`. Ready for execution.*
