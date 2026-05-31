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
//   - customer.subscription.deleted (G6.d / V1.5-T4) →
//       * ProductionSubscription path: mark row as CANCELLED
//       * tier subscription path: flip CreatorProfile back to MAKER
//   - checkout.session.completed (V1.5-T4) → tier subscription onboarding:
//       capture stripeTierSubscriptionId + flip CreatorProfile.subscriptionTier
//       via the shared setCreatorTierWithAudit helper (SYSTEM actor)
//   - customer.subscription.updated (V1.5-T4) → mirror Stripe's
//       cancel_at_period_end + current_period_end onto CreatorProfile so
//       the /settings/plan UI reflects pending cancellations

import { prisma } from '@ilaunchify/db'
import { createDispatches } from '@ilaunchify/orders'
import { setCreatorTierWithAudit } from '@ilaunchify/auth'
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

    // V1.5-T4 — tier subscription onboarding. The Customer pays via
    // Stripe-hosted Checkout (mode='subscription'), Stripe creates the
    // Subscription, and fires this event. We capture the subscription
    // id + flip the creator's tier in one place.
    case 'checkout.session.completed':
      await onCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
      return { handled: true }

    // V1.5-T4 — tier subscription state mirror. Covers cancel_at_period_end
    // toggles + plan changes. For ProductionSubscriptions we ignore
    // (no parallel mirror needed — those have their own webhook path).
    case 'customer.subscription.updated':
      await onSubscriptionUpdated(event.data.object as Stripe.Subscription)
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
  // First, the ProductionSubscription path (G6.d).
  const productionSub = await prisma.productionSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true, status: true },
  })
  if (productionSub) {
    if (
      productionSub.status === 'CANCELLED' ||
      productionSub.status === 'COMPLETED'
    ) {
      return
    }
    await prisma.productionSubscription.update({
      where: { id: productionSub.id },
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
    return
  }

  // V1.5-T4 — tier subscription path. Stripe ends the schedule (either
  // because cancel_at_period_end finally fired OR because we hit a
  // failed payment retry cap). Flip the creator back to MAKER + clear
  // the Stripe handles so a future re-upgrade goes through Checkout
  // cleanly. We DO NOT keep stripeCustomerId — that lives on User and
  // is reusable across re-subscribes.
  const tierProfile = await prisma.creatorProfile.findUnique({
    where: { stripeTierSubscriptionId: subscription.id },
    select: { id: true, subscriptionTier: true },
  })
  if (!tierProfile) return

  await setCreatorTierWithAudit({
    creatorProfileId: tierProfile.id,
    newTier: 'MAKER',
    actor: { kind: 'system', label: 'stripe_subscription_deleted' },
    payload: {
      stripeSubscriptionId: subscription.id,
      cancellationReason:
        subscription.cancellation_details?.reason ??
        subscription.cancellation_details?.comment ??
        'stripe_subscription_deleted',
    },
  })

  await prisma.creatorProfile.update({
    where: { id: tierProfile.id },
    data: {
      stripeTierSubscriptionId: null,
      tierCurrentPeriodEnd: null,
      tierCancelAtPeriodEnd: false,
    },
  })
}

// =============================================================================
// V1.5-T4 — tier subscription handlers (checkout.session.completed +
// customer.subscription.updated). Companion to onSubscriptionDeleted's
// tier path above.
// =============================================================================

/**
 * Fires after the creator finishes paying for a tier upgrade via the
 * Stripe-hosted Checkout flow (mode='subscription').
 *
 * We only act when this is a tier session (metadata.ilaunchify_kind ===
 * 'tier'). For production subscriptions we use a different path —
 * placeOrderFromCheckoutDraft creates the row pre-checkout and ties the
 * Stripe handles via createProductionSubscription before redirecting to
 * Checkout, so we don't need a callback here for those.
 *
 * Idempotent: if the creator's stripeTierSubscriptionId is already set
 * to this subscription, skip (Stripe retries webhooks; we may see this
 * event twice).
 */
async function onCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  const kind = session.metadata?.ilaunchify_kind
  if (kind !== 'tier') return // production-order checkout — handled by PI path
  if (session.mode !== 'subscription') return // defensive
  if (session.payment_status !== 'paid') return // unpaid sessions don't grant tier

  const creatorProfileId = session.metadata?.ilaunchify_creator_profile_id
  const newTier = session.metadata?.ilaunchify_tier as
    | 'BUILDER'
    | 'AGENCY'
    | undefined
  if (!creatorProfileId || !newTier) {
    // Hard mismatch — Stripe shouldn't fire this without our metadata
    // because createTierCheckoutSession always pins both. Log & bail
    // rather than partially apply.
    // eslint-disable-next-line no-console
    console.error(
      '[webhook] checkout.session.completed tier session missing metadata',
      { sessionId: session.id, metadata: session.metadata },
    )
    return
  }

  const stripeSubscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id
  if (!stripeSubscriptionId) return

  // Idempotency: re-delivered webhook for an already-flipped creator.
  const existing = await prisma.creatorProfile.findUnique({
    where: { id: creatorProfileId },
    select: { id: true, stripeTierSubscriptionId: true },
  })
  if (!existing) return
  if (existing.stripeTierSubscriptionId === stripeSubscriptionId) return

  // Pull the subscription so we can stamp current_period_end on the
  // profile in this same write (saves a round-trip vs waiting for
  // customer.subscription.updated to do it).
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId)

  // Step 1: persist the Stripe handles + period end on the profile.
  await prisma.creatorProfile.update({
    where: { id: creatorProfileId },
    data: {
      stripeTierSubscriptionId: stripeSubscriptionId,
      tierCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
      tierCancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  })

  // Step 2: flip the tier through the shared helper so the audit row
  // matches admin-initiated tier changes (action='CREATOR_TIER_CHANGE',
  // actorRole='SYSTEM'). Re-entrant: same-tier short-circuits inside
  // the helper, so a stray double-delivery doesn't double-audit.
  await setCreatorTierWithAudit({
    creatorProfileId,
    newTier,
    actor: { kind: 'system', label: 'stripe_checkout_completed' },
    payload: {
      stripeSubscriptionId,
      stripeSessionId: session.id,
      planCode: session.metadata?.ilaunchify_plan_code ?? null,
      amountTotal: session.amount_total ?? null,
      currency: session.currency ?? null,
    },
  })
}

/**
 * Mirror Stripe's cancel_at_period_end + current_period_end onto our
 * row whenever they change. Driven by:
 *   - creator pressing Cancel on /settings/plan (we set the flag in
 *     cancelTierSubscription + persist locally, but the webhook is
 *     authoritative for the period-end timestamp)
 *   - creator pressing Resume (cancel_at_period_end flips back to false)
 *   - any future plan-swap action we add
 *
 * We DON'T flip the tier here — that only happens on
 * customer.subscription.deleted once the cycle actually ends.
 */
async function onSubscriptionUpdated(subscription: Stripe.Subscription) {
  const profile = await prisma.creatorProfile.findUnique({
    where: { stripeTierSubscriptionId: subscription.id },
    select: { id: true },
  })
  if (!profile) return // not a tier sub (likely a ProductionSubscription) — ignore

  await prisma.creatorProfile.update({
    where: { id: profile.id },
    data: {
      tierCancelAtPeriodEnd: subscription.cancel_at_period_end,
      tierCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  })
}

// Suppress unused-import noise — kept for symmetry with cancelProductionSubscription.
void stripe
