# Veil launch runbook

## Pre-launch checklist

- [ ] Final content review with client (every page, every image, every link).
- [ ] All images licensed and credited where required.
- [ ] axe-core check: zero critical / serious violations on every template.
- [ ] Two-brand smoke test passes.
- [ ] Lighthouse: ≥ 90 on home and one services page.
- [ ] Netlify project created and linked to the monorepo, build base set to repo root.
- [ ] `netlify.toml` committed; build command runs from root so workspace deps resolve.
- [ ] Decap CMS admin reachable at `/admin`; test login as a real GitHub user with write access.
- [ ] Edit-and-publish smoke test: change a hero heading via Decap, watch the build, verify on the Netlify URL.
- [ ] Forms: contact form submits, Netlify Forms receives, notifications routed to founders' email.
- [ ] Site renders correctly at 320 / 768 / 1024 / 1440 px (manual check).
- [ ] Tab-through every template — focus order sane, focus indicator visible.
- [ ] Screen reader pass on home (VoiceOver) — landmarks and headings flow.
- [ ] JS-disabled: every public page works.
- [ ] OAuth proxy reachable at custom domain; client_id / client_secret / state_secret set as Worker secrets.
- [ ] Client has GitHub access to the repo with the right write scope.

## DNS cutover

Performed by the client at their registrar.

1. In Netlify, add `veilengineering.com` and `www.veilengineering.com` as custom domains. Netlify provides DNS records.
2. Client adds at the registrar (typically GoDaddy / Wix DNS panel):
   - Apex `veilengineering.com` — ALIAS / ANAME to `apex-loadbalancer.netlify.com`, or A records to Netlify's IPs.
   - `www` — CNAME to `<site>.netlify.app`.
3. Verify with `dig veilengineering.com +short` from a clean network.
4. Netlify provisions TLS via Let's Encrypt automatically after DNS resolves.
5. Test both apex and www — both should load and `www` should redirect to apex (or vice versa, per Netlify config).

## Rollback

If anything blocks within 24 hours of cutover, client reverts DNS at the registrar:

1. Restore the previous DNS records (ALIAS / CNAME pointing to Wix).
2. Wix site comes back within DNS TTL.
3. The new Netlify deploy stays live at its `.netlify.app` URL for continued iteration.

Document any decisions made during rollback in `audit-output/launch-incident-<date>.md`.

## Post-launch handoff

- Walk the client through Decap admin: collections, how to add a service page, how to edit hero copy, how to upload images.
- Share where to find Netlify build status and how to invite additional editors.
- Document the engineer's contact for incidents.
- Schedule a 2-week post-launch check-in to triage any issues surfaced by real traffic.
