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
import {
  createTierCheckoutSession,
  cancelTierSubscription,
  resumeTierSubscription,
  type UpgradeableTier,
} from '@ilaunchify/payments'

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
// Reason is captured on the Stripe subscription so the cancellation
// shows up on the eventual subscription.deleted payload for audit.

export async function cancelMyTierSubscription(input: {
  reason?: string
}): Promise<Result<{ cancelAt: string }>> {
  const user = await requireUser()

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, stripeTierSubscriptionId: true },
  })
  if (!profile) {
    return { ok: false, error: 'Creator profile not found.' }
  }
  if (!profile.stripeTierSubscriptionId) {
    return { ok: false, error: 'No active tier subscription to cancel.' }
  }

  try {
    const res = await cancelTierSubscription({
      creatorProfileId: profile.id,
      reason: input.reason,
    })
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
    select: { id: true },
  })
  if (!profile) {
    return { ok: false, error: 'Creator profile not found.' }
  }

  try {
    const res = await resumeTierSubscription({
      creatorProfileId: profile.id,
    })
    revalidatePath('/settings/plan')
    return { ok: true, currentPeriodEnd: res.currentPeriodEnd.toISOString() }
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
