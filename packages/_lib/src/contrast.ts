import { parse, formatHex, oklch, converter } from 'culori';

export type Hex = string;

export interface FailingPair {
  pairKey: string;
  fg: Hex;
  bg: Hex;
  role: string;
  large?: boolean;
}

export interface ColorOverrides {
  lockedBackgrounds: Hex[];
  lockedForegrounds: Hex[];
}

export type ResolveStrategy =
  | 'adjust-fg'
  | 'adjust-bg'
  | 'manual-override'
  | 'no-change-needed';

export interface ContrastDecision {
  pairKey: string;
  role: string;
  fgOriginal: Hex;
  fgAdjusted: Hex;
  bgOriginal: Hex;
  bgAdjusted: Hex;
  ratioOriginal: number;
  ratioAdjusted: number;
  strategy: ResolveStrategy;
  rationale: string;
  large: boolean;
}

const toOklch = converter('oklch');

function relativeLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminanceOf(hex: Hex): number {
  const parsed = parse(hex);
  if (!parsed) throw new Error(`unparseable color: ${hex}`);
  const rgb = converter('rgb')(parsed);
  if (!rgb) throw new Error(`failed to convert to rgb: ${hex}`);
  const r = relativeLuminance(Math.round((rgb.r ?? 0) * 255));
  const g = relativeLuminance(Math.round((rgb.g ?? 0) * 255));
  const b = relativeLuminance(Math.round((rgb.b ?? 0) * 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: Hex, bg: Hex): number {
  const L1 = luminanceOf(fg);
  const L2 = luminanceOf(bg);
  const [lighter, darker] = L1 >= L2 ? [L1, L2] : [L2, L1];
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsAA(ratio: number, large: boolean): boolean {
  return ratio >= (large ? 3 : 4.5);
}

interface AdjustOptions {
  target: number;
  maxIterations?: number;
  step?: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function adjustLightness(color: Hex, towards: 'darker' | 'lighter', amount: number): Hex {
  const lab = toOklch(parse(color)!);
  if (!lab) throw new Error(`failed oklch conversion: ${color}`);
  const delta = towards === 'darker' ? -amount : amount;
  const next = { ...lab, l: clamp((lab.l ?? 0) + delta, 0, 1) };
  const hex = formatHex(next);
  if (!hex) throw new Error(`formatHex failed for ${JSON.stringify(next)}`);
  return hex;
}

function adjustUntilPass(
  baseFg: Hex,
  baseBg: Hex,
  which: 'fg' | 'bg',
  opts: AdjustOptions,
): { color: Hex; ratio: number; iterations: number } {
  const step = opts.step ?? 0.02;
  const maxIterations = opts.maxIterations ?? 60;
  const targetColor = which === 'fg' ? baseFg : baseBg;
  const other = which === 'fg' ? baseBg : baseFg;
  const otherLum = luminanceOf(other);
  const direction: 'darker' | 'lighter' = otherLum > 0.5 ? 'darker' : 'lighter';

  let current = targetColor;
  let ratio = contrastRatio(which === 'fg' ? current : baseFg, which === 'fg' ? baseBg : current);
  for (let i = 1; i <= maxIterations; i++) {
    if (ratio >= opts.target) {
      return { color: current, ratio, iterations: i - 1 };
    }
    current = adjustLightness(current, direction, step);
    ratio = contrastRatio(
      which === 'fg' ? current : baseFg,
      which === 'fg' ? baseBg : current,
    );
  }
  return { color: current, ratio, iterations: maxIterations };
}

export function resolve(pair: FailingPair, overrides: ColorOverrides): ContrastDecision {
  const large = pair.large ?? false;
  const target = large ? 3 : 4.5;
  const originalRatio = contrastRatio(pair.fg, pair.bg);

  if (meetsAA(originalRatio, large)) {
    return {
      pairKey: pair.pairKey,
      role: pair.role,
      fgOriginal: pair.fg,
      fgAdjusted: pair.fg,
      bgOriginal: pair.bg,
      bgAdjusted: pair.bg,
      ratioOriginal: originalRatio,
      ratioAdjusted: originalRatio,
      strategy: 'no-change-needed',
      rationale: `pair already meets AA (ratio ${originalRatio.toFixed(2)})`,
      large,
    };
  }

  const fgLocked = overrides.lockedForegrounds.includes(pair.fg.toLowerCase());
  const bgLocked = overrides.lockedBackgrounds.includes(pair.bg.toLowerCase());

  if (fgLocked && bgLocked) {
    return {
      pairKey: pair.pairKey,
      role: pair.role,
      fgOriginal: pair.fg,
      fgAdjusted: pair.fg,
      bgOriginal: pair.bg,
      bgAdjusted: pair.bg,
      ratioOriginal: originalRatio,
      ratioAdjusted: originalRatio,
      strategy: 'manual-override',
      rationale: 'both fg and bg locked by override config; needs manual designer decision',
      large,
    };
  }

  const adjust = fgLocked ? 'bg' : 'fg';
  const result = adjustUntilPass(pair.fg, pair.bg, adjust, { target });

  if (!meetsAA(result.ratio, large)) {
    return {
      pairKey: pair.pairKey,
      role: pair.role,
      fgOriginal: pair.fg,
      fgAdjusted: adjust === 'fg' ? result.color : pair.fg,
      bgOriginal: pair.bg,
      bgAdjusted: adjust === 'bg' ? result.color : pair.bg,
      ratioOriginal: originalRatio,
      ratioAdjusted: result.ratio,
      strategy: 'manual-override',
      rationale: `automated adjustment could not reach ${target}:1 within iteration budget (got ${result.ratio.toFixed(2)})`,
      large,
    };
  }

  return {
    pairKey: pair.pairKey,
    role: pair.role,
    fgOriginal: pair.fg,
    fgAdjusted: adjust === 'fg' ? result.color : pair.fg,
    bgOriginal: pair.bg,
    bgAdjusted: adjust === 'bg' ? result.color : pair.bg,
    ratioOriginal: originalRatio,
    ratioAdjusted: result.ratio,
    strategy: adjust === 'fg' ? 'adjust-fg' : 'adjust-bg',
    rationale:
      adjust === 'fg'
        ? `foreground shifted toward higher contrast in OKLCH to meet ${target}:1`
        : `background shifted toward higher contrast in OKLCH (fg was locked) to meet ${target}:1`,
    large,
  };
}
