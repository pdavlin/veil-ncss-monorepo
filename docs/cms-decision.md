# CMS auth decision — Decap + Cloudflare Workers OAuth proxy

## What we picked

**Decap CMS with GitHub backend, fronted by a Cloudflare Workers OAuth proxy.**

The proxy lives at `auth/cf-worker/`, deploys to Cloudflare Workers, and is shared by both `sites/veil` (Phase 3) and `sites/ncss` (Phase 4).

## Why

The originally documented path (Netlify Identity + git-gateway) is in maintenance mode. We needed Decap auth on free tier without taking a dependency that may sunset.

Three options were considered:

1. **Cloudflare Workers OAuth proxy.** Picked.
   - Free tier covers the load (100k requests/day).
   - One small TypeScript file; easy to audit.
   - Brand-neutral: lives at `auth.<engineer>.dev` and serves both sites with no per-brand deploy.
   - Survives Netlify changes.
2. **Netlify Functions broker.** Workable, but couples auth to Netlify and burns function quota.
3. **OAuth.io or similar SaaS.** Adds an account and a credit card surface.

## How it works

```
Decap admin window
        |
        | window.opener.postMessage(...)
        v
auth.<engineer>.dev (CF Worker)
        |
        | code -> token exchange
        v
api.github.com
```

1. User clicks "Login with GitHub" in Decap.
2. Decap opens `https://auth.<engineer>.dev/auth?site_id=<origin>&scope=repo,user`.
3. Worker validates origin against an allowlist, mints a signed state cookie, redirects to GitHub.
4. GitHub redirects back to `/callback?code=...&state=...`.
5. Worker validates the state cookie, exchanges the code for an access token, and posts the result back to the opener via `postMessage`.

## Secrets

Set with `wrangler secret put`:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `OAUTH_STATE_SECRET` — HMAC key, any high-entropy string

Non-secret config in `wrangler.toml`:

- `ALLOWED_ORIGINS` — comma-separated list of site origins permitted to use this proxy.
- `GITHUB_SCOPES` — default scopes (e.g. `repo,user`).

## Operational notes

- The Worker is stateless; no KV, no D1.
- State cookie has a 10-minute TTL.
- Decap config (`sites/<brand>/src/admin/config.yml`) sets `backend.base_url` to the Worker's custom domain and `backend.auth_endpoint` to `auth`.
- Adding a new brand: append its origin to `ALLOWED_ORIGINS` and redeploy. No code change.

## When to revisit

- If GitHub deprecates OAuth Apps in favor of GitHub Apps for this kind of flow.
- If we want preview-deploy editing — that requires per-PR origin allowlisting or a wildcard.
- If we add a third brand and the OAuth callback flow needs branching by `site_id` for separate GitHub Apps.
