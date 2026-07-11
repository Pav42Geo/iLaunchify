# Merit-withhold patch — routing snapshot + shipDispatch + executor (for Code)

Ready-to-apply diff for the **manufacturer merit-fee withhold** half of `FEE_MODEL_RECONCILIATION_SPEC_2026-07-09`. Companion to the already-landed Green work (`packages/plans/creator-fee.ts`, `packages/orders/manufacturer-merit-fee.ts`, schema snapshots, pin-tests, guardrail).

**Model:** merit (4.5/2.5/0%) is **withheld from the manufacturer's payout**, snapshotted at **routing**, and — following the existing `nettedCents` ledger pattern — kept OUT of `Transfer.amountCents` (which stays the gross leg cost) and subtracted at **execution**. `sent = amountCents − meritFeeCents − nettedCents`.

**Prerequisite:** apply AFTER `pnpm db:push && pnpm db:generate` (the spec's additive fields must exist in the generated client, or Hunks B/C won't typecheck). **Shadow-safe:** the resolver returns 0 until `MeritPolicy.enabled`, so every number below is 0 until you flip the engine — landing this changes no money today.

Three hunks, three files. All other legs (LABEL/COPACKING) are untouched — merit only eats the PRODUCT (manufacturer) leg.

---

## Hunk A · `packages/orders/src/routing.ts` — snapshot merit onto PRODUCT legs

**A1 — add the import** (alongside the other `./` imports at the top of the file):

```diff
+import { resolveManufacturerMeritFeeBps, meritWithholdCents } from './manufacturer-merit-fee'
```

**A2 — resolve + stamp the snapshot** just before the transaction (after the `primaryManufacturerId` guard, ~line 727):

```diff
   if (!primaryManufacturerId || !primaryPrintId) {
     return { ok: false, reason: 'NO_DISPATCHES', message: 'No dispatches were produced' }
   }
 
+  // Snapshot the manufacturer MERIT fee onto each PRODUCT leg (FEE_MODEL_RECONCILIATION_SPEC
+  // 2026-07-09). Merit (4.5/2.5/0%) is WITHHELD from the manufacturer's payout at ship, so we
+  // FREEZE the bps here (the badge could change before ship) and precompute the withheld cents
+  // from the leg cost. Non-PRODUCT legs (LABEL/COPACKING) carry no merit. The resolver is
+  // shadow-safe: 0 until MeritPolicy.enabled — so this snapshot is 0 today. Resolved once per
+  // distinct manufacturer service (a multi-item order can have several).
+  const meritBpsByService = new Map<string, number>()
+  const dispatchRowsWithMerit = await Promise.all(
+    dispatchRows.map(async (row) => {
+      if (row.type !== 'PRODUCT') return { ...row, meritFeeBps: 0, meritFeeCents: 0 }
+      let bps = meritBpsByService.get(row.partnerServiceId)
+      if (bps === undefined) {
+        bps = await resolveManufacturerMeritFeeBps(row.partnerServiceId)
+        meritBpsByService.set(row.partnerServiceId, bps)
+      }
+      return { ...row, meritFeeBps: bps, meritFeeCents: meritWithholdCents(row.costCents, bps) }
+    }),
+  )
+
   await prisma.$transaction(async (tx) => {
```

**A3 — write the enriched rows** (the `createMany`, ~line 734; the cast already accepts the extra fields):

```diff
     await (tx as unknown as { orderDispatch: { createMany: (a: unknown) => Promise<unknown> } }).orderDispatch.createMany({
-      data: dispatchRows,
+      data: dispatchRowsWithMerit,
     })
```

---

## Hunk B · `apps/partner/src/app/(dashboard)/orders/[dispatchId]/actions.ts` — record the withhold on the Transfer

In `shipDispatch`, the Transfer-mint block (~line 661). Keep `amountCents` GROSS (the leg cost); record `meritFeeCents` so the executor can net it — mirroring `nettedCents`.

```diff
     if (charge) {
       const partner = dispatch.partnerService.partner
+      // Manufacturer merit-fee withhold (FEE_MODEL_RECONCILIATION_SPEC 2026-07-09 — "merit eats
+      // the manufacturer"). Only the PRODUCT leg carries it; the value was frozen at routing and
+      // is 0 until MeritPolicy.enabled. amountCents stays GROSS (the leg cost); the executor
+      // subtracts meritFeeCents at send, same as nettedCents. sent = amount − merit − netted.
+      const meritFeeCents = dispatch.type === 'PRODUCT' ? (dispatch.meritFeeCents ?? 0) : 0
       await tx.transfer.create({
         data: {
           chargeId: charge.id,
           destinationStripeId: '',
           destinationUserId: partner.userId,
           destinationType: dispatch.type === 'PRODUCT' ? 'MANUFACTURER' : 'PRINT_PROVIDER',
           amountCents: dispatch.costCents,
+          meritFeeCents,
           reason: dispatch.type === 'PRODUCT' ? 'PRODUCT_COST' : 'LABEL_COST',
           status: 'PENDING',
           scheduledFor: new Date(),
         },
       })
     }
```

*(`dispatch` comes from `loadOwnedDispatch`, which uses a full `include` — `dispatch.meritFeeCents` is present after `db:generate`, no select change needed.)*

---

## Hunk C · `packages/payments/src/transfer-execute.ts` — net merit before clawback recoupment

In `executePendingTransfers`, the `sendAmount` init (~line 138). Withhold merit FIRST so clawbacks recoup from the net-of-merit payout; the executor only reads the snapshot, never re-resolves.

```diff
-      let sendAmount = t.amountCents
+      // Merit withhold first (FEE_MODEL_RECONCILIATION_SPEC 2026-07-09): the payout is net of the
+      // manufacturer merit fee BEFORE clawback recoupment. 0 for non-manufacturer transfers and
+      // while the engine is disabled. Snapshotted at ship (shipDispatch); the executor only nets it.
+      const meritFeeCents = t.meritFeeCents ?? 0
+      let sendAmount = t.amountCents - meritFeeCents
       let netting: ClawbackNetting | null = null
       if (clawbackNettingEnabled()) {
         const approved = await (
           prisma as unknown as {
             partnerClawback: {
               findMany: (a: unknown) => Promise<Array<{ id: string; amountCents: number; remainingCents: number | null }>>
             }
           }
         ).partnerClawback
           .findMany({
             where: { partner: { userId: t.destinationUserId }, status: 'APPROVED' },
             orderBy: { createdAt: 'asc' }, // oldest debt first
             select: { id: true, amountCents: true, remainingCents: true },
           })
           .catch(() => [] as Array<{ id: string; amountCents: number; remainingCents: number | null }>)
         netting = computeClawbackNetting(
-          t.amountCents,
+          sendAmount, // net-of-merit pool
           approved.map((c) => ({ id: c.id, remainingCents: c.remainingCents ?? c.amountCents })),
         )
         sendAmount = netting.netAmountCents
       }
```

*(`t.meritFeeCents` is a Transfer scalar; the candidate query uses `include`, so it's selected by default after regen — no query change. The `amountCents: { gt: 0 }` candidate filter is unaffected: `amountCents` is still gross. The existing `sendAmount === 0` fully-netted branch already handles a zeroed payout.)*

---

## After applying

1. `pnpm type-check` — Hunks B/C need the regenerated client (run `db:push`+`db:generate` first).
2. `node scripts/run-vitest-suites.mjs` — the pure math (`meritWithholdCents`, `creatorFeeFromRule`) is already pinned and green.
3. **Add integration coverage** (Code, needs prisma/mocks — out of scope for the pure harness): assert a PRODUCT dispatch row is stamped `meritFeeBps/meritFeeCents` at routing while LABEL/COPACKING rows are 0; assert a shipped PRODUCT transfer records `meritFeeCents` with `amountCents` gross; assert the executor sends `amount − merit − netted`.
4. `pnpm check:invariants` — unaffected (this patch adds no hardcoded fee constant).
5. This is the manufacturer half. The **creator half** (Hunks §3.4/§3.5 of the spec — swap `cart-actions.ts` / `route-actions.ts` to `resolveCreatorFeeBps`, delete the two `PLATFORM_FEE_BPS = 500`, snapshot `Order.platformFeeBps/Cents/Source`) is the behavior-changing part (5%→15/12/8); do it as its own commit and remove those files from the guardrail allowlist as you go.

**Net:** with the engine off, Hunks A–C compute and store 0 and change no payout — safe to land now. When `MeritPolicy.enabled` flips, the manufacturer's transfer is reduced by their badge rate, recorded on both `OrderDispatch` and `Transfer`, and reproducible from the routing snapshot.
