// Cancellation/refund money math — the consumer for OrderSettings.cancellationFeeBps
// and refundProcessingFeeBps. PURE (no Prisma / Stripe) so it's unit-testable and
// reusable wherever a refund is computed (admin cancellation review today; a real
// Stripe refund call when that capability ships).
//
// Basis = the order total the creator paid (Order.totalCents). Both fees are
// computed against that basis. The cancellation fee is retained first; the
// processing fee is then clamped to whatever remains, so the two can never
// over-subtract and the refund is always >= 0.

export interface CancellationFeePolicy {
  /** Fee retained on a cancel past the free window (basis points of the total). */
  cancellationFeeBps: number
  /** Non-refundable processing fee on the refund (basis points of the total). */
  refundProcessingFeeBps: number
}

export interface CancellationOutcome {
  /** The order total the refund is computed from (cents). */
  basisCents: number
  /** Cancellation fee retained (cents). */
  cancellationFeeCents: number
  /** Non-refundable processing fee retained (cents). */
  processingFeeCents: number
  /** Net refunded to the creator (cents) — never negative. */
  refundCents: number
  /** True when the combined fees met or exceeded the basis (refund clamped to 0). */
  feesExceededBasis: boolean
}

const bps = (cents: number, b: number): number => Math.round((cents * b) / 10_000)

/**
 * Compute the fee/refund breakdown for a cancellation, given the order total and
 * the fee policy in effect. Deterministic and clamp-safe:
 *  - negative/NaN inputs are floored to 0
 *  - the cancellation fee is capped at the basis
 *  - the processing fee is capped at what remains after the cancellation fee
 *  - the refund is the remainder, never below 0
 */
export function computeCancellationOutcome(
  basisCents: number,
  policy: CancellationFeePolicy,
): CancellationOutcome {
  const basis = Number.isFinite(basisCents) ? Math.max(0, Math.round(basisCents)) : 0
  const cancelBps = Number.isFinite(policy.cancellationFeeBps) ? Math.max(0, policy.cancellationFeeBps) : 0
  const procBps = Number.isFinite(policy.refundProcessingFeeBps) ? Math.max(0, policy.refundProcessingFeeBps) : 0

  const cancellationFeeCents = Math.min(basis, bps(basis, cancelBps))
  const remaining = basis - cancellationFeeCents
  const processingFeeCents = Math.min(remaining, bps(basis, procBps))
  const refundCents = Math.max(0, basis - cancellationFeeCents - processingFeeCents)

  return {
    basisCents: basis,
    cancellationFeeCents,
    processingFeeCents,
    refundCents,
    feesExceededBasis: basis > 0 && cancellationFeeCents + processingFeeCents >= basis,
  }
}
