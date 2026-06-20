// Refund planning — the deterministic money math behind an order refund. PURE
// (no Stripe / Prisma) so it's fully unit-testable and reviewable in isolation
// before any irreversible money moves. The executor (see docs/REFUND_EXECUTION.md)
// turns a plan into Stripe calls + DB records; this file only decides the amounts.
//
// Model: the creator paid `chargeAmountCents`; the platform withheld
// `applicationFeeCents`, and the remainder was (or will be) transferred to partners.
// To refund the creator `refundCents`, each partner's share is recouped in
// proportion to their transfer, and the platform funds the rest (its fee share +
// any rounding remainder). Sum of all reversals + platformShare == refundCents.

export type TransferReversalAction = 'REVERSE' | 'CANCEL'

export interface RefundPlanTransfer {
  transferId: string
  amountCents: number
  /** Prisma TransferStatus — COMPLETED transfers are reversed; not-yet-sent ones
   *  (PENDING/READY/EXECUTING) are cancelled/reduced by the executor. */
  status: string
}

export interface RefundPlanInput {
  chargeAmountCents: number
  applicationFeeCents: number
  transfers: RefundPlanTransfer[]
  /** Desired gross refund to the creator (e.g. from computeCancellationOutcome). */
  refundCents: number
}

export interface RefundPlanReversal {
  transferId: string
  amountCents: number
  action: TransferReversalAction
}

export interface RefundPlan {
  /** Gross refund to the creator, clamped to 0..chargeAmountCents. */
  refundCents: number
  /** Portion the platform funds — its proportional fee share plus rounding remainder. */
  platformShareCents: number
  /** Per-transfer recoupment from partners. */
  reversals: RefundPlanReversal[]
  /** Sum of reversal amounts. */
  partnerRecoupCents: number
  /** True when the whole charge is being refunded. */
  isFullRefund: boolean
}

const clampInt = (n: number, lo: number, hi: number): number => {
  const v = Number.isFinite(n) ? Math.round(n) : 0
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Compute a refund plan. Deterministic + conservative:
 *  - the refund is clamped to the charge amount
 *  - each partner transfer is recouped in proportion to the refund
 *  - the platform absorbs the rounding remainder (never a partner)
 *  - a COMPLETED transfer → REVERSE; any not-yet-sent transfer → CANCEL
 */
export function planRefund(input: RefundPlanInput): RefundPlan {
  const charge = clampInt(input.chargeAmountCents, 0, Number.MAX_SAFE_INTEGER)
  const refundCents = clampInt(input.refundCents, 0, charge)

  if (charge === 0 || refundCents === 0) {
    return {
      refundCents,
      platformShareCents: refundCents,
      reversals: [],
      partnerRecoupCents: 0,
      isFullRefund: charge > 0 && refundCents === charge,
    }
  }

  const reversals: RefundPlanReversal[] = []
  let partnerRecoupCents = 0
  let remaining = refundCents // cumulative cap so reversals never exceed the refund
  for (const t of input.transfers) {
    const tAmount = clampInt(t.amountCents, 0, charge)
    if (tAmount === 0 || remaining === 0) continue
    // Proportional recoupment, capped at the transfer amount AND the remaining refund
    // (rounding could otherwise push the sum a cent over).
    const amountCents = Math.min(tAmount, remaining, Math.round((tAmount * refundCents) / charge))
    if (amountCents === 0) continue
    reversals.push({
      transferId: t.transferId,
      amountCents,
      action: t.status === 'COMPLETED' ? 'REVERSE' : 'CANCEL',
    })
    partnerRecoupCents += amountCents
    remaining -= amountCents
  }

  // The platform funds the rest — its fee share plus any rounding remainder. Never
  // negative: reversals are capped at `remaining`, so the sum can't exceed the refund.
  const platformShareCents = refundCents - partnerRecoupCents

  return {
    refundCents,
    platformShareCents,
    reversals,
    partnerRecoupCents,
    isFullRefund: refundCents === charge,
  }
}
