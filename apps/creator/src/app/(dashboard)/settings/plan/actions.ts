'use server'

// V1.5-T5 — server actions for the creator self-serve tier flow.
//
// Three actions, all guarded by requireUser() + creator-profile lookup:
//   - startTierUpgrade({ targetTier }) → Stripe Checkout URL
//   - cancelMyTierSubscription({ reason? }) → cancel_at_period_end:true
//   - resumeMyTierSubscription() → undo a pending cancel
//
// Pattern matches /settings/payouts/actions.ts (existing creator-side
// Stripe-Connect actions) so wiring on the client is identical: action
// returns { ok: true, ... } | { ok: false, error: string } and the
// client-side button toast-routes from there.

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import {
  createTierCheckoutSession,
  cancelTierSubscription,
  resumeTierSubscription,
  pauseTierSubscription,
  createBillingPortalSession,
  PAUSE_MIN_MONTHS,
  PAUSE_MAX_MONTHS,
  type UpgradeableTier,
} from '@ilaunchify/payments'
import {
  isTierCancelReasonCode,
  REASON_TEXT_MAX_LENGTH,
  type TierCancelReasonCode,
} from './cancel-reasons'

type Result<T = unknown> = (T & { ok: true }) | { ok: false; error: string }

// =============================================================================
// startTierUpgrade — open Stripe Checkout
// =============================================================================
//
// Returns a hosted Checkout URL so the client component can do
// `window.location.assign(url)` (Stripe redirect must be top-level, can't
// be inside a fetch handler). The success_url returns to /settings/plan
// where V1.5-T4's webhook will have already flipped the tier.

export async function startTierUpgrade(input: {
  targetTier: UpgradeableTier
}): Promise<Result<{ url: string }>> {
  const user = await requireUser()

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      subscriptionTier: true,
      displayName: true,
      stripeTierSubscriptionId: true,
      tierCancelAtPeriodEnd: true,
    },
  })
  if (!profile) {
    return { ok: false, error: 'Complete creator onboarding before upgrading.' }
  }
  if (profile.subscriptionTier === input.targetTier) {
    return { ok: false, error: `You are already on the ${input.targetTier} plan.` }
  }
  if (
    profile.stripeTierSubscriptionId &&
    !profile.tierCancelAtPeriodEnd
  ) {
    // Active subscription that isn't pending cancel — they should manage
    // their existing one, not open a second Checkout.
    return {
      ok: false,
      error:
        'You already have an active tier subscription. Cancel the current plan before switching.',
    }
  }

  // success_url + cancel_url have to be absolute for Stripe — pull the
  // host from headers so this works in dev (localhost:3000) and prod.
  // V1.5: hard-coded to /settings/plan for both because the success
  // banner + skeleton loader live on that page.
  const origin = await getOrigin()
  const successUrl = `${origin}/settings/plan?checkout=success&tier=${input.targetTier.toLowerCase()}`
  const cancelUrl = `${origin}/settings/plan?checkout=cancelled`

  try {
    const session = await createTierCheckoutSession({
      creatorProfileId: profile.id,
      newTier: input.targetTier,
      userId: user.id,
      userEmail: user.email!,
      userName: profile.displayName ?? user.name ?? null,
      successUrl,
      cancelUrl,
    })
    return { ok: true, url: session.url }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// =============================================================================
// cancelMyTierSubscription — creator-initiated cancel (period-end)
// =============================================================================
//
// Schedules cancellation at the end of the current period — the creator
// keeps Builder/Agency benefits until then. customer.subscription.deleted
// (V1.5-T4) flips them back to MAKER at the actual end date.
//
// Cancellation P0 (docs/CREATOR_PLAN_CANCELLATION_RESEARCH_2026-07-20.md):
// the decision moment is now recorded on OUR side too, not just Stripe:
//   1. Structured reasonCode (+ optional free text) from the cancel modal.
//   2. TierCancellationEvent row — churn-analytics SSOT.
//   3. SUBSCRIPTION_CANCEL_REQUESTED audit row (actor = the creator).
// The reason still mirrors to Stripe cancellation_details so it appears on
// the eventual subscription.deleted payload. Steps 2 + 3 are best-effort
// AFTER the Stripe call succeeds: the cancel must not appear to fail when
// only bookkeeping does. The tier flip stays webhook-authoritative.

export async function cancelMyTierSubscription(input: {
  reasonCode: TierCancelReasonCode
  reasonText?: string
}): Promise<Result<{ cancelAt: string }>> {
  const user = await requireUser()

  if (!isTierCancelReasonCode(input.reasonCode)) {
    return { ok: false, error: 'Pick a reason for cancelling.' }
  }
  const reasonText =
    input.reasonText?.trim().slice(0, REASON_TEXT_MAX_LENGTH) || null

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      subscriptionTier: true,
      stripeTierSubscriptionId: true,
    },
  })
  if (!profile) {
    return { ok: false, error: 'Creator profile not found.' }
  }
  if (!profile.stripeTierSubscriptionId) {
    // Admin-granted Builder/Agency (courtesy upgrade) has no Stripe sub —
    // the page hides the cancel CTA for this state, but guard here too.
    return {
      ok: false,
      error:
        'Your plan is managed by iLaunchify. Contact support to make changes.',
    }
  }

  try {
    const res = await cancelTierSubscription({
      creatorProfileId: profile.id,
      // Compact "CODE: free text" string for Stripe cancellation_details.
      reason: reasonText
        ? `${input.reasonCode}: ${reasonText}`
        : input.reasonCode,
    })

    // Best-effort bookkeeping — Stripe already accepted the cancel.
    try {
      // Cast-guarded until the TierCancellationEvent migration lands
      // (db:push + db:generate) — same pattern as the dunning fields on
      // page.tsx. TODO: drop the cast once the client is regenerated.
      await (
        prisma as unknown as {
          tierCancellationEvent: {
            create: (a: { data: Record<string, unknown> }) => Promise<unknown>
          }
        }
      ).tierCancellationEvent.create({
        data: {
          creatorProfileId: profile.id,
          tier: profile.subscriptionTier,
          reasonCode: input.reasonCode,
          reasonText,
          stripeSubscriptionId: profile.stripeTierSubscriptionId,
          periodEnd: res.cancelAt,
        },
      })
      await logAuditAs(user, {
        entityType: 'CreatorProfile',
        entityId: profile.id,
        action: 'SUBSCRIPTION_CANCEL_REQUESTED',
        fromValue: profile.subscriptionTier,
        toValue: 'MAKER',
        payload: {
          reasonCode: input.reasonCode,
          reasonText,
          cancelAt: res.cancelAt.toISOString(),
          stripeSubscriptionId: profile.stripeTierSubscriptionId,
        },
      })
    } catch (bookkeepingErr) {
      // eslint-disable-next-line no-console
      console.error(
        '[plan] cancel bookkeeping failed',
        (bookkeepingErr as Error).message,
      )
    }

    revalidatePath('/settings/plan')
    return { ok: true, cancelAt: res.cancelAt.toISOString() }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// =============================================================================
// resumeMyTierSubscription — undo a pending cancel
// =============================================================================

export async function resumeMyTierSubscription(): Promise<
  Result<{ currentPeriodEnd: string }>
> {
  const user = await requireUser()

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, subscriptionTier: true },
  })
  if (!profile) {
    return { ok: false, error: 'Creator profile not found.' }
  }

  try {
    const res = await resumeTierSubscription({
      creatorProfileId: profile.id,
    })

    // Best-effort bookkeeping (Cancellation P0) — stamp resumedAt on the
    // open cancellation event(s) + audit the undo.
    try {
      // Cast-guarded until the migration lands — see cancel above.
      await (
        prisma as unknown as {
          tierCancellationEvent: {
            updateMany: (a: {
              where: Record<string, unknown>
              data: Record<string, unknown>
            }) => Promise<unknown>
          }
        }
      ).tierCancellationEvent.updateMany({
        where: { creatorProfileId: profile.id, resumedAt: null },
        data: { resumedAt: new Date() },
      })
      await logAuditAs(user, {
        entityType: 'CreatorProfile',
        entityId: profile.id,
        action: 'SUBSCRIPTION_CANCEL_RESUMED',
        toValue: profile.subscriptionTier,
        payload: {
          currentPeriodEnd: res.currentPeriodEnd.toISOString(),
        },
      })
    } catch (bookkeepingErr) {
      // eslint-disable-next-line no-console
      console.error(
        '[plan] resume bookkeeping failed',
        (bookkeepingErr as Error).message,
      )
    }

    revalidatePath('/settings/plan')
    return { ok: true, currentPeriodEnd: res.currentPeriodEnd.toISOString() }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// =============================================================================
// pauseMyTierSubscription — the P1 save-flow offer (Cancellation P1)
// =============================================================================
//
// Accepted from the cancel modal INSTEAD of cancelling (offered only for
// NOT_USING / TEMPORARY reasons; the single retention offer, CA-compliant).
// Stripe voids invoices for 1-3 months and auto-resumes; benefits are kept
// (Pavel 2026-07-20). Eligibility guards (already-paused, 1x/365d cooldown)
// live in the payments helper — this action adds auth + audit.

export async function pauseMyTierSubscription(input: {
  months: number
  reasonCode?: TierCancelReasonCode
}): Promise<Result<{ resumesAt: string }>> {
  const user = await requireUser()

  if (
    !Number.isInteger(input.months) ||
    input.months < PAUSE_MIN_MONTHS ||
    input.months > PAUSE_MAX_MONTHS
  ) {
    return { ok: false, error: 'Pick a pause length of 1 to 3 months.' }
  }

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      subscriptionTier: true,
      stripeTierSubscriptionId: true,
    },
  })
  if (!profile) {
    return { ok: false, error: 'Creator profile not found.' }
  }
  if (!profile.stripeTierSubscriptionId) {
    return {
      ok: false,
      error:
        'Your plan is managed by iLaunchify. Contact support to make changes.',
    }
  }

  try {
    const res = await pauseTierSubscription({
      creatorProfileId: profile.id,
      months: input.months,
    })

    // Best-effort bookkeeping — Stripe already accepted the pause.
    try {
      await logAuditAs(user, {
        entityType: 'CreatorProfile',
        entityId: profile.id,
        action: 'SUBSCRIPTION_PAUSED',
        toValue: profile.subscriptionTier,
        payload: {
          months: input.months,
          resumesAt: res.resumesAt.toISOString(),
          // Which cancel reason this save converted, for save-rate analytics.
          savedFromReasonCode: input.reasonCode ?? null,
        },
      })
    } catch (bookkeepingErr) {
      // eslint-disable-next-line no-console
      console.error(
        '[plan] pause bookkeeping failed',
        (bookkeepingErr as Error).message,
      )
    }

    revalidatePath('/settings/plan')
    return { ok: true, resumesAt: res.resumesAt.toISOString() }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// =============================================================================
// openBillingPortal — Stripe-hosted card update + invoice history
// =============================================================================
//
// Cancellation P1: the dunning grace banner's "Manage billing" now works.
// The portal configuration disables cancel + plan switching — those stay in
// our flows (reason capture + audit). Returns a hosted URL; the client does
// a top-level navigation, same pattern as Checkout.

export async function openBillingPortal(): Promise<Result<{ url: string }>> {
  const user = await requireUser()

  const origin = await getOrigin()
  try {
    const res = await createBillingPortalSession({
      userId: user.id,
      returnUrl: `${origin}/settings/plan`,
    })
    return { ok: true, url: res.url }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Resolve the page's origin from request headers so Stripe success/cancel
 * URLs are absolute. Use this instead of an env var because dev runs on
 * localhost:3000 but prod runs on app.ilaunchify.com — picking from
 * headers covers both with no config.
 */
async function getOrigin(): Promise<string> {
  // next/headers is async in Next 15.
  const { headers } = await import('next/headers')
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}
