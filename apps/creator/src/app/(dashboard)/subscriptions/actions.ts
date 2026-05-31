'use server'

// Phase G6.f — creator-side ProductionSubscription cancel action.
//
// Lives at /subscriptions next to /orders + /products so the creator
// has one mental model: top-level sidebar entries for each
// long-running object they own. V1.5 may move this under /account/billing
// alongside the future tier-upgrade flow (task #554), but for V1 a
// flat path matches the existing sidebar pattern.
//
// cancelMySubscription:
//   1. requireUser + verifies the subscription belongs to the caller
//   2. delegates to @ilaunchify/payments cancelProductionSubscription
//      which forwards to Stripe and returns the canceledAt timestamp
//   3. updates our row to CANCELLED with the reason + timestamp
//   4. logs PRODUCTION_SUBSCRIPTION_CANCELLED audit
//
// We don't call subscription.cancel ourselves — the helper handles
// idempotent "already cancelled" cases by returning canceledAt = now,
// and the webhook on customer.subscription.deleted (G6.d) will
// reconcile if Stripe state diverges.

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { cancelProductionSubscription } from '@ilaunchify/payments'

type Result = { ok: true } | { ok: false; error: string }

export async function cancelMySubscription(input: {
  productionSubscriptionId: string
  reason?: string
}): Promise<Result> {
  const user = await requireUser()

  const sub = await prisma.productionSubscription.findFirst({
    where: { id: input.productionSubscriptionId, creatorUserId: user.id },
    select: {
      id: true,
      status: true,
      stripeSubscriptionId: true,
      productId: true,
      cadence: true,
    },
  })
  if (!sub) {
    return { ok: false, error: 'Subscription not found.' }
  }
  if (sub.status === 'CANCELLED' || sub.status === 'COMPLETED') {
    return { ok: false, error: 'Subscription is already inactive.' }
  }

  // Forward to Stripe — best-effort. If Stripe 404s (already cancelled
  // there), the helper returns canceledAt=now and we still flip our row
  // so the UI stays consistent.
  let canceledAt = new Date()
  try {
    const result = await cancelProductionSubscription({
      stripeSubscriptionId: sub.stripeSubscriptionId,
      reason: input.reason,
    })
    canceledAt = result.canceledAt
  } catch (err) {
    // Don't expose the Stripe error to the creator — log internally,
    // proceed with our cancel. Webhook will reconcile.
    console.error('Stripe cancel failed; proceeding with local cancel:', err)
  }

  await prisma.productionSubscription.update({
    where: { id: sub.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: canceledAt,
      cancelledReason: input.reason?.trim() || 'Cancelled by creator',
      nextRunAt: null,
    },
  })

  await logAuditAs(user, {
    entityType: 'ProductionSubscription',
    entityId: sub.id,
    action: 'PRODUCTION_SUBSCRIPTION_CANCELLED',
    fromValue: sub.status,
    toValue: 'CANCELLED',
    payload: {
      productId: sub.productId,
      cadence: sub.cadence,
      reason: input.reason?.trim() || null,
      surface: 'creator-account-subscriptions',
    },
  })

  revalidatePath('/subscriptions')
  return { ok: true }
}
