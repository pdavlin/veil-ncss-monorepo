export interface AliasDecl {
  fallback: string;
  description: string;
}

export const aliases: Record<string, AliasDecl> = {
  '--color-surface-default': {
    fallback: '#ffffff',
    description: 'Page and card surfaces in the default (neutral) state.',
  },
  '--color-surface-brand': {
    fallback: '#555555',
    description: 'Surface filled with the brand color. Brand layers override.',
  },
  '--color-surface-muted': {
    fallback: '#f5f5f5',
    description: 'Subtle, low-emphasis surface (e.g. dividers, light fills).',
  },
  '--color-text-default': {
    fallback: '#111111',
    description: 'Primary body text on default surface.',
  },
  '--color-text-muted': {
    fallback: '#555555',
    description: 'Secondary text; metadata and captions.',
  },
  '--color-text-on-brand': {
    fallback: '#ffffff',
    description: 'Text drawn on top of --color-surface-brand. Must pass AA after brand override.',
  },
  '--color-border-subtle': {
    fallback: '#e5e5e5',
    description: 'Hairline borders, separators.',
  },
  '--color-border-strong': {
    fallback: '#999999',
    description: 'Emphasised borders and focus rings.',
  },
  '--color-divider': {
    fallback: '#a0a09f',
    description: 'Chunky section divider (e.g. header bottom band). Medium gray between subtle and strong.',
  },
  '--color-accent': {
    fallback: '#2f6fa1',
    description: 'Brand accent for highlights and interactive states.',
  },
  '--color-accent-text': {
    fallback: '#1f4e7a',
    description: 'Accent used for body-sized text on a light surface. Darkened so WCAG 2 AA contrast (4.5:1) holds for small text — the standard --color-accent is tuned for graphical and large-text use.',
  },
  '--color-link': {
    fallback: '#1056b3',
    description: 'Inline link text.',
  },
  '--font-sans': {
    fallback: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    description: 'Default UI / body stack.',
  },
  '--font-display': {
    fallback: 'var(--font-sans)',
    description: 'Display / heading face. Brand layers override.',
  },
  '--font-mono': {
    fallback: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace',
    description: 'Code, technical labels.',
  },
  '--text-body': {
    fallback: 'var(--text-step-0)',
    description: 'Body copy size.',
  },
  '--text-lead': {
    fallback: 'var(--text-step-1)',
    description: 'Lead paragraph size.',
  },
  '--text-display': {
    fallback: 'var(--text-step-4)',
    description: 'Largest display heading.',
  },
  '--space-section': {
    fallback: 'var(--space-2xl)',
    description: 'Vertical spacing between page sections.',
  },
  '--space-block': {
    fallback: 'var(--space-l)',
    description: 'Spacing between blocks within a section.',
  },
  '--space-inline': {
    fallback: 'var(--space-s)',
    description: 'Inline gap between siblings.',
  },
  '--measure-prose': {
    fallback: '65ch',
    description: 'Max inline-size for readable long-form prose.',
  },
  '--measure-container': {
    fallback: '72rem',
    description: 'Max inline-size for page-level containers.',
  },
  '--measure-narrow': {
    fallback: '48rem',
    description: 'Max inline-size for narrow content (e.g. centred hero copy).',
  },
  '--measure-card-min': {
    fallback: '18rem',
    description: 'Minimum inline-size for an auto-fit grid card.',
  },
  '--leading-tight': {
    fallback: '1.15',
    description: 'Line-height for display and large headings.',
  },
  '--leading-snug': {
    fallback: '1.3',
    description: 'Line-height for small headings and labels.',
  },
  '--target-size-min': {
    fallback: '24px',
    description: 'Minimum interactive target size (WCAG 2.2 AA, 2.5.8).',
  },
};
