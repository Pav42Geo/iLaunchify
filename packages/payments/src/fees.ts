// Platform application fee defaults.
// Per docs/PAYMENTS.md decision 4: 15% baseline, $1 floor, per-creator override possible.

export const APPLICATION_FEE_RATE_BP = 1500   // 15%
export const APPLICATION_FEE_FLOOR_CENTS = 100

/**
 * Compute the platform fee on a given subtotal.
 * - rate is in basis points (1500 = 15%)
 * - floor is a minimum so micro-orders don't lose money on Stripe per-tx fees
 */
export function computeApplicationFee({
  subtotalCents,
  rateBp = APPLICATION_FEE_RATE_BP,
  floorCents = APPLICATION_FEE_FLOOR_CENTS,
}: {
  subtotalCents: number
  rateBp?: number
  floorCents?: number
}): number {
  const fee = Math.floor((subtotalCents * rateBp) / 10_000)
  return Math.max(fee, floorCents)
}
