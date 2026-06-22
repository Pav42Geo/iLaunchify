# Integrations & API Keys — Admin Control Center

Admin → Integrations & API → **API Keys & Status** (`/integrations`, `platform:admin`).

## Design decision (Pavel, 2026-06-22): env-backed registry, NOT a DB key vault

The platform talks to many external services (Stripe, Google, Cloudflare R2, Resend,
USDA, Anthropic, Sentry, the compliance service, CockroachDB, …). Pavel wanted a
single place to "manage all the keys." We deliberately chose the **secure** form:

- The admin page is a **status control center**, not a vault. It reports whether each
  integration's backing env var is **set in the running environment** — a boolean —
  and links to the vendor dashboard to rotate the key. It **never reads, displays, or
  stores secret values**, and there is **no form that writes a secret into the DB**.
- Secret VALUES live in the host's env / secrets store (Vercel/Railway/Doppler/…),
  never in our database. A single DB leak therefore can't expose Stripe + R2 + the
  auth signing key at once. This keeps the locked Tier 0/1 security posture intact
  (see `SECURITY_ARCHITECTURE.md`).
- Rotation flow: rotate in the vendor dashboard → update the env var on the host →
  redeploy/restart. The page surfaces the dashboard link + a suggested cadence.

### Why not the other options
- **In-app encrypted vault (KMS):** convenient but reopens the secrets-infra decision
  the security plan deferred, and adds real blast-radius if RBAC/KMS is misconfigured.
  Revisit only with a hard requirement + cloud KMS envelope encryption.
- **External secrets manager (Doppler/Infisical):** the natural upgrade if you want to
  edit every key in ONE web UI and rotate without a redeploy. The registry page already
  links out cleanly; adopting one later needs no page change.

## Code

- `apps/admin/src/app/(dashboard)/integrations/integration-registry.ts` — the catalog
  (`INTEGRATIONS[]`: each service's env vars, kind secret/config/public, docs +
  dashboard URLs, rotation cadence, live vs planned) and `resolveIntegrationStatuses()`,
  which reads `process.env` and returns **presence booleans only** (plus a test/live
  classification derived from a non-secret key *prefix* for Stripe).
- `page.tsx` — cream hero + security banner + KPI strip + per-category cards (status
  pill, env badge, per-var ✓/○ checklist with a copy-the-NAME button, rotate/docs links,
  rotation hint).
- Add a new service by appending one row to `INTEGRATIONS`.

## Covered today (live)

Stripe · Google OAuth · Auth.js secret · Resend · Cloudflare R2 · USDA FDC ·
Anthropic · Sentry · Compliance service · CockroachDB · Cron secret.

## Planned slots (pre-listed, not yet wired)

Mux (Academy video) · Pacdora (3D packaging) · Sales tax (Stripe Tax/TaxJar) ·
Shipping (Shippo/EasyPost) · GTIN/UPC (GS1).

## Possible follow-ups

- **Test-connection** buttons (server actions that ping each vendor with the
  already-configured key and report ok/fail — still never exposing the value).
- **Rotation tracking**: a tiny additive `IntegrationMeta` table (code, lastRotatedAt,
  rotateEveryDays, notes) to turn the static cadence hint into real "due" reminders.
- Link out to an adopted secrets manager once chosen.
