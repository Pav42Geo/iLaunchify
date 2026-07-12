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

import { prisma, getSampleSettings, getOrderSettings } from '@ilaunchify/db'
import { createDispatches, mintSampleCredit, createOrderWithNumber } from '@ilaunchify/orders'
import { setCreatorTierWithAudit } from '@ilaunchify/auth'
import { dispatchNotification } from '@ilaunchify/notifications'
import { appLogger } from '@ilaunchify/logger'
import type Stripe from 'stripe'
import { ingestChargeRadarOutcome } from './radar-risk'
import { stripe } from './client'
import { cancelProductionSubscription } from './subscriptions'

// V1 dunning grace window: how long a creator keeps their paid tier after the
// first failed recurring charge before the grace-expiry cron downgrades them.
const TIER_DUNNING_GRACE_DAYS = 7

// Structured logger for the webhook hot path — every line carries app=payments.
const log = appLogger('payments')

// Tier 1.4 (docs/SECURITY_ARCHITECTURE.md): global event-id dedupe. Claim the
// event id before dispatch; a concurrent or re-delivered duplicate loses the
// claim race (P2002) and is skipped. If the handler THROWS, the claim is
// released so Stripe's retry can reprocess — otherwise a transient failure
// would permanently swallow the event. Complements the per-domain idempotency
// checks inside each handler; does not replace them.
//
// A clean throw releases the claim, but a HARD process death (OOM, deploy,
// SIGKILL) mid-handler skips the catch — the claim row is orphaned and Stripe's
// redelivery would be skipped forever, stranding e.g. a paid order with no
// dispatches. So a P2002 also checks the existing claim's age: a claim older than
// STALE_CLAIM_MS is treated as such an orphan and atomically reclaimed for
// reprocessing. This is only safe because every handler is idempotent — re-running
// a genuinely-completed event is a no-op (charge/order/credit already exist).
const STALE_CLAIM_MS = 15 * 60 * 1000 // 15 min: >> any handler's runtime, << Stripe's 3-day retry window

async function claimWebhookEvent(event: Stripe.Event): Promise<boolean> {
  try {
    await prisma.processedWebhookEvent.create({
      data: { id: event.id, source: 'stripe', type: event.type },
    })
    return true
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      // Reclaim ONLY if the prior claim is stale (an orphan from a crashed process).
      // The processedAt guard makes this atomic: among racing redeliveries exactly
      // one updateMany matches `lt cutoff` and wins; the rest see the fresh timestamp
      // and skip. A recent claim → genuine duplicate → skip.
      const cutoff = new Date(Date.now() - STALE_CLAIM_MS)
      const reclaimed = await prisma.processedWebhookEvent
        .updateMany({
          where: { id: event.id, processedAt: { lt: cutoff } },
          data: { processedAt: new Date(), type: event.type },
        })
        .catch(() => ({ count: 0 }))
      if (reclaimed.count === 1) {
        log.warn('webhook.stale_claim_reclaimed', { eventId: event.id, type: event.type })
        return true
      }
      return false // already claimed (recent) — skip
    }
    // Unknown DB error — process anyway: per-domain idempotency still guards,
    // and dropping a paid-order event is worse than a rare double-dispatch.
    log.warn('webhook.claim_failed_processing_anyway', {
      eventId: event.id,
      err: (err as Error).message,
    })
    return true
  }
}

async function releaseWebhookClaim(eventId: string): Promise<void> {
  try {
    await prisma.processedWebhookEvent.delete({ where: { id: eventId } })
  } catch {
    // Best-effort — worst case the provider retry is skipped and the
    // per-domain idempotency state decides.
  }
}

export async function handleStripeEvent(
  event: Stripe.Event,
): Promise<{ handled: boolean; duplicate?: boolean }> {
  const fresh = await claimWebhookEvent(event)
  if (!fresh) {
    log.info('webhook.duplicate_skipped', { eventId: event.id, type: event.type })
    return { handled: false, duplicate: true }
  }
  try {
    return await dispatchStripeEvent(event)
  } catch (err) {
    await releaseWebhookClaim(event.id)
    throw err
  }
}

async function dispatchStripeEvent(event: Stripe.Event): Promise<{ handled: boolean }> {
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

    // Risk Center M4 — Radar outcome lands on the Charge object, not the PI.
    // Persist risk_score/risk_level + run the RADAR_ELEVATED detector.
    case 'charge.succeeded':
      await ingestChargeRadarOutcome(event.data.object as Stripe.Charge)
      return { handled: true }

    case 'invoice.payment_succeeded':
      await onInvoicePaid(event.data.object as Stripe.Invoice)
      return { handled: true }

    // V1 dunning — a recurring tier-subscription charge failed. Start the grace
    // period; the grace-expiry cron downgrades to Maker if it stays unpaid.
    case 'invoice.payment_failed':
      await onTierInvoiceFailed(event.data.object as Stripe.Invoice)
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

  // Idempotent CHARGE creation: record the Charge + flip the order to PAID exactly
  // once per PaymentIntent. Crucially we do NOT early-return the whole handler when
  // the Charge already exists — the post-payment side effects below (dispatch
  // creation for production, credit mint for samples) must still run on a Stripe
  // redelivery. Otherwise a crash between this commit and dispatch creation would
  // strand a PAID order with no dispatches that no retry could ever repair. Both
  // side effects are independently idempotent (createDispatches only acts on a PAID
  // order, then flips it to ROUTING; mintCreditForPaidSample upserts on
  // sourceOrderId), so re-running them is a safe no-op.
  const existing = await prisma.charge.findFirst({
    where: { stripePaymentIntentId: pi.id },
  })
  if (!existing) {
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
  }

  // Branch on order type (Pavel 2026-06-10). A SAMPLE order mints its credit
  // (when the partner enabled it) and does NOT enter the multi-partner production
  // dispatch graph. PRODUCTION orders route exactly as before. Cast-guarded —
  // orderType/SampleCredit land on the client after the sample-policy migration.
  const typed = await (prisma as unknown as {
    order: { findUnique: (a: unknown) => Promise<{ orderType: string | null } | null> }
  }).order
    .findUnique({ where: { id: orderId }, select: { orderType: true } })
    .catch(() => null)

  if (typed?.orderType === 'SAMPLE') {
    await mintCreditForPaidSample(orderId)
    return
  }

  // Routing: create the two OrderDispatches. Auto-holds the order if no match.
  // Accept window + partner-match scoring weights are admin-tunable (OrderSettings).
  const orderSettings = await getOrderSettings()
  await createDispatches({
    orderId,
    acceptWindowHours: orderSettings.acceptWindowHours,
    weights: {
      capability: orderSettings.capabilityWeightPct,
      proximity: orderSettings.proximityWeightPct,
      cert: orderSettings.certWeightPct,
    },
  })
}

/** Mint the SampleCredit for a freshly-paid SAMPLE order, when the product's
 *  ProductSampleOption granted credit (capped, 90-day expiry per
 *  `mintSampleCredit`). Idempotent via the unique `sourceOrderId`. Cast-guarded;
 *  failures are logged, not thrown (the sample is already paid). */
async function mintCreditForPaidSample(orderId: string): Promise<void> {
  try {
    // Admin master switch — when credit-back is off, a sample is just a paid
    // order (no credit minted).
    const settings = await getSampleSettings()
    if (!settings.creditBackEnabled) return

    const p = prisma as unknown as {
      order: {
        findUnique: (a: unknown) => Promise<{
          brandId: string
          creatorUserId: string
          subtotalCents: number
          sampleKind: 'UNBRANDED' | 'BRANDED' | null
          paidAt: Date | null
          items: Array<{ product: { productTemplateId: string | null } | null }>
        } | null>
      }
      productSampleOption: {
        findUnique: (a: unknown) => Promise<{ creditTowardFirstOrder: boolean; creditCapCents: number | null } | null>
      }
      sampleCredit: { upsert: (a: unknown) => Promise<unknown> }
    }

    const order = await p.order.findUnique({
      where: { id: orderId },
      select: {
        brandId: true,
        creatorUserId: true,
        subtotalCents: true,
        sampleKind: true,
        paidAt: true,
        items: { take: 1, select: { product: { select: { productTemplateId: true } } } },
      },
    })
    if (!order || !order.sampleKind) return
    const productTemplateId = order.items[0]?.product?.productTemplateId
    if (!productTemplateId) return

    const opt = await p.productSampleOption.findUnique({
      where: { productTemplateId_kind: { productTemplateId, kind: order.sampleKind } },
      select: { creditTowardFirstOrder: true, creditCapCents: true },
    })
    if (!opt) return

    const minted = mintSampleCredit(order.subtotalCents, opt, (order.paidAt ?? new Date()).getTime(), {
      expiryDays: settings.creditExpiryDays,
      platformCapCents: settings.creditMaxCapCents,
    })
    if (!minted) return

    await p.sampleCredit.upsert({
      where: { sourceOrderId: orderId }, // unique → idempotent on webhook retries
      update: {},
      create: {
        creatorUserId: order.creatorUserId,
        brandId: order.brandId,
        productTemplateId,
        sourceOrderId: orderId,
        amountCents: minted.amountCents,
        remainingCents: minted.amountCents,
        status: 'AVAILABLE',
        expiresAt: new Date(minted.expiresAtMs),
      },
    })
  } catch (err) {
    console.error('[webhook] mintCreditForPaidSample failed:', (err as Error).message)
  }
}

async function onChargeRefunded(charge: Stripe.Charge) {
  // Resolve the order id robustly. Stripe does NOT copy a PaymentIntent's
  // metadata onto its Charge, so charge.metadata is empty for our PI-created
  // charges (we only stamp the PI, in createCheckoutSession). Fall back to OUR
  // Charge row, linked at payment time by stripeChargeId / stripePaymentIntentId
  // — otherwise the whole refund reconciliation below silently no-ops.
  let orderId = charge.metadata?.ilaunchify_order_id ?? null
  if (!orderId) {
    const piId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null
    const ours = await prisma.charge
      .findFirst({
        where: { OR: [{ stripeChargeId: charge.id }, ...(piId ? [{ stripePaymentIntentId: piId }] : [])] },
        select: { orderId: true },
      })
      .catch(() => null)
    orderId = ours?.orderId ?? null
  }
  if (!orderId) return

  // Reconcile any Refund rows we created (executeOrderRefund) against Stripe's
  // authoritative status. `charge.refunds.data` carries each refund's id + status.
  const refunds = charge.refunds?.data ?? []
  for (const r of refunds) {
    const status = r.status === 'succeeded' ? 'SUCCEEDED' : r.status === 'failed' ? 'FAILED' : 'PENDING'
    await prisma.refund
      .updateMany({ where: { stripeRefundId: r.id }, data: { status } })
      .catch(() => {/* row may not exist (refund created directly in Stripe) */})
  }

  // Move the order to REFUNDED — but only from a status the FSM allows. A CANCELLED
  // order stays CANCELLED (the cancellation decision: CANCELLED is the terminal void
  // state; the refund is a separate Refund record), so we never override it here.
  await prisma.order
    .updateMany({
      where: { id: orderId, status: { in: ['PAID', 'DELIVERED', 'COMPLETED', 'DISPUTED'] } },
      data: { status: 'REFUNDED' },
    })
    .catch(() => {/* ignore not-found / not-eligible */})

  // Refunding a SAMPLE voids its unused credit (Pavel 2026-06-10). APPLIED credit
  // (already consumed on a placed production order) is left for a later clawback
  // pass. No-op for production orders. Cast-guarded.
  await (prisma as unknown as {
    sampleCredit: { updateMany: (a: unknown) => Promise<unknown> }
  }).sampleCredit
    .updateMany({ where: { sourceOrderId: orderId, status: 'AVAILABLE' }, data: { status: 'VOID', remainingCents: 0 } })
    .catch(() => {/* ignore — not a sample / no credit */})
}

async function onTransferEvent(_event: Stripe.Event) {
  // V1.5+: reconcile Transfer rows with Stripe transfer status.
  // For V1, transfers are created synchronously by the scheduler; webhooks are observational.
}

// =============================================================================
// G6.d — ProductionSubscription recurring cycle handler
// =============================================================================
//
// V1 dunning — a tier subscription's recurring charge failed. Start the grace
// period (idempotent: don't reset the clock on Stripe's retries). The cron
// (apps/creator /api/cron/tier-dunning) downgrades to MAKER once grace expires.
// Cast-guarded — tierPaymentFailedAt/tierGraceUntil land after the migration.
async function onTierInvoiceFailed(invoice: Stripe.Invoice) {
  const stripeSubscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
  if (!stripeSubscriptionId) return

  const profileModel = (
    prisma as unknown as {
      creatorProfile: {
        findUnique: (a: unknown) => Promise<{
          id: string
          userId: string
          subscriptionTier: string
          tierGraceUntil: Date | null
        } | null>
        update: (a: unknown) => Promise<unknown>
      }
    }
  ).creatorProfile

  const profile = await profileModel
    .findUnique({
      where: { stripeTierSubscriptionId: stripeSubscriptionId },
      select: { id: true, userId: true, subscriptionTier: true, tierGraceUntil: true },
    })
    .catch(() => null)
  if (!profile) return // not a tier subscription (likely a ProductionSubscription invoice)
  if (profile.subscriptionTier === 'MAKER') return // nothing to dun on the free tier
  if (profile.tierGraceUntil) return // already in grace — keep the original deadline

  const now = new Date()
  const graceUntil = new Date(now.getTime() + TIER_DUNNING_GRACE_DAYS * 24 * 60 * 60 * 1000)
  await profileModel.update({
    where: { id: profile.id },
    data: { tierPaymentFailedAt: now, tierGraceUntil: graceUntil },
  })

  await dispatchNotification({
    userId: profile.userId,
    event: 'CREATOR_PAYMENT_FAILED',
    data: { graceUntil: graceUntil.toISOString() },
    audience: 'creator',
  }).catch(() => {})
}

// Recovery: a previously-failed tier subscription paid — clear the grace state.
async function clearTierDunningIfRecovered(stripeSubscriptionId: string) {
  const profileModel = (
    prisma as unknown as {
      creatorProfile: {
        findUnique: (a: unknown) => Promise<{ id: string; tierGraceUntil: Date | null } | null>
        update: (a: unknown) => Promise<unknown>
      }
    }
  ).creatorProfile
  const profile = await profileModel
    .findUnique({
      where: { stripeTierSubscriptionId: stripeSubscriptionId },
      select: { id: true, tierGraceUntil: true },
    })
    .catch(() => null)
  if (profile?.tierGraceUntil) {
    await profileModel.update({
      where: { id: profile.id },
      data: { tierPaymentFailedAt: null, tierGraceUntil: null },
    })
  }
}

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

  // Dunning recovery: if this paid invoice belongs to a tier subscription that
  // was in a grace period, the creator's card now works — clear the grace state.
  await clearTierDunningIfRecovered(stripeSubscriptionId)

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
  if (existingOrder) {
    // We already minted the Order for this invoice. Don't blindly return — re-drive
    // the idempotent dispatch creation, in case a prior delivery crashed after the
    // Order commit but before dispatches were created (which would otherwise strand
    // a PAID subscription order with no production that no retry could repair).
    // createDispatches self-guards: it only acts on a PAID order, then flips it to
    // ROUTING, so re-running once dispatches exist is a no-op. The subscription
    // advance is deliberately NOT re-run — it's keyed to runsCompleted and a full
    // redelivery could double-count; a counter off by one is far milder than a paid
    // order with no production.
    await createDispatches({ orderId: existingOrder.id })
    return
  }

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
  const order = await createOrderWithNumber((orderNumber) => prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      // orderNumber post-dates the generated client (cast-guarded). The @unique
      // retry lives in createOrderWithNumber.
      data: {
        orderNumber,
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
      } as Parameters<typeof tx.order.create>[0]['data'],
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
  }))

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
    log.error('checkout.session.completed tier session missing metadata', {
      event: 'checkout.session.completed',
      sessionId: session.id,
      metadata: session.metadata,
    })
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
