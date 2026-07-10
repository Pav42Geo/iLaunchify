# iLaunchify — Remediation Safety Plan & Code-Health Architecture (2026-07-09)

Companion to `AUDIT_2026-07-09_CONSISTENCY.md`. This document answers three things:

1. **Safety plan** — how to fix the audit findings without breaking money, auth, or the two-agent working tree.
2. **Step-by-step remediation** — a sequenced, phase-gated plan for the actual findings.
3. **Logic organization** — the principles + guardrails that make this *class* of inconsistency structurally hard to reintroduce.

The through-line: **turn conventions that currently live in human vigilance (CLAUDE.md, memory files) into machine-enforced invariants.** You already do this well (`check-invariants.mjs`, `--strict` in CI, gitleaks pre-commit, flow-manifest). Every finding in the audit is something that *slipped past* because it wasn't yet a check. The plan below both fixes the debt and closes the door behind it.

---

## PART 0 — The core principle: Single Source of Truth (SSOT), enforced

Almost every audit finding is one bug wearing different hats: **the same fact is written down in more than one place, and the copies drifted.** Fees (5% vs 15/12/8), tiers (3 union types), money formatters (13 copies), `cuid` vs `uuid`, rate suffixes (`Bp`/`Bps`/`Pct`/`Percent`). The cure is not "be more careful" — it's structural:

> **Every fact has exactly one authoritative home. Everything else *derives* from it (import, generated type, DB read) and cannot restate it.**

Four rules operationalize that:

- **R1 — Generated over hand-rolled.** Enum/type shapes come from `@ilaunchify/db` (Prisma-generated) via `import type`, never a hand-written string-union that "mirrors" the enum. A hand-rolled mirror can't fail to compile when the enum changes — that's the whole bug.
- **R2 — Constants live in a package, not a file.** Business numbers (fees, caps, thresholds, ports) live in `packages/plans` / `packages/db` config, exported once. UI reads them; UI never re-declares them.
- **R3 — Prove it with a script, not a reviewer.** If a rule is mechanical (no new `cuid()`, no `Decimal` money field, no local money formatter), it becomes a `check-invariants.mjs` entry that fails CI. Reserve human/agent review for judgment.
- **R4 — Additive, reversible, audited.** Schema and money changes are additive migrations, behind flags where behavior changes, always writing an `AuditLog` row, always snapshot-preserving for legal reproducibility.

The rest of this document is these four rules applied.

---

## PART 1 — Safety framework (how to change safely in *this* repo)

Before any fix, classify it. iLaunchify has three properties that make naive edits dangerous: **money paths**, **a shared working tree with a second agent (Code)**, and **a push-not-migrate CockroachDB with a 3-layer stale-client trap.** The framework:

### 1.1 Risk tiers (decide per change)

| Tier | Examples from the audit | Safety bar |
|---|---|---|
| **Green — mechanical, reversible** | new invariant checks, consolidating money formatters into `packages/ui`, importing `TierKey`, deleting dead code | Single-writer file ownership + typecheck + tests. Ship freely. |
| **Yellow — behavior-preserving but wide** | env-var name consolidation, enum de-dup, `Bp`/`Bps` rename | Codemod + full typecheck + grep-verify zero stragglers. One PR per concern. |
| **Red — money / auth / schema-shape / business meaning** | fee reconciliation, `cuid→uuid` backfill, retiring `/api/dev/login`, channel Decimal→cents | Requires a **Pavel decision first**, a written before/after invariant, a test that pins the number, staged rollout behind a flag, and snapshot preservation. Never "just refactor." |

**Rule:** never bundle a Red change with Green cleanup in the same PR. If a reviewer can't tell whether the diff changed a number, the PR is too big.

### 1.2 The non-negotiables for Red changes (money/auth/schema)

1. **Write the invariant down first.** e.g. "A creator on Maker pays exactly `productionFeeBps` on production subtotal; no other fee path applies a different number." Put it in the PR description and as a test assertion *before* touching code.
2. **Pin the number in a test.** Money bugs are silent. `merit-fee.test.ts` / `cancellation-refund.test.ts` are the model — every fee path gets a test that fails if the number moves.
3. **Additive migrations only.** Never `DROP`/rename a column in place. Add the new column/field, dual-write, backfill, cut over reads, retire the old one in a later migration. (CLAUDE.md: no `DROP` without a Pavel decision.)
4. **Flag behavior changes.** If checkout starts charging a different number, it goes behind an `OrderSettings` / admin flag so it can be flipped and rolled back without a deploy.
5. **Snapshot for reproducibility.** Orders/fees already snapshot; preserve that — a historical order must always recompute to what was actually charged, not today's config.

### 1.3 Two-agent working-tree discipline (Cowork + Code share the tree)

Per CLAUDE.md §Multi-agent and the hot-file memory:

- **Single writer per file per session.** Announce ownership. The audit's hot files — checkout (`cart-actions.ts`, `route-actions.ts`), partner product builder, Studio canvas — are exactly where fixes land, so coordinate explicitly.
- **Commit immediately after each change.** Cowork's sandbox can't write `.git`; hand Pavel the `git add … && commit && push` line and have it run before the other agent touches that path.
- **No repo-wide destructive ops while the other agent is active** (`git reset --hard`, `checkout .`).
- **Schema changes carry the full incantation.** After any `db:push`: `pnpm db:generate` → `rm -rf apps/*/.next` → restart `next dev`. Hand off *all three* steps (the stale-client trap has three layers).

### 1.4 Definition of Done for every fix

A change is done when: typecheck passes · `pnpm check:invariants --strict` passes · relevant tests pass (and a new test pins any number/behavior touched) · an `AuditLog` row is written if it mutates · the flow-manifest is regenerated if deps/imports changed · CLAUDE.md / a memory file is updated if a convention changed · it's committed and pushed.

---

## PART 2 — Step-by-step remediation plan (sequenced)

Ordered deliberately: **build the guardrails first**, so the actual fixes can't regress and so any drift *already* in the tree surfaces. Then the business-decision items. Then mechanical debt. Each phase is independently shippable.

### PHASE 0 — Guardrails first (Green, ~1–2 days, do before touching findings)

The goal: make the audit's categories *un-reintroducible*, and let the new checks tell you the true size of each backlog. Add these as entries in `scripts/check-invariants.mjs` (the file is explicitly designed for "add a new invariant = add one entry"). Start each as `warn`, burn the baseline to zero, then flip to the CI `--strict` gate.

- **0.1 — No new `cuid()`.** Warn on any `@default(cuid())` in `schema.prisma` beyond a frozen allowlist of the 136 that exist today. New models must use `uuid()`. (Freezes H3 so it stops growing while you decide on backfill.)
- **0.2 — No `Decimal` money fields.** Warn on `@db.Decimal` on any field whose name matches money (`price|amount|total|cost|fee|subtotal`), allowlisting the 4 known channel fields. (Freezes M1.)
- **0.3 — No hand-rolled tier unions.** Warn on any `type … = .*'maker'.*'builder'` / uppercase variant outside `@ilaunchify/auth`. Forces `import { TierKey }`. (Freezes M2.)
- **0.4 — No local money formatter.** Warn on a `const … = (…cents…) =>` that returns a `$`-prefixed string outside `packages/ui`/`packages/plans`. (Freezes M4.)
- **0.5 — No duplicated fee constant.** Warn on a literal `= 500` / `0.15|0.12|0.08` fee constant outside the SSOT package. (Freezes H1/M3's copies.)
- **0.6 — Env-var name allowlist.** Warn on reads of app-URL env vars outside a canonical set. (Freezes the L env-var fragmentation.)

Each check follows the existing pattern: a small function in `CHECKS[]`, an `AUDIT_ALLOWLIST`-style set of reviewed exceptions keyed by `file:line`, `warn` locally / fail under `--strict` in CI once clean. **This phase writes nothing to money or schema — it's pure instrumentation, safe to ship immediately.**

*Also in Phase 0 (Red-adjacent, but pure addition):* stand up test coverage for the untested critical packages (H4) — `packages/audit`, `packages/security`, `packages/plans`, `packages/compliance-client`. These tests don't change behavior; they *characterize* current behavior so later refactors have a safety net. Write them first, before any refactor that touches those packages.

### PHASE 1 — The fee reconciliation (Red, needs Pavel decision) 

This is the highest-value, highest-risk item (H1 + H2 + M3). **It starts with a decision, not code.**

1. **Decide the model (Pavel).** Which is canonical for creators: the tier-tapered 15/12/8%, or the flat 5%? Is 5% intentional V1 staging with the tier fee planned later, or a bug? (Do the same for partner: confirm merit 4.5/2.5/0 is the *only* live partner number.) Nothing else in this phase can proceed until this is written down. *→ Recommend capturing it in `docs/PLATFORM_SPEC.md` as the single fee-model spec.*
2. **Make `packages/plans` the single fee SSOT.** All fee numbers — base production bps, creator tier rates, partner merit bps — export from one module, read from `OrderSettings`/`MeritPolicy` where admin-tunable. UI imports; UI never restates.
3. **Delete the contradictions.** Remove/fix the partner FeeRule seed 15/12/8 (`seed-subscription-plans.ts:159,188,217`) so it can't shadow merit. Fix `PlansTab.tsx:151` to fall back to the merit value, not the stale seed.
4. **Reconcile the two checkout paths.** Channel reorders (`route-actions.ts`) must read the same `getOrderSettings()` + `resolveOrderProductionFeeBps` as the main cart, and use one rounding function (`floor` vs `round` today).
5. **Pin every path with a test** (per 1.2) and put any behavior change behind the existing `OrderSettings` flag so it's reversible.
6. **Verify:** the number the creator is *shown* and the number *charged* are computed from the same call. Add an invariant/test that asserts they can't diverge.

### PHASE 2 — Auth hardening (Red, launch-blocking, H5)

1. Wire real auth (magic-link / passkey per `AUTH_ENTRANCE_SECURITY_2026-07.md`) into signup/login.
2. Remove `/api/dev/login` from the *real* flow (`signup/route.ts`, `LoginForm.tsx`, `guest-gate-actions.ts:114`); keep it only as an explicitly dev-only utility, or delete it.
3. Confirm `NODE_ENV` is authoritative in every deploy target (it's the only thing currently gating the bypass).
4. Add an invariant check: no production code path routes through `/api/dev/login`.

### PHASE 3 — The `cuid → uuid` decision (Red, H3)

1. **Decide (Pavel):** backfill the hot tables, or formally narrow the rule to "uuid for new models only." Phase 0.1 already froze growth, so this is not urgent — but the write-hotspot on `AuditLog`/`Order`/`Notification` is real.
2. If backfilling: additive only. Because IDs are PKs/FKs, this is a genuine migration project (new column, dual-write, backfill, cut over FKs, retire) — scope it as its own effort, hottest tables first, never an in-place edit. If not: update CLAUDE.md so the doc matches reality and the 0.1 allowlist becomes the permanent line.

### PHASE 4 — Mechanical debt cleanup (Green/Yellow, low risk, parallelizable)

Each is now *protected by a Phase-0 check*, so cleanup can't regress:

- **M2** — replace the 3 tier unions with `import { TierKey } from '@ilaunchify/auth'`; fix the `imagegen/metering.ts` `undefined`-limits path.
- **M4** — one `formatCents` in `packages/ui`; codemod the ~13 call sites.
- **M5** — rename colliding local types (`DisputeStatus`, `TemplateStatus`); add `CREATOR_PAYMENT_FAILED` to `NotificationEvent` and drop the double-cast.
- **L** — de-dup identical enums (`*AssignmentSource`, partner-doc/cert status); finish the packing-taxonomy "15→6" consolidation; publish canonical `{DRAFT/ACTIVE/ARCHIVED}` + `{PENDING/APPROVED/REJECTED}` vocab; standardize `Bps`/`Percent`; consolidate env-var names; resolve React 18-vs-documented-19; route the 40 `console.error` through `packages/logger`; delete the dead `SubscribeChoiceRail` component.

Do these one concern per PR, Yellow ones with a codemod + full-tree grep to prove zero stragglers.

---

## PART 3 — Logic organization: how to build so this doesn't recur

This is the "healthy code" architecture. Three layers.

### 3.1 The SSOT map (where each fact is allowed to live)

| Fact | Single home | How everything else uses it |
|---|---|---|
| Enum/status shapes | `schema.prisma` → generated `@ilaunchify/db` | `import type { OrderStatus } from '@ilaunchify/db'` — never a hand union |
| Status transitions | FSM helpers (`packages/orders`, `academy`, `support`) | call the transition assert; never inline `prisma.update({status})` |
| Fees / tier rates / caps | `packages/plans` (+ `OrderSettings`/`MeritPolicy` for tunable) | `import` / DB read; UI never restates a number |
| Money formatting | one util in `packages/ui` | import it |
| Cross-app URLs | `marketingUrl()`/`creatorUrl()`/`partnerUrl()` + canonical env names | call the helper |
| Tenant/ownership checks | `packages/auth` centralized guards | call the guard, never ad-hoc |
| Audit writes | `packages/audit` | every mutation calls it |

**Design test:** if you can answer "where does this number/shape live?" with exactly one file, you're healthy. If the answer is "a few places," that's the next audit finding.

### 3.2 Money & value discipline (the rounding/units rules)

- **One unit: integer cents (and bps for rates).** No `Float`/`Decimal` for money. The channel `Decimal` fields are the exception to *eliminate*, not to copy.
- **One rounding function.** A single `feeCents(base, bps)` helper — pick `round` or `floor` once and use it everywhere. Divergent rounding across screens *is* a money bug.
- **Rates: one bps convention + one percent convention,** named consistently (`…Bps` for basis points, `…Pct` for 0–100 int), documented in the schema-conventions doc.

### 3.3 Schema conventions doc + guard (make the rules executable)

Create `docs/SCHEMA_CONVENTIONS.md` capturing: `uuid()` PKs, no `@db.Text`, integer-cents money, `Bps`/`Pct` naming, canonical lifecycle vocab, timestamps `@default(now())`/`@updatedAt`, additive-only migrations. Then — critically — **every rule in it that's mechanical becomes a `check-invariants.mjs` check** (Phase 0). A convention doc without a guard is a wish; the guard is the convention.

### 3.4 The enforcement pyramid (fast feedback → deep judgment)

You already have most of this; the plan completes it:

1. **Type system** (compile-time) — `import type` from generated Prisma so enum drift is a *type error*, not a runtime surprise. This is the cheapest, strongest guard; lean on it hardest.
2. **`check-invariants.mjs`** (pre-commit + CI `--strict`) — mechanical invariants. Grow it with Phase 0.
3. **Tests that pin numbers** — every money/fee/threshold path has a test asserting the exact value (the `merit-fee.test.ts` model).
4. **`connection-review` subagent + PR review** — judgment calls a linter can't make: "did this build forget to wire X," contract mismatches, business-meaning drift.
5. **flow-manifest** — the shared map so cross-package wiring stays visible.

Rule of thumb (yours, already in the script header): *don't ask an agent to check what a script can prove.* Push every finding down to the lowest, fastest layer that can catch it.

### 3.5 A "Definition of Done" PR checklist (paste into the PR template)

- [ ] No new hand-rolled enum/tier union — imported from `@ilaunchify/db` / `@ilaunchify/auth`
- [ ] No new business number outside its SSOT package
- [ ] Money in integer cents; one shared formatter; one rounding helper
- [ ] Any number/behavior changed is pinned by a test
- [ ] Mutation writes an `AuditLog` row; status change goes through an FSM
- [ ] Schema change is additive; full stale-client incantation handed off
- [ ] `check:invariants --strict`, typecheck, tests green; flow-manifest regenerated
- [ ] Red change (money/auth/schema)? — decision recorded, behind a flag, snapshot-safe

---

## PART 4 — Suggested sequencing & ownership

| When | Phase | Tier | Who decides |
|---|---|---|---|
| Now (this week) | 0 — guardrails + characterization tests | Green | engineer, no decision needed |
| After 0 | 1 — fee reconciliation | Red | **Pavel: fee model** |
| Parallel to 1 | 2 — auth hardening | Red | Pavel: launch gate |
| After 0, not urgent | 3 — cuid/uuid | Red | **Pavel: backfill vs freeze** |
| Rolling, after 0 | 4 — mechanical debt | Green/Yellow | engineer, one concern per PR |

**Two decisions block everything Red and only you can make them:** (1) is the creator fee 15/12/8 or 5%? (2) backfill the 136 `cuid` tables or formally freeze the rule? Everything else is engineering that the guardrails make safe.

**Start Phase 0 today** regardless — it's zero-risk instrumentation, and it converts every audit finding from "a thing we found once" into "a thing CI will never let back in."

---

### Appendix — the one-sentence version

> Give every fact a single home (generated types, one constants package, FSM helpers, `packages/audit`), and encode each convention as a `check-invariants.mjs` rule so drift fails the build instead of reaching production — then the audit findings become a one-time cleanup instead of a recurring tax.
