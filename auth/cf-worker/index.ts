/*
 * Decap CMS OAuth proxy for GitHub.
 *
 * Flow:
 *   1. Decap admin opens /auth?provider=github&site_id=<origin>&scope=<scope>
 *   2. We validate the origin, mint a state cookie, and redirect to GitHub.
 *   3. GitHub redirects back to /callback?code=...&state=...
 *   4. We exchange the code for a token and post it back to the opener via window.opener.postMessage.
 *
 * Secrets (set with `wrangler secret put`):
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET
 *   OAUTH_STATE_SECRET    (HMAC key for state cookie)
 */

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  OAUTH_STATE_SECRET: string;
  ALLOWED_ORIGINS: string;
  GITHUB_SCOPES: string;
}

const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';
const STATE_COOKIE = 'oauth_state';

function allowedOriginSet(env: Env): Set<string> {
  return new Set(
    (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function renderError(message: string, status = 400): Response {
  const safe = escapeHtml(message);
  const body = `<!doctype html><meta charset="utf-8"><title>Authentication error</title>
<main style="font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem">
  <h1>Authentication error</h1>
  <p>${safe}</p>
  <p><a href="javascript:history.back()">Try again</a></p>
</main>`;
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function mintState(env: Env, origin: string): Promise<string> {
  const nonce = crypto.randomUUID();
  const payload = `${origin}|${nonce}|${Date.now()}`;
  const sig = await hmac(env.OAUTH_STATE_SECRET, payload);
  return btoa(`${payload}|${sig}`);
}

async function verifyState(env: Env, state: string): Promise<{ origin: string } | null> {
  try {
    const decoded = atob(state);
    const parts = decoded.split('|');
    if (parts.length !== 4) return null;
    const [origin, nonce, tsStr, sig] = parts as [string, string, string, string];
    const payload = `${origin}|${nonce}|${tsStr}`;
    const expect = await hmac(env.OAUTH_STATE_SECRET, payload);
    if (expect !== sig) return null;
    const ts = Number(tsStr);
    if (!Number.isFinite(ts) || Date.now() - ts > 10 * 60 * 1000) return null;
    return { origin };
  } catch {
    return null;
  }
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    if (k) out[k] = v;
  }
  return out;
}

function postMessageHtml(payload: { provider: 'github'; token: string } | { error: string }, origin: string): Response {
  const json = JSON.stringify(payload);
  const html = `<!doctype html><meta charset="utf-8"><title>OAuth</title>
<script>
(function () {
  function send() {
    if (!window.opener) return;
    window.opener.postMessage('authorization:github:${'error' in payload ? 'error' : 'success'}:' + ${JSON.stringify(json)}, ${JSON.stringify(origin)});
  }
  window.addEventListener('message', send, false);
  send();
})();
</script>
<p>Authentication complete. You may close this window.</p>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function startOAuth(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const siteId = url.searchParams.get('site_id') || url.searchParams.get('origin');
  if (!siteId) return renderError('Missing site_id.');
  const origin = siteId.startsWith('http') ? new URL(siteId).origin : `https://${siteId}`;
  const allowed = allowedOriginSet(env);
  if (!allowed.has(origin)) {
    return renderError(`Origin not allowed: ${origin}`);
  }

  const state = await mintState(env, origin);
  const scope = url.searchParams.get('scope') || env.GITHUB_SCOPES;
  const redirectUri = `${url.origin}/callback`;

  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope,
    state,
    allow_signup: 'false',
  });

  const headers = new Headers({ Location: `${GITHUB_AUTHORIZE}?${params.toString()}` });
  headers.append(
    'Set-Cookie',
    `${STATE_COOKIE}=${encodeURIComponent(state)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
  );
  return new Response(null, { status: 302, headers });
}

async function finishOAuth(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  if (!code || !stateParam) return renderError('Missing code or state.');

  const cookies = parseCookies(req.headers.get('cookie'));
  if (cookies[STATE_COOKIE] !== stateParam) {
    return renderError('State mismatch — possible CSRF.');
  }

  const verified = await verifyState(env, stateParam);
  if (!verified) return renderError('Invalid or expired state.');

  const tokenRes = await fetch(GITHUB_TOKEN, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  if (!tokenRes.ok) {
    return renderError(`GitHub token exchange failed (${tokenRes.status}).`, 502);
  }

  const data = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };
  if (data.error || !data.access_token) {
    return postMessageHtml({ error: data.error_description || data.error || 'Token exchange failed.' }, verified.origin);
  }

  return postMessageHtml({ provider: 'github', token: data.access_token }, verified.origin);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    if (url.pathname === '/auth') return startOAuth(req, env);
    if (url.pathname === '/callback') return finishOAuth(req, env);
    if (url.pathname === '/') {
      return new Response('Decap OAuth proxy. Endpoints: /auth, /callback.', {
        headers: { 'content-type': 'text/plain' },
      });
    }
    return new Response('Not found', { status: 404 });
  },
};

export const __test__ = { mintState, verifyState, parseCookies };
