# Creator-fee patch — checkout + channel reorder (for Code)

Ready-to-apply diff for the **creator-side** half of `FEE_MODEL_RECONCILIATION_SPEC_2026-07-09` — the behavior-changing commit (flat 5% → subscription-tier 15/12/8%). Companion to the merit-withhold patch (`FEE_SHIPDISPATCH_MERIT_PATCH_2026-07-09.md`) and the landed Green helpers.

**Model:** the creator platform fee = their subscription-tier rate, resolved via `resolveCreatorFeeBps` (`@ilaunchify/plans`), admin-editable in Tiers & Plans. The manufacturer merit resolver is removed from the creator's application fee (it now eats the manufacturer's payout). Fee snapshot is frozen onto the `Order`.

**Accepted policy flags (Pavel 2026-07-09):** fee base = **production subtotal + FC labeling, EXCLUDING shipping** (matches the `production_order_subtotal` rule); fallback = **Maker 15%**, never 5%.

**Prerequisite:** apply AFTER `pnpm db:push && pnpm db:generate` (needs `Order.platformFeeBps/Cents/Source`). This is the commit that MOVES money — land it on its own, with the pin-tests green in staging first.

---

## File 1 · `apps/creator/src/app/(checkout)/products/[productId]/checkout/cart-actions.ts`

**1a — imports.** Add the plans helpers; drop the now-unused merit resolver.

```diff
-  resolveOrderProductionFeeBps,
 } from '@ilaunchify/orders'
```
```diff
+import { resolveCreatorFeeBps, resolveCreatorFeeBounds, creatorFeeCents } from '@ilaunchify/plans'
```
*(add the new import beside the other `@ilaunchify/*` imports, ~line 27)*

**1b — delete the flat-fee constant** (~line 76):

```diff
-const PLATFORM_FEE_BPS = 500 // V1 5% — moves to PlatformFeeConfig long-term
```

**1c — the fee block** (lines 624–638). Replace the base-fee + merit resolver + shipping-inclusive base with the creator tier fee:

```diff
-  // --- 7. Platform fee (admin-tunable; falls back to PLATFORM_FEE_BPS) --------
-  // MM-8: the fee resolves from the fulfilling MANUFACTURER's standing badge +
-  // any active fee-grace promo. Shadow-safe — with the merit engine disabled and
-  // no promo it returns the base rate unchanged, so this is inert until go-live.
-  const baseFeeBps = orderSettings.productionFeeBps ?? PLATFORM_FEE_BPS
-  const { feeBps } = await resolveOrderProductionFeeBps({
-    manufacturerServiceId: product.productTemplate?.manufacturerServiceId ?? null,
-    baseFeeBps,
-  })
-  // PS-3c — the FC labeling fee is a production service: it joins the fee base
-  // and the subtotal, not the shipping line.
-  const feeBase = productionTotalCents + fcLabelingCents + shippingCents
-  const platformFeeCents = Math.floor(feeBase * (feeBps / 10000))
+  // --- 7. Platform fee — creator SUBSCRIPTION-TIER rate (FEE_MODEL_RECONCILIATION_SPEC
+  //        2026-07-09). 15/12/8%, admin-editable in Tiers & Plans (FeeRule). Retires the
+  //        flat 5% + manufacturer-merit-on-the-creator model: merit now eats the
+  //        MANUFACTURER's payout, not this charge. Fee base = production subtotal + FC
+  //        labeling (a production service); shipping is NOT in the base (Pavel 2026-07-09).
+  const { feeBps, source: platformFeeSource } = await resolveCreatorFeeBps(creatorTier)
+  const feeBounds = await resolveCreatorFeeBounds(creatorTier)
+  const feeBase = productionTotalCents + fcLabelingCents
+  const platformFeeCents = creatorFeeCents(feeBase, feeBps, feeBounds)
   const grossTotalCents =
     productionTotalCents + fcLabelingCents + shippingCents + platformFeeCents
```

*(`creatorTier` already exists at ~line 578; `orderSettings` is still used for shipping/other knobs, so leave the `resolveOrderSettings` call. Sample-credit logic below is unchanged — it still offsets `platformFeeCents`.)*

**1d — snapshot onto the Order** (the `tx.order.create` data, ~line 811):

```diff
         totalCents,
+        // Creator tier-fee snapshot (FEE_MODEL_RECONCILIATION_SPEC) — frozen so a
+        // historical order reproduces regardless of later FeeRule edits.
+        platformFeeBps: feeBps,
+        platformFeeCents,
+        platformFeeSource,
         manufacturerServiceId: routing.manufacturingServiceId,
```
*(the data object is already `as Parameters<...>['data']`-cast, so this compiles even before regen.)*

**1e — optional:** add `platformFeeBps` / `platformFeeSource` to the `ORDER_CREATED` audit payload (~line 987) for traceability.

---

## File 2 · `apps/creator/src/app/(dashboard)/channels/orders/route-actions.ts`

**2a — imports.**

```diff
-import { requireUser } from '@ilaunchify/auth'
+import { requireUser, getCreatorTier } from '@ilaunchify/auth'
+import { resolveCreatorFeeBps, resolveCreatorFeeBounds, creatorFeeCents } from '@ilaunchify/plans'
```

**2b — delete the flat-fee constant** (~line 24):

```diff
-const PLATFORM_FEE_BPS = 500 // mirror checkout's V1 5% (moves to PlatformFeeConfig)
```

**2c — resolve the creator fee once** (the tier is constant for the whole batch). Add right after `const user = await requireUser()` near the top of the action, BEFORE the per-product loop:

```diff
+  // Creator tier fee for this batch (FEE_MODEL_RECONCILIATION_SPEC 2026-07-09) — same
+  // SSOT as checkout; resolved once, reused per order. Retires the hardcoded 5%.
+  const creatorTier = await getCreatorTier(user.id)
+  const creatorFee = await resolveCreatorFeeBps(creatorTier)
+  const creatorFeeBounds = await resolveCreatorFeeBounds(creatorTier)
```

**2d — compute the per-order fee** (after `subtotalCents`, ~line 148):

```diff
     const subtotalCents = product.priceCents * qty
     const totalCents = subtotalCents // shipping/tax legs land with the logistics rail
+    // Channel reorders use the SAME creator tier fee as checkout (base = subtotal;
+    // channel orders have no FC-labeling/shipping legs at this stage).
+    const platformFeeCents = creatorFeeCents(subtotalCents, creatorFee.feeBps, creatorFeeBounds)
```

**2e — snapshot onto the Order** (the `prisma.order.create` data, ~line 160):

```diff
           totalCents,
+          platformFeeBps: creatorFee.feeBps,
+          platformFeeCents,
+          platformFeeSource: creatorFee.source,
           manufacturerServiceId,
```

**2f — charge the resolved fee, not the flat 5%** (~line 199):

```diff
-          applicationFeeCents: Math.round((subtotalCents * PLATFORM_FEE_BPS) / 10_000),
+          applicationFeeCents: platformFeeCents,
```

---

## After applying

1. `pnpm db:push && pnpm db:generate && rm -rf apps/*/.next` (if not already done for the snapshot fields).
2. **Retire the guardrail allowlist entries** in `scripts/check-invariants.mjs` — delete these two now-fixed lines from `FEE_CONST_ALLOWLIST` so the check ENFORCES them going forward:
   - `apps/creator/src/app/(checkout)/products/[productId]/checkout/cart-actions.ts`
   - `apps/creator/src/app/(dashboard)/channels/orders/route-actions.ts`
   (Leave `subscriptions/page.tsx` until its `feePct` display copy is switched to read from plans — spec §3.)
3. `pnpm type-check` · `pnpm check:invariants --strict` · `node scripts/run-vitest-suites.mjs` (creator-fee pin-tests already green).
4. **Add a checkout math test** (Code; needs the app-level harness): a Maker order of production subtotal $X is charged `round(X × 1500/10000)` (min 100c) as the application fee, and the `Order` row snapshots `platformFeeBps = 1500`, `platformFeeSource = 'TIER_RULE'` — i.e. **fee shown == fee charged**.
5. Update `docs/PLATFORM_SPEC.md` (+ CLAUDE.md fee note) to state the two-fee model: creator tier fee (15/12/8, this patch) + manufacturer merit withhold (4.5/2.5/0, the merit patch); the flat 5% is retired.

**Net:** this is the only change that moves money today — creators are charged their tier rate instead of a flat 5%, the number shown at checkout equals the number charged, and every order snapshots the rate it paid. The manufacturer merit patch remains inert until `MeritPolicy.enabled`.
