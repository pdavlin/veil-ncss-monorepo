import type { FluidValue } from './utopia.js';

export interface CSSBlock {
  selector: string;
  declarations: Record<string, string>;
  comment?: string;
}

function indent(line: string, n = 2): string {
  return ' '.repeat(n) + line;
}

export function emitBlock(block: CSSBlock): string {
  const lines: string[] = [];
  if (block.comment) lines.push(`/* ${block.comment} */`);
  lines.push(`${block.selector} {`);
  for (const [key, value] of Object.entries(block.declarations)) {
    lines.push(indent(`${key}: ${value};`));
  }
  lines.push('}');
  return lines.join('\n');
}

export function emitFluidScale(
  scale: Record<string, FluidValue>,
  prefix: string,
  selector = ':root',
): string {
  const decls: Record<string, string> = {};
  for (const [label, value] of Object.entries(scale)) {
    decls[`--${prefix}-${label}`] = value.clamp;
  }
  return emitBlock({
    selector,
    declarations: decls,
    comment: `${prefix} scale (fluid, viewport ${Object.values(scale)[0]?.minVw ?? '?'}–${
      Object.values(scale)[0]?.maxVw ?? '?'
    })`,
  });
}

export function emitCustomProps(
  selector: string,
  declarations: Record<string, string>,
  comment?: string,
): string {
  return emitBlock({
    selector,
    declarations,
    comment: comment ?? undefined,
  } as CSSBlock);
}

export function header(name: string): string {
  return `/*\n * ${name}\n * Generated. Do not edit by hand — edit the source config and rebuild.\n */\n`;
}
