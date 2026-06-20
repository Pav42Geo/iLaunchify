# OrderSettings — consumer wiring status

`OrderSettings` (admin singleton, `packages/db/src/order-settings.ts`) + per-scope
`OrderSettingsOverride` (tier/market/region) are the admin-tunable source of truth.
This tracks which settings actually drive behavior vs. which are still policy-only.

## Wired (admin changes take effect)

| Setting | Consumer |
|---|---|
| `productionFeeBps` | creator `cart-actions` via `resolveOrderSettings({ creatorTier })` (honors overrides) |
| `flatShippingBaseCents` / `flatShippingPerUnitCents` / `freeShippingThresholdCents` | creator `cart-actions` shipping calc (override-aware) |
| `acceptWindowHours` | `webhook-handlers` → `findRouting` → dispatch `acceptDeadlineAt` |
| `capabilityWeightPct` / `proximityWeightPct` / `certWeightPct` | `webhook-handlers` → routing partner-match scorer |
| `autoCancelAfterHours` | `runStaleOrderAutoCancel` (`packages/orders/auto-cancel.ts`), called by the admin cron |
| `changeoverDays` | marketing `pricing.ts` (D5 multi-flavor lead-time model) |
| `defaultMoq` | **2026-06-20** — marketing `launch-actions` clamp floor + creator `ProductionStep` UI min/clamp/helper (via `getProductionOptions`) |
| `creatorCancelWindowHours` / `autoApproveCreatorCancelBeforeRouting` | **2026-06-20** — creator `requestOrderCancellation` (`orders/cancel-actions.ts`): unpaid + within window + auto-approve → cancel outright; otherwise files a `CancellationRequest` for admin review. UI: Cancel order button on the order detail page. |

## Policy-only (no consumer yet — by design)

| Setting | Why deferred |
|---|---|
| `maxReroutes` | V1 parks a declined/timed-out order at `ON_HOLD` for **manual** admin reroute. The auto-reroute loop that would consume a reroute cap is V1.5 marketplace matching (#153). Wiring it now would imply a loop that doesn't exist. |
| `warehouseReferralFeeBps` | Warehouse-referral revenue path not built. |
| `partnerStrikeOnCancel` | **2026-06-20 — wired, pending migration.** New `PartnerStrike` model; admin `reviewCancellation` records an ACTIVE strike against the at-fault partner (the requester) on APPROVE when the policy is on. Active count shows on the admin partner detail. Migration runs on Mac — see `docs/HANDOFF-partner-strike-migration.md`; cast-guarded until then. |
| `disputeWindowDays` | The `Dispute` model is Stripe-chargeback-shaped (`stripeDisputeId`, `evidenceDueBy`), not a creator-opened post-delivery dispute. Needs its own flow. |

### Partially wired — `cancellationFeeBps` / `refundProcessingFeeBps`

**2026-06-20.** Computed but not yet executed. `computeCancellationOutcome(totalCents, policy)`
(pure, `packages/orders/cancellation-refund.ts`, golden-tested) turns the two fee bps
into `{ cancellationFeeCents, processingFeeCents, refundCents, feesExceededBasis }`
against the order total. Admin `reviewCancellation` computes it on APPROVE and records
the breakdown in the audit snapshot, so the exact fee/refund amounts under the live
policy are captured at decision time. The actual **Stripe refund call** lands with the
payments refund capability (no `prisma.refund` writer exists yet) — at which point it
consumes the same engine.

When a deferred consumer ships, move its row up and drop the constant.
