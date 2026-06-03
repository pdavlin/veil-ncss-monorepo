import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFluidType,
  buildFluidSpace,
  emitFluidScale,
  emitCustomProps,
  header,
} from '@veil-ncss/tokens-shared';
import { typeConfig, spaceConfig, breakpoints, radii, shadows, motion } from './config/scales.js';
import { aliases } from './config/aliases.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, 'dist');

async function ensureDist() {
  await mkdir(DIST, { recursive: true });
}

async function writeOut(name: string, content: string) {
  await writeFile(join(DIST, name), content + '\n', 'utf8');
}

const RESET = `${header('reset.css — modern CSS reset (in @layer reset)')}
*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: var(--font-sans);
  font-size: var(--text-body);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  color: var(--color-text-default);
  background-color: var(--color-surface-default);
}
img, picture, video, canvas, svg { display: block; max-width: 100%; }
input, button, textarea, select { font: inherit; color: inherit; }
button { background: none; border: none; cursor: pointer; }
a { color: var(--color-link); text-decoration-thickness: 0.08em; text-underline-offset: 0.15em; }
:focus-visible { outline: 2px solid var(--color-border-strong); outline-offset: 2px; }
p, h1, h2, h3, h4, h5, h6 { overflow-wrap: break-word; }
:where(h1, h2, h3, h4, h5, h6) { font-family: var(--font-display); line-height: 1.15; }
`;

const INDEX = `${header('index.css — entry point for @veil-ncss/tokens-base')}
@layer reset, tokens, base, components, utilities;

@import url('./reset.css') layer(reset);
@import url('./scales.css') layer(tokens);
@import url('./aliases.css') layer(tokens);
@import url('./misc.css') layer(tokens);
`;

async function main() {
  await ensureDist();

  const typeScale = buildFluidType(typeConfig);
  const spaceScale = buildFluidSpace(spaceConfig);

  const scalesCss = [
    header('scales.css — fluid type + space (utopia-core derived)'),
    emitFluidScale(typeScale, 'text'),
    '',
    emitFluidScale(spaceScale, 'space'),
  ].join('\n');

  const aliasDecls: Record<string, string> = {};
  for (const [name, decl] of Object.entries(aliases)) {
    aliasDecls[name] = decl.fallback;
  }
  const aliasesCss = [
    header('aliases.css — semantic aliases with fallbacks; brand layers override.'),
    emitCustomProps(':root', aliasDecls, 'semantic alias contract'),
  ].join('\n');

  const miscDecls = { ...breakpoints, ...radii, ...shadows, ...motion };
  const miscCss = [
    header('misc.css — breakpoints, radii, shadows, motion.'),
    emitCustomProps(':root', miscDecls, 'misc design tokens'),
  ].join('\n');

  await writeOut('reset.css', RESET);
  await writeOut('scales.css', scalesCss);
  await writeOut('aliases.css', aliasesCss);
  await writeOut('misc.css', miscCss);
  await writeOut('index.css', INDEX);

  const model = {
    fluid: { type: typeScale, space: spaceScale },
    aliases,
    misc: { breakpoints, radii, shadows, motion },
  };
  await writeOut('model.json', JSON.stringify(model, null, 2));

  console.log(`[tokens-base] wrote ${Object.keys(model.fluid.type).length} type steps, ${Object.keys(model.fluid.space).length} space steps, ${Object.keys(aliases).length} aliases.`);
}

main().catch((err) => {
  console.error('[tokens-base] build failed:', err);
  process.exit(1);
});
