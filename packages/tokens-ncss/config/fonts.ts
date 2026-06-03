/**
 * NCSS web font config. Source files live in `packages/tokens-ncss/fonts/`,
 * copied to `dist/fonts/` by the build. CSS refs are relative to `dist/index.css`.
 *
 * NOTE: Avenir Next World is Linotype/Monotype proprietary. Self-hosting requires
 * a current Monotype web font license held by NCSS. See LICENSE-NOTES.md.
 */

export interface FontFace {
  family: string;
  file: string;
  weight: number;
  style: 'normal' | 'italic';
  display?: 'swap' | 'fallback' | 'optional' | 'block' | 'auto';
}

export const family = 'Avenir Next World';

export const faces: FontFace[] = [
  { family, file: 'AvenirNextWorld-Thin.woff2', weight: 100, style: 'normal' },
  { family, file: 'AvenirNextWorld-ThinIt.woff2', weight: 100, style: 'italic' },
  { family, file: 'AvenirNextWorld-Regular.woff2', weight: 400, style: 'normal' },
  { family, file: 'AvenirNextWorld-Italic.woff2', weight: 400, style: 'italic' },
  { family, file: 'AvenirNextWorld-Demi.woff2', weight: 600, style: 'normal' },
  { family, file: 'AvenirNextWorld-DemiIt.woff2', weight: 600, style: 'italic' },
  { family, file: 'AvenirNextWorld-Bold.woff2', weight: 700, style: 'normal' },
  { family, file: 'AvenirNextWorld-BoldIt.woff2', weight: 700, style: 'italic' },
];

export const fontStack = `"${family}", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
