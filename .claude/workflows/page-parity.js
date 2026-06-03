export const meta = {
  name: 'page-parity',
  description: 'Compare a rebuilt page against live veilengineering.com (desktop parity is strict; live mobile is reference-only because we are replacing its UA-sniffed parallel HTML with one responsive document). Adds a responsive-integrity check (rebuild-desktop vs rebuild-mobile) so we catch responsive bugs.',
  phases: [
    { title: 'Capture', detail: 'extract live (desktop+mobile reference) and rebuild (desktop+mobile) structures in parallel' },
    { title: 'Screenshot', detail: 'full-page PNGs of live and rebuild at both viewports' },
    { title: 'Judge', detail: 'desktop parity (gates) + responsive integrity (gates) + mobile coverage (info-only) + visual judges' },
  ],
};

// args: { path?: '/about/', rebuildUrl?: 'http://127.0.0.1:8080', shotsDir?: '/tmp/parity-screenshots' }
// Tolerate args arriving as either an object or a JSON-encoded string.
let parsedArgs = args;
if (typeof args === 'string') {
  try { parsedArgs = JSON.parse(args); } catch { parsedArgs = null; }
}
log(`workflow received args: typeof=${typeof args} parsed=${JSON.stringify(parsedArgs)}`);

const PAGE_PATH = (parsedArgs && parsedArgs.path) || '/';
const LIVE_BASE = 'https://www.veilengineering.com';
const REBUILD_BASE = (parsedArgs && parsedArgs.rebuildUrl) || 'http://127.0.0.1:8080';
const SHOTS_DIR = (parsedArgs && parsedArgs.shotsDir) || `/tmp/parity-screenshots${PAGE_PATH.replace(/\//g, '_')}`;
log(`resolved PAGE_PATH=${PAGE_PATH}  REBUILD_BASE=${REBUILD_BASE}  SHOTS_DIR=${SHOTS_DIR}`);

const THRESHOLDS = {
  // desktop parity vs live desktop (strict — this IS what we're rebuilding)
  desktop: {
    headings: 0.80,
    paragraphs: 0.65,
    nav: 0.85,
    order: 0.80,
    media: 0.40,
    aggregate: 0.75,
    visual: 0.70,
  },
  // responsive integrity (rebuild-desktop vs rebuild-mobile — same document, different viewport)
  responsive: {
    coverage: 0.95,   // should be ~1.0; mobile must carry the same content
    visual: 0.70,    // mobile rendering must be readable + non-broken
  },
  // mobile brand fidelity (rebuild-mobile vs live-mobile) — visual, NOT structural mirror
  // Live mobile is the UA-sniffed parallel HTML we're replacing, but the BRAND PRESENCE
  // (wordmark prominence, type hierarchy, decorative elements, color palette, content visibility)
  // should be preserved in the rebuild's mobile rendering.
  mobileBrand: {
    visual: 0.70,
  },
  // mobile content coverage vs live mobile reference (info-only — same content goal)
  mobileCoverage: {
    paragraphs: 0.50,
    headings: 0.50,
  },
};

const W = { headings: 0.25, paragraphs: 0.40, nav: 0.15, order: 0.10, media: 0.10 };
const SLACK = 0.10;

const STRUCT_SCHEMA = {
  type: 'object',
  required: ['variant', 'url', 'title', 'headings', 'paragraphs', 'navLinks', 'mediaCount'],
  properties: {
    variant: { type: 'string' },
    url: { type: 'string' },
    title: { type: 'string' },
    headings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['level', 'text'],
        properties: { level: { type: 'string' }, text: { type: 'string' } },
      },
    },
    paragraphs: { type: 'array', items: { type: 'string' } },
    navLinks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text', 'href'],
        properties: { text: { type: 'string' }, href: { type: 'string' } },
      },
    },
    mediaCount: { type: 'integer' },
  },
};

const SHOT_SCHEMA = {
  type: 'object',
  required: ['variant', 'out', 'ok'],
  properties: {
    variant: { type: 'string' },
    url: { type: 'string' },
    out: { type: 'string' },
    ok: { type: 'boolean' },
  },
};

const VISUAL_FINDING_SCHEMA = {
  type: 'object',
  required: ['severity', 'observation'],
  properties: {
    severity: { type: 'string', enum: ['critical', 'serious', 'minor'] },
    observation: { type: 'string' },
  },
};

const VISUAL_SINGLE_SCHEMA = {
  type: 'object',
  required: ['score', 'verdict', 'findings'],
  properties: {
    score: { type: 'number' },
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    findings: { type: 'array', items: VISUAL_FINDING_SCHEMA },
  },
};

function capturePrompt(variant, url, mobileFlag) {
  return `Run a deterministic structural extractor and return its JSON output.

Use the Bash tool to execute this exact command:

  pnpm exec tsx tools/extract-page.ts --variant ${variant} --url ${url}${mobileFlag ? ' --mobile' : ''}

The command prints a single JSON object to stdout. Parse it and return via structured output.
Do NOT run Playwright yourself, do NOT modify the script.
If the command fails or produces invalid JSON, abort and report the error.`;
}

function screenshotPrompt(variant, url, mobileFlag, out, label) {
  return `Capture a full-page screenshot for parity comparison.

Use the Bash tool to execute this exact command:

  pnpm exec tsx tools/screenshot-page.ts --variant ${variant} --url ${url} --out ${out} --label "${label}"${mobileFlag ? ' --mobile' : ''}

The command prints a single JSON object to stdout (variant, url, out, label, ok). Parse and return via structured output.
The --label injects a corner badge BEFORE capture so the judge agent can't confuse which screenshot is which.
Do NOT modify the script. If it fails, report the error.`;
}

// ----- helpers -----

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\.,;:!\?…]+$/u, '')
    .trim();
}

function isExternalNavLink(text, href) {
  const t = normalize(text);
  const h = String(href || '').toLowerCase();
  if (/(linkedin|twitter|facebook|instagram|youtube|github)\.com/.test(h)) return true;
  if (h.startsWith('mailto:') || h.startsWith('tel:')) return true;
  if (t === '' || t.length > 60) return true;
  return false;
}

function isNoisyParagraph(p) {
  const n = normalize(p);
  if (n.length < 30) return true;
  if (/^© ?\d{4}/.test(n)) return true;
  if (/^thanks for submitting/i.test(p)) return true;
  const tokens = p.trim().split(/\s+/);
  const periodEndings = tokens.filter((t) => /\.$/.test(t)).length;
  if (periodEndings >= 4 && tokens.length <= 12) return true;
  return false;
}

function lcsLen(a, b) {
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  const dp = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      if (a[i - 1] === b[j - 1]) dp[j] = prev + 1;
      else dp[j] = Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

// ----- desktop parity scoring (existing) -----

function scoreHeadings(live, rebuild) {
  const liveNavLabels = new Set(live.navLinks.map((n) => normalize(n.text)));
  const liveHeadings = live.headings.map((h) => normalize(h.text));
  const qualifying = liveHeadings.filter((t) => t && !liveNavLabels.has(t));
  const excluded = liveHeadings.length - qualifying.length;
  const rebuildSet = new Set(rebuild.headings.map((h) => normalize(h.text)));
  let matched = 0;
  const missing = [];
  for (const t of qualifying) {
    if (rebuildSet.has(t)) matched++;
    else missing.push(t);
  }
  const score = qualifying.length === 0 ? 1.0 : matched / qualifying.length;
  return { score, matched, qualifying: qualifying.length, excluded, missing };
}

function scoreParagraphs(live, rebuild) {
  const qualifyingLive = live.paragraphs.filter((p) => !isNoisyParagraph(p));
  const rebuildNorm = rebuild.paragraphs.map((p) => normalize(p));
  let matched = 0;
  const missing = [];
  for (const p of qualifyingLive) {
    const needle = normalize(p).slice(0, 40);
    if (needle.length === 0) continue;
    const hit = rebuildNorm.some((r) => r.includes(needle));
    if (hit) matched++;
    else missing.push(p.slice(0, 60));
  }
  const score = qualifyingLive.length === 0 ? 1.0 : matched / qualifyingLive.length;
  return { score, matched, qualifying: qualifyingLive.length, missing };
}

function scoreOrder(live, rebuild) {
  const liveNavLabels = new Set(live.navLinks.map((n) => normalize(n.text)));
  const liveOrder = live.headings.map((h) => normalize(h.text)).filter((t) => t && !liveNavLabels.has(t));
  const rebuildOrder = rebuild.headings.map((h) => normalize(h.text));
  if (liveOrder.length === 0) return { score: 1.0, lcs: 0, total: 0, liveOrder, rebuildOrder };
  const lcs = lcsLen(liveOrder, rebuildOrder);
  return { score: lcs / liveOrder.length, lcs, total: liveOrder.length, liveOrder, rebuildOrder };
}

function scoreMedia(live, rebuild) {
  const liveC = Math.max(0, live.mediaCount || 0);
  const rebuildC = Math.max(0, rebuild.mediaCount || 0);
  if (liveC === 0 && rebuildC === 0) return { score: 1.0, live: 0, rebuild: 0 };
  if (liveC === 0) return { score: 0.5, live: 0, rebuild: rebuildC };
  return { score: Math.min(rebuildC, liveC) / Math.max(rebuildC, liveC), live: liveC, rebuild: rebuildC };
}

function scoreNav(live, rebuild) {
  const qualifying = live.navLinks
    .filter((l) => !isExternalNavLink(l.text, l.href))
    .map((l) => normalize(l.text))
    .filter((t) => t.length > 0);
  const uniq = Array.from(new Set(qualifying));
  const rebuildSet = new Set(
    rebuild.navLinks.filter((l) => !isExternalNavLink(l.text, l.href)).map((l) => normalize(l.text))
  );
  let matched = 0;
  const missing = [];
  for (const t of uniq) {
    if (rebuildSet.has(t)) matched++;
    else if (t === 'sustainable design' && rebuildSet.has('sustainability')) matched++;
    else missing.push(t);
  }
  const score = uniq.length === 0 ? 1.0 : matched / uniq.length;
  return { score, matched, qualifying: uniq.length, missing };
}

function desktopVerdict(scores) {
  const aggregate =
    W.headings * scores.headings.score +
    W.paragraphs * scores.paragraphs.score +
    W.nav * scores.nav.score +
    W.order * scores.order.score +
    W.media * scores.media.score;
  const t = THRESHOLDS.desktop;
  const verdict =
    aggregate >= t.aggregate &&
    scores.headings.score >= t.headings - SLACK &&
    scores.paragraphs.score >= t.paragraphs - SLACK &&
    scores.nav.score >= t.nav - SLACK &&
    scores.order.score >= t.order - SLACK &&
    scores.media.score >= t.media - SLACK
      ? 'PASS'
      : 'FAIL';
  return {
    headings: +scores.headings.score.toFixed(4),
    paragraphs: +scores.paragraphs.score.toFixed(4),
    nav: +scores.nav.score.toFixed(4),
    order: +scores.order.score.toFixed(4),
    media: +scores.media.score.toFixed(4),
    aggregate: +aggregate.toFixed(4),
    verdict,
  };
}

function judgeDesktop(live, rebuild) {
  const hs = scoreHeadings(live, rebuild);
  const ps = scoreParagraphs(live, rebuild);
  const ns = scoreNav(live, rebuild);
  const os = scoreOrder(live, rebuild);
  const ms = scoreMedia(live, rebuild);
  return { verdict: desktopVerdict({ headings: hs, paragraphs: ps, nav: ns, order: os, media: ms }), headings: hs, paragraphs: ps, nav: ns, order: os, media: ms };
}

// ----- responsive integrity: rebuild-desktop vs rebuild-mobile -----
// Same source document; mobile must carry the same content as desktop.
// If headings/paragraphs/nav drop at mobile width, that's a responsive bug
// (e.g., display:none on something we shouldn't hide).

function scoreResponsive(rebuildDesktop, rebuildMobile) {
  // headings — set-based (order may differ between viewport renderings)
  const dH = new Set(rebuildDesktop.headings.map((h) => normalize(h.text)).filter(Boolean));
  const mH = new Set(rebuildMobile.headings.map((h) => normalize(h.text)).filter(Boolean));
  const dHArr = Array.from(dH);
  const headingsMatched = dHArr.filter((t) => mH.has(t)).length;
  const headingsScore = dHArr.length === 0 ? 1.0 : headingsMatched / dHArr.length;

  // paragraphs — substring coverage
  const dP = rebuildDesktop.paragraphs.filter((p) => !isNoisyParagraph(p));
  const mPNorm = rebuildMobile.paragraphs.map((p) => normalize(p));
  let paragraphsMatched = 0;
  for (const p of dP) {
    const needle = normalize(p).slice(0, 40);
    if (mPNorm.some((r) => r.includes(needle))) paragraphsMatched++;
  }
  const paragraphsScore = dP.length === 0 ? 1.0 : paragraphsMatched / dP.length;

  // nav — set-based
  const dN = new Set(rebuildDesktop.navLinks.filter((l) => !isExternalNavLink(l.text, l.href)).map((l) => normalize(l.text)).filter(Boolean));
  const mN = new Set(rebuildMobile.navLinks.filter((l) => !isExternalNavLink(l.text, l.href)).map((l) => normalize(l.text)).filter(Boolean));
  const dNArr = Array.from(dN);
  const navMatched = dNArr.filter((t) => mN.has(t)).length;
  const navScore = dNArr.length === 0 ? 1.0 : navMatched / dNArr.length;

  const coverage = (headingsScore + paragraphsScore + navScore) / 3;
  const verdict = coverage >= THRESHOLDS.responsive.coverage - SLACK ? 'PASS' : 'FAIL';
  return {
    coverage: +coverage.toFixed(4),
    headings: { score: +headingsScore.toFixed(4), matched: headingsMatched, total: dHArr.length },
    paragraphs: { score: +paragraphsScore.toFixed(4), matched: paragraphsMatched, total: dP.length },
    nav: { score: +navScore.toFixed(4), matched: navMatched, total: dNArr.length },
    verdict,
  };
}

// ----- mobile content coverage vs live mobile (INFORMATIONAL) -----
// Live mobile is a UA-sniffed parallel HTML we're replacing.
// We don't require structural matching, just verify we cover its content.

function scoreMobileCoverage(liveMobile, rebuildMobile) {
  const liveNavLabels = new Set(liveMobile.navLinks.map((n) => normalize(n.text)));
  const liveQualifying = liveMobile.headings.map((h) => normalize(h.text)).filter((t) => t && !liveNavLabels.has(t));
  const rebuildSet = new Set(rebuildMobile.headings.map((h) => normalize(h.text)).filter(Boolean));
  let hMatched = 0;
  for (const t of liveQualifying) if (rebuildSet.has(t)) hMatched++;
  const headingsScore = liveQualifying.length === 0 ? 1.0 : hMatched / liveQualifying.length;

  const liveParagraphs = liveMobile.paragraphs.filter((p) => !isNoisyParagraph(p));
  const rebuildNorm = rebuildMobile.paragraphs.map((p) => normalize(p));
  let pMatched = 0;
  for (const p of liveParagraphs) {
    const needle = normalize(p).slice(0, 40);
    if (rebuildNorm.some((r) => r.includes(needle))) pMatched++;
  }
  const paragraphsScore = liveParagraphs.length === 0 ? 1.0 : pMatched / liveParagraphs.length;

  return {
    headings: { score: +headingsScore.toFixed(4), matched: hMatched, total: liveQualifying.length },
    paragraphs: { score: +paragraphsScore.toFixed(4), matched: pMatched, total: liveParagraphs.length },
  };
}

// ----- workflow body -----

phase('Capture');

const [liveDesktop, liveMobile, rebuildDesktop, rebuildMobile] = await parallel([
  () => agent(capturePrompt('live-desktop', LIVE_BASE + PAGE_PATH, false), {
    label: 'capture:live-desktop', phase: 'Capture', schema: STRUCT_SCHEMA,
  }),
  () => agent(capturePrompt('live-mobile-reference', LIVE_BASE + PAGE_PATH, true), {
    label: 'capture:live-mobile (reference)', phase: 'Capture', schema: STRUCT_SCHEMA,
  }),
  () => agent(capturePrompt('rebuild-desktop', REBUILD_BASE + PAGE_PATH, false), {
    label: 'capture:rebuild-desktop', phase: 'Capture', schema: STRUCT_SCHEMA,
  }),
  () => agent(capturePrompt('rebuild-mobile', REBUILD_BASE + PAGE_PATH, true), {
    label: 'capture:rebuild-mobile', phase: 'Capture', schema: STRUCT_SCHEMA,
  }),
]);

if (!liveDesktop || !liveMobile || !rebuildDesktop || !rebuildMobile) {
  log('one or more structural captures returned null — aborting');
  return { path: PAGE_PATH, thresholds: THRESHOLDS, overall: 'FAIL', notes: 'capture phase failed' };
}

phase('Screenshot');

const liveDesktopShot = `${SHOTS_DIR}/live-desktop.png`;
const liveMobileShot = `${SHOTS_DIR}/live-mobile.png`;
const rebuildDesktopShot = `${SHOTS_DIR}/rebuild-desktop.png`;
const rebuildMobileShot = `${SHOTS_DIR}/rebuild-mobile.png`;

const shots = await parallel([
  () => agent(screenshotPrompt('live-desktop', LIVE_BASE + PAGE_PATH, false, liveDesktopShot, 'LIVE DESKTOP'), {
    label: 'shot:live-desktop', phase: 'Screenshot', schema: SHOT_SCHEMA,
  }),
  () => agent(screenshotPrompt('live-mobile', LIVE_BASE + PAGE_PATH, true, liveMobileShot, 'LIVE MOBILE'), {
    label: 'shot:live-mobile', phase: 'Screenshot', schema: SHOT_SCHEMA,
  }),
  () => agent(screenshotPrompt('rebuild-desktop', REBUILD_BASE + PAGE_PATH, false, rebuildDesktopShot, 'REBUILD DESKTOP'), {
    label: 'shot:rebuild-desktop', phase: 'Screenshot', schema: SHOT_SCHEMA,
  }),
  () => agent(screenshotPrompt('rebuild-mobile', REBUILD_BASE + PAGE_PATH, true, rebuildMobileShot, 'REBUILD MOBILE'), {
    label: 'shot:rebuild-mobile', phase: 'Screenshot', schema: SHOT_SCHEMA,
  }),
]);

phase('Judge');

// 1. Desktop parity (strict gate)
const desktop = judgeDesktop(liveDesktop, rebuildDesktop);

// 2. Responsive integrity (strict gate — same document)
const responsive = scoreResponsive(rebuildDesktop, rebuildMobile);

// 3. Mobile content coverage (informational only)
const mobileCoverage = scoreMobileCoverage(liveMobile, rebuildMobile);

// 4. Visual judges — run in parallel
const [desktopVisual, responsiveVisual, mobileBrandVisual] = await parallel([
  () => agent(`Compare visual fidelity of the rebuild's DESKTOP rendering against live veilengineering.com.
The rebuild's goal is to **preserve the existing visual identity** while fixing the audit's responsive/a11y failures.

Read both screenshots and judge:

LIVE DESKTOP:    ${shots[0] && shots[0].ok ? liveDesktopShot : '(capture failed)'}
REBUILD DESKTOP: ${shots[2] && shots[2].ok ? rebuildDesktopShot : '(capture failed)'}

Walk top-to-bottom and identify divergences in:
- Layout structure (column arrangement, section ordering)
- Component styling (cards, buttons, form inputs, links)
- Decorative elements (separators, parallax strips, backgrounds)
- Typography (hierarchy, weight, size relationships)
- Spacing (padding, gaps, white space density)

Severity:
- critical: missing major section / wrong section order / broken layout
- serious: wrong component variant or stacking direction
- minor: small style differences

Score 0.00-1.00. Verdict PASS if score >= ${THRESHOLDS.desktop.visual} AND no critical findings.

Up to 8 findings, short and specific.`, {
    label: 'judge:desktop-visual', phase: 'Judge', schema: VISUAL_SINGLE_SCHEMA,
  }),

  () => agent(`Compare the REBUILD's responsive behavior between DESKTOP and MOBILE viewports. The rebuild is ONE responsive HTML document, not two parallel documents — so mobile should carry the same content as desktop, just stacked / resized appropriately.

You are NOT comparing to the live site. You are checking whether the rebuild's mobile view degrades gracefully from its desktop view.

REBUILD DESKTOP: ${shots[2] && shots[2].ok ? rebuildDesktopShot : '(capture failed)'}
REBUILD MOBILE:  ${shots[3] && shots[3].ok ? rebuildMobileShot : '(capture failed)'}

Check:
- Does mobile show ALL the content visible on desktop? (no missing sections, headings, or paragraphs)
- Is content stacking sensibly (multi-column → single-column, side-by-side → stacked)?
- Are touch targets reasonable size? Any interactive controls obscured or unreachable?
- No horizontal scroll? No text clipped at viewport edges?
- Typography rescales sensibly (no oversized headings forcing horizontal scroll, no tiny body text)?
- Images/media adapt (full-width or scaled to fit)?

Severity:
- critical: content missing on mobile that's visible on desktop / horizontal scroll / unreachable controls
- serious: layout choices that hurt usability (cramped spacing, tiny touch targets)
- minor: small adjustment opportunities

Score 0.00-1.00. PASS if score >= ${THRESHOLDS.responsive.visual} AND no critical findings.

Up to 8 findings, short and specific.`, {
    label: 'judge:responsive-visual', phase: 'Judge', schema: VISUAL_SINGLE_SCHEMA,
  }),

  () => agent(`Compare the REBUILD's MOBILE rendering against the LIVE site's MOBILE rendering for BRAND VISUAL FIDELITY.

Important framing: live mobile is a separate User-Agent-sniffed HTML document we are replacing with one responsive document. You should NOT penalize the rebuild for:
  - Different navigation pattern (e.g. live shows a stacked vertical nav, rebuild uses a different responsive treatment) — these are both valid responsive choices for the same brand
  - Slightly different DOM structure or section ordering
  - The rebuild lacking duplicate UA-sniffed widgets (social-icon shortcut bars, mobile-only chrome)

You SHOULD score harshly when:
  - The rebuild loses the brand's visual presence at mobile width: e.g. wordmark size dramatically smaller than live's prominent wordmark, type hierarchy flattened, hero feels generic vs the live's intentional hero treatment
  - Decorative elements that read as brand identity (parallax strips, separators, the architect/engineer diagram) are absent or de-emphasized
  - Color palette / contrast diverges
  - Sections of content are missing (recent projects band, engineered shading explainer, founders contact info)
  - Type sizes are too small to be readable / mismatch live's prominent type at this width

LIVE MOBILE:    ${shots[1] && shots[1].ok ? liveMobileShot : '(capture failed)'}
REBUILD MOBILE: ${shots[3] && shots[3].ok ? rebuildMobileShot : '(capture failed)'}

Score 0.00–1.00 on BRAND visual fidelity (not structural mirror).

Verdict: PASS if score >= ${THRESHOLDS.mobileBrand.visual} AND no critical findings.

Critical: brand presence catastrophically diminished (e.g. wordmark a fraction the size, nav links cramped to illegible, hero feels generic).
Serious: brand identity weakened (decorative elements missing, type hierarchy reduced, palette drift).
Minor: small adjustment opportunities.

Up to 8 findings, short and specific.`, {
    label: 'judge:mobile-brand', phase: 'Judge', schema: VISUAL_SINGLE_SCHEMA,
  }),
]);

const overall =
  desktop.verdict.verdict === 'PASS' &&
  responsive.verdict === 'PASS' &&
  desktopVisual.verdict === 'PASS' &&
  responsiveVisual.verdict === 'PASS' &&
  mobileBrandVisual.verdict === 'PASS'
    ? 'PASS'
    : 'FAIL';

const verdict = {
  path: PAGE_PATH,
  thresholds: THRESHOLDS,
  // === gates ===
  desktop: desktop.verdict,
  responsive: { coverage: responsive.coverage, verdict: responsive.verdict },
  desktopVisual: { score: +desktopVisual.score.toFixed(4), verdict: desktopVisual.verdict, findings: desktopVisual.findings },
  responsiveVisual: { score: +responsiveVisual.score.toFixed(4), verdict: responsiveVisual.verdict, findings: responsiveVisual.findings },
  mobileBrandVisual: { score: +mobileBrandVisual.score.toFixed(4), verdict: mobileBrandVisual.verdict, findings: mobileBrandVisual.findings },
  // === informational ===
  mobileCoverage: {
    headings: mobileCoverage.headings,
    paragraphs: mobileCoverage.paragraphs,
    note: 'reference-only: live mobile is a UA-sniffed parallel HTML being replaced; structural divergence here is expected by the audit (recommendations.md #6)',
  },
  overall,
  notes: [
    `Desktop parity: H=${(desktop.verdict.headings * 100).toFixed(0)}% P=${(desktop.verdict.paragraphs * 100).toFixed(0)}% N=${(desktop.verdict.nav * 100).toFixed(0)}% Order=${(desktop.verdict.order * 100).toFixed(0)}% Media=${(desktop.verdict.media * 100).toFixed(0)}% agg=${(desktop.verdict.aggregate * 100).toFixed(0)}% → ${desktop.verdict.verdict}`,
    `Responsive integrity (rebuild D↔M): coverage=${(responsive.coverage * 100).toFixed(0)}% (H ${responsive.headings.matched}/${responsive.headings.total}, P ${responsive.paragraphs.matched}/${responsive.paragraphs.total}, N ${responsive.nav.matched}/${responsive.nav.total}) → ${responsive.verdict}`,
    `Desktop visual: ${(desktopVisual.score * 100).toFixed(0)}% → ${desktopVisual.verdict}`,
    `Responsive visual (rebuild D↔M): ${(responsiveVisual.score * 100).toFixed(0)}% → ${responsiveVisual.verdict}`,
    `Mobile brand visual (rebuild M vs live M): ${(mobileBrandVisual.score * 100).toFixed(0)}% → ${mobileBrandVisual.verdict}`,
    `Mobile coverage (info): vs live-mobile reference H ${mobileCoverage.headings.matched}/${mobileCoverage.headings.total}, P ${mobileCoverage.paragraphs.matched}/${mobileCoverage.paragraphs.total}`,
  ].join('  |  '),
  detail: {
    desktop: {
      headings: { matched: desktop.headings.matched, qualifying: desktop.headings.qualifying, excluded: desktop.headings.excluded, missing: desktop.headings.missing.slice(0, 6) },
      paragraphs: { matched: desktop.paragraphs.matched, qualifying: desktop.paragraphs.qualifying, missing: desktop.paragraphs.missing.slice(0, 4) },
      nav: { matched: desktop.nav.matched, qualifying: desktop.nav.qualifying, missing: desktop.nav.missing },
      order: { lcs: desktop.order.lcs, total: desktop.order.total },
      media: { live: desktop.media.live, rebuild: desktop.media.rebuild },
    },
    responsive: responsive,
    shots: { liveDesktop: liveDesktopShot, liveMobile: liveMobileShot, rebuildDesktop: rebuildDesktopShot, rebuildMobile: rebuildMobileShot },
  },
};

log(`path ${PAGE_PATH}  →  overall ${overall}`);
log(`  desktop parity      ${desktop.verdict.verdict}  agg=${(desktop.verdict.aggregate * 100).toFixed(0)}%`);
log(`  responsive integrity ${responsive.verdict}  coverage=${(responsive.coverage * 100).toFixed(0)}%`);
log(`  desktop visual       ${desktopVisual.verdict}  score=${(desktopVisual.score * 100).toFixed(0)}%`);
log(`  responsive visual    ${responsiveVisual.verdict}  score=${(responsiveVisual.score * 100).toFixed(0)}%`);
log(`  mobile brand visual  ${mobileBrandVisual.verdict}  score=${(mobileBrandVisual.score * 100).toFixed(0)}%`);
log(`  mobile coverage      (info) H ${mobileCoverage.headings.matched}/${mobileCoverage.headings.total}  P ${mobileCoverage.paragraphs.matched}/${mobileCoverage.paragraphs.total}`);

return verdict;
