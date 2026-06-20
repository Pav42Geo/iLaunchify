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

## Policy-only (no consumer yet — by design)

| Setting | Why deferred |
|---|---|
| `maxReroutes` | V1 parks a declined/timed-out order at `ON_HOLD` for **manual** admin reroute. The auto-reroute loop that would consume a reroute cap is V1.5 marketplace matching (#153). Wiring it now would imply a loop that doesn't exist. |
| `warehouseReferralFeeBps` | Warehouse-referral revenue path not built. |
| `creatorCancelWindowHours` / `cancellationFeeBps` / `refundProcessingFeeBps` / `partnerStrikeOnCancel` / `autoApproveCreatorCancelBeforeRouting` / `disputeWindowDays` | Cancellation/refund/dispute flows land incrementally; settings exist so the policy is editable as each consumer ships. |

When a deferred consumer ships, move its row up and drop the constant.
