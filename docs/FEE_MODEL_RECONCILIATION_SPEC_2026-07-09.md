# Fee-Model Reconciliation — Build-Ready Implementation Spec (2026-07-09)

**Decision (Pavel, 2026-07-09):**
1. The **creator** pays the platform a production fee equal to their **subscription-tier rate — Maker 15% / Builder 12% / Agency 8%**, admin-editable from **Tiers & Plans**.
2. The **manufacturer merit fee** (Verified 4.5% / Trusted 2.5% / Premier 0%) is a **separate** fee **withheld from the manufacturer's payout** ("eats the manufacturer"), not added to the creator's charge.
3. **Retire** the flat 5% `OrderSettings.productionFeeBps` as the creator fee source (keep the column, deprecate its use).

This is a **Red (money-path)** change per `REMEDIATION_AND_CODE_HEALTH_PLAN`. Execution mode: **build-ready spec** — no hot-file edits made in this session. Two files are two-agent hot zones (`cart-actions.ts`, partner `[dispatchId]/actions.ts`); ownership handoff is in §7.

---

## 1 · Target money model (one order)

```
Creator pays (Stripe PaymentIntent)
  = production subtotal  + FC labeling + shipping + tax
  + platform application_fee = CREATOR TIER RATE (15/12/8%) × [fee base]     ← NEW source
                                                                 (was flat 5% + mfr merit)

Manufacturer receives (Stripe transfer, at ship)
  = dispatch.costCents  −  MERIT FEE (4.5/2.5/0%) × dispatch.costCents        ← NEW withhold
                          (0 today; nonzero only once MeritPolicy.enabled)

Printer / packer / FC receive
  = their dispatch.costCents  (unchanged — merit is a manufacturer concept only)
```

Two fees, two parties, two independent knobs:
- **Creator fee** → `FeeRule` rows (per `SubscriptionPlan`), admin-edited in Tiers & Plans, read via `lookupFeeRate`.
- **Manufacturer merit fee** → `MeritPolicy` + partner badge, admin-edited in the Merit console, read via the existing resolver. **Shadow-inert until `MeritPolicy.enabled` flips**, so shipping this withhold today changes nothing until you turn it on.

---

## 2 · What already exists (do NOT rebuild)

- **Admin editability is already wired.** `/tiers/plan/[code]` → `PlanFeeRulesEditor` → `updateFeeRule(...)` (`apps/admin/src/app/(dashboard)/tiers/actions.ts:426`) — capability-gated (`tiers:write`), validates 0–100%, writes an `AuditLog` (`FEE_RULE_UPDATE`), and calls `invalidatePlansCache()`. **No admin UI work needed.**
- **Runtime reader exists:** `lookupFeeRate(planCode, event)` (`packages/plans/src/lookups.ts:225`) returns `{ ratePercent, flatCents, minCents, maxCents }` from a cache the admin edit invalidates. `creatorTierToPlanCode('maker'|'builder'|'agency')` (`lookups.ts:128`) and `FEE_EVENTS.PRODUCTION_ORDER_SUBTOTAL` (`codes.ts:136`) are ready.
- **Checkout already knows the creator tier:** `getCreatorTier(user.id)` → `'maker'|'builder'|'agency'` (`cart-actions.ts:578`).
- **Manufacturer merit resolver exists & is shadow-safe:** `resolveOrderProductionFeeBps({ manufacturerServiceId, baseFeeBps })` (`packages/orders/src/production-fee-resolver.ts:35`) → badge/promo-adjusted bps; returns base unchanged until `MeritPolicy.enabled`.
- **Payout withhold precedent exists:** `Transfer.nettedCents` + `clawback-netting.ts` already reduce a payout and record the reduction — mirror this pattern for merit.
- **The intended split is already documented in code:** `packages/orders/src/transfer-planner.ts:25` `computeTransferPlan()` subtracts the fee from the **creator** and pays partners whole. It's exported but unused — this spec effectively activates its model at the live seam.

---

## 3 · Change set (file-by-file)

### 3.1 — Schema: add fee snapshots (additive migration, `db push`)

Historical orders must recompute to what was actually charged. No fee-rate snapshot exists today (only `Charge.applicationFeeCents`, an amount). Add:

**`Order`** (or `OrderItem` if you prefer per-line; `Order` is simpler and matches the single application_fee):
```prisma
platformFeeBps        Int?   // creator tier rate snapshot at checkout (1500/1200/800)
platformFeeCents      Int?   // resolved creator application fee at checkout
platformFeeSource     String? // 'TIER_RULE' | 'FALLBACK'  (audit/debug)
```

**`OrderDispatch`** (manufacturer leg withhold snapshot):
```prisma
meritFeeBps    Int?   // manufacturer merit bps snapshot (0 until engine enabled)
meritFeeCents  Int?   // withheld from this dispatch's payout
```

**`Transfer`** (so the executed payout is auditable):
```prisma
meritFeeCents  Int  @default(0)  // merit withheld from this transfer (parallels nettedCents)
```

- Additive only — no `DROP`, no rename. All nullable / defaulted so pre-push rows are safe.
- After push: `pnpm db:generate` → `rm -rf apps/*/.next` → restart. **Hand off all three steps.**
- Keep `OrderSettings.productionFeeBps` and the `OrderSettingsOverride` CREATOR_TIER path in the schema (don't drop); they just stop being the creator-fee source. Add a `// DEPRECATED as creator-fee source 2026-07-09 — see FEE_MODEL_RECONCILIATION_SPEC` comment.

### 3.2 — `packages/plans`: a single creator-fee resolver (SSOT)

Add one exported helper so **every** charge path resolves the creator fee identically (no more hand-computed bps). New file `packages/plans/src/creator-fee.ts`:

```ts
// Resolve the creator's platform production fee for a tier. SSOT for the
// creator-side fee — checkout AND channel reorders call this, nothing else
// recomputes it. Reads the admin-editable FeeRule via lookupFeeRate.
export interface CreatorFee { feeBps: number; source: 'TIER_RULE' | 'FALLBACK' }

const FALLBACK_BPS = 1500 // Maker rate — the conservative default when a creator
                          // has no plan-specific rule. NEVER the old 5%.

export async function resolveCreatorFeeBps(tier: 'maker'|'builder'|'agency'): Promise<CreatorFee> {
  const rule = await lookupFeeRate(creatorTierToPlanCode(tier), FEE_EVENTS.PRODUCTION_ORDER_SUBTOTAL)
  if (rule?.ratePercent == null) return { feeBps: FALLBACK_BPS, source: 'FALLBACK' }
  return { feeBps: Math.round(Number(rule.ratePercent) * 100), source: 'TIER_RULE' } // 15.00% → 1500 bps
}

// Apply flat/min/max from the rule if present; returns fee in cents.
export function creatorFeeCents(base: number, feeBps: number, rule?: { flatCents?: number|null; minCents?: number|null; maxCents?: number|null }): number { … }
```

- Use **one** rounding function everywhere (pick `Math.round`; the two current paths use `floor` vs `round` — unify). Document the choice in the file header.
- Honor `flatCents`/`minCents`/`maxCents` from the `FeeRule` (the seed sets `minCents: 100`).
- Export from `packages/plans/src/index.ts`.

### 3.3 — `packages/orders`: a manufacturer-merit resolver (thin wrapper)

The existing `resolveOrderProductionFeeBps` layers merit **over a base**. For the new model the merit fee is standalone (base = 0). Add:

```ts
// packages/orders/src/manufacturer-merit-fee.ts
// The merit fee withheld from a manufacturer's payout. 0 baseline; equals the
// badge bps (450/250/0) only when MeritPolicy.enabled; promo grants win. Reuses
// the existing prisma-backed resolver with baseFeeBps = 0.
export async function resolveManufacturerMeritFeeBps(manufacturerServiceId: string | null): Promise<number> {
  const { feeBps } = await resolveOrderProductionFeeBps({ manufacturerServiceId, baseFeeBps: 0 })
  return feeBps // 0 until enabled, then 450/250/0 or promo
}
```

### 3.4 — `cart-actions.ts` (HOT — Code owns) — creator fee from tier, merit off the creator

Current block (`apps/creator/src/app/(checkout)/products/[productId]/checkout/cart-actions.ts:624–638`):
```ts
const baseFeeBps = orderSettings.productionFeeBps ?? PLATFORM_FEE_BPS       // ← remove
const { feeBps } = await resolveOrderProductionFeeBps({ … })               // ← remove (merit no longer on creator)
const feeBase = productionTotalCents + fcLabelingCents + shippingCents
const platformFeeCents = Math.floor(feeBase * (feeBps / 10000))
```
Replace with:
```ts
const { feeBps, source } = await resolveCreatorFeeBps(creatorTier)          // creatorTier already at L578
const feeBase = productionSubtotalForFee                                     // see §6 policy flag (fee base)
const platformFeeCents = creatorFeeCents(feeBase, feeBps, feeRule)
// snapshot onto the Order create payload:
//   platformFeeBps: feeBps, platformFeeCents, platformFeeSource: source
```
- Delete `const PLATFORM_FEE_BPS = 500` (L76).
- Keep `applicationFeeCents = platformFeeCents - sampleCreditAppliedCents` (L669) and the `createCheckoutSession({ applicationFeeCents })` wiring (L1284) unchanged.
- The merit resolver call **moves out** of this file entirely — merit is now a manufacturer-payout concern (§3.6).

### 3.5 — `route-actions.ts` (channel reorder) — same creator fee, no more hardcoded 5%

`apps/creator/src/app/(dashboard)/channels/orders/route-actions.ts`:
- Delete `const PLATFORM_FEE_BPS = 500` (L24).
- Resolve the creator tier here (use `getCreatorTier`), then `resolveCreatorFeeBps` + `creatorFeeCents`, replacing the hardcoded `Math.round(subtotalCents * 500 / 10_000)` (L199). Snapshot the same fields.

### 3.6 — `shipDispatch` (HOT — partner) — withhold merit from the manufacturer leg

`apps/partner/src/app/(dashboard)/orders/[dispatchId]/actions.ts:663–674`. Today: `amountCents: dispatch.costCents` (full). Change **only the PRODUCT (manufacturer) leg**:
```ts
const meritBps = dispatch.meritFeeBps ?? 0            // snapshot read (see below); 0 today
const meritFeeCents = Math.round(dispatch.costCents * meritBps / 10000)
await tx.transfer.create({ data: {
  …,
  amountCents: dispatch.costCents - meritFeeCents,    // withhold merit
  meritFeeCents,                                       // record it (auditable)
  … } })
```
- Non-PRODUCT legs (printer/packer/FC) are unchanged — paid whole.
- **Snapshot timing (see §6 flag):** recommended — resolve `resolveManufacturerMeritFeeBps(manufacturerServiceId)` and write `OrderDispatch.meritFeeBps/meritFeeCents` when the dispatch is **created at routing** (`packages/orders` routing), then read it here. This freezes the badge at routing time and keeps `shipDispatch` a pure read. Because merit is inert now, the snapshot is 0 and the withhold is a no-op until you enable the engine.

### 3.7 — Retire the flat 5%

- Remove both `PLATFORM_FEE_BPS = 500` literals (§3.4, §3.5).
- Leave `OrderSettings.productionFeeBps` in place but unused as creator fee; add the DEPRECATED comment. (A later cleanup can repurpose or drop it via its own decision.)

---

## 4 · Tests that pin the numbers (write these FIRST — characterize, then change)

Money bugs are silent; per the safety plan every fee path gets a value-pinning test.

- `packages/plans/creator-fee.test.ts` — `resolveCreatorFeeBps` returns 1500/1200/800 for maker/builder/agency; FALLBACK when no rule; `creatorFeeCents` honors flat/min/max and rounding.
- `packages/orders/manufacturer-merit-fee.test.ts` — returns **0** when `MeritPolicy.enabled=false` (shadow); 450/250/0 by badge when enabled; promo wins. (Extend existing `merit-fee.test.ts`.)
- A checkout-math test asserting: creator application fee = tierBps × base, and the manufacturer transfer = costCents − meritCents; and that **the fee shown to the creator equals the fee charged** (the H1 invariant).
- Reconciliation test: `sum(partner payouts) + platform fees + refunds == charge total` still balances under the new split (extend `transfer-planner.test.ts`).

## 5 · Guardrails to add (so this can't drift back) — `scripts/check-invariants.mjs`

- **No hardcoded fee constant:** fail on a `= 500` / `0.15|0.12|0.08` platform-fee literal outside `packages/plans`. (Kills the duplicate `PLATFORM_FEE_BPS` class.)
- **Creator fee resolved through the SSOT:** warn if `cart-actions`/`route-actions` compute an application fee without calling `resolveCreatorFeeBps`.
- **Fee snapshot present:** warn if an `Order` create in a checkout path omits `platformFeeBps`.
Start `warn`, burn to zero, flip to CI `--strict` (matches the existing pattern).

---

## 6 · Open policy flags (confirm before/while building — small, but money)

1. **Fee base.** Today the creator fee base is `productionTotalCents + fcLabelingCents + shippingCents`. The `FeeRule` event is named `production_order_subtotal`, which argues the base should be the **production subtotal only** (exclude shipping, maybe FC labeling). *Recommend: production subtotal (+ FC labeling), exclude shipping.* Confirm — it moves the number.
2. **Fallback when a creator has no plan rule.** *Recommend: 15% (Maker), never 5%.* Confirm.
3. **Merit snapshot timing.** Freeze the manufacturer badge at **routing** (recommended) vs **checkout** vs **ship**. Only matters once the engine is enabled. Confirm.
4. **Merit only eats the manufacturer leg**, not printer/packer/FC — assumed from "eats the manufacturer." Confirm no merit on non-PRODUCT legs.

## 7 · Sequencing, safety & two-agent handoff

**Order of operations (each step independently safe):**
1. Schema migration §3.1 (additive) → `db push` + `db:generate` + `rm -rf apps/*/.next` + restart. *(Owner: whoever runs DB; hand off all steps.)*
2. `packages/plans` §3.2 + `packages/orders` §3.3 helpers + their tests §4. *(Green — Cowork can own these; no hot files.)*
3. Guardrail checks §5 (warn mode). *(Green — `scripts/`.)*
4. **`cart-actions.ts` §3.4 + `route-actions.ts` §3.5** — **Code owns** (checkout hot zone). Single-writer; commit immediately.
5. **`shipDispatch` §3.6 + routing snapshot** — partner hot zone; coordinate ownership.
6. Retire 5% §3.7; flip guardrails to `--strict` once clean.

**Safety properties:**
- Manufacturer withhold ships **inert** (merit disabled → withholds 0), so step 5 is safe to land before the engine is ever enabled.
- The behavior-changing step is #4 (creator 5% → 15/12/8). Gate it so it's reversible: land the helper first, keep a one-line switch (e.g. read the tier rule vs. fall back) until the pin tests are green in staging.
- Every path writes its existing `AuditLog`; add `platformFeeBps`/`platformFeeSource` to the `ORDER_CREATED` audit payload.
- Snapshots make historical orders reproducible regardless of later admin edits.

**Definition of Done:** typecheck green · `check:invariants --strict` green · all §4 pin-tests green · fee shown == fee charged (asserted) · manufacturer withhold = 0 with engine off (asserted) · reconciliation balances · CLAUDE.md / `PLATFORM_SPEC.md` updated to state the two-fee model · committed + pushed.

---

### One-paragraph summary for Code

Creator platform fee now comes from the creator's subscription-tier `FeeRule` (15/12/8%, already admin-editable in Tiers & Plans) via a new `resolveCreatorFeeBps` in `packages/plans`; delete the two `PLATFORM_FEE_BPS = 500` constants and stop calling the merit resolver on the creator's application fee. The manufacturer merit fee (4.5/2.5/0%) moves to a payout withhold in `shipDispatch` (`amountCents = costCents − meritFeeCents`), snapshotted at routing and inert until `MeritPolicy.enabled`. Add fee-bps snapshots to `Order`/`OrderDispatch`/`Transfer`, pin every number with a test, and add invariant checks so no fee constant can be hardcoded again. Confirm the four policy flags in §6 first — the fee base and fallback move the actual number.
