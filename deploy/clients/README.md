# clients.davlin.io

Static, OIDC-gated client deliverables. Hosted on the linode box behind traefik + pocket-id.

## Layout

```
deploy/clients/
├── docker-compose.yml     # nginx + traefik labels
├── nginx.conf             # static-serve config
├── html/                  # site root (mounted read-only into container)
│   ├── index.html         # bare "private" landing
│   └── ncss/
│       └── audit-report/  # populated by `pnpm run sync:clients` (below)
└── README.md
```

## First-time setup

### 1. DNS

Cloudflare → davlin.io zone → add record:
- Type: `A`
- Name: `clients`
- Value: `172.237.156.70`
- Proxy: orange-cloud (proxied)

This gives `clients.davlin.io` TLS via the existing `*.davlin.io` wildcard cert. No new cert needed.

### 2. Push the stack to linode

From this machine:

```bash
# Sync deploy files + html content to ~/cookbook/clients on linode
rsync -av --delete \
  /Users/pdavlin/Development/ncss-projects/deploy/clients/ \
  linode:~/cookbook/clients/

# Bring up nginx
ssh linode "cd ~/cookbook/clients && docker compose up -d"
```

Traefik picks up the new labels automatically. First visit to `https://clients.davlin.io/` redirects to pocket-id for login; once authed, the same session cookie covers every other `*.davlin.io` host because the cookie domain is set to `.davlin.io`.

## Adding a new client report

```bash
# Example: Veil audit (this project) at /ncss/audit-report/
rsync -av --delete \
  /Users/pdavlin/Development/ncss-projects/audit-output/www.veilengineering.com/site-davlin/ \
  /Users/pdavlin/Development/ncss-projects/deploy/clients/html/ncss/audit-report/

# Then re-sync to linode
rsync -av --delete \
  /Users/pdavlin/Development/ncss-projects/deploy/clients/html/ \
  linode:~/cookbook/clients/html/
```

No container restart needed — nginx serves whatever's currently in the mounted directory.

## Auth

- OIDC provider: `https://login.davlin.io` (pocket-id)
- Middleware: `oidc-auth@file` from `~/cookbook/traefik/rules/oidc-middleware.yml`
- Cookie domain: `.davlin.io` — single sign-on across all `*.davlin.io` hosts
- Adding new users: pocket-id admin UI at `https://login.davlin.io`

## Caching

`nginx.conf` sets:
- Images/fonts: 30-day immutable cache
- HTML: `no-cache, must-revalidate` (updates show up immediately after rsync)
