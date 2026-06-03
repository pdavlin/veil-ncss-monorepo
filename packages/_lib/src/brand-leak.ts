/**
 * Brand-leak guard. PRD NFR-2.5: brand layers must not override base internals.
 *
 * Given a brand layer's emitted CSS and the alias whitelist from tokens-base,
 * returns every custom-property declaration that isn't:
 *   (a) in the alias whitelist,
 *   (b) a raw brand palette token matching `--<paletteNs>-<name>` (e.g. `--color-veil-ink`).
 *
 * Empty array → brand layer is clean.
 */

export interface BrandLeakReport {
  declaration: string;
  selector: string;
  reason: 'unknown-alias' | 'wrong-palette-namespace';
}

export interface CheckOptions {
  /** Permitted alias names, e.g. ['--color-surface-default', '--font-display', …]. */
  aliasWhitelist: string[];
  /** Raw palette namespace pattern, e.g. 'color-veil' → matches `--color-veil-*`. */
  paletteNamespaces: string[];
  /** CSS source to inspect (the brand layer's emitted index.css). */
  css: string;
}

const SELECTOR_BLOCK_RE = /([^{}]+)\{([^{}]+)\}/g;
const DECL_RE = /(--[a-z0-9-]+)\s*:/gi;

function isAllowedPaletteToken(name: string, namespaces: string[]): boolean {
  return namespaces.some((ns) => name.startsWith(`--${ns}-`));
}

export function checkBrandLeak(opts: CheckOptions): BrandLeakReport[] {
  const allowedAliases = new Set(opts.aliasWhitelist);
  const reports: BrandLeakReport[] = [];

  for (const match of opts.css.matchAll(SELECTOR_BLOCK_RE)) {
    const selectorRaw = match[1]?.trim() ?? '';
    const body = match[2] ?? '';
    if (selectorRaw.startsWith('@font-face')) continue;
    const declMatches = body.matchAll(DECL_RE);
    for (const declMatch of declMatches) {
      const name = declMatch[1];
      if (!name) continue;
      if (allowedAliases.has(name)) continue;
      if (isAllowedPaletteToken(name, opts.paletteNamespaces)) continue;
      reports.push({
        declaration: name,
        selector: selectorRaw,
        reason: allowedAliases.size === 0 ? 'unknown-alias' : isAllowedPaletteToken(name, [])
          ? 'wrong-palette-namespace'
          : 'unknown-alias',
      });
    }
  }
  return reports;
}
