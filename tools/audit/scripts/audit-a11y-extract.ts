import { parseColor, contrastRatio } from '../lib/color.ts';

export interface ContrastDetail {
  fg: string;
  bg: string;
  ratio: number;
  required: number;
}

export function extractContrast(message: string): ContrastDetail | undefined {
  const ratioMatch = message.match(/contrast (?:ratio )?of ([\d.]+)/i);
  const fgMatch = message.match(/foreground colou?r:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\))/i);
  const bgMatch = message.match(/background colou?r:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\))/i);
  const expectedMatch = message.match(/[Ee]xpected contrast ratio of ([\d.]+)/);
  if (!ratioMatch || !fgMatch || !bgMatch) return undefined;
  const ratio = Number(ratioMatch[1]);
  const required = expectedMatch && expectedMatch[1] ? Number(expectedMatch[1]) : 4.5;
  let computedRatio = ratio;
  if (Number.isNaN(computedRatio)) {
    const fg = parseColor(fgMatch[1]!);
    const bg = parseColor(bgMatch[1]!);
    if (fg && bg) computedRatio = contrastRatio(fg, bg);
  }
  return {
    fg: fgMatch[1]!.toLowerCase(),
    bg: bgMatch[1]!.toLowerCase(),
    ratio: Number(computedRatio.toFixed(2)),
    required,
  };
}
