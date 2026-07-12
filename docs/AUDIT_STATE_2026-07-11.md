# State of the Audit — one-page status (2026-07-11)

Rollup of the platform consistency audit (`AUDIT_2026-07-09_CONSISTENCY.md`) and everything done since. **Every High/Medium finding is resolved, staged for Code, frozen by a guardrail, or specced.** This is the keeper index.

## Findings ledger

| # | Finding | Status | Owner / next |
|---|---|---|---|
| **H1** | Creator fee advertised 15/12/8 but checkout charged flat 5% | ✅ SSOT + snapshots + docs landed; 📝 checkout patch staged | Code applies `FEE_CREATOR_CHECKOUT_PATCH` |
| **H2** | Partner FeeRule seed 15/12/8 contradicted merit 4.5/2.5/0 | ✅ **Done** — seed + PlansTab corrected | — |
| **H3** | 136 `cuid()` tables vs `uuid()` mandate | 🧊 **Frozen** — `no new cuid()` guardrail + CLAUDE.md rule | Pavel: backfill only if hotspot metrics warrant |
| **H4** | Zero tests on audit/security/compliance-client/notifications | ✅ **Done** — all four now have characterization tests | — |
| **H5** | `/api/dev/login` bypass in auth flow | 📝 **Specced** (`H5_AUTH_DEVLOGIN_RETIREMENT_SPEC`) | Code: A0–A3 PR · Pavel: A4 Turnstile |
| **M1** | Money as `Decimal` dollars in channel layer | 🧊 **Frozen** — `no new Decimal money` guardrail | — |
| **M2** | 3 fragmented tier unions + imagegen undefined-limits bug | ✅ **Done** — bug fixed; shadows → SSOT | — |
| **M3** | Duplicate `PLATFORM_FEE_BPS` + rounding drift + channel bypass | ✅/📝 — retired in the fee patches | Code (part of fee patches) |
| **M4** | ~15 copy-pasted money formatters | ✅ SSOT built (`formatCents`); 📝 codemod handed off | Code: `M4_MONEY_FORMATTER_CODEMOD` |
| **M5** | Enum name collisions + dead `NotificationEvent` cast | ✅ **Done** | — |
| **M6** | `Bp/Bps/Pct/Percent` rate-naming drift | ✅ convention set; 4 `Bp→Bps` renames specced | Code: alongside a money PR (`NAMING_CONVENTIONS_AND_DEBT`) |
| **L** | Duplicate enums, shadow unions, vocab, React 18/19, env-var names | ✅ shadow unions fixed; rest specced | Pavel decisions / Code (low priority) |

## Guardrails now enforcing (CI `--strict`) — `scripts/check-invariants.mjs`
`@db.Text` · cross-app `<Link>` · server-action AuditLog · FSM-bypass · Prisma-client-fresh · **no hardcoded platform-fee constant** · **no new `cuid()`** · **no new `Decimal` money field**. Plus CI now runs the money-path vitest suites + the security-headers test (Code, `4d99d0a5`).

## Test coverage added this cycle
`packages/audit` (vocabulary dup-guard) · `packages/security` (headers posture) · `packages/compliance-client` (fail-closed auth) · `packages/notifications` (feedback-token HMAC) · `packages/plans` (creator-fee math) · `packages/orders` (manufacturer-merit) · imagegen goldens wired into the runner. (Tenant isolation was already covered in `packages/auth`.)

## Fee model — the headline fix (reconciled 2026-07-09, Pavel)
**Two fees, two parties, two SSOTs:** creator pays their tier rate (Maker 15 / Builder 12 / Agency 8 %) via `@ilaunchify/plans resolveCreatorFeeBps`; manufacturer merit (Verified 4.5 / Trusted 2.5 / Premier 0 %) is **withheld from the manufacturer's payout** via `@ilaunchify/orders`, shadow-inert until `MeritPolicy.enabled`. Flat 5% retired. Snapshotted onto `Order`/`OrderDispatch`/`Transfer`. Spec: `FEE_MODEL_RECONCILIATION_SPEC_2026-07-09`.

## Still open — by owner
- **Code:** apply the 2 fee hot-file patches (merit first/inert, then creator/money-mover); M4 codemod; H5 A0–A3 auth PR. (All specced; commit per item; remove guardrail allowlist entries as files are fixed.)
- **Pavel (decisions/provisioning):** Turnstile keys (→ `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`) + confirm admin-TOTP; H5 login provider env (`AUTH_SECRET` + Google/Resend); React 18-vs-19; cuid-backfill only if metrics warrant.

## Artifact index (all in `docs/` unless noted)
`AUDIT_2026-07-09_CONSISTENCY.md` (findings) · `REMEDIATION_AND_CODE_HEALTH_PLAN_2026-07-09.md` (strategy) · `FEE_MODEL_RECONCILIATION_SPEC_2026-07-09.md` + `FEE_CREATOR_CHECKOUT_PATCH` + `FEE_SHIPDISPATCH_MERIT_PATCH` · `M4_MONEY_FORMATTER_CODEMOD.md` · `H5_AUTH_DEVLOGIN_RETIREMENT_SPEC_2026-07-11.md` · `NAMING_CONVENTIONS_AND_DEBT_2026-07-11.md` · `AUTH_ENTRANCE_SECURITY_2026-07.md` (pre-existing strategy) · CLAUDE.md "Fee model" section · memory `ilaunchify-fee-model-two-fee`.
