# Secrets — inventory & rotation runbook

**Status:** Tier 1.3 deliverable of `SECURITY_ARCHITECTURE.md` (LOCKED 2026-06-05).
**Rules:** one value per environment (dev / preview / prod — never share), secrets live only in env (`.env.local` root + `services/compliance/.env`), never in code or chat. Pre-commit gitleaks scan guards the repo (`brew install gitleaks` to activate).

## Inventory

| Secret | Used by | Where to rotate | Blast radius if leaked |
|---|---|---|---|
| `AUTH_SECRET` | Auth.js, all apps | generate: `openssl rand -base64 32` | session/cookie forgery — rotate immediately, all users re-login |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth | Google Cloud Console → Credentials | OAuth impersonation of the app |
| `AUTH_RESEND_KEY` / `AUTH_EMAIL_FROM` | magic links + notifications | Resend dashboard → API Keys | email-sending abuse, phishing from your domain |
| `DATABASE_URL` | all apps + compliance service | CockroachDB Cloud → SQL Users (new password) | full data access — most critical secret |
| `STRIPE_SECRET_KEY` | payments | Stripe dashboard → API keys → roll | money movement — most critical with DATABASE_URL |
| `STRIPE_WEBHOOK_SECRET` (×2: creator, partner) | webhook signature verify | Stripe dashboard → Webhooks → roll secret | forged webhook events (order/tier flips) |
| `COMPLIANCE_SERVICE_TOKEN` | apps ↔ compliance service | generate: `openssl rand -hex 32`, set BOTH sides | recipe exfiltration + forged label verdicts |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | storage, compliance service | Cloudflare → R2 API tokens | asset read/write (cert PDFs are private) |
| AI provider key (recipe parser) | partner app | provider dashboard | spend abuse |

## Rotation procedure (any secret)

1. Generate/roll the new value at the provider (column 3).
2. Update every env that uses it (root `.env.local`; compliance service `.env` where applicable; hosting platform env for deployed envs).
3. Restart what reads it: `pnpm dev` locally; redeploy hosted apps; restart uvicorn for the compliance service.
4. Verify the dependent flow (sign-in for AUTH_*, a test webhook for STRIPE_WEBHOOK_SECRET, `/healthz` + an authed `/v1` call for the compliance token).
5. Revoke the old value at the provider — rotation isn't done until the old one is dead.

## On suspected leak

Rotate (steps above) **immediately** for: `DATABASE_URL`, `STRIPE_SECRET_KEY`, `AUTH_SECRET` — in that order. Then: check the AuditLog + `/admin/security` for anomalous sessions/events, revoke all sessions for affected users (Security & Access → Revoke all), and check Stripe's event log for unexpected activity. Write up what happened in `docs/` — even two paragraphs — so the next incident starts from precedent.

## Standing hygiene

- A value pasted into chat/issue/log is **burned** — rotate it even if "probably fine" (precedent: the dev `COMPLIANCE_SERVICE_TOKEN` of 2026-06-05 is dev-only for this reason).
- New secret → add a row to the inventory table in the same PR.
- Quarterly: walk the table, rotate anything that hasn't moved in 6+ months (low ceremony, builds the muscle).
