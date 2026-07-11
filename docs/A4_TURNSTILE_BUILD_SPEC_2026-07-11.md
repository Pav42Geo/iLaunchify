# A4 — Cloudflare Turnstile build spec (for Code)

Concrete build for the bot-defense half of H5 A4 (`AUTH_ENTRANCE_SECURITY_2026-07.md` §3/§4; `H5_AUTH_DEVLOGIN_RETIREMENT_SPEC` §A4). Creators stay **open signup** (NOT invite-only) — Turnstile + disposable-email + passwordless is the defense. Partners keep `PartnerAccessMode`; admin is invite-only + TOTP (separate).

**Env (already provisioned, in `.env.local` + host env):**
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — public, rendered in the browser widget.
- `TURNSTILE_SECRET_KEY` — server-only, verifies the token. Never `NEXT_PUBLIC`.

**Feature-gating:** Turnstile is ON only when the keys are present. Widget renders nothing without the site key; the server verifier **skips (allows)** when the secret is unset — so unconfigured dev/preview still works — but logs a loud warning in production (a prod deploy missing the secret has no bot defense). Pavel can flip the verifier to fail-closed later.

---

## 1 · Shared server verifier — `packages/auth/src/turnstile.ts`

Lives next to `rate-limit.ts` (same entrance-security family). Split pure ↔ io so it's testable.

```ts
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export interface TurnstileResult { ok: boolean; skipped?: boolean; errorCodes?: string[] }

// PURE — interpret Cloudflare's /siteverify JSON. Unit-tested.
export function interpretSiteverify(body: { success?: boolean; 'error-codes'?: string[] }): TurnstileResult {
  return body?.success === true ? { ok: true } : { ok: false, errorCodes: body?.['error-codes'] ?? [] }
}

// IO — POST the token to Cloudflare. Feature-gated: no secret → skip (allow) with a
// prod warning. Never throws; a network failure returns { ok:false } (fail-closed on error).
export async function verifyTurnstile(args: { token: string | null | undefined; ip?: string | null }): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    if (process.env.NODE_ENV === 'production') console.warn('[turnstile] TURNSTILE_SECRET_KEY unset in production — bot defense OFF')
    return { ok: true, skipped: true }
  }
  if (!args.token) return { ok: false, errorCodes: ['missing-input-response'] }
  try {
    const form = new URLSearchParams({ secret, response: args.token })
    if (args.ip) form.set('remoteip', args.ip)
    const res = await fetch(SITEVERIFY, { method: 'POST', body: form })
    return interpretSiteverify(await res.json())
  } catch {
    return { ok: false, errorCodes: ['network-error'] } // fail-closed on error
  }
}
```
Export both from `packages/auth/src/index.ts`. Test `interpretSiteverify` (success→ok, failure→codes) + the skip-when-unset branch (pure part) in the `run-pure-tests`/vitest suite.

## 2 · Client widget — `packages/ui` `<TurnstileWidget>`

Reusable across all four auth apps. Loads Cloudflare's script once, renders the widget, hands the token to the parent.

```tsx
'use client'
// Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (feature off).
// Loads https://challenges.cloudflare.com/turnstile/v0/api.js, renders the widget,
// calls onToken(token) on success and onToken(null) on expire/error.
export function TurnstileWidget({ onToken }: { onToken: (t: string | null) => void }) { … }
```
Implementation notes: use the explicit-render or implicit (`class="cf-turnstile" data-sitekey=… data-callback=…`) API; wire `data-callback` → `onToken(token)`, `data-expired-callback`/`data-error-callback` → `onToken(null)`. Export from `@ilaunchify/ui`.

## 3 · Where it goes

| Surface | Form component (widget) | Server verify | Priority |
|---|---|---|---|
| Creator signup | `apps/creator/src/app/(auth)/signup/SignupForm.tsx` | `apps/creator/.../api/auth/signup/route.ts` | **P0** (open form) |
| Partner signup | `apps/partner/src/app/(auth)/signup/SignupForm.tsx` | `apps/partner/.../api/auth/signup/route.ts` | **P0** |
| Creator login | `apps/creator/src/app/(auth)/login/LoginForm.tsx` | login verify step (§4) | P0 |
| Partner login | `apps/partner/src/app/(auth)/login/LoginForm.tsx` | login verify step | P0 |
| Partner contact form | `apps/partner/src/lib/contact-actions.ts` (+ its form) | in the action, before creating the lead | P1 (the file's own TODO) |
| Admin login | `apps/admin/src/app/(auth)/login/LoginForm.tsx` | — | P2 (invite-only + TOTP; defense-in-depth only) |

## 4 · Wiring

**Signup routes (P0):** the form mounts `<TurnstileWidget onToken={setToken}>` and sends `turnstileToken` in the POST body. At the **top** of each signup `POST` (before `createUserWithRole`):
```ts
const t = await verifyTurnstile({ token: body.turnstileToken, ip: requestIp(req) })
if (!t.ok) return NextResponse.json({ error: 'TURNSTILE_FAILED', message: 'Verification failed — please retry.' }, { status: 403 })
```
(`requestIp` already exists in `packages/auth`.)

**Login (P0):** magic-link/Google go through Auth.js `signIn()` client-side, so verify BEFORE that. Add a tiny `POST /api/auth/turnstile` route (or a server action) that calls `verifyTurnstile`; the login form submits the token there first and only calls `signIn('resend'|'google', …)` on `{ ok: true }`. (Alternatively check the token inside the existing `signIn` callback in `config.ts` where the rate-limiter already lives — but the pre-check route is simpler and keeps the Auth.js flow untouched.)

**Contact form (P1):** in `contact-actions.ts`, call `verifyTurnstile` before persisting — replaces the file's existing `// add … Turnstile` TODO.

## 5 · Tests + verification
- Unit: `interpretSiteverify` (success/failure/codes) + `verifyTurnstile` skip-when-unset (mock the fetch or test only the pure interpret).
- Manual (needs running apps + real keys): widget renders on all P0 forms; a signup with a bad/absent token → 403; a good token → proceeds; with the secret unset locally → skipped (still works).
- Add a `check:invariants` note: `TURNSTILE_SECRET_KEY` must never appear with a `NEXT_PUBLIC_` prefix (leak guard).

## 6 · Ownership / sequencing
Code-owned (auth apps + `packages/auth` verifier + `packages/ui` widget). Independent of the H5 A0–A3 dev-login PR — can land in parallel. Keys are already provisioned; **remember to use the ROTATED secret** (the original was committed to `.env.example` and must be rotated in Cloudflare — see the security note). Buildable-not-built here: needs the running apps + a real Turnstile round-trip to verify.
