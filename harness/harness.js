/* harness.js — runtime brand toggle + axe-core run. No framework. */

const html = document.documentElement;
const buttons = Array.from(document.querySelectorAll('button[data-brand-set]'));
const active = document.getElementById('active-brand');
const out = document.getElementById('axe-output');
const runBtn = document.getElementById('run-axe');

function setBrand(name) {
  html.setAttribute('data-brand', name);
  if (active) active.textContent = name;
  for (const b of buttons) {
    b.setAttribute('aria-pressed', String(b.dataset.brandSet === name));
  }
  void runAxe();
}

async function runAxe() {
  if (!window.axe) {
    out.textContent = 'axe-core not yet loaded.';
    return;
  }
  out.textContent = 'running axe…';
  try {
    const results = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
    });
    const lines = [
      `violations: ${results.violations.length}`,
      `passes: ${results.passes.length}`,
      `incomplete: ${results.incomplete.length}`,
      '',
    ];
    for (const v of results.violations) {
      lines.push(`• [${v.impact ?? '?'}] ${v.id} — ${v.help}`);
      for (const node of v.nodes.slice(0, 3)) {
        lines.push(`    ${node.target.join(' ')}`);
      }
    }
    out.textContent = lines.join('\n');
  } catch (err) {
    out.textContent = `axe error: ${err && err.message ? err.message : String(err)}`;
  }
}

for (const b of buttons) {
  b.addEventListener('click', () => setBrand(b.dataset.brandSet));
}
runBtn?.addEventListener('click', () => runAxe());
window.addEventListener('resize', () => runAxe());
window.addEventListener('load', () => runAxe());
