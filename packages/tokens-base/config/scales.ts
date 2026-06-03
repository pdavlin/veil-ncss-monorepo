import type { FluidTypeConfig, FluidSpaceConfig } from '@veil-ncss/tokens-shared/utopia';

export const VIEWPORT = { min: 320, max: 1440 } as const;

export const typeConfig: FluidTypeConfig = {
  minWidth: VIEWPORT.min,
  maxWidth: VIEWPORT.max,
  minFontSize: 16,
  maxFontSize: 19,
  minTypeScale: 1.2,
  maxTypeScale: 1.333,
  positiveSteps: 5,
  negativeSteps: 2,
};

export const spaceConfig: FluidSpaceConfig = {
  minWidth: VIEWPORT.min,
  maxWidth: VIEWPORT.max,
  minSize: 16,
  maxSize: 19,
  positiveSteps: [1.5, 2, 3, 4, 6, 8],
  negativeSteps: [0.75, 0.5, 0.25],
};

export const breakpoints: Record<string, string> = {
  '--bp-sm': '480px',
  '--bp-md': '768px',
  '--bp-lg': '1024px',
  '--bp-xl': '1280px',
  '--bp-2xl': '1440px',
};

export const radii: Record<string, string> = {
  '--radius-none': '0',
  '--radius-xs': '2px',
  '--radius-s': '4px',
  '--radius-m': '8px',
  '--radius-l': '12px',
  '--radius-xl': '20px',
  '--radius-pill': '999px',
  '--radius-circle': '50%',
};

export const shadows: Record<string, string> = {
  '--shadow-xs': '0 1px 2px rgba(0, 0, 0, 0.04)',
  '--shadow-s': '0 2px 4px rgba(0, 0, 0, 0.06)',
  '--shadow-m': '0 4px 12px rgba(0, 0, 0, 0.08)',
  '--shadow-l': '0 10px 30px rgba(0, 0, 0, 0.10)',
};

export const motion: Record<string, string> = {
  '--motion-duration-fast': '120ms',
  '--motion-duration-base': '200ms',
  '--motion-duration-slow': '320ms',
  '--motion-ease-standard': 'cubic-bezier(0.2, 0, 0, 1)',
  '--motion-ease-emphasized': 'cubic-bezier(0.3, 0, 0, 1)',
};
