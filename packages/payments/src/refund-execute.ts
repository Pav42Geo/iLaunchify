// Order refund executor — turns a `planRefund` result into a Stripe refund + the
// matching DB records. MONEY-MOVING; gated behind STRIPE_REFUNDS_ENABLED (default
// off) so merged code never moves real money until that flag is deliberately set
// after Stripe test-mode verification. See docs/REFUND_EXECUTION.md.
//
// Design notes:
//   - Does NOT change Order.status. Per the cancellation decision, CANCELLED is a
//     terminal "voided" state and the refund is a SEPARATE Refund record. The caller
//     owns any status change (e.g. a dispute resolved in the creator's favor).
//   - The caller owns the audit trail (this package has no audit dep). The returned
//     `plan` + `refundId` are everything the caller needs to log REFUND_PLANNED /
//     REFUND_ISSUED / REFUND_FAILED.
//   - Idempotency keys on every Stripe call so a retry can't double-refund.

import { prisma } from '@ilaunchify/db'
import type { RefundReason } from '@ilaunchify/db'
import { stripe } from './client'
import { planRefund, type RefundPlan } from './refund-plan'

/** Master switch — refunds only hit Stripe when this is explicitly enabled. */
export function refundsEnabled(): boolean {
  return process.env.STRIPE_REFUNDS_ENABLED === 'true'
}

export interface ExecuteRefundInput {
  orderId: string
  /** Gross refund to the creator (cents) — from computeCancellationOutcome etc. */
  refundCents: number
  reason?: RefundReason
  initiatedByUserId: string
}

export type ExecuteRefundResult =
  | { ok: true; executed: boolean; plan: RefundPlan; refundId?: string }
  | { ok: false; error: string }

/**
 * Compute + (when enabled) execute a refund for an order's charge.
 *
 * Flag OFF → returns `{ executed: false, plan }` with NO Stripe call and NO DB
 * write: a pure dry-run the caller can audit as planned intent.
 *
 * Flag ON → creates the Stripe refund, the `Refund` row, per-partner transfer
 * reversals (`Transfer` marked + `PartnerClawback` rows), and returns the refund id.
 * Any Stripe failure returns `{ ok: false }` after attempting no partial money move
 * beyond Stripe's own idempotent retry guarantees.
 */
export async function executeOrderRefund(input: ExecuteRefundInput): Promise<ExecuteRefundResult> {
  const charge = await prisma.charge.findUnique({
    where: { orderId: input.orderId },
    include: { transfers: true },
  })
  if (!charge) {
    return { ok: false, error: 'No charge on this order — nothing to refund.' }
  }

  const plan = planRefund({
    chargeAmountCents: charge.amountCents,
    applicationFeeCents: charge.applicationFeeCents,
    transfers: charge.transfers.map((t) => ({
      transferId: t.id,
      amountCents: t.amountCents,
      status: t.status,
    })),
    refundCents: input.refundCents,
  })

  // Dry-run: nothing moves, nothing is written. The caller records the plan.
  if (!refundsEnabled()) {
    return { ok: true, executed: false, plan }
  }

  try {
    const stripeRefund = await stripe.refunds.create(
      { charge: charge.stripeChargeId, amount: plan.refundCents },
      { idempotencyKey: `refund:${input.orderId}:${plan.refundCents}` },
    )

    const refund = await prisma.refund.create({
      data: {
        chargeId: charge.id,
        orderId: input.orderId,
        stripeRefundId: stripeRefund.id,
        amountCents: plan.refundCents,
        reason: input.reason ?? 'OTHER',
        status: stripeRefund.status === 'succeeded' ? 'SUCCEEDED' : 'PENDING',
        initiatedByUserId: input.initiatedByUserId,
      },
    })

    // Recoup each partner's share. COMPLETED transfers are reversed in Stripe;
    // not-yet-sent ones are cancelled in the DB so the payout scheduler skips them.
    for (const reversal of plan.reversals) {
      const transfer = charge.transfers.find((t) => t.id === reversal.transferId)
      if (!transfer) continue

      if (reversal.action === 'REVERSE' && transfer.stripeTransferId) {
        await stripe.transfers.createReversal(
          transfer.stripeTransferId,
          { amount: reversal.amountCents },
          { idempotencyKey: `reverse:${refund.id}:${transfer.id}` },
        )
        await prisma.transfer.update({
          where: { id: transfer.id },
          data: { reversedByRefundId: refund.id, status: 'REVERSED' },
        })
      } else if (reversal.action === 'CANCEL') {
        await prisma.transfer.update({
          where: { id: transfer.id },
          data: { status: 'CANCELED' },
        })
      }

      // Clawback ledger row (PENDING_APPROVAL) against the partner who got the payout.
      const partner = await prisma.partner.findFirst({
        where: { userId: transfer.destinationUserId },
        select: { id: true },
      })
      if (partner) {
        await prisma.partnerClawback.create({
          data: {
            partnerId: partner.id,
            refundId: refund.id,
            amountCents: reversal.amountCents,
            reason: 'Refund recoupment',
            status: 'PENDING_APPROVAL',
          },
        })
      }
    }

    return { ok: true, executed: true, plan, refundId: refund.id }
  } catch (err) {
    return { ok: false, error: `Refund execution failed: ${(err as Error).message}` }
  }
}
