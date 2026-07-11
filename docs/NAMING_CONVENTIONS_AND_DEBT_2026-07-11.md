# Naming conventions + remaining L-tier debt (2026-07-11)

Closes out the **M6** (rate naming) and **L-tier** (duplicate enums, vocab, shadow unions) findings from `AUDIT_2026-07-09_CONSISTENCY.md`. Some items were fixed this session (§3); the rest are **buildable-not-built** because they're schema-field renames / enum-type migrations that need `db:push` + call-site updates + a real typecheck — not safe to do blind. This doc is the canonical convention (stops new drift) + the prioritized backlog.

---

## 1 · Rate / money naming convention (M6) — CANONICAL

Adopt one name per kind of number. New code MUST follow this; the inventory below migrates the stragglers.

| Concept | Convention | Type | Example |
|---|---|---|---|
| Basis points (fees, rates) | `…Bps` (plural) | `Int` | `productionFeeBps`, `verifiedFeeBps` |
| Percent 0–100 (weight knobs, shares) | `…Pct` | `Int` | `capabilityWeightPct`, `slotSharesPct` |
| Money | `…Cents` | `Int` | `subtotalCents` (never `Decimal` — see M1 guardrail) |

- **Never** `Bp` singular, and **never** `Decimal`/`Float` for a rate or money value (rounding/scale hazard; the `no new Decimal money field` guardrail already blocks money).
- The current schema is **95% compliant**: 23 fields use `Bps`; only **4** use the deprecated `Bp` singular.

### Rename inventory (the 4 `Bp` → `Bps` stragglers)
Each is a Prisma field rename → a migration (use `@map` to keep the DB column stable, or additive-add-then-cutover) + update every call site + `db:push` + `db:generate`.
- `schema.prisma:588` `baseRateBp` → `baseRateBps`
- `schema.prisma:775` `feeRateOverrideBp` → `feeRateOverrideBps`
- `schema.prisma:970` `feeRateOverrideBp` → `feeRateOverrideBps`
- `schema.prisma:2862` `discountBp` → `discountBps`

*Low value, non-zero risk (touches money-model fields). Do it as one focused PR when a money-path change is already open, not standalone.* Once done, a `check:invariants` rule can forbid new `…Bp` (singular) field names.

---

## 2 · Enum vocabulary (L-tier)

### 2a · Byte-identical duplicate enums — consolidate *in a migration*, or accept + document
| Enum A | Enum B | Members | Note |
|---|---|---|---|
| `NicheAssignmentSource` | `PhraseAssignmentSource` | `AUTO_RULE, MANUFACTURER, ADMIN` | identical — same "who assigned this" concept |
| `PartnerCertInstanceStatus` | `PartnerDocumentStatus` | `PENDING_REVIEW, VERIFIED, EXPIRED, REJECTED` | identical member set |
| `TicketRequesterRole` = `PlanAudience` = `AcademyAudience` | | `CREATOR, PARTNER` | three copies of the same audience pair |

**Recommendation: leave them separate, don't consolidate.** Merging Prisma enums means changing a column's type on the other model = a real enum migration for essentially cosmetic gain, and it couples unrelated domains (a niche-assignment change would ripple into phrase assignment). The drift risk is low (all are tiny, stable sets). If you ever do consolidate, do it one pair at a time in a dedicated migration, lowest-traffic first.

### 2b · Content-lifecycle vocabulary — publish a canonical set (convention only)
9+ enums model "content status" with slightly different terminal words (`DEPRECATED` vs `ARCHIVED` vs `RETIRED` vs `DISCONTINUED`). No migration needed — just adopt a canonical vocabulary for NEW enums:
- Content lifecycle: **`DRAFT → ACTIVE → ARCHIVED`** (use `ARCHIVED`, not the synonyms).
- Review/approval: **`PENDING → APPROVED → REJECTED`**.
Existing enums stay; this stops new near-duplicates.

---

## 3 · Fixed this session (shadow unions → SSOT)

Hand-rolled string unions replaced with the generated Prisma enum (or canonical type), so they can't drift:
- `apps/creator/.../products/page.tsx` — `ProductStatus`/`ComplianceOutcome` → Prisma `ProductStatus`/`ComplianceCheckOutcome`.
- `packages/db/src/admin-invites.ts` — `AdminInviteStatus` → Prisma enum.
- `packages/support/.../intake-policy.ts` — → Prisma `SubscriptionTier` (M2).
- `apps/admin/.../disputes/page.tsx` — → Prisma `OrderDisputeStatus`/`OrderDisputeCategory` (M5).
- `packages/notifications/.../center-types.ts` — `TemplateStatus` → `NotificationOverrideStatus` (M5, name-collision).

**Intentionally NOT consolidated:** `packages/orders/.../sample-credit.ts` and `packages/imagegen/.../metering.ts` keep local tier/status unions **by design** — both are documented as deliberately Prisma-free pure modules (unit-testable, decoupled). Anchoring them would violate that intent. (imagegen's real bug — undefined limits — was fixed separately in M2.)

---

## 4 · Other L-tier items — need a Pavel decision (not code)

- **React 18 vs documented 19** — all four apps pin `react ^18.3.1` while CLAUDE.md/memory say "React 19"; Next 15.0.2 defaults to 19. **Decide which is true and align** (pin 19 + test, or update the docs to say 18). Also `packages/ui/package.json` lists `next`/`react` twice — tidy.
- **Env-var name fragmentation** — the same host is read via 2–3 names (`NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_CREATOR_URL` / `CREATOR_LOGIN_HOST`). Pick one canonical name per app URL; alias the rest. Convention change + a small codemod.
- **`ChannelOrderLine` missing `createdAt`/`updatedAt`** (`schema.prisma` ~5390) while its siblings carry both — a one-line additive migration (quick Code task).
- **Debug noise** — ~40 `console.error` in `apps/partner/.../products/new/build-actions.ts`; route through `packages/logger`. **Dead code:** the deprecated `rules-of-hooks`-disabled `SubscribeChoiceRail` component in the checkout tree — delete (Code's checkout zone).

---

## Priority
None of §1–2 is urgent — they're consistency polish now protected by conventions + guardrails. If you touch them, order by ROI: **§4 React-18/19 decision** (real supported-combo question) > **§4 ChannelOrderLine timestamps** (trivial) > **§1 Bp→Bps** (do alongside a money PR) > **§2a enum dedup** (skip unless a migration is already open).
