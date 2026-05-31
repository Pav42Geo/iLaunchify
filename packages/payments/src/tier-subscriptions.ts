// V1.5-T3 — Stripe-side helpers for CREATOR TIER subscriptions
// (Maker → Builder/Agency self-serve upgrade).
//
// Why a separate file from subscriptions.ts:
//   ProductionSubscription bills per-run for a specific product+brand
//   (one Stripe Subscription per recurring production line). Tier
//   subscriptions are platform-level — one per creator, recurring
//   monthly. The two SHARE getOrCreateCreatorCustomer (same User-side
//   Stripe Customer) but diverge in everything else: metadata kind,
//   pricing source (SubscriptionPlan vs CheckoutDraft), webhook
//   branch, and cancellation semantics (tier uses cancel_at_period_end
//   so the creator keeps Builder/Agency until the cycle ends).
//
// Per-subscription Stripe Product+Price (mirror ProductionSubscription
// pattern). Slightly noisier in the Dashboard's Products list than a
// shared lookup_key would be, but it lets us grandfather pricing per
// creator if SubscriptionPlan.monthlyPriceCents changes — existing
// subscribers keep their old Price.id until they cancel.
//
// V1.5 webhook responsibilities (lands in V1.5-T4, NOT here):
//   - checkout.session.completed (mode='subscription' + metadata.kind='tier')
//       → stamp CreatorProfile.stripeTierSubscriptionId +
//         setCreatorTierWithAudit(BUILDER|AGENCY, actor: system)
//   - customer.subscription.updated
//       → mirror cancel_at_period_end + current_period_end onto
//         CreatorProfile.tierCancelAtPeriodEnd + .tierCurrentPeriodEnd
//   - customer.subscription.deleted
//       → flip back to MAKER + clear stripe handles

import { prisma } from '@ilaunchify/db'
import {
  creatorTierToPlanCode,
  getPlanByCode,
} from '@ilaunchify/plans'
import { stripe } from './client'
import { getOrCreateCreatorCustomer } from './subscriptions'

/** Tier the creator is upgrading TO. Cannot be MAKER (downgrades happen by cancel). */
export type UpgradeableTier = 'BUILDER' | 'AGENCY'

function tierToPlanCode(tier: UpgradeableTier) {
  return creatorTierToPlanCode(tier.toLowerCase() as 'builder' | 'agency')
}

// =============================================================================
// createTierCheckoutSession — open Stripe Checkout for a tier upgrade
// =============================================================================
//
// Flow:
//   1. Resolve plan + monthly price from SubscriptionPlan (server side
//      of truth — admin can change pricing without code changes).
//   2. Get-or-create Stripe Customer pinned to User.stripeCustomerId.
//   3. Create per-subscription Product + Price (USD, recurring monthly).
//   4. Open Checkout Session in mode='subscription' with metadata
//      `kind: 'tier'` so V1.5-T4's webhook branches into the tier path
//      instead of the ProductionSubscription path.
//   5. Return the hosted Checkout URL — caller redirects.
//
// Errors thrown (not returned as Result envelopes) — server actions in
// apps/creator/.../settings/plan wrap this and translate to user-facing
// toasts.
//   - "Plan not found"           → SubscriptionPlan seed missing
//   - "Plan price not set"       → monthlyPriceCents is 0 or negative
//   - "Tier subscription exists" → CreatorProfile already has one
//                                  (caller should route to manage, not buy)

export interface CreateTierCheckoutSessionInput {
  creatorProfileId: string
  /** Tier the creator is upgrading TO. */
  newTier: UpgradeableTier
  /** Authenticated user buying the upgrade (becomes Stripe Customer). */
  userId: string
  userEmail: string
  userName: string | null
  /** Where Stripe redirects after successful payment. */
  successUrl: string
  /** Where Stripe sends the creator if they bail out of Checkout. */
  cancelUrl: string
}

export interface CreateTierCheckoutSessionResult {
  sessionId: string
  url: string
  /** Echoed back so caller can confirm what was charged. */
  planCode: string
  monthlyPriceCents: number
}

export async function createTierCheckoutSession(
  input: CreateTierCheckoutSessionInput,
): Promise<CreateTierCheckoutSessionResult> {
  // 1. Look up the target plan + pricing from our SubscriptionPlan
  //    table. Pricing lives in the DB so admin edits in /admin/tiers
  //    propagate to the next Checkout without a code change.
  const planCode = tierToPlanCode(input.newTier)
  const plan = await getPlanByCode(planCode)
  if (!plan) {
    throw new Error(`Plan ${planCode} not found — seed missing?`)
  }
  if (!plan.monthlyPriceCents || plan.monthlyPriceCents <= 0) {
    throw new Error(
      `Plan ${planCode} has no monthly price set; cannot Checkout.`,
    )
  }

  // 2. Block double-buying. If the creator is mid-subscription we want
  //    them on a manage-billing flow, not a fresh Checkout.
  const profile = await prisma.creatorProfile.findUnique({
    where: { id: input.creatorProfileId },
    select: {
      id: true,
      stripeTierSubscriptionId: true,
      tierCancelAtPeriodEnd: true,
    },
  })
  if (!profile) throw new Error('Creator profile not found.')
  if (
    profile.stripeTierSubscriptionId &&
    !profile.tierCancelAtPeriodEnd
  ) {
    throw new Error(
      'Tier subscription already exists — route to manage flow, not Checkout.',
    )
  }

  // 3. Stripe Customer is shared across tier + production subscriptions
  //    for this user. First call creates + caches on User; subsequent
  //    calls return the cached id.
  const customerId = await getOrCreateCreatorCustomer({
    userId: input.userId,
    email: input.userEmail,
    name: input.userName,
  })

  // 4. Per-subscription Product + Price. Naming includes the plan tier
  //    so the Stripe Dashboard's product list reads as
  //    "iLaunchify Builder — creator <name>".
  const product = await stripe.products.create({
    name: `iLaunchify ${plan.tierName} — creator ${input.userName ?? input.userEmail}`,
    metadata: {
      ilaunchify_kind: 'tier',
      ilaunchify_creator_profile_id: input.creatorProfileId,
      ilaunchify_creator_user_id: input.userId,
      ilaunchify_plan_code: planCode,
      ilaunchify_tier: input.newTier,
    },
  })

  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: plan.monthlyPriceCents,
    recurring: { interval: 'month', interval_count: 1 },
    metadata: {
      ilaunchify_kind: 'tier',
      ilaunchify_creator_profile_id: input.creatorProfileId,
      ilaunchify_plan_code: planCode,
      ilaunchify_tier: input.newTier,
    },
  })

  // 5. Checkout Session in subscription mode. Stripe will (on payment
  //    success) create the actual customer.subscription — we capture
  //    its id in V1.5-T4 via checkout.session.completed.
  //
  //    Metadata is duplicated at session level + on the subscription
  //    itself (via subscription_data.metadata) so EITHER webhook event
  //    can branch into the tier path without joining back.
  const tierMetadata = {
    ilaunchify_kind: 'tier' as const,
    ilaunchify_creator_profile_id: input.creatorProfileId,
    ilaunchify_creator_user_id: input.userId,
    ilaunchify_plan_code: planCode,
    ilaunchify_tier: input.newTier,
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // Stripe forbids customer_email when customer is set — the Customer
    // already carries the email.
    metadata: tierMetadata,
    subscription_data: {
      metadata: tierMetadata,
      // No application_fee_percent — this is platform revenue, not a
      // marketplace transaction. Connect transfers don't apply here.
    },
    // Pavel decision (V1.5): monthly only. Annual deferred.
    // No coupons in V1.5 — promo codes ship later if needed.
    allow_promotion_codes: false,
  })

  if (!session.url) {
    // Stripe always returns a url for hosted Checkout sessions; this is
    // a defensive guard for the type, not an expected runtime path.
    throw new Error('Stripe did not return a Checkout URL.')
  }

  return {
    sessionId: session.id,
    url: session.url,
    planCode,
    monthlyPriceCents: plan.monthlyPriceCents,
  }
}

// =============================================================================
// cancelTierSubscription — schedule end-of-period cancellation
// =============================================================================
//
// Pavel decision (V1.5): cancel_at_period_end. The creator keeps their
// tier benefits (Builder feature gates) until the current billing cycle
// closes. Then customer.subscription.deleted fires and V1.5-T4 flips
// CreatorProfile.subscriptionTier back to MAKER + clears the Stripe
// handles.
//
// We do NOT immediately downgrade here — the creator paid through the
// end of the period and should get what they paid for.
//
// Idempotent: re-calling on an already-pending cancellation is a no-op
// (Stripe.update with the same flag succeeds and returns the same
// state). Re-calling after the subscription has been deleted throws —
// caller should check tierCancelAtPeriodEnd first.

export interface CancelTierSubscriptionInput {
  creatorProfileId: string
  /** Free-text reason captured on the Stripe subscription for audit. */
  reason?: string
}

export interface CancelTierSubscriptionResult {
  /** When the cancellation takes effect (= current_period_end). */
  cancelAt: Date
  /** What CreatorProfile.tierCurrentPeriodEnd should be updated to. */
  currentPeriodEnd: Date
}

export async function cancelTierSubscription(
  input: CancelTierSubscriptionInput,
): Promise<CancelTierSubscriptionResult> {
  const profile = await prisma.creatorProfile.findUnique({
    where: { id: input.creatorProfileId },
    select: { id: true, stripeTierSubscriptionId: true },
  })
  if (!profile) throw new Error('Creator profile not found.')
  if (!profile.stripeTierSubscriptionId) {
    throw new Error('No active tier subscription to cancel.')
  }

  const updated = await stripe.subscriptions.update(
    profile.stripeTierSubscriptionId,
    {
      cancel_at_period_end: true,
      // Stripe attaches this to the cancellation_details on the next
      // customer.subscription.updated webhook — surfaces in our audit
      // log via V1.5-T4.
      cancellation_details: input.reason
        ? { comment: input.reason.slice(0, 500) }
        : undefined,
    },
  )

  // Mirror immediately so the /settings/plan UI reflects the change
  // before Stripe fires customer.subscription.updated.
  const periodEnd = new Date(updated.current_period_end * 1000)
  await prisma.creatorProfile.update({
    where: { id: profile.id },
    data: {
      tierCancelAtPeriodEnd: true,
      tierCurrentPeriodEnd: periodEnd,
    },
  })

  return {
    cancelAt: periodEnd,
    currentPeriodEnd: periodEnd,
  }
}

// =============================================================================
// resumeTierSubscription — undo a pending cancel before period_end
// =============================================================================
//
// Mirror of cancelTierSubscription. Creator changes their mind between
// "Cancel" and "actually-cancelled-by-Stripe" — flip cancel_at_period_end
// back to false. Stripe keeps billing on the same cycle.
//
// Useful for V1.5-T5's /settings/plan UI: when tierCancelAtPeriodEnd is
// true, show a "Resume subscription" button next to the planned end date.

export async function resumeTierSubscription(input: {
  creatorProfileId: string
}): Promise<{ currentPeriodEnd: Date }> {
  const profile = await prisma.creatorProfile.findUnique({
    where: { id: input.creatorProfileId },
    select: {
      id: true,
      stripeTierSubscriptionId: true,
      tierCancelAtPeriodEnd: true,
    },
  })
  if (!profile) throw new Error('Creator profile not found.')
  if (!profile.stripeTierSubscriptionId) {
    throw new Error('No tier subscription to resume.')
  }
  if (!profile.tierCancelAtPeriodEnd) {
    throw new Error('Tier subscription is not pending cancellation.')
  }

  const updated = await stripe.subscriptions.update(
    profile.stripeTierSubscriptionId,
    { cancel_at_period_end: false },
  )

  const periodEnd = new Date(updated.current_period_end * 1000)
  await prisma.creatorProfile.update({
    where: { id: profile.id },
    data: {
      tierCancelAtPeriodEnd: false,
      tierCurrentPeriodEnd: periodEnd,
    },
  })

  return { currentPeriodEnd: periodEnd }
}
