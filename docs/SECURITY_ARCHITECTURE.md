# iLaunchify Security Architecture — V2

**Status:** 🔒 LOCKED — Pavel 2026-06-05. Changes to tier scoping or §7 verdicts require a new Pavel decision.
**Supersedes:** `FOD-reference/docs/threats.md`, `SECURITY_CHECKLIST.md` (Cursor-era, written for the retired Express/Redis/Keycloak/Postgres stack — keep the habit, not the content).
**Reconciles:** the Cursor "8 critical architectures" proposal (§7 maps every item to adopt / adapt / defer / drop).
**Guiding principle:** [operational trust > optimization] + [earn the right] — buy proven tools, conservative defaults, defer infrastructure until a real customer or threat pulls us in.

---

## 1. The actual attack surface

Four Next.js 15 apps (marketing 3010 public · creator 3000 · partner 3002 · admin 3003), where **server actions are the entire API surface** — there is no separate backend to firewall. Shared packages enforce auth (`@ilaunchify/auth`, Auth.js v5), payments (Stripe Connect + Subscriptions), audit (`@ilaunchify/audit`), storage (R2 via S3 SDK + presigned URLs). Data in CockroachDB Serverless via Prisma. One internal Python FastAPI compliance service. Email via Resend.

Trust boundaries:

| Boundary | Crossing | Today |
|---|---|---|
| Internet → 3 authed apps | Auth.js session cookie | Guards in actions/pages only — **no middleware layer** |
| Internet → marketing | Public | No security headers |
| Stripe → webhook routes | `constructEvent` signature | ✅ verified, per-domain idempotency |
| Apps → compliance service | Plain HTTP, `COMPLIANCE_SERVICE_URL` | ❌ **no authentication in either direction** |
| Apps → R2 | S3 creds + presigned URLs | ✅ private key paths for cert PDFs |
| Partner ↔ Partner data | `authorize()` ownership walks | ✅ but per-file convention, not centrally enforced |

## 2. Threat model — ranked for THIS business

1. **Tenant isolation / IDOR (critical).** Partners upload trade secrets: recipes, ingredient costs, margins, lead pipelines. One missed ownership check in a server action exposes partner A's recipe to partner B. This is the marketplace-killing threat — partners only join if their data is provably isolated from competitors on the same platform.
2. **Account takeover.** No rate limiting on login/signup; an admin account compromise = full platform compromise (admin drives FSMs, payouts context, all partner data).
3. **Authorization drift.** `requireRole`/`authorize()` are conventions each new file must remember. Surface grows weekly (this is the practical version of the Cursor "zero-trust" goal).
4. **Payment integrity.** Strongest area today: signature-verified webhooks, idempotent handlers, all tier writes through `setCreatorTierWithAudit`.
5. **Internal service abuse.** The unauthenticated compliance service accepts recipe payloads (partner trade secrets) and returns label/compliance verdicts that print on physical FDA labels — tampering here is a *real-world* safety + liability issue, not just data loss.
6. **Injection/XSS/clickjacking.** Prisma parameterizes SQL (✅); no CSP/frame headers anywhere (❌); React escapes by default — keep `dangerouslySetInnerHTML` banned.
7. **Supply chain.** pnpm monorepo, no automated audit/SAST in CI yet.
8. **Cost-abuse.** AI recipe parser + USDA-backed ingredient search are unmetered compute/API sinks.

## 3. Current posture (verified 2026-06-05)

**Strengths:** consistent `requireRole`/`requireUser` in actions · per-action ownership walks (template → PartnerService → Partner) · AuditLog row on every mutation (forensics + the raw material for anomaly detection later) · Stripe signatures + idempotency · upload size/type caps · R2 presigned URLs, private cert paths · no raw SQL.

**Gaps:** no `middleware.ts` in any app · zero security headers · zero rate limiting · compliance service unauthenticated · authz not centralized or tested · no dependency scanning in CI · no incident runbook.

## 4. Tier 0 — this week (no schema, no product risk)

1. **`middleware.ts` in creator / partner / admin.** Coarse edge gate: no valid session → `/login`; role claim mismatch (e.g. CREATOR hitting admin host) → reject. Pages/actions keep their fine-grained guards — this is defense-in-depth, not a replacement. Admin app: also IP-log every request via the existing audit path.
2. **Security headers in all four `next.config`s** (shared helper in `packages/ui` or a new `packages/security`): HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal. CSP starts `Content-Security-Policy-Report-Only`, tightened per app after a week of reports (marketing first — it's public).
3. **Rate limiting, DB-backed.** Sliding-window table in Cockroach (no Redis in the stack; don't add infra for this — Cursor's express-rate-limit equivalent). Scope: login/signup (per-IP + per-email), AI parser actions (per-partner), ingredient search (per-session). Fail-closed on auth, fail-open elsewhere.
4. **Compliance service auth.** Shared bearer token via env on both sides (client sends `Authorization`, FastAPI dependency verifies) + bind service to internal network only. 30-minute fix for a real hole.

## 5. Tier 1 — launch gates

1. **Centralize ownership guards.** Move the `authorize()` pattern into `packages/auth` as typed helpers (`requirePartnerOwnedTemplate`, `requireCreatorOwnedBrand`, …) so every server action uses one audited path. Add a table-driven authz test per helper (same throw-based pattern as `partner-fsm.test.ts`): for each role × resource, assert owner-passes / non-owner-fails / admin-policy.
2. **Zod at server-action boundaries.** Replace ad-hoc field checks; one schema per action input. (The Pydantic instinct from the old doc, applied to the real boundary.)
3. **Secrets hygiene.** Per-env keys (dev/preview/prod), documented rotation runbook, pre-commit secret scanning (gitleaks). Vault is deferred — env-scoped secrets in the host platform are sufficient pre-PMF.
4. **Webhook hardening.** Add a processed-`event.id` table for global dedupe (current per-domain idempotency is good; this closes cross-handler replay).
5. **Admin hardening.** 2FA for ADMIN role (Auth.js TOTP), short session maxAge for admin app, AuditLog alert hook on `PARTNER_TERMINATE` / tier writes / role grants.

## 6. Tier 2 — earn-the-right (deferred until pulled)

CI `pnpm audit` + semgrep SAST gate · CockroachDB Cloud hardening pass (IP allowlist, least-priv SQL users, log export — run the cockroachdb security-audit tooling) · external pen test **before real partner money flows** · incident-response runbook (`docs/` + on-call note) · dependency auto-update bot · CSP enforce-mode everywhere.

## 7. Cursor "8 architectures" — reconciliation

| Cursor item | Verdict | Why |
|---|---|---|
| WAF/Cloudflare in front | **Adapt** | Use host-level (Vercel/Cloudflare) WAF + the Tier-0 middleware. No self-managed WAF. |
| Auth0/JWT | **Drop** | Auth.js v5 is in and working. Migrating auth pre-PMF is risk, not security. |
| HashiCorp Vault + auto-rotation | **Defer** | Host env-scoped secrets + rotation runbook + gitleaks (Tier 1). Vault when there's a team and compliance pull. |
| PostgreSQL RLS | **Drop** | Tenancy is app-layer by locked decision ([earn-the-right memory]); Cockroach Serverless ≠ self-managed RLS ops. Centralized guards + tests (Tier 1) are the equivalent control. |
| Container sandboxing | **Adapt** | Applies to one thing: the compliance service. Non-root container, internal-only network (Tier 0/1). |
| AI threat detection (TensorFlow) | **Drop (V1)** | The AuditLog is the substrate; start with dumb threshold alerts (Tier 1.5). ML detection is theater at this scale. |
| Security rules in design-system components | **Adopt (cheap)** | Shared form primitives already centralize validation UX; add the shared headers helper + a "secure defaults" note to `DESIGN_SYSTEM.md`. |
| Observability arch (Prometheus/Grafana/LogRocket) | **Adapt** | Real need, wrong tools list — see `docs/OBSERVABILITY.md`; host metrics + Sentry-class error tracking first. Separate doc, keep out of scope here. |
| Kafka / Avro / Snowflake data plane | **Drop (V1)** | No streaming consumers exist. Cockroach + future changefeeds when orchestration V2 needs them. |
| DevEx golden templates | **Out of scope** | Good idea, not security. The subagents (`v2-admin-surface-builder` etc.) ARE the golden path. |
| Sustainability / carbon dashboards | **Drop** | Pre-PMF distraction. |
| Edge architecture (Workers + Redis Edge) | **Drop (V1)** | B2B dashboards don't need sub-100ms global edge; marketing can use host CDN defaults. |
| AI gateway | **Defer** | One AI consumer today (recipe parser). Rate-limit + validate it (Tier 0/1); a gateway when there are ≥3 consumers. |
| "Start with security + observability" | **Adopt** | The one strategic call we fully keep. |

## 8. KPIs (replacing the Cursor table)

- 100% of authed routes behind middleware (Tier 0 exit criterion)
- 100% of mutating server actions through a centralized guard helper, proven by the authz test suite (Tier 1 exit)
- Critical dependency patch ≤ 72h (CI gate, Tier 2)
- 0 unauthenticated internal services (Tier 0 exit)
- Rate-limit coverage on every credential + AI endpoint (Tier 0 exit)

## 9. Explicit non-goals (V1)

Vault, Kafka/Avro/Snowflake, Postgres RLS, TensorFlow threat detection, carbon accounting, edge compute, Auth0 migration, SOC 2 prep (revisit when an enterprise creator/partner asks — see compliance tooling when that day comes).
