export interface Hsl {
  h: number;
  s: number;
  l: number;
  a: number;
}

export function parseColor(value: string): Hsl | null {
  const trimmed = value.trim().toLowerCase();
  let m = trimmed.match(/^rgba?\(([^)]+)\)$/);
  if (m && m[1]) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean);
    const r = Number(parts[0]);
    const g = Number(parts[1]);
    const b = Number(parts[2]);
    const a = parts[3] === undefined ? 1 : Number(parts[3]);
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
    return rgbToHsl(r, g, b, a);
  }
  m = trimmed.match(/^#([0-9a-f]{3,8})$/);
  if (m && m[1]) {
    const hex = m[1];
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 1;
    if (hex.length === 3) {
      r = parseInt(hex[0]! + hex[0], 16);
      g = parseInt(hex[1]! + hex[1], 16);
      b = parseInt(hex[2]! + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      a = parseInt(hex.slice(6, 8), 16) / 255;
    } else {
      return null;
    }
    return rgbToHsl(r, g, b, a);
  }
  return null;
}

export function rgbToHsl(r: number, g: number, b: number, a = 1): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, l, a };
}

export function hslToRgb({ h, s, l }: Hsl): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hueToRgb = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(hueToRgb(h + 1 / 3) * 255),
    g: Math.round(hueToRgb(h) * 255),
    b: Math.round(hueToRgb(h - 1 / 3) * 255),
  };
}

export function toHex({ h, s, l, a }: Hsl): string {
  const { r, g, b } = hslToRgb({ h, s, l, a });
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const base = `#${hex(r)}${hex(g)}${hex(b)}`;
  return a < 1 ? `${base}${hex(Math.round(a * 255))}` : base;
}

export function hslDistance(a: Hsl, b: Hsl): number {
  // Hue is circular; smallest angular distance.
  const dh = Math.min(Math.abs(a.h - b.h), 1 - Math.abs(a.h - b.h));
  const ds = a.s - b.s;
  const dl = a.l - b.l;
  const da = a.a - b.a;
  return Math.sqrt(dh * dh + ds * ds + dl * dl + da * da);
}

export function contrastRatio(fg: Hsl, bg: Hsl): number {
  const lFg = relativeLuminance(hslToRgb(fg));
  const lBg = relativeLuminance(hslToRgb(bg));
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
