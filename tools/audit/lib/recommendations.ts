import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

const REC_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
  '..',
  'audit-output',
  'recommendations.md',
);

export function loadRecommendationsHtml(): string | null {
  if (!fs.existsSync(REC_PATH)) return null;
  const md = fs.readFileSync(REC_PATH, 'utf-8');
  marked.setOptions({ gfm: true, breaks: false });
  return marked.parse(md) as string;
}
