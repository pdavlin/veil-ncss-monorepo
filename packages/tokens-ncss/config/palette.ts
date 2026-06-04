import { bodyStack, displayStack } from './fonts.js';

export interface PairingDecl {
  role: string;
  fg: string;
  bg: string;
  large?: boolean;
}

/**
 * STUB palette for NCSS — Phase 2 only proves the brand-swap works. Phase 4 replaces colors.
 * Fonts (Avenir Next World) are real and wired up; colors remain placeholders.
 */
export const palette: Record<string, string> = {
  '--color-ncss-ink': '#101010',
  '--color-ncss-deep': '#1f3a2a',
  '--color-ncss-paper': '#ffffff',
  '--color-ncss-light': '#eef2ec',
  '--color-ncss-stone': '#52615a',
  '--color-ncss-accent': '#05674C',
  '--color-ncss-link': '#0033cc',
};

// --font-mono is deliberately not overridden — Avenir Next World isn't monospaced.
// Falls through to tokens-base's system mono stack.
export const aliasMap: Record<string, string> = {
  '--color-surface-default': 'var(--color-ncss-paper)',
  '--color-surface-brand': 'var(--color-ncss-deep)',
  '--color-surface-muted': 'var(--color-ncss-light)',
  '--color-text-default': 'var(--color-ncss-ink)',
  '--color-text-muted': 'var(--color-ncss-stone)',
  '--color-text-on-brand': 'var(--color-ncss-paper)',
  '--color-border-subtle': 'var(--color-ncss-light)',
  '--color-border-strong': 'var(--color-ncss-stone)',
  '--color-accent': 'var(--color-ncss-accent)',
  '--color-link': 'var(--color-ncss-link)',
  '--font-sans': bodyStack,
  '--font-display': displayStack,
};

// Documented role pairings; build asserts AA. Phase 4 will revisit when real
// brand colors land, but the role set should stay stable so component code
// doesn't need to know which brand is active.
export const pairings: PairingDecl[] = [
  { role: 'body text on default surface', fg: '#101010', bg: '#ffffff' },
  { role: 'body text on muted surface', fg: '#101010', bg: '#eef2ec' },
  { role: 'muted text on default surface', fg: '#52615a', bg: '#ffffff' },
  { role: 'text on brand surface', fg: '#ffffff', bg: '#1f3a2a' },
  { role: 'accent on default surface', fg: '#05674C', bg: '#ffffff', large: true },
  { role: 'link on default surface', fg: '#0033cc', bg: '#ffffff' },
];
