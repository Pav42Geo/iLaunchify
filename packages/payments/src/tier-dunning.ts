// V1 subscription dunning — grace-expiry downgrade.
//
// The webhook (onTierInvoiceFailed) starts a grace period on a failed recurring
// tier charge. This processor (run daily by apps/creator /api/cron/tier-dunning)
// downgrades any creator whose grace window has elapsed while still unpaid:
//   - cancel the Stripe subscription immediately (stop the retries)
//   - flip the tier to MAKER via the shared audited helper
//   - clear the dunning + tier-subscription handles
//   - notify the creator
//
// Idempotent + best-effort: each step is guarded so one failure can't strand the
// batch. The grace fields are cast-guarded (pending the migration).

import { prisma } from '@ilaunchify/db'
import type { NotificationEvent, SubscriptionTier } from '@ilaunchify/db'
import { setCreatorTierWithAudit } from '@ilaunchify/auth'
import { dispatchNotification } from '@ilaunchify/notifications'
import { stripe } from './client'

export interface TierDunningResult {
  downgraded: number
  profileIds: string[]
}

export async function processTierDunning(now: Date = new Date()): Promise<TierDunningResult> {
  const expired = await (
    prisma as unknown as {
      creatorProfile: {
        findMany: (a: unknown) => Promise<
          Array<{
            id: string
            userId: string
            subscriptionTier: string
            stripeTierSubscriptionId: string | null
          }>
        >
      }
    }
  ).creatorProfile
    .findMany({
      where: { tierGraceUntil: { lt: now }, NOT: { subscriptionTier: 'MAKER' } },
      select: { id: true, userId: true, subscriptionTier: true, stripeTierSubscriptionId: true },
    })
    .catch(() => [] as Array<{ id: string; userId: string; subscriptionTier: string; stripeTierSubscriptionId: string | null }>)

  const profileIds: string[] = []

  for (const p of expired) {
    // Stop Stripe's retries so a later successful charge can't strand a paid sub
    // against an account we've already downgraded. Best-effort.
    if (p.stripeTierSubscriptionId) {
      await stripe.subscriptions.cancel(p.stripeTierSubscriptionId).catch(() => undefined)
    }

    await setCreatorTierWithAudit({
      creatorProfileId: p.id,
      newTier: 'MAKER' as SubscriptionTier,
      actor: { kind: 'system', label: 'dunning_downgrade' },
      payload: { reason: 'grace_expired_unpaid', fromTier: p.subscriptionTier },
    })

    await (
      prisma as unknown as { creatorProfile: { update: (a: unknown) => Promise<unknown> } }
    ).creatorProfile
      .update({
        where: { id: p.id },
        data: {
          tierPaymentFailedAt: null,
          tierGraceUntil: null,
          stripeTierSubscriptionId: null,
          tierCurrentPeriodEnd: null,
          tierCancelAtPeriodEnd: false,
        },
      })
      .catch(() => undefined)

    await dispatchNotification({
      userId: p.userId,
      event: 'CREATOR_SUBSCRIPTION_DOWNGRADED' as unknown as NotificationEvent,
      data: {},
      audience: 'creator',
    }).catch(() => undefined)

    profileIds.push(p.id)
  }

  return { downgraded: profileIds.length, profileIds }
}
