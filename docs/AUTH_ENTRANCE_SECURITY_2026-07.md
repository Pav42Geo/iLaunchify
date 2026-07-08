# Auth & Entrance Security — Audit + Hardening Strategy

**Status:** DRAFT for Pavel · 2026-07-07 · covers all three entrances (creator :3000, partner :3002, admin :3003)
**Companion to:** `docs/SECURITY_ARCHITECTURE.md` (LOCKED Tier 0/1/2 plan) and `docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md` §7 (public↔private access).

> **The one-line answer to "LLMs/bots break entrances easily — what do we do?":** your strongest defense is the thing you're already choosing — **invite-only launch**. If accounts only exist by invitation, automated account creation, fake-signup floods, and trial-farming are removed *at the source* — there is no open form to hammer. Layer **Cloudflare Turnstile + passkeys + disposable-email blocking + breached-password checks** on top and you meet current NIST phishing-resistance guidance at low cost. ([invite-only shrinks the threat model](https://thehackernews.com/2026/03/how-to-protect-your-saas-from-bot.html))

---

## 0. Decision register

| # | Decision | Recommendation |
|---|---|---|
| S1 | Primary auth method going forward | **Passkeys (WebAuthn/FIDO2)** primary + short-lived magic-link fallback |
| S2 | Admin console auth | **Separate stack; passkeys/hardware keys mandatory; IP-gated; no email-link** |
| S3 | Bot defense at launch | **Invite-only + Cloudflare Turnstile** on public form + login |
| S4 | Build admin 2FA now (it's LOCKED-planned but unbuilt)? | **Yes — before admin console holds real money/PII** |
| S5 | Managed B2B auth vendor (WorkOS/Stytch) now or later? | **Later** — only when partner orgs demand SSO/SCIM |

---

## 1. Current posture (audit)

**Stack:** Auth.js v5 (NextAuth) + Prisma adapter, shared from `packages/auth/src/config.ts` across all three apps. **Passwordless by design** — Google OAuth + **Resend email magic links** (primary prod method); a dev-only credentials provider + per-app `/api/dev/login` route exist but **hard-refuse in production**.

**What's solid:**
- Passwordless magic-link (no password database to stuff/breach).
- **Admin is already invite-only** (`admin-invite.ts` + `/accept-invite`) with a real RBAC matrix — 4 roles → ~28 capabilities, DB-backed, `requireRole('ADMIN')` + live `requireCapability(cap)`, null-role = zero capabilities (least-privilege).
- DB-backed rate limiting (`RateLimitBucket`) on sign-in + signup (per-IP + per-email).
- Edge middleware presence-checks + real enforcement in server actions via `requireUser`/`ownership.ts` guards (tenant isolation = threat #1, already built).
- Security headers (`packages/security/headers.js`), HSTS, `frame-ancestors 'none'`.

**Real gaps (the hardening targets):**
1. **Public signup is effectively open** — any email can request a magic link / create a row. Defense today = rate-limiting only: **no bot challenge, no disposable-email block, no explicit email-ownership gate before the User/Partner row is created** (`signup.ts` pre-creates rows). This is the #1 exposure for a public partner form.
2. **Admin 2FA/TOTP is LOCKED-planned but NOT built** (SECURITY_ARCHITECTURE Tier 1). The most privileged entrance has the same magic-link posture as users.
3. **CSP is Report-Only** (not enforced yet).
4. **Rate limiter fails open** on DB error (deliberate, but a DoS on Cockroach removes throttling).
5. **No breached-password / anomaly / fingerprint signals** (fine while passwordless + invite-only; matters at public scale).

---

## 2. Why weak entrances fall to bots/AI now (and why invite-only fixes most of it)

Modern bots and LLM-driven automation solve image CAPTCHAs cheaply, script headless browsers, and run distributed credential stuffing under per-IP limits — so **rate-limiting alone is insufficient** ([OWASP Credential Stuffing](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html)). The current defense stack that works:

- **Invisible bot management** — prefer proof-of-work / behavioral challenges over image puzzles. **Cloudflare Turnstile** is free, non-interactive (rotating PoW + browser-API + behavior heuristics), doesn't proxy your traffic, and added a *Block AI Scrapers* toggle (GPTBot/ClaudeBot/PerplexityBot) in 2026. ([Turnstile](https://developers.cloudflare.com/turnstile/), [GA post](https://blog.cloudflare.com/turnstile-ga/))
- **Disposable/temp-email blocking + email verification** — the cheapest abuse vector; block at the door. ([Castle](https://blog.castle.io/understanding-disposable-emails/))
- **Breached-password checks** (HaveIBeenPwned) + graduated lockouts — MFA alone stops ~99.9% of takeovers. ([OWASP Top 10:2025 A07](https://owasp.org/Top10/2025/A07_2025-Authentication_Failures/))
- **Device/browser fingerprinting + anomaly detection** — reused fingerprints, headless signatures, instant-fill timing (scale-up layer). ([Castle](https://blog.castle.io/fake-account-creation-attacks-anatomy-detection-and-defense/))

**Invite-only removes the open surface entirely** — the residual attack surface becomes *login* (defended by passkeys + stuffing controls) and *invite abuse* (defended by one-time, expiring, single-use invite tokens). This is why the private launch (`PARTNER_ONBOARDING_STRATEGY` §7) is a security decision as much as a GTM one.

---

## 3. Passwordless is the right base — go further with passkeys

**Passkeys (WebAuthn/FIDO2) are the 2025–2026 gold standard.** Origin-bound key pairs are *cryptographically unusable on any domain but yours* — a passkey for `ilaunchify.com` can't be replayed on a look-alike phishing page, and there's no secret to type into a fake form. **NIST SP 800-63B-4** (final July 2025) places synced passkeys at **AAL2** and device-bound/hardware passkeys at **AAL3**, and **deprecates email OTP / downgrades SMS** as restricted authenticators. ([FIDO Alliance](https://fidoalliance.org/passkeys/), [NIST SP 800-63B-4](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf))

**Magic links** (your current method) are *email-as-single-factor* — fine as a low-friction fallback if engineered correctly: HTTPS-only, **short expiry + strict one-time use**, bound to the originating session/device, **explicit click-through** (enterprise mail scanners pre-fetch links and can burn single-use tokens), and **never log the token**. ([MojoAuth](https://mojoauth.com/blog/are-magic-links-secure-technical-deep-dive))

### Per-entrance recommendation

| Entrance | Primary | Fallback | MFA / notes |
|---|---|---|---|
| **Creator** (:3000, consumer-ish) | Passkey | Magic link (hardened) | Optional MFA; keep friction low for the <15-min goal |
| **Partner** (:3002, business) | Passkey | Magic link | Add SSO/SAML later if partner orgs ask |
| **Admin** (:3003, privileged) | **Passkey / hardware FIDO2 key — mandatory** | *none* (no email-link) | **Enforced MFA, IP allow-list/VPN, step-up on money/PII, short sessions, separate auth stack, not on a public path** ([WorkOS MFA](https://workos.com/blog/mfa-best-practices), [step-up](https://workos.com/blog/step-up-authentication)) |

Auth.js supports adding WebAuthn/passkeys alongside the existing email provider, so this is additive, not a rewrite.

---

## 4. Phased hardening plan

**P0 — launch (cheap, high-leverage, do with the private-mode work):**
1. **Ship invite-only** for creators + partners (the `PartnerAccessMode` switch from `PARTNER_ONBOARDING_STRATEGY` §7). Biggest single win.
2. **Cloudflare Turnstile** on the public application form + on `/login` (free, invisible).
3. **Block disposable/temp emails** + require email verification before provisioning a real (non-lead) account. Move the `signup.ts` row-creation to *after* verification, or keep public submissions as LEAD-only (already the §7 design).
4. **Build admin 2FA** (S4) — passkeys/hardware keys for the admin console; IP-gate the admin path; keep admin auth separate; add **step-up re-auth** before refunds, tier changes, payouts, and admin overrides (`ownership.ts` + a `requireStepUp()` guard).
5. Harden the magic link: confirm short expiry, one-time use, click-through, no token logging; **rate-limit magic-link requests** per email+IP (already partially there).
6. **Breached-password check** — only relevant if/when you add any password path; otherwise skip while passwordless.

**P1 — passkeys everywhere:** add WebAuthn as the primary method for creator + partner, magic link demoted to fallback. Enforce CSP (flip from Report-Only). Give the rate limiter a fail-closed option for auth endpoints under attack.

**P2 — public-scale:** device/browser fingerprinting + behavioral anomaly detection on the open form; WAF/edge bot rules; adopt a managed **B2B auth vendor** only if partner orgs demand SSO/SCIM — **WorkOS AuthKit** (passkeys/MFA/RBAC free to ~1M MAU, SAML/SCIM, admin portal + audit logs) or **Stytch** (passwordless-first). ([WorkOS vs Stytch](https://workos.com/blog/workos-vs-auth0-vs-stytch))

---

## 4B. Admin 2FA (S4) — concrete implementation spec ("build now")

You greenlit S4. **Honest sequencing note:** this is security-critical auth touching `packages/auth` + a schema migration, and it must be typechecked + tested + `db:push`'d before it's trusted — none of which I can verify in this session. So this is the **buildable spec**; I'll implement it as a reviewed slice on a dev session where typecheck/db run (a half-working 2FA is worse than none — it can lock admins out or give false assurance).

**Approach: TOTP-first, passkeys next.** TOTP (authenticator-app codes) is self-contained (no vendor, works offline, ~a day to ship) and is the right *first* factor to add on top of the existing magic-link admin login. Passkeys/hardware keys (the NIST AAL3 ideal) are the P1 upgrade via WebAuthn.

**Schema (additive migration):** an `AdminMfa` row per admin user — `userId` (unique), `totpSecret` (**encrypted at rest**, not plaintext), `enabledAt`, `backupCodes` (hashed, single-use), `lastVerifiedAt`, `lastStepUpAt`. (Or fields on `User`; separate table keeps user auth and admin MFA decoupled per §3.)

**Flows:**
1. **Enrollment** — admin visits `/settings/security` → server generates a TOTP secret (`otplib`) → render a QR (`qrcode`) + manual key → admin enters a code to confirm → on success, `enabledAt` set + **10 single-use backup codes** shown once (hashed in DB).
2. **Enforcement** — a `requireAdminMfa()` guard (in `packages/auth`, composed with `requireRole('ADMIN')`) blocks the admin app until the user is enrolled **and** has a fresh MFA-verified session claim. First-login **grace window** to enroll; after that, hard gate.
3. **Step-up** — a `requireStepUp(maxAgeMinutes)` guard that re-prompts for a TOTP code before **sensitive actions**: refunds, payouts, tier changes, RBAC edits, partner force-unpin, data export. Adds a `stepUpAt` claim rather than tearing down the session. ([WorkOS step-up](https://workos.com/blog/step-up-authentication))
4. **Recovery** — backup codes for a lost authenticator; a `SUPER_ADMIN` can reset another admin's MFA (audited, `ADMIN_MFA_RESET`).

**Libraries:** `otplib` (RFC-6238 TOTP), `qrcode` (enrollment QR), an encrypt/decrypt helper for the secret at rest (reuse whatever the repo uses for secrets, or Node `crypto` + a KMS/`AUTH_SECRET`-derived key).

**Files to touch:** `packages/auth` (mfa helpers + `requireAdminMfa`/`requireStepUp` guards), `packages/db/prisma/schema.prisma` (the `AdminMfa` model + migration → `db:push` + `db:generate` + `.next` clear), `apps/admin/.../settings/security/*` (enrollment + verify UI), audit events (`ADMIN_MFA_ENROLLED`, `ADMIN_MFA_VERIFIED`, `ADMIN_STEP_UP`, `ADMIN_MFA_RESET`) via `packages/audit`.

**Policy:** every `ADMIN`-role user must enroll (grace on first login); combine with **IP allow-list/VPN** on the admin path and keep admin off a public URL (§3). This gets the admin console to NIST AAL2 immediately; the passkey/hardware-key P1 takes it to AAL3.

**Slice plan when we build it:** (1) schema + `otplib` helpers + pure unit tests (verifiable via `run-vitest-suites`), (2) enrollment UI + verify, (3) `requireAdminMfa` enforcement + grace window, (4) `requireStepUp` on the sensitive-action list, (5) backup codes + super-admin reset. Each slice typechecked + committed before the next.

---

## 5. What NOT to over-build

- Don't add passwords just to bolt on "MFA" — passwordless + passkeys is stronger and simpler.
- Don't buy a bot-management vendor at launch — Turnstile (free) + invite-only covers you until public scale.
- Don't route all traffic through a heavy WAF while private — the open surface is tiny.
- Don't shorten every session globally — reserve short sessions + step-up for the admin/privileged paths.

**Net launch posture:** invite-only + Turnstile + passkeys (hardware keys for admins) + disposable-email blocking + step-up on sensitive admin actions = a low-cost stack that already meets NIST AAL2/AAL3 phishing-resistance guidance, with fingerprinting/anomaly/vendor auth as the deliberate scale-up additions.

### Sources
Current posture: `packages/auth/*`, `packages/security/*`, `docs/SECURITY_ARCHITECTURE.md`, `.claude/memory/ilaunchify-security-architecture-locked.md`. Web sources linked inline (NIST SP 800-63B-4, FIDO Alliance, OWASP Top 10:2025 A07 + Credential Stuffing, Cloudflare Turnstile, Castle, WorkOS/Stytch).
