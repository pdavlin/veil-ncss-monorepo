/**
 * NCSS web font config — Archivo (body, via Google Fonts <link> in base.njk)
 * + PP Neue Corp Narrow Ultrabold (display, self-hosted).
 *
 * NOTE: PP Neue Corp is Pangram Pangram commercial — self-hosting requires a
 * current Pangram Pangram license held by NCSS. Source .otf lives in fonts/.
 */

export interface FontFace {
  family: string;
  file: string;
  weight: number;
  style: 'normal' | 'italic';
  display?: 'swap' | 'fallback' | 'optional' | 'block' | 'auto';
}

export const bodyFamily = 'Archivo';
export const displayFamily = 'PP Neue Corp Narrow';

export const faces: FontFace[] = [
  { family: displayFamily, file: 'PPNeueCorp-NarrowUltrabold.otf', weight: 800, style: 'normal' },
];

export const bodyStack = `"${bodyFamily}", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
export const displayStack = `"${displayFamily}", "${bodyFamily}", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
