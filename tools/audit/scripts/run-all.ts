import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const steps = [
  ['crawl.ts', 'URL discovery'],
  ['extract-tokens.ts', 'Token extraction'],
  ['cluster-tokens.ts', 'Token clustering'],
  ['screenshot.ts', 'Screenshot capture'],
  ['audit-a11y.ts', 'A11y audit'],
  ['curate.ts', 'Curation'],
  ['report.ts', 'HTML report'],
  ['report-davlin.ts', 'HTML report (davlin theme)'],
  ['report-pdf.ts', 'PDF export'],
] as const;

async function runStep(script: string, label: string, args: string[]): Promise<void> {
  console.log(`\n=== ${label} (${script}) ===\n`);
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', path.join(__dirname, script), ...args], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  for (const [script, label] of steps) {
    await runStep(script, label, args);
  }
  console.log('\n=== All steps complete ===\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
