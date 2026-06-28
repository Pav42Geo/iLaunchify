// Partner payout executor — turns the PENDING `Transfer` rows that `shipDispatch`
// queues at ship time into actual Stripe Connect transfers (the manufacturer /
// print-provider gets paid). MONEY-MOVING; gated behind STRIPE_TRANSFERS_ENABLED
// (default off) so merged code never moves real money until that flag is
// deliberately set after Stripe test-mode verification — same posture as the
// refund executor (STRIPE_REFUNDS_ENABLED).
//
// Design notes:
//   - The payout SPLIT is already computed (orders/transfer-planner) and the
//     payable is already recorded (Transfer row, amountCents per leg). This file
//     only EXECUTES: it does not decide amounts.
//   - Idempotency key `transfer:<transferId>` on every Stripe call, so a retry
//     (overlapping cron, Stripe network blip) can never double-pay a partner.
//   - Claim-to-execute: PENDING → EXECUTING via a conditional updateMany so two
//     concurrent cron runs can't both grab the same row.
//   - Account-gated: only rows whose destination partner account is ACTIVE
//     (payouts enabled) are attempted. A partner who hasn't finished Connect
//     onboarding leaves their Transfer PENDING (held, not failed) until they do.
//   - source_transaction: passed only when we hold a real Stripe charge id
//     (`ch_…`); otherwise the transfer draws from the platform balance. (In
//     onPaymentSucceeded, Charge.stripeChargeId falls back to the PI id when
//     latest_charge isn't expanded — never pass a `pi_…` as source_transaction.)
//   - No audit dep in this package: the caller (cron route) owns logging. The
//     returned per-row outcomes are everything it needs.

import { prisma } from '@ilaunchify/db'
import { stripe } from './client'
import { clawbackNettingEnabled, computeClawbackNetting, type ClawbackNetting } from './clawback-netting'

/** Master switch — partner payouts only hit Stripe when this is explicitly enabled. */
export function transfersEnabled(): boolean {
  return process.env.STRIPE_TRANSFERS_ENABLED === 'true'
}

export type TransferOutcome = {
  transferId: string
  orderId: string
  destinationUserId: string
  amountCents: number
  result:
    | 'paid'
    | 'netted' // fully recouped against APPROVED clawbacks — no Stripe transfer sent
    | 'held_account_inactive'
    | 'held_charge_unsettled'
    | 'skipped_claimed'
    | 'failed'
    | 'superseded' // a refund cancelled the row mid-flight; transfer was sent — flag for manual recoup
  stripeTransferId?: string
  detail?: string
}

export type ExecuteTransfersResult = {
  executed: boolean // false when the flag is off (dry inventory only)
  enabled: boolean
  considered: number
  paid: number
  netted: number // fully recouped against clawbacks (no Stripe transfer)
  held: number
  failed: number
  superseded: number // transfer sent but a refund cancelled the row mid-flight
  outcomes: TransferOutcome[]
}

const ACTIVE = 'ACTIVE'
const SUCCEEDED = 'SUCCEEDED'

/**
 * Process queued partner payouts. Picks up PENDING Transfer rows whose charge
 * has SUCCEEDED and whose destination partner account is ACTIVE, and sends each
 * via Stripe Connect. Safe to run on a cron every minute — idempotent per row.
 *
 * @param limit max rows per run (default 100) — keeps a single invocation bounded.
 */
export async function executePendingTransfers(limit = 100): Promise<ExecuteTransfersResult> {
  const now = new Date()
  const enabled = transfersEnabled()

  // Candidate rows: queued, due, with their charge + destination account.
  const candidates = await prisma.transfer.findMany({
    where: {
      status: 'PENDING',
      amountCents: { gt: 0 },
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: {
      charge: { select: { status: true, stripeChargeId: true, orderId: true } },
      destinationUser: { select: { stripeAccountId: true, stripeAccountStatus: true } },
    },
  })

  const outcomes: TransferOutcome[] = []

  for (const t of candidates) {
    const base = {
      transferId: t.id,
      orderId: t.charge.orderId,
      destinationUserId: t.destinationUserId,
      amountCents: t.amountCents,
    }

    // Hold (do not claim) when the money isn't ready to move — these stay PENDING
    // and are retried on the next run once the precondition clears.
    if (t.charge.status !== SUCCEEDED) {
      outcomes.push({ ...base, result: 'held_charge_unsettled' })
      continue
    }
    const destination = t.destinationUser.stripeAccountId
    if (!destination || t.destinationUser.stripeAccountStatus !== ACTIVE) {
      outcomes.push({ ...base, result: 'held_account_inactive' })
      continue
    }

    // When the flag is off we report what WOULD pay, but touch neither the DB nor
    // Stripe — a true dry run for the verification runbook.
    if (!enabled) {
      outcomes.push({ ...base, result: 'held_account_inactive', detail: 'STRIPE_TRANSFERS_ENABLED off (dry run)' })
      continue
    }

    // Claim: PENDING → EXECUTING. If another run already claimed it, count is 0.
    const claim = await prisma.transfer.updateMany({
      where: { id: t.id, status: 'PENDING' },
      data: { status: 'EXECUTING' },
    })
    if (claim.count !== 1) {
      outcomes.push({ ...base, result: 'skipped_claimed' })
      continue
    }

    try {
      // Clawback netting (opt-in, its own flag): recoup the partner's APPROVED
      // clawbacks out of this payout before sending. Pure math (computeClawbackNetting);
      // reduces the amount sent, never below 0; partial recoup carries to a future
      // payout. The clawback rows are reduced in the SAME txn that settles the
      // transfer (below) — never before — so a failed/raced payout can't under-recoup.
      let sendAmount = t.amountCents
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
          t.amountCents,
          approved.map((c) => ({ id: c.id, remainingCents: c.remainingCents ?? c.amountCents })),
        )
        sendAmount = netting.netAmountCents
      }

      // Settle the transfer + recoup the netted clawbacks ATOMICALLY (one txn,
      // compare-and-set on EXECUTING). Stripe's idempotency key means a retry after a
      // committed-Stripe / failed-DB window re-sends the same amount harmlessly and
      // re-applies the (still-unreduced) clawbacks. Returns the settle outcome.
      const settle = async (stripeTransferId: string | null): Promise<'settled' | 'superseded'> => {
        return prisma.$transaction(async (tx) => {
          const upd = await (
            tx as unknown as { transfer: { updateMany: (a: unknown) => Promise<{ count: number }> } }
          ).transfer.updateMany({
            where: { id: t.id, status: 'EXECUTING' },
            data: {
              status: 'COMPLETED',
              ...(stripeTransferId ? { stripeTransferId } : {}),
              nettedCents: netting?.nettedCents ?? 0,
              destinationStripeId: destination,
              executedAt: new Date(),
              failureReason: null,
            },
          })
          if (upd.count !== 1) return 'superseded' as const
          for (const app of netting?.applications ?? []) {
            await (
              tx as unknown as { partnerClawback: { update: (a: unknown) => Promise<unknown> } }
            ).partnerClawback.update({
              where: { id: app.clawbackId },
              data: {
                remainingCents: app.newRemainingCents,
                ...(app.fullyRecouped ? { status: 'EXECUTED', resolvedAt: new Date() } : {}),
              },
            })
          }
          return 'settled' as const
        })
      }

      // Fully netted: the partner owed ≥ this payout. Don't call Stripe (a 0-amount
      // transfer would 400) — just settle as netted and recoup the clawbacks.
      if (sendAmount === 0) {
        const r = await settle(null)
        if (r === 'settled') {
          outcomes.push({ ...base, result: 'netted', detail: `Fully recouped against clawbacks (−${t.amountCents}c)` })
        } else {
          outcomes.push({ ...base, result: 'superseded', detail: 'Row left EXECUTING (refund raced) before netting settled' })
        }
        continue
      }

      // Only a real charge id (ch_…) is valid as source_transaction; a pi_… fallback
      // would 400. Without it, Stripe draws from the platform's available balance.
      const sourceTransaction = t.charge.stripeChargeId.startsWith('ch_') ? t.charge.stripeChargeId : undefined

      const transfer = await stripe.transfers.create(
        {
          amount: sendAmount, // net of any clawback recoupment
          currency: 'usd',
          destination,
          ...(sourceTransaction ? { source_transaction: sourceTransaction } : {}),
          description: `iLaunchify ${t.reason} payout for order ${t.charge.orderId}`,
          metadata: {
            ilaunchify_transfer_id: t.id,
            ilaunchify_order_id: t.charge.orderId,
            ilaunchify_reason: t.reason,
          },
        },
        { idempotencyKey: `transfer:${t.id}` },
      )

      // Compare-and-set on EXECUTING (inside settle): only WE may move the row out of
      // the state we claimed. If a refund flipped it to CANCELED/REVERSED while our
      // Stripe call was in flight, settle returns 'superseded' — we must NOT resurrect
      // it to COMPLETED. The transfer DID go through but the racing refund (seeing it
      // as not-yet-COMPLETED) issued NO Stripe reversal, so the money is NOT
      // auto-recouped; we stamp stripeTransferId and surface 'superseded' for manual
      // reversal. Idempotency-keyed → never double-pays.
      const r = await settle(transfer.id)
      if (r === 'settled') {
        outcomes.push({
          ...base,
          result: 'paid',
          stripeTransferId: transfer.id,
          ...(netting && netting.nettedCents > 0 ? { detail: `Net of −${netting.nettedCents}c clawback recoup` } : {}),
        })
      } else {
        await prisma.transfer
          .update({ where: { id: t.id }, data: { stripeTransferId: transfer.id } })
          .catch(() => undefined) // best-effort: row may already carry a reversal's id
        outcomes.push({
          ...base,
          result: 'superseded',
          stripeTransferId: transfer.id,
          detail: 'Row left EXECUTING (refund raced) — transfer sent; flag for manual recoup',
        })
      }
    } catch (err) {
      // Revert the claim so the row is retried next run (the idempotency key makes a
      // retry safe even if Stripe actually created the transfer before throwing). Also
      // compare-and-set on EXECUTING: never resurrect a row a refund cancelled mid-flight
      // back to PENDING (that would re-pay a partner whose order is being refunded).
      const detail = err instanceof Error ? err.message : String(err)
      await prisma.transfer.updateMany({
        where: { id: t.id, status: 'EXECUTING' },
        data: { status: 'PENDING', failureReason: detail.slice(0, 500) },
      })
      outcomes.push({ ...base, result: 'failed', detail })
    }
  }

  const paid = outcomes.filter((o) => o.result === 'paid').length
  const netted = outcomes.filter((o) => o.result === 'netted').length
  const failed = outcomes.filter((o) => o.result === 'failed').length
  const superseded = outcomes.filter((o) => o.result === 'superseded').length
  const held = outcomes.length - paid - netted - failed - superseded

  return {
    executed: enabled,
    enabled,
    considered: candidates.length,
    paid,
    netted,
    held,
    failed,
    superseded,
    outcomes,
  }
}
