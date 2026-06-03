# @veil-ncss/tokens-base

Brand-agnostic design tokens: fluid type scale, fluid space scale, semantic aliases (with fallback values), breakpoints, radii, shadows, motion, and a modern CSS reset.

## Layer model

```css
@layer reset, tokens, base, components, utilities;
```

`tokens-base/dist/index.css` declares the layer order. Brand layers (`tokens-veil`, `tokens-ncss`) emit selectors into the `tokens` layer and override the alias values declared here.

## Alias contract

Aliases are the only color/font surface that components should reach for. Brand layers MAY override aliases; they MUST NOT add new aliases. To extend the contract, edit `config/aliases.ts` and rebuild.

| Alias | Purpose |
|---|---|
| `--color-surface-default` | Page and card surfaces |
| `--color-surface-brand` | Brand-filled surface |
| `--color-surface-muted` | Low-emphasis surface |
| `--color-text-default` | Primary body text |
| `--color-text-muted` | Secondary text |
| `--color-text-on-brand` | Text on brand surface |
| `--color-border-subtle` | Hairlines |
| `--color-border-strong` | Emphasized borders |
| `--color-accent` | Interactive accent |
| `--color-link` | Inline link text |
| `--font-sans` | Body stack |
| `--font-display` | Heading face |
| `--font-mono` | Code |
| `--text-body` / `--text-lead` / `--text-display` | Semantic type sizes |
| `--space-section` / `--space-block` / `--space-inline` | Semantic spacing |

## Generated files

Run `pnpm --filter @veil-ncss/tokens-base build`. Outputs land in `dist/`.

- `index.css` — entry, declares layer order, imports the rest.
- `reset.css` — modern CSS reset.
- `scales.css` — fluid type + space scales (clamp).
- `aliases.css` — semantic aliases with fallbacks.
- `misc.css` — breakpoints, radii, shadows, motion.
- `model.json` — machine-readable copy of the token model.
