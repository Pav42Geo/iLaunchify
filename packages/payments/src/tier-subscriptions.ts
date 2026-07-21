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
import { setCreatorTierWithAudit } from '@ilaunchify/auth/server'
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

// =============================================================================
// pauseTierSubscription — the P1 save-flow offer (Cancellation P1)
// =============================================================================
//
// docs/CREATOR_PLAN_CANCELLATION_RESEARCH_2026-07-20.md §3.5. Offered from
// the cancel modal (only for NOT_USING / TEMPORARY reasons) as the single
// retention offer (CA ARL: max one, shown next to a plain cancel path).
//
// Mechanics: Stripe pause_collection { behavior: 'void', resumes_at } — the
// subscription STAYS ACTIVE in Stripe, invoices in the window are voided,
// billing auto-resumes at resumes_at. We anchor the pause to the END of the
// already-paid period: resumes_at = current_period_end + N months, so the
// creator gets what they paid for, then N free-but-Maker months.
//
// Pavel decisions 2026-07-20 (supersede same-day keep-benefits):
//   1. Benefits are KEPT until current_period_end — they paid through it.
//   2. From period end until billing resumes the tier is MAKER. Not paying
//      = no paid benefits: no 12/8% fee rate, no designer seats (swept by
//      the shared tier helper), and critically no tier-gated AI features
//      whose inference the platform pays for.
// Timeline state on the profile:
//   tierPauseStartsAt  (= paid period end; the pause-start cron sweeps the
//                        tier to MAKER once this passes)
//   tierPauseResumesAt (= startsAt + N months; Stripe resumes billing and
//                        the customer.subscription.updated webhook restores
//                        tierPausedFromTier)
// unpauseTierSubscription handles a manual early resume at any point.
// Guards against abuse:
//   - 1 to 3 months only
//   - at most ONE pause per rolling 365 days (tierLastPausedAt)
//   - pausing clears a pending cancel_at_period_end (pause IS the save)

export interface PauseTierSubscriptionInput {
  creatorProfileId: string
  /** Whole months to pause: 1, 2, or 3. */
  months: number
}

export const PAUSE_MIN_MONTHS = 1
export const PAUSE_MAX_MONTHS = 3
/** Rolling window for the one-pause guard. */
export const PAUSE_COOLDOWN_DAYS = 365

export async function pauseTierSubscription(
  input: PauseTierSubscriptionInput,
): Promise<{ startsAt: Date; resumesAt: Date }> {
  if (
    !Number.isInteger(input.months) ||
    input.months < PAUSE_MIN_MONTHS ||
    input.months > PAUSE_MAX_MONTHS
  ) {
    throw new Error(
      `Pause length must be ${PAUSE_MIN_MONTHS} to ${PAUSE_MAX_MONTHS} months.`,
    )
  }

  const profile = await prisma.creatorProfile.findUnique({
    where: { id: input.creatorProfileId },
    select: {
      id: true,
      subscriptionTier: true,
      stripeTierSubscriptionId: true,
      tierPauseResumesAt: true,
      tierLastPausedAt: true,
      tierPausedFromTier: true,
    },
  })
  if (!profile) throw new Error('Creator profile not found.')
  if (!profile.stripeTierSubscriptionId) {
    throw new Error('No active tier subscription to pause.')
  }

  // Pause-abuse guards: one pause in flight at a time, one per rolling year.
  const now = new Date()
  if (
    profile.tierPausedFromTier ||
    (profile.tierPauseResumesAt && profile.tierPauseResumesAt > now)
  ) {
    throw new Error('Your subscription already has a pause scheduled.')
  }
  if (profile.tierLastPausedAt) {
    const cooldownEnd = new Date(
      profile.tierLastPausedAt.getTime() +
        PAUSE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
    )
    if (cooldownEnd > now) {
      throw new Error(
        'You can pause once every 12 months. Contact support if you need more time.',
      )
    }
  }

  // Anchor to the END of the paid period — the creator keeps what they
  // paid for, then gets N unpaid Maker months.
  const sub = await stripe.subscriptions.retrieve(
    profile.stripeTierSubscriptionId,
  )
  const startsAt = new Date(sub.current_period_end * 1000)
  const resumesAt = new Date(startsAt)
  resumesAt.setMonth(resumesAt.getMonth() + input.months)

  await stripe.subscriptions.update(profile.stripeTierSubscriptionId, {
    pause_collection: {
      behavior: 'void',
      resumes_at: Math.floor(resumesAt.getTime() / 1000),
    },
    // Pause IS the save — a pending cancel is withdrawn by taking it.
    cancel_at_period_end: false,
  })

  // Mirror immediately (webhook confirms). The tier is NOT flipped here —
  // the pause-start cron (processTierPauseStarts) drops it to MAKER once
  // startsAt passes.
  await prisma.creatorProfile.update({
    where: { id: profile.id },
    data: {
      tierPauseStartsAt: startsAt,
      tierPauseResumesAt: resumesAt,
      tierPausedFromTier: profile.subscriptionTier,
      tierLastPausedAt: now,
      tierCancelAtPeriodEnd: false,
    },
  })

  return { startsAt, resumesAt }
}

// =============================================================================
// unpauseTierSubscription — manual early resume (before or during the pause)
// =============================================================================
//
// Clears Stripe pause_collection and restores the remembered tier. Safe in
// both phases: before startsAt the tier never dropped (restore is a same-tier
// no-op inside the shared helper); during the pause it flips MAKER back to
// the remembered tier. Stripe resumes billing on its own schedule after the
// pause_collection is cleared.

export async function unpauseTierSubscription(input: {
  creatorProfileId: string
}): Promise<{ restoredTier: string | null }> {
  const profile = await prisma.creatorProfile.findUnique({
    where: { id: input.creatorProfileId },
    select: { id: true, stripeTierSubscriptionId: true },
  })
  if (!profile) throw new Error('Creator profile not found.')
  if (!profile.stripeTierSubscriptionId) {
    throw new Error('No tier subscription on file.')
  }

  const pauseState = await prisma.creatorProfile.findUnique({
    where: { id: profile.id },
    select: { tierPausedFromTier: true },
  })
  if (!pauseState?.tierPausedFromTier) {
    throw new Error('Your subscription is not paused.')
  }

  await stripe.subscriptions.update(profile.stripeTierSubscriptionId, {
    // Empty string clears pause_collection (stripe-node convention).
    pause_collection: '',
  })

  // Restore the tier (same-tier no-op if the drop never happened) + clear
  // the pause window. tierLastPausedAt intentionally KEPT — the cooldown
  // stands even after an early resume.
  await setCreatorTierWithAudit({
    creatorProfileId: profile.id,
    newTier: pauseState.tierPausedFromTier,
    actor: { kind: 'system', label: 'pause_early_resume' },
    payload: { stripeSubscriptionId: profile.stripeTierSubscriptionId },
  })
  await prisma.creatorProfile.update({
    where: { id: profile.id },
    data: {
      tierPauseStartsAt: null,
      tierPauseResumesAt: null,
      tierPausedFromTier: null,
    },
  })

  return { restoredTier: pauseState.tierPausedFromTier }
}

// =============================================================================
// processTierPauseStarts — cron sweep: drop to MAKER once the paid period ends
// =============================================================================
//
// Runs from the same cron route as processTierDunning. Finds profiles whose
// pause window has begun (tierPauseStartsAt <= now, tierPausedFromTier set,
// tier not yet MAKER) and flips them via the shared audited helper (which
// also sweeps designer seats). Idempotent: once flipped, the tier IS MAKER
// and the row no longer matches.

export interface TierPauseSweepResult {
  swept: number
  errors: number
}

export async function processTierPauseStarts(): Promise<TierPauseSweepResult> {
  const now = new Date()
  const due = await prisma.creatorProfile.findMany({
    where: {
      tierPausedFromTier: { not: null },
      tierPauseStartsAt: { lte: now },
      subscriptionTier: { not: 'MAKER' },
    },
    select: { id: true, subscriptionTier: true },
  })

  let swept = 0
  let errors = 0
  for (const row of due) {
    try {
      await setCreatorTierWithAudit({
        creatorProfileId: row.id,
        newTier: 'MAKER',
        actor: { kind: 'system', label: 'pause_started' },
        payload: { pausedFromTier: row.subscriptionTier },
      })
      swept += 1
    } catch (err) {
      errors += 1
      // eslint-disable-next-line no-console
      console.error(
        '[tier-pause] sweep failed for profile',
        row.id,
        (err as Error).message,
      )
    }
  }
  return { swept, errors }
}

// =============================================================================
// scheduleTierDowngrade — TRUE downgrade at renewal (Cancellation P2)
// =============================================================================
//
// Replaces the "cancel + re-subscribe" doctrine for tier downgrades
// (docs/CREATOR_PLAN_CANCELLATION_RESEARCH_2026-07-20.md P2). Paid-through
// doctrine: the creator keeps the CURRENT tier until current_period_end, then
// the LOWER tier's price starts billing, with no proration in either
// direction (nothing changes mid-cycle, so there is nothing to prorate).
//
// Mechanics: Stripe Subscription Schedule with two phases:
//   phase 1 = current price, ends at current_period_end
//   phase 2 = per-subscription Builder price (grandfather pattern, same as
//             Checkout), ONE iteration, then end_behavior 'release' — the
//             subscription continues on the Builder price with no schedule
//             attached, back to the exact shape upgrades produce.
// The tier flip happens when phase 2 starts: customer.subscription.updated
// fires with the new price whose metadata carries ilaunchify_tier, and the
// webhook flips DOWN only (guarded), then clears the mirrors.
//
// Undo: releaseScheduledTierDowngrade before phase 2 — the schedule releases,
// the sub keeps the current price, nothing ever changes.

export interface ScheduleTierDowngradeInput {
  creatorProfileId: string
  /** Tier to land on at renewal. V1: 'BUILDER' (Agency is the only tier
      with somewhere lower to go that isn't a cancel-to-Maker). */
  targetTier: 'BUILDER'
}

export async function scheduleTierDowngrade(
  input: ScheduleTierDowngradeInput,
): Promise<{ effectiveAt: Date }> {
  const profile = await prisma.creatorProfile.findUnique({
    where: { id: input.creatorProfileId },
    select: {
      id: true,
      subscriptionTier: true,
      stripeTierSubscriptionId: true,
      tierCancelAtPeriodEnd: true,
      tierPausedFromTier: true,
      tierPendingDowngradeTo: true,
      tierDowngradeAt: true,
    },
  })
  if (!profile) throw new Error('Creator profile not found.')
  if (!profile.stripeTierSubscriptionId) {
    throw new Error('No active tier subscription to downgrade.')
  }
  if (profile.subscriptionTier !== 'AGENCY') {
    throw new Error('Only an Agency plan can switch down to Builder.')
  }
  if (profile.tierCancelAtPeriodEnd) {
    throw new Error(
      'Your plan is set to cancel. Resume it first, then switch tiers.',
    )
  }
  if (profile.tierPausedFromTier) {
    throw new Error('Your plan is paused. Resume it before switching tiers.')
  }
  if (profile.tierPendingDowngradeTo && profile.tierDowngradeAt) {
    // Idempotent: already scheduled.
    return { effectiveAt: profile.tierDowngradeAt }
  }

  const sub = await stripe.subscriptions.retrieve(
    profile.stripeTierSubscriptionId,
  )
  const currentItem = sub.items.data[0]
  if (!currentItem) throw new Error('Subscription has no billable item.')

  // Per-subscription Builder Product+Price — SubscriptionPlan is the price
  // SSOT (admin-editable), grandfathered per creator exactly like Checkout.
  const planCode = tierToPlanCode(input.targetTier)
  const plan = await getPlanByCode(planCode)
  if (!plan?.monthlyPriceCents || plan.monthlyPriceCents <= 0) {
    throw new Error(`Plan ${planCode} has no monthly price set.`)
  }
  const priceMetadata = {
    ilaunchify_kind: 'tier' as const,
    ilaunchify_creator_profile_id: profile.id,
    ilaunchify_plan_code: planCode,
    ilaunchify_tier: input.targetTier,
  }
  const product = await stripe.products.create({
    name: `iLaunchify ${plan.tierName} — scheduled downgrade`,
    metadata: priceMetadata,
  })
  const newPrice = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: plan.monthlyPriceCents,
    recurring: { interval: 'month', interval_count: 1 },
    metadata: priceMetadata,
  })

  // Attach (or reuse) the schedule and lay out the two phases.
  const scheduleId =
    typeof sub.schedule === 'string'
      ? sub.schedule
      : (sub.schedule?.id ??
        (await stripe.subscriptionSchedules.create({
          from_subscription: sub.id,
        })).id)

  await stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: 'release',
    phases: [
      {
        items: [{ price: currentItem.price.id, quantity: 1 }],
        start_date: sub.current_period_start,
        end_date: sub.current_period_end,
      },
      {
        items: [{ price: newPrice.id, quantity: 1 }],
        iterations: 1,
      },
    ],
    metadata: priceMetadata,
  })

  const effectiveAt = new Date(sub.current_period_end * 1000)

  // Mirror for the UI.
  await prisma.creatorProfile.update({
    where: { id: profile.id },
    data: {
      tierPendingDowngradeTo: input.targetTier,
      tierDowngradeAt: effectiveAt,
      tierScheduleId: scheduleId,
    },
  })

  return { effectiveAt }
}

/**
 * Undo a scheduled downgrade before it takes effect: release the schedule
 * (subscription keeps its current price as if nothing happened) + clear the
 * mirrors. Safe to call twice.
 */
export async function releaseScheduledTierDowngrade(input: {
  creatorProfileId: string
}): Promise<void> {
  const extra = await prisma.creatorProfile.findUnique({
    where: { id: input.creatorProfileId },
    select: { tierScheduleId: true },
  })
  if (!extra?.tierScheduleId) return

  try {
    await stripe.subscriptionSchedules.release(extra.tierScheduleId)
  } catch (err) {
    // Already released/completed is fine — mirrors get cleared either way.
    // eslint-disable-next-line no-console
    console.warn(
      '[tier-downgrade] schedule release warning',
      (err as Error).message,
    )
  }

  await prisma.creatorProfile.update({
    where: { id: input.creatorProfileId },
    data: {
      tierPendingDowngradeTo: null,
      tierDowngradeAt: null,
      tierScheduleId: null,
    },
  })
}

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
