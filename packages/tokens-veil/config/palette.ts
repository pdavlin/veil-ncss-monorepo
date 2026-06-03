/**
 * Veil palette — curated from Phase 1's tokens.clusters.json on www.veilengineering.com.
 * Names follow Phase 1's clustering (representative hex). Brand layer maps these to aliases.
 */
export const palette: Record<string, string> = {
  '--color-veil-ink': '#0b0b0b',
  '--color-veil-paper': '#ffffff',
  '--color-veil-mist': '#f5f5f5',
  '--color-veil-stone': '#605e5e',
  '--color-veil-stone-light': '#a0a09f',
  '--color-veil-tan': '#b0a986',
  '--color-veil-rust': '#de5021',
  '--color-veil-pink': '#ed1566',
  '--color-veil-link': '#0000ee',
};

export const fonts = {
  display: "'Roboto', 'Roboto Light', ui-sans-serif, system-ui, sans-serif",
  body: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
  mono: "ui-monospace, SFMono-Regular, 'Menlo', monospace",
};

/**
 * Maps semantic aliases to brand palette tokens.
 * Right-hand side is a CSS expression — typically `var(--color-veil-*)` or a literal hex.
 */
export const aliasMap: Record<string, string> = {
  '--color-surface-default': 'var(--color-veil-paper)',
  '--color-surface-brand': 'var(--color-veil-ink)',
  '--color-surface-muted': 'var(--color-veil-mist)',
  '--color-text-default': 'var(--color-veil-ink)',
  '--color-text-muted': 'var(--color-veil-stone)',
  '--color-text-on-brand': 'var(--color-veil-paper)',
  '--color-border-subtle': 'var(--color-veil-mist)',
  '--color-border-strong': 'var(--color-veil-stone)',
  '--color-divider': 'var(--color-veil-stone-light)',
  '--color-accent': 'var(--color-veil-rust)',
  '--color-link': 'var(--color-veil-link)',
  '--font-sans': fonts.body,
  '--font-display': fonts.display,
  '--font-mono': fonts.mono,
};

/**
 * Documented color pairings the design system promises to keep accessible.
 * Each pair must pass WCAG 2.2 AA after contrast resolution. The build fails otherwise.
 *
 * `fg` and `bg` are *concrete* hex values (resolved from palette), since contrast math
 * needs literal colors, not CSS variable references.
 */
export interface PairingDecl {
  role: string;
  fg: string;
  bg: string;
  large?: boolean;
}

export const pairings: PairingDecl[] = [
  { role: 'body text on default surface', fg: '#0b0b0b', bg: '#ffffff' },
  { role: 'body text on muted surface', fg: '#0b0b0b', bg: '#f5f5f5' },
  { role: 'muted text on default surface', fg: '#605e5e', bg: '#ffffff' },
  { role: 'text on brand surface', fg: '#ffffff', bg: '#0b0b0b' },
  { role: 'accent on default surface', fg: '#de5021', bg: '#ffffff', large: true },
  { role: 'link on default surface', fg: '#0000ee', bg: '#ffffff' },
  { role: 'tan accent on brand', fg: '#b0a986', bg: '#0b0b0b', large: true },
];
