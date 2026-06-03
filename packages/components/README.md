# @veil-ncss/components

Brand-agnostic Nunjucks includes and scoped CSS shared by every site in this monorepo.

## Rules

- Reference only semantic aliases from `@veil-ncss/tokens-base`.
- Never hardcode hex/rgb/hsl colors or px/rem literals. Lint enforces this.
- Never reference brand strings (`veil`, `ncss`) in source. Lint enforces this.
- Pass content through data; never embed brand copy.

## Consumption

A site registers the component package in its Eleventy config:

```javascript
import { registerComponents } from '@veil-ncss/components';

export default function (eleventyConfig) {
  registerComponents(eleventyConfig);
  // ...
}
```

This copies component CSS into `_site/styles/components/` and exposes a `componentRoot` global. Add the package's `src` directory to your Eleventy `_includes` path so `{% include "components/<name>.njk" %}` resolves; the site's `.eleventy.js` does this via the `includes` dir option.

The site stylesheet imports tokens first, then component styles:

```css
@import "tokens-base/index.css";
@import "tokens-veil/index.css";  /* brand layer */
@import "components/index.css";
```

## Components

### `site-header.njk`

```
site = {
  name: string,
  tagline?: string,
  nav: [{ label, href }],
}
```

### `site-footer.njk`

```
site = {
  name: string,
  footer: { copyright, links?: [{ label, href }] },
  social?: [{ label, href }],
}
```

### `hero.njk`

```
hero = {
  eyebrow?: string,
  heading: string,
  body?: string,      // HTML allowed (safe-piped)
  primaryCta?:   { label, href },
  secondaryCta?: { label, href },
  image?:        { src, alt },
}
```

### `feature-grid.njk`

```
featureGrid = {
  heading?: string,
  intro?:   string,   // HTML
  items:    [{ title, body, href? }],
}
```

### `cta-band.njk`

```
ctaBand = {
  heading: string,
  body?:   string,    // HTML
  cta:     { label, href },
}
```

### `prose.njk`

```
prose = {
  eyebrow?: string,
  heading?: string,
  body?:    string,   // HTML; falls back to Eleventy `content`
}
```

### `button.njk`

```
button = {
  label: string,
  href?: string,                     // if set, renders <a>
  type?: 'button' | 'submit',
  variant?: 'primary' | 'ghost' | 'link',
  ariaLabel?: string,
}
```

### `picture.njk`

```
picture = {
  src: string,
  alt: string,
  sizes?: string,
  loading?: 'lazy' | 'eager',
  sources?: [{ srcset, type }],
}
```

## Two-Brand Smoke Test

`scripts/two-brand-smoke.ts` renders a representative page with the NCSS-stub brand layer swapped in. Any component that references a brand-specific token, asset, or string will surface there.
