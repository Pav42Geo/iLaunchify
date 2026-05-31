// @ilaunchify/plans — Subscribe & Save discount ladder.
//
// V1: hardcoded constant. Single source of truth used by:
//   - SubscribeChoiceRail (run-count dropdown, savings preview, hover
//     tier card, locked teaser caption, info popup "Save up to X%")
//   - OrderSummary "Subscription savings" line
//   - cart-actions placeOrderFromCheckoutDraft when committing the
//     ProductionSubscription
//
// V1.5+: move into a SubscriptionDiscountTier Prisma model so admin
// can edit live from /admin/tiers. The exported helpers below stay
// signature-compatible — only the implementation swaps to a cached
// DB lookup (same pattern as lookupPlanFeature / lookupFeeRate).
//
// Per Pavel 2026-05-31 — all percentages displayed in the UI must
// derive from this ladder, not be hardcoded strings. The "Save up
// to X%" copy uses getMaxDiscountBp(); the per-run preview uses
// the picked tier's discountBp.

export interface SubscriptionDiscountTier {
  /** Number of runs the creator commits to. null = open-ended. */
  runCount: number | null
  /** Discount in basis points (e.g. 800 = 8%). */
  discountBp: number
}

export const SUBSCRIPTION_DISCOUNT_LADDER: readonly SubscriptionDiscountTier[] = [
  { runCount: 3, discountBp: 500 },   // 5%
  { runCount: 6, discountBp: 800 },   // 8%
  { runCount: 12, discountBp: 1200 }, // 12%
  { runCount: null, discountBp: 1000 }, // 10% — open-ended
] as const

/** Highest possible discount across the ladder. Drives "Save up to X%" copy. */
export function getMaxDiscountBp(): number {
  return SUBSCRIPTION_DISCOUNT_LADDER.reduce(
    (max, tier) => (tier.discountBp > max ? tier.discountBp : max),
    0,
  )
}

/** Look up a tier by runCount (null = open-ended). Falls back to 6 runs. */
export function getTierByRunCount(
  runCount: number | null,
): SubscriptionDiscountTier {
  return (
    SUBSCRIPTION_DISCOUNT_LADDER.find((t) => t.runCount === runCount) ??
    SUBSCRIPTION_DISCOUNT_LADDER[1]! // default = 6 runs
  )
}

/** Format a basis-points value as a plain integer percent (e.g. 800 → 8). */
export function formatDiscountPct(discountBp: number): string {
  return (discountBp / 100).toFixed(0)
}
