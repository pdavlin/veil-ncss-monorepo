# Stack decision — Eleventy 3.x kept

## What we picked

**Eleventy 3.x** with Nunjucks templates for both sites, consuming a shared Nunjucks include set in `packages/components`.

## What was considered

| Option | Why pass |
| --- | --- |
| **Eleventy 3** (picked) | Mature, minimal, ESM-first, fast cold builds, no client JS by default. Component model is just Nunjucks includes — interoperates perfectly with our shared brand-agnostic include set. |
| **Astro** | More features than we need: islands, JSX components, content collections. Adds tooling complexity and a build dependency we have to keep current. Component reuse across sites would require an Astro package layer. |
| **Hugo** | Fast, single binary. But the template language is Go-flavored and we want to keep tooling within the JS/TS workspace. Component package would have to be Hugo partials, which doesn't help if a future site wants React or Astro. |

## Rationale

- We have no requirement for client-side interactivity beyond a contact form, which Netlify Forms handles without JS.
- Shared brand-agnostic components must be expressible in plain templates. Nunjucks gives us that with no compile step.
- The site is a small set of marketing pages; Astro and Hugo are over-spec'd for the load.
- Eleventy 3 ships with `@11ty/eleventy-img` for responsive picture generation, covering FR-3.16 with no extra integration work.

## When to revisit

- A page needs real client-side interactivity (e.g. filterable portfolio, multi-step quote tool). Solution candidates: islands via Astro, or an Eleventy build of a small Lit/web-component bundle.
- Build time on Netlify free tier becomes a constraint at content scale.
- We start needing typed data sources beyond markdown frontmatter (Contentful, headless WP).
