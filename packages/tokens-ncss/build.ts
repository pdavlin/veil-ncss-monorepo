import { mkdir, writeFile, readdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio, emitCustomProps, header } from '@veil-ncss/tokens-shared';
import { palette, aliasMap, pairings, type PairingDecl } from './config/palette.js';
import { faces, type FontFace } from './config/fonts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, 'dist');
const FONTS_SRC = join(__dirname, 'fonts');
const FONTS_DIST = join(DIST, 'fonts');

async function copyFonts(): Promise<string[]> {
  await mkdir(FONTS_DIST, { recursive: true });
  const entries = await readdir(FONTS_SRC).catch(() => [] as string[]);
  const copied: string[] = [];
  for (const name of entries) {
    if (!name.endsWith('.woff2')) continue;
    await copyFile(join(FONTS_SRC, name), join(FONTS_DIST, name));
    copied.push(name);
  }
  return copied;
}

function emitFontFace(face: FontFace): string {
  const display = face.display ?? 'swap';
  return [
    '@font-face {',
    `  font-family: "${face.family}";`,
    `  src: url('./fonts/${face.file}') format('woff2');`,
    `  font-weight: ${face.weight};`,
    `  font-style: ${face.style};`,
    `  font-display: ${display};`,
    '}',
  ].join('\n');
}

interface VerifiedPairing extends PairingDecl {
  ratio: number;
  large: boolean;
}

function verifyPairings(): VerifiedPairing[] {
  const verified: VerifiedPairing[] = [];
  for (const p of pairings) {
    const large = p.large ?? false;
    const ratio = contrastRatio(p.fg, p.bg);
    const target = large ? 3 : 4.5;
    if (ratio < target) {
      console.error(
        `[tokens-ncss] FAIL: "${p.role}" (${p.fg} on ${p.bg}) ratio ${ratio.toFixed(2)} < ${target}.`,
      );
      process.exit(2);
    }
    verified.push({ ...p, large, ratio });
  }
  return verified;
}

async function main() {
  await mkdir(DIST, { recursive: true });

  const copied = await copyFonts();
  const missing = faces.filter((f) => !copied.includes(f.file));
  if (missing.length > 0) {
    console.error(
      `[tokens-ncss] ${missing.length} font file(s) declared in config but missing from fonts/:\n  ${missing
        .map((m) => m.file)
        .join('\n  ')}`,
    );
    process.exit(2);
  }

  const verifiedPairings = verifyPairings();

  const fontFaceBlock = faces.map(emitFontFace).join('\n\n');
  const paletteCss = emitCustomProps(
    ':root, :root[data-brand="ncss"]',
    palette,
    'NCSS stub palette (Phase 4 replaces colors)',
  );
  const aliasCss = emitCustomProps(
    ':root, :root[data-brand="ncss"]',
    aliasMap,
    'NCSS alias overrides (fonts: Avenir Next World)',
  );

  const indexCss = [
    header('@veil-ncss/tokens-ncss — NCSS brand layer (colors: stub, fonts: real)'),
    fontFaceBlock,
    '',
    paletteCss,
    '',
    aliasCss,
  ].join('\n');

  await writeFile(join(DIST, 'index.css'), indexCss + '\n', 'utf8');

  const model = {
    brand: 'ncss' as const,
    palette,
    aliasOverrides: aliasMap,
    pairings: verifiedPairings,
    fontFaces: faces,
    stub: true,
  };
  await writeFile(join(DIST, 'model.json'), JSON.stringify(model, null, 2) + '\n', 'utf8');

  console.log(
    `[tokens-ncss] wrote stub palette (${Object.keys(palette).length} tokens), ${copied.length} fonts copied, ${faces.length} @font-face emitted, ${verifiedPairings.length} pairings verified.`,
  );
}

main().catch((err) => {
  console.error('[tokens-ncss] build failed:', err);
  process.exit(1);
});
