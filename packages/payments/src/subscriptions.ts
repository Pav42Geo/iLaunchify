// Phase G6.b — Production-run subscription helpers.
//
// When a creator accepts the Subscribe & save offer at checkout Step 3,
// we create a recurring schedule in Stripe that bills them every
// cycle (monthly or quarterly) at the locked per-run price. Each paid
// invoice fires `invoice.payment_succeeded`, which G6.d's webhook
// translates into a fresh Order spawned from the parent
// ProductionSubscription's frozen manifestSnapshot.
//
// V1 design notes
//   * The day-1 Order still flows through the normal one-time
//     placeOrderFromCheckoutDraft path. The Stripe Subscription's
//     `billing_cycle_anchor` is set to `now + cadence` so the FIRST
//     recurring invoice fires AFTER the day-1 order, not immediately.
//     Prevents double-charging the creator on cycle 0.
//   * Per-subscription Stripe Product + Price (not a shared SKU). This
//     is intentional: each creator's recurring run is unique to their
//     product / qty / picks, and the locked snapshot lives in our DB
//     as ProductionSubscription.manifestSnapshot. The Stripe Product is
//     just the billing handle.
//   * The platform application_fee_amount on the recurring invoices is
//     computed each cycle by the webhook using the same fees.ts helper
//     as one-time orders — keeps fee logic in one place.
//
// Required ENV
//   STRIPE_SECRET_KEY — already enforced by client.ts.

import { prisma } from '@ilaunchify/db'
import { stripe } from './client'

export type ProductionCadence = 'MONTHLY' | 'QUARTERLY'

/** What Stripe interval each cadence maps to. */
const CADENCE_TO_STRIPE: Record<
  ProductionCadence,
  { interval: 'month'; intervalCount: number; days: number }
> = {
  MONTHLY: { interval: 'month', intervalCount: 1, days: 30 },
  QUARTERLY: { interval: 'month', intervalCount: 3, days: 91 },
}

/**
 * Resolve (cached) or create the persistent Stripe Customer for this
 * creator. Cached on User.stripeCustomerId — first call creates +
 * persists, subsequent calls return the cached ID. Email + metadata
 * pinned so Stripe Dashboard search works.
 */
export async function getOrCreateCreatorCustomer(input: {
  userId: string
  email: string
  name: string | null
}): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, stripeCustomerId: true },
  })
  if (!user) throw new Error('User not found.')
  if (user.stripeCustomerId) return user.stripeCustomerId

  const customer = await stripe.customers.create({
    email: input.email,
    name: input.name ?? undefined,
    metadata: { ilaunchify_user_id: input.userId },
  })

  await prisma.user.update({
    where: { id: input.userId },
    data: { stripeCustomerId: customer.id },
  })

  return customer.id
}

/**
 * Create the Stripe-side artefacts for a new ProductionSubscription:
 * Product + Price + Subscription. Caller (G6.c) is responsible for
 * persisting the returned IDs onto a ProductionSubscription row in
 * the same transaction that creates the day-1 Order.
 *
 * Discount is baked into the Price's unit_amount (not a Coupon) so the
 * recurring invoices show one line item the creator understands.
 * If we ever need pro-rata coupon logic, swap to Stripe Coupons.
 */
export interface CreateProductionSubscriptionInput {
  customerId: string
  /** Display name shown on Stripe Dashboard + recurring invoices. */
  productName: string
  /** Brand the run is being produced under — for metadata + descriptor. */
  brandId: string
  brandName: string
  /** Our internal product the subscription is tied to. */
  productId: string
  cadence: ProductionCadence
  /** Per-run subtotal AFTER discount, in cents. */
  perRunUnitAmountCents: number
  /** null = open-ended (charges until cancel). Else stop after N. */
  totalRuns: number | null
  /** Pin our DB row for webhook lookups. Required. */
  productionSubscriptionId: string
}

export interface CreateProductionSubscriptionResult {
  stripeSubscriptionId: string
  stripePriceId: string
  stripeProductId: string
  /** When the FIRST recurring invoice will fire (in seconds since epoch). */
  firstInvoiceAt: number
}

export async function createProductionSubscription(
  input: CreateProductionSubscriptionInput,
): Promise<CreateProductionSubscriptionResult> {
  const spec = CADENCE_TO_STRIPE[input.cadence]

  // 1. Stripe Product — the billing handle for this recurring run.
  //    NOT the iLaunchify Product row (those are physical SKUs).
  const product = await stripe.products.create({
    name: `${input.productName} · recurring (${input.cadence.toLowerCase()})`,
    metadata: {
      ilaunchify_product_id: input.productId,
      ilaunchify_brand_id: input.brandId,
      ilaunchify_subscription_id: input.productionSubscriptionId,
    },
  })

  // 2. Stripe Price — the per-cycle amount. Discount is baked in.
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: input.perRunUnitAmountCents,
    recurring: {
      interval: spec.interval,
      interval_count: spec.intervalCount,
    },
    metadata: {
      ilaunchify_subscription_id: input.productionSubscriptionId,
    },
  })

  // 3. Anchor the FIRST charge to one full cycle from now so the day-1
  //    one-time order isn't doubled. proration_behavior 'none' guards
  //    against partial-period invoices if Stripe ever differs.
  const anchorAt = Math.floor(Date.now() / 1000) + spec.days * 24 * 60 * 60

  const subscription = await stripe.subscriptions.create({
    customer: input.customerId,
    items: [{ price: price.id }],
    billing_cycle_anchor: anchorAt,
    proration_behavior: 'none',
    // null totalRuns = open-ended; Stripe runs until cancel.
    // When totalRuns is N, we let it bill N times then cancel via
    // webhook (G6.d) once runsCompleted reaches the cap. Simpler than
    // Stripe schedules for V1.
    metadata: {
      ilaunchify_subscription_id: input.productionSubscriptionId,
      ilaunchify_product_id: input.productId,
      ilaunchify_brand_id: input.brandId,
      ilaunchify_total_runs:
        input.totalRuns != null ? String(input.totalRuns) : 'open',
    },
  })

  return {
    stripeSubscriptionId: subscription.id,
    stripePriceId: price.id,
    stripeProductId: product.id,
    firstInvoiceAt: anchorAt,
  }
}

/**
 * Cancel a ProductionSubscription in Stripe (creator-initiated or
 * triggered by hitting totalRuns). Returns the canonical canceledAt
 * timestamp so the caller can persist it on our row.
 */
export async function cancelProductionSubscription(input: {
  stripeSubscriptionId: string
  reason?: string
}): Promise<{ canceledAt: Date }> {
  const sub = await stripe.subscriptions.cancel(input.stripeSubscriptionId, {
    cancellation_details: input.reason
      ? { comment: input.reason.slice(0, 500) }
      : undefined,
  })
  return {
    canceledAt: new Date((sub.canceled_at ?? Math.floor(Date.now() / 1000)) * 1000),
  }
}
