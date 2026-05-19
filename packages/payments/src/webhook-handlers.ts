// Stripe webhook event dispatcher.
//
// The actual /api/webhooks/stripe route in each app:
//   1. Verifies signature with stripe.webhooks.constructEvent()
//   2. Calls handleStripeEvent(event)
//   3. Returns 200 OK
//
// V1 handles three event types end-to-end:
//   - account.updated → flip User.stripeAccountStatus
//   - payment_intent.succeeded → flip Order to PAID + create dispatches
//   - charge.refunded → record Refund + queue clawbacks (placeholder for V1.5)

import { prisma } from '@ilaunchify/db'
import { createDispatches } from '@ilaunchify/orders'
import type Stripe from 'stripe'

export async function handleStripeEvent(event: Stripe.Event): Promise<{ handled: boolean }> {
  switch (event.type) {
    case 'account.updated':
      await onAccountUpdated(event.data.object as Stripe.Account)
      return { handled: true }

    case 'payment_intent.succeeded':
      await onPaymentSucceeded(event.data.object as Stripe.PaymentIntent)
      return { handled: true }

    case 'charge.refunded':
      await onChargeRefunded(event.data.object as Stripe.Charge)
      return { handled: true }

    case 'transfer.created':
    case 'transfer.updated':
    case 'transfer.reversed':
      await onTransferEvent(event)
      return { handled: true }

    default:
      return { handled: false }
  }
}

async function onAccountUpdated(account: Stripe.Account) {
  const user = await prisma.user.findUnique({ where: { stripeAccountId: account.id } })
  if (!user) return

  const status =
    account.charges_enabled === false && account.payouts_enabled === false
      ? 'RESTRICTED'
      : account.payouts_enabled
        ? 'ACTIVE'
        : 'PENDING'

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeAccountStatus: status },
  })
}

async function onPaymentSucceeded(pi: Stripe.PaymentIntent) {
  const orderId = pi.metadata?.ilaunchify_order_id
  if (!orderId) return

  // Idempotent: skip if we already processed this PaymentIntent
  const existing = await prisma.charge.findFirst({
    where: { stripePaymentIntentId: pi.id },
  })
  if (existing) return

  await prisma.$transaction(async (tx) => {
    // Record the Charge
    await tx.charge.create({
      data: {
        orderId,
        stripeChargeId: typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.id,
        stripePaymentIntentId: pi.id,
        amountCents: pi.amount,
        currency: pi.currency,
        applicationFeeCents: pi.application_fee_amount ?? 0,
        status: 'SUCCEEDED',
        statementDescriptor: pi.statement_descriptor_suffix ?? null,
      },
    })

    await tx.order.update({
      where: { id: orderId },
      data: { status: 'PAID', paidAt: new Date() },
    })
  })

  // Routing: create the two OrderDispatches. Auto-holds the order if no match.
  await createDispatches({ orderId })
}

async function onChargeRefunded(charge: Stripe.Charge) {
  // V1: record-only. V1.5+: clawback transfers + partner debit logic.
  const orderId = charge.metadata?.ilaunchify_order_id
  if (!orderId) return

  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'REFUNDED' },
  }).catch(() => {/* ignore not-found */})
}

async function onTransferEvent(_event: Stripe.Event) {
  // V1.5+: reconcile Transfer rows with Stripe transfer status.
  // For V1, transfers are created synchronously by the scheduler; webhooks are observational.
}
