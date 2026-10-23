import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, { __test__, type Env } from './index.js';

const env: Env = {
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'test-client-secret',
  OAUTH_STATE_SECRET: 'test-hmac-secret',
  ALLOWED_ORIGINS: 'https://veilengineering.com,https://ncss.org',
  GITHUB_SCOPES: 'repo,user',
};

describe('mintState / verifyState', () => {
  it('verifies a freshly minted state', async () => {
    const s = await __test__.mintState(env, 'https://veilengineering.com');
    const v = await __test__.verifyState(env, s);
    expect(v?.origin).toBe('https://veilengineering.com');
  });

  it('rejects tampered state', async () => {
    const s = await __test__.mintState(env, 'https://veilengineering.com');
    const tampered = s.slice(0, -2) + 'aa';
    const v = await __test__.verifyState(env, tampered);
    expect(v).toBeNull();
  });

  it('rejects expired state', async () => {
    const realNow = Date.now;
    const oldDate = realNow() - 11 * 60 * 1000;
    Date.now = () => oldDate;
    const s = await __test__.mintState(env, 'https://veilengineering.com');
    Date.now = realNow;
    const v = await __test__.verifyState(env, s);
    expect(v).toBeNull();
  });
});

describe('parseCookies', () => {
  it('parses semicolon-separated cookies', () => {
    const cookies = __test__.parseCookies('a=1; b=two%20words; c=3');
    expect(cookies).toEqual({ a: '1', b: 'two words', c: '3' });
  });
  it('returns empty for null', () => {
    expect(__test__.parseCookies(null)).toEqual({});
  });
});

describe('oauthAppFor', () => {
  const brandEnv: Env = {
    ...env,
    GITHUB_CLIENT_ID_VEIL: 'veil-id',
    GITHUB_CLIENT_SECRET_VEIL: 'veil-secret',
    GITHUB_CLIENT_ID_NCSS: 'ncss-id',
    GITHUB_CLIENT_SECRET_NCSS: 'ncss-secret',
  };

  it('selects the NCSS app on auth.ncss.build', () => {
    expect(__test__.oauthAppFor(brandEnv, 'auth.ncss.build')?.clientId).toBe('ncss-id');
  });

  it('selects the Veil app on auth.veilengineering.com', () => {
    expect(__test__.oauthAppFor(brandEnv, 'auth.veilengineering.com')?.clientId).toBe('veil-id');
  });

  it('no longer selects the NCSS app on goncss.com', () => {
    expect(__test__.oauthAppFor(brandEnv, 'auth.goncss.com')?.clientId).toBe('test-client-id');
  });

  it('does not match a lookalike host', () => {
    expect(__test__.oauthAppFor(brandEnv, 'auth.notncss.build')?.clientId).toBe('test-client-id');
  });

  it('falls back on workers.dev', () => {
    expect(__test__.oauthAppFor(brandEnv, 'veil-ncss-auth.example.workers.dev')?.clientId).toBe('test-client-id');
  });

  it('falls back when the NCSS secrets are not set', () => {
    expect(__test__.oauthAppFor(env, 'auth.ncss.build')?.clientId).toBe('test-client-id');
  });

  it('sends the NCSS client_id and callback to GitHub from auth.ncss.build', async () => {
    const res = await worker.fetch(
      new Request('https://auth.ncss.build/auth?site_id=https://veilengineering.com'),
      brandEnv,
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') || '');
    expect(location.searchParams.get('client_id')).toBe('ncss-id');
    expect(location.searchParams.get('redirect_uri')).toBe('https://auth.ncss.build/callback');
  });
});

describe('fetch routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects /auth without site_id', async () => {
    const res = await worker.fetch(new Request('https://auth.example.dev/auth'), env);
    expect(res.status).toBe(400);
  });

  it('rejects /auth with disallowed origin', async () => {
    const res = await worker.fetch(
      new Request('https://auth.example.dev/auth?site_id=https://evil.com'),
      env,
    );
    expect(res.status).toBe(400);
  });

  it('redirects /auth with allowed origin', async () => {
    const res = await worker.fetch(
      new Request('https://auth.example.dev/auth?site_id=https://veilengineering.com'),
      env,
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('location') || '';
    expect(location.startsWith('https://github.com/login/oauth/authorize')).toBe(true);
    expect(res.headers.get('set-cookie')).toMatch(/oauth_state=/);
  });

  it('rejects /callback with missing state cookie', async () => {
    const res = await worker.fetch(
      new Request('https://auth.example.dev/callback?code=abc&state=xyz'),
      env,
    );
    expect(res.status).toBe(400);
  });

  it('completes /callback on successful token exchange', async () => {
    const state = await __test__.mintState(env, 'https://veilengineering.com');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'gh_tok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const req = new Request(
      `https://auth.example.dev/callback?code=abc&state=${encodeURIComponent(state)}`,
      { headers: { cookie: `oauth_state=${encodeURIComponent(state)}` } },
    );
    const res = await worker.fetch(req, env);
    expect(fetchSpy).toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('authorization:github:success');
  });

  it('returns error html when GitHub denies code exchange', async () => {
    const state = await __test__.mintState(env, 'https://veilengineering.com');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad_verification_code', error_description: 'Code expired.' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const req = new Request(
      `https://auth.example.dev/callback?code=abc&state=${encodeURIComponent(state)}`,
      { headers: { cookie: `oauth_state=${encodeURIComponent(state)}` } },
    );
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('authorization:github:error');
    expect(body).toContain('Code expired.');
  });
});
