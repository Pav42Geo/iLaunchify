# HANDOFF → Code: PS-7 per-hop legs + shipToNodeId wiring (2026-07-11)

Cowork kicked off PS-7 (docs/PRINT_PROVIDER_SELECTION.md §8.5). Both [PAVEL] blockers are now
DECIDED (freight bearer + no-creator-facing-UNRESOLVED — see §8.5). This doc hands you the
[CODE-coordinated] wiring: routing.ts / manifest.ts / dispatch-fsm are your zone (shared-hot,
single-writer). Cowork will NOT touch those files.

## What Cowork just landed (commit pending Pavel)

1. **`packages/orders/src/hop-planner.ts`** — pure `planShipmentHops()` + tests (`hop-planner.test.ts`,
   exported from index). Given a RESOLVED application point + destination + per-hop costs, returns:
   - `hops: PlannedHop[]` — `LABELS` (printer→application point) / `GOODS_TRANSFER` (mfr→co-packer)
     / `FINISHED_GOODS` (holder→destination; HOLD-with-remote-application emits the ship-back leg)
   - `labelShipToServiceId` — what you write to `OrderDispatch.shipToNodeId` on the LABEL dispatch
   - `creatorShippingCents` / `platformAbsorbedCents` — bearer attribution already applied
   - Throws on UNRESOLVED input — run `validateGraphCompleteness` first, always.
2. **Schema (additive, gates on Pavel's `pnpm db:push && pnpm db:generate && rm -rf apps/*/.next`):**
   - `OrderDispatch.shipToNodeId String?` — next physical node (soft FK PartnerService.id). Null = legacy.
   - Seed gate `billing:platform_pays_interpartner_freight` (OFF = creator pays, the locked default).

## What's yours

1. **`createDispatches` (routing.ts):** after routing, build `ApplicationGraphInput` per decorated
   component (`appliesLabels` from the mfr/co-pack PartnerService, ACTIVE RELABEL VAS rows from the
   ship-to FC — same derivation as checkout's `labeling-actions.ts`), run `validateGraphCompleteness`,
   then `planShipmentHops`. Write `shipToNodeId` on the LABEL dispatch (= `labelShipToServiceId`) and
   the PRODUCT dispatch (= co-packer id on GOODS_TRANSFER, else null). Emit one PLANNED `ShipmentLeg`
   per hop (`shipFromJson`/`shipToJson` snapshots; `ratedCostCents` = hop.costCents). Read the bearer
   gate via `LogisticsSetting` and pass `platformPaysInterPartnerFreight` — do NOT re-derive billing.
2. **`generateOrderManifest` (manifest.ts):** LABEL-leg ship-to = `shipToNodeId`'s service address,
   never `order.shipTo*` (§8.2.5 invariant). `scopeShipTo` already redacts intermediate hops — this
   is the layer that decides them. Fall back to legacy addressing when `shipToNodeId` is null.
3. **Checkout pre-flight (belt+suspenders, per the 2026-07-11 decision):** on UNRESOLVED at
   placeOrder → block with "temporarily unavailable", flip template coverage to GAP (PS-8
   `printCoverage` machinery), notify admin+mfr. NO creator-facing fix-it menu. Publish gate already
   exists via PS-8 coverage; extend it to consume `validateGraphCompleteness` (application +
   assembly), not just print coverage.
4. **Ledger:** keep each hop a separate ledger item; `platformAbsorbedCents` (bearer flipped) books
   as a platform expense line, never blended into the production fee base (fee base = production
   subtotal + FC labeling only — FEE_MODEL_RECONCILIATION_SPEC).

## Sequencing / guards

- PS-7 validator must be live in publish + checkout BEFORE PS-3 manual printer pinning goes live.
- PS-8 tables are still UNMIGRATED — coordinate: one `db:push` covers both PS-8 and `shipToNodeId`.
- `transitionDispatch` stub: unrelated to this handoff but same file family — wire-or-delete is
  still your open item.
- Checkout's `shipping-hops.ts` (estimateLabelHopCents) stays the pricing source for the LABELS hop
  until the admin rate card lands; `planShipmentHops` deliberately takes costs as input.

Questions → Pavel. Decision trail: PRINT_PROVIDER_SELECTION §8.5 (both [PAVEL] items DECIDED
2026-07-11), memory `ilaunchify-interpartner-freight-bearer` + `ilaunchify-coverage-guard-no-unresolved`.
