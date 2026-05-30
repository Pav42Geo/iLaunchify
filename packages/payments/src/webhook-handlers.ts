// Stripe webhook event dispatcher.
//
// The actual /api/webhooks/stripe route in each app:
//   1. Verifies signature with stripe.webhooks.constructEvent()
//   2. Calls handleStripeEvent(event)
//   3. Returns 200 OK
//
// V1 handles these event types end-to-end:
//   - account.updated → flip User.stripeAccountStatus
//   - payment_intent.succeeded → flip Order to PAID + create dispatches
//   - charge.refunded → record Refund + queue clawbacks (placeholder for V1.5)
//   - invoice.payment_succeeded (G6.d) → spawn cycle-N Order for a
//     ProductionSubscription from its locked manifestSnapshot
//   - customer.subscription.deleted (G6.d) → mark our row as CANCELLED
//     when Stripe ends the schedule for any reason

import { prisma } from '@ilaunchify/db'
import { createDispatches } from '@ilaunchify/orders'
import type Stripe from 'stripe'
import { stripe } from './client'
import { cancelProductionSubscription } from './subscriptions'

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

    case 'invoice.payment_succeeded':
      await onInvoicePaid(event.data.object as Stripe.Invoice)
      return { handled: true }

    case 'customer.subscription.deleted':
      await onSubscriptionDeleted(event.data.object as Stripe.Subscription)
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

// =============================================================================
// G6.d — ProductionSubscription recurring cycle handler
// =============================================================================
//
// Stripe fires `invoice.payment_succeeded` for every recurring invoice the
// customer pays. For our subscriptions:
//   1. Lookup the ProductionSubscription by stripeSubscriptionId.
//   2. Reject the day-1 invoice (we already handled the first charge via
//      the one-time Order path — placeOrderFromCheckoutDraft anchors the
//      billing cycle one full period out, so the FIRST invoice we should
//      ever see here is cycle 2). Stripe's "billing_reason" tells us.
//   3. Idempotent — skip if an Order already exists with this invoice ID
//      stamped on it. Stripe retries webhooks; we must tolerate dupes.
//   4. Create a fresh Order + OrderItem from the locked manifestSnapshot
//      in one transaction. Route through createDispatches like the
//      one-time path does.
//   5. Increment runsCompleted + advance nextRunAt. If we hit totalRuns,
//      cancel the Stripe subscription + flip status to COMPLETED.
//
// Charge row: we record one for reconciliation parity with one-time
// orders so the Admin Finance ledger reads consistently.

async function onInvoicePaid(invoice: Stripe.Invoice) {
  const stripeSubscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id
  if (!stripeSubscriptionId) return // one-off invoice, not a subscription

  // V1 only handles cycle 2+ here. The first invoice has
  // billing_reason='subscription_create' — the day-1 Order already
  // handled that. Anything else (`subscription_cycle`, `subscription_update`)
  // is a real recurring charge that should spawn an Order.
  if (invoice.billing_reason === 'subscription_create') return

  const sub = await prisma.productionSubscription.findUnique({
    where: { stripeSubscriptionId },
    include: {
      brand: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
    },
  })
  if (!sub) return // not one of ours (e.g. tier subscriptions on the same Customer)
  if (sub.status !== 'ACTIVE') return // cancelled / completed — ignore stragglers

  // Idempotency: if we've already created an Order for this invoice,
  // skip. Stripe retries webhooks up to 3 days; we must be safe.
  const stripeInvoiceId = invoice.id
  if (!stripeInvoiceId) return
  const existingOrder = await prisma.order.findFirst({
    where: {
      productionSubscriptionId: sub.id,
      // We stash the invoice id on internalNotes so future runs can
      // detect it. Cleaner V1.5 home would be a dedicated column.
      internalNotes: { contains: `stripe_invoice_id:${stripeInvoiceId}` },
    },
    select: { id: true },
  })
  if (existingOrder) return

  // Read the locked manifest — every cycle uses the same picks.
  const manifest = sub.manifestSnapshot as unknown as {
    quantity: number
    substrateSlug: string | null
    packagingMaterialSlug: string | null
    finishPartnerFinishIds: string[]
    shipTo: {
      shipToType: 'CREATOR_ADDRESS' | 'WAREHOUSE_PARTNER'
      shipToPartnerServiceId: string | null
      contactName: string
      contactPhone: string | null
      addressLine1: string
      addressLine2: string | null
      city: string
      state: string | null
      postalCode: string
      country: string
    }
  }
  if (!manifest?.quantity || manifest.quantity <= 0) return

  const cycleNumber = sub.runsCompleted + 1
  const subtotalCents = invoice.subtotal ?? sub.subtotalCentsAtCreation
  const shippingCents = 0 // computed downstream in V1.5; manifest doesn't carry it
  const taxCents = invoice.tax ?? 0
  const totalCents = invoice.total ?? subtotalCents

  const internalNotes = [
    `stripe_invoice_id:${stripeInvoiceId}`,
    `production_subscription:${sub.id}`,
    `cycle:${cycleNumber}`,
    sub.totalRuns ? `of:${sub.totalRuns}` : 'open-ended',
  ].join(' · ')

  // Order + OrderItem in one transaction so partial failures don't
  // leave half a cycle on the books.
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        brandId: sub.brandId,
        creatorUserId: sub.creatorUserId,
        status: 'PAID',
        paidAt: new Date(),
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents,
        shipToType: manifest.shipTo.shipToType,
        shipToPartnerServiceId: manifest.shipTo.shipToPartnerServiceId,
        shipToContactName: manifest.shipTo.contactName,
        shipToContactPhone: manifest.shipTo.contactPhone,
        shipToAddressLine1: manifest.shipTo.addressLine1,
        shipToAddressLine2: manifest.shipTo.addressLine2,
        shipToCity: manifest.shipTo.city,
        shipToState: manifest.shipTo.state,
        shipToPostalCode: manifest.shipTo.postalCode,
        shipToCountry: manifest.shipTo.country,
        productionSubscriptionId: sub.id,
        subscriptionCycleNumber: cycleNumber,
        internalNotes,
      },
    })
    await tx.orderItem.create({
      data: {
        orderId: created.id,
        productId: sub.productId,
        quantity: manifest.quantity,
        unitPriceCents: Math.round(totalCents / manifest.quantity),
        totalCents,
        designVersionId: sub.designVersionId,
      },
    })
    await tx.charge.create({
      data: {
        orderId: created.id,
        stripeChargeId:
          typeof invoice.charge === 'string'
            ? invoice.charge
            : invoice.charge?.id ?? stripeInvoiceId,
        stripePaymentIntentId:
          typeof invoice.payment_intent === 'string'
            ? invoice.payment_intent
            : invoice.payment_intent?.id ?? stripeInvoiceId,
        amountCents: totalCents,
        currency: invoice.currency ?? 'usd',
        applicationFeeCents: 0, // V1.5 — fees on subscriptions are platform-side
        status: 'SUCCEEDED',
        statementDescriptor: null,
      },
    })
    return created
  })

  // Routing — same path as the one-time order. Auto-holds if no partner match.
  await createDispatches({ orderId: order.id })

  // Advance the subscription. If we've hit the cap, cancel + mark COMPLETED.
  const reachedCap =
    sub.totalRuns != null && cycleNumber >= sub.totalRuns

  if (reachedCap) {
    try {
      await cancelProductionSubscription({
        stripeSubscriptionId: sub.stripeSubscriptionId,
        reason: `Reached configured totalRuns (${sub.totalRuns})`,
      })
    } catch {
      // Best-effort — Stripe might 404 if already cancelled. The
      // subscription.deleted webhook will reconcile.
    }
    await prisma.productionSubscription.update({
      where: { id: sub.id },
      data: {
        runsCompleted: cycleNumber,
        nextRunAt: null,
        status: 'COMPLETED',
      },
    })
  } else {
    // nextRunAt comes from Stripe — Stripe's next invoice is on the
    // current_period_end of the (now-paid) cycle.
    const periodEnd = (invoice.period_end ?? 0) * 1000
    await prisma.productionSubscription.update({
      where: { id: sub.id },
      data: {
        runsCompleted: cycleNumber,
        nextRunAt: periodEnd ? new Date(periodEnd) : null,
      },
    })
  }
}

async function onSubscriptionDeleted(subscription: Stripe.Subscription) {
  const ours = await prisma.productionSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true, status: true },
  })
  if (!ours) return
  if (ours.status === 'CANCELLED' || ours.status === 'COMPLETED') return

  await prisma.productionSubscription.update({
    where: { id: ours.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : new Date(),
      cancelledReason:
        subscription.cancellation_details?.reason ??
        subscription.cancellation_details?.comment ??
        'stripe_subscription_deleted',
      nextRunAt: null,
    },
  })
}

// Suppress unused-import noise — kept for symmetry with cancelProductionSubscription.
void stripe
