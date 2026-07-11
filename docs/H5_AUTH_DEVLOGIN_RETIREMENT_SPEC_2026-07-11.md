# H5 — Retire the dev-login bypass + fail-closed prod auth (buildable spec, 2026-07-11)

Addresses audit finding **H5** (`AUDIT_2026-07-09_CONSISTENCY.md`). Companion to the strategy doc **`AUTH_ENTRANCE_SECURITY_2026-07.md`** (decisions S1–S5, phased plan, admin-2FA §4B) — this spec is the concrete *retire-the-bypass + verify* slice; it does not restate the entrance strategy.

> **Correction to the audit's framing (verified 2026-07-11).** H5 said "`/api/dev/login` is load-bearing in the real signup/login flow; real auth is unwired." That overstates it. Real auth **is** wired: `signIn('resend', …)` (magic-link) fires in the signup routes when `AUTH_RESEND_KEY + AUTH_EMAIL_FROM` are set; `LoginForm` defaults to magic-link; Google OAuth is configured; `config.ts` uses **database** sessions with real providers and **throws at boot** if a prod runtime has zero providers. `/api/dev/login` is a *fallback* that only triggers when no provider is configured, and it **hard-403s when `NODE_ENV === 'production'`**. So this is **hardening + verification**, not building auth. That reframing lowers the severity but the bypass is still real attack surface and the public entrance is not yet invite-only/Turnstile — both belong to launch.

---

## 1 · What's actually true today (as-is)

- **`/api/dev/login`** (creator/partner/admin) — forges an Auth.js JWT session cookie for any existing user by email. Guards: `NODE_ENV==='production' → 403`; requires `AUTH_SECRET`. Used by: the signup routes' `DEV_REDIRECT` fallback, `LoginForm`'s dev button, and `apps/marketing/src/lib/guest-gate-actions.ts:114` (guest launch).
- **Signup routes** (`apps/{creator,partner}/src/app/api/auth/signup/route.ts`) — create the user, then: if `hasResend` → `signIn('resend')` → `nextStep: 'CHECK_EMAIL'`; **else** → `nextStep: 'DEV_REDIRECT'` with a `/api/dev/login?...` url.
- **`config.ts`** — providers: Google (if `AUTH_GOOGLE_*`), Resend (if `AUTH_RESEND_*`), and a **dev-only Credentials** provider that activates only when `providers.length===0 && NODE_ENV!=='production'` (`isDevSignInOnly`). Session strategy: `isDevSignInOnly ? 'jwt' : 'database'`. Boot throws if `providers.length===0` outside the production-build phase.
- **Net:** in a correctly-configured prod (Resend and/or Google set), the dev bypass is unreachable (403) and unused (real providers win). The exposure is **non-prod/preview environments** (`NODE_ENV!=='production'` staging/preview that's internet-reachable) and **code attack surface**.

## 2 · Residual risks this spec closes

1. **Preview/staging exposure** — any deployed environment with `NODE_ENV!=='production'` (Vercel preview, a misconfigured staging) exposes `/api/dev/login` = one-request session forgery for any known email. The `NODE_ENV` check is the *only* gate.
2. **Silent fallback path** — the `DEV_REDIRECT` branch means "auth works" locally can mask "Resend not actually configured" — a config drift that only surfaces in prod.
3. **Open public entrance** — signup is an open form (no invite gate, no Turnstile) → bot/AI signup floods (the strategy doc's whole premise).

## 3 · The change set

### A0 — Gate `/api/dev/login` behind an explicit opt-in (P0, do first)

`NODE_ENV` alone is too weak (previews aren't "production"). Require BOTH not-prod AND an explicit flag, so the route is dead unless a developer deliberately turns it on locally.

In all three `apps/*/src/app/api/dev/login/route.ts`, replace the guard:
```ts
if (process.env.NODE_ENV === 'production') { …403… }
```
with:
```ts
// Dead unless BOTH: non-prod AND an explicit local opt-in. A reachable preview
// deploy (NODE_ENV!=='production') no longer exposes session forgery. (H5)
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_LOGIN !== 'true') {
  return NextResponse.json({ error: 'Dev sign-in is disabled' }, { status: 403 })
}
```
`ENABLE_DEV_LOGIN=true` lives only in `.env.local` (never in any deployed env). Add it to `.env.example` with a loud comment.

### A1 — Remove the `DEV_REDIRECT` fallback from the real signup flow (P0)

In the creator + partner signup routes, delete the `else → DEV_REDIRECT` branch. When Resend isn't configured, do **not** silently forge a session — return an explicit error so the misconfig is visible:
```ts
if (!hasResend) {
  return NextResponse.json(
    { ok: false, error: 'AUTH_NOT_CONFIGURED', message: 'Email sign-in is not configured.' },
    { status: 503 },
  )
}
// … signIn('resend', …) → CHECK_EMAIL
```
The client's `DEV_REDIRECT` handling (and the `devUrl` field) is removed with it. (Local dev still works: with `ENABLE_DEV_LOGIN=true` a developer hits `/api/dev/login` directly, or configures Resend.)

### A2 — Retire the dev-login affordance in the clients (P0)

- `apps/creator/src/app/(auth)/login/LoginForm.tsx` — remove the `/api/dev/login` button/branch (~lines 48–51); keep magic-link (default) + Google. Same for partner/admin login forms if present.
- `apps/marketing/src/lib/guest-gate-actions.ts:114` — replace the `TODO(prod): swap /api/dev/login for the real magic-link`: the guest launch must establish a session via `signIn('resend')` (or land the guest on `/login` carrying the launch intent), never the bypass.

### A3 — Fail-closed assertion + test (P0)

- `config.ts` already throws when `providers.length===0` outside the build phase. Add an explicit **production** assertion: if `NODE_ENV==='production'` and `isDevSignInOnly` is somehow true, throw at boot (belt-and-suspenders — the dev Credentials provider must never exist in prod).
- Add a test (`packages/auth`): `isDevSignInOnly === false` and the Credentials provider is absent whenever `NODE_ENV==='production'`; a unit assert that the dev-login guard rejects unless `ENABLE_DEV_LOGIN==='true'`.

### A4 — Entrance hardening (P0 launch, per the strategy doc — reference, don't rebuild here)

Execute `AUTH_ENTRANCE_SECURITY_2026-07.md` §4 P0. **Correction (Pavel 2026-07-11): creators are NOT invite-only** — that was the strategy doc's *recommendation* (S3), not an adopted decision. Creator signup stays **open**, defended by **Cloudflare Turnstile** (public form + `/login`) + **disposable-email blocking** + passwordless/passkeys — not an invite gate. **Partners** keep their own access switch (`PartnerAccessMode`, private↔public, from `PARTNER_ONBOARDING_STRATEGY` §7). Plus §4B **admin TOTP 2FA** (already specced there). These are the launch-security posture; A0–A3 above just removes the bypass so the hardened entrance is the *only* door.

## 4 · Why this is buildable-not-built here

This is **Red, security-critical, auth-touching** (`packages/auth` + the app auth routes) and, for A4, a schema migration (invite tokens, TOTP secret, Turnstile verification). None of typecheck / `db:push` / a real sign-in round-trip can run in this session — and a half-migrated auth change can lock users out or give false assurance. So this is the reviewed spec; implement it on a dev session where typecheck + db + a manual magic-link/Google sign-in test all run green. (Same honest sequencing the strategy doc's §4B calls out.)

## 5 · Verification checklist (before it's "done")

- [ ] `/api/dev/login` returns 403 unless `NODE_ENV!=='production' && ENABLE_DEV_LOGIN==='true'` — tested in all three apps.
- [ ] Signup with Resend configured → `CHECK_EMAIL` + a real magic-link email arrives; sign-in completes to a **database** session (`session.strategy==='database'`).
- [ ] Signup without Resend → `503 AUTH_NOT_CONFIGURED` (no session forged), not a silent dev redirect.
- [ ] Google OAuth round-trip works.
- [ ] No production code path references `/api/dev/login` (add a `check:invariants` rule: no `/api/dev/login` string outside the route file + `.env.example`).
- [ ] Turnstile token required on the public form + `/login`; invite token required to create a creator/partner account (A4).
- [ ] Admin TOTP enrollment enforced (A4 / doc §4B).

## 6 · Sequencing & ownership

1. **A0–A3 (retire the bypass + fail-closed)** — one focused PR, **Code owns** (touches `apps/*/api/dev/login`, the signup routes, `LoginForm`, `guest-gate-actions`, `config.ts`, a `packages/auth` test). Behavior-preserving for a correctly-configured environment; the only change a real user sees is that a mis-configured env now errors instead of silently bypassing.
2. **A4 (invite-only + Turnstile + admin 2FA)** — the launch-gating security work; scope per `AUTH_ENTRANCE_SECURITY` P0. Needs **Pavel** calls on Turnstile account + invite model, and a schema migration.
3. **P1 (passkeys primary)** — additive later, per the strategy doc.

**Guardrail to add alongside A2** (cheap, prevents regrowth): a `check:invariants` warn on any `/api/dev/login` reference in `apps/*/src` outside the route file — so the bypass can never be re-wired into a flow.
