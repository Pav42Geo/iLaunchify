// V1.5-T2 — single source-of-truth for writes to CreatorProfile.subscriptionTier.
//
// Two callers today:
//   1. apps/admin/.../tiers/actions.ts → changeCreatorTier() and
//      bulkChangeCreatorTier() — admin promotes/demotes a creator.
//      Actor is the admin User. Reason is required.
//   2. packages/payments/src/webhook-handlers.ts → onTierSubscriptionXxx
//      (lands in V1.5-T4). Actor is SYSTEM. Stripe metadata becomes the
//      audit payload.
//
// Before V1.5: the admin actions did the prisma.update + logAudit inline,
// so the webhook would have either duplicated the logic or skipped pieces
// (audit, revalidate). This helper makes both write paths identical.
//
// Returns the previous tier (caller decides whether to no-op on same-tier),
// not a Result envelope, since callers have different validation rules
// (admin enforces reason; webhook trusts Stripe). Throws on a missing
// CreatorProfile — that's an invariant violation either way.

import { prisma } from '@ilaunchify/db'
import { logAudit } from '@ilaunchify/audit'
import type { SubscriptionTier } from '@ilaunchify/db'

export type TierWriteActor =
  | {
      kind: 'admin'
      /** Admin User.id; gets stamped on tierChangedById. */
      userId: string
    }
  | {
      kind: 'system'
      /** Optional human label for the audit row (e.g. "stripe_webhook"). */
      label?: string
    }

export interface SetCreatorTierInput {
  creatorProfileId: string
  newTier: SubscriptionTier
  actor: TierWriteActor
  /** Free-form payload merged into the audit row's `payload` JSON. */
  payload?: Record<string, unknown>
}

export interface SetCreatorTierResult {
  previousTier: SubscriptionTier
  changed: boolean
}

/**
 * Idempotent helper — if the creator is already on the requested tier we
 * skip the write AND the audit entry (`changed: false`). Callers can
 * still react to that (admin shows "already on this tier" toast; webhook
 * treats it as a no-op).
 */
export async function setCreatorTierWithAudit(
  input: SetCreatorTierInput,
): Promise<SetCreatorTierResult> {
  const existing = await prisma.creatorProfile.findUnique({
    where: { id: input.creatorProfileId },
    select: {
      id: true,
      subscriptionTier: true,
      userId: true,
      displayName: true,
    },
  })
  if (!existing) {
    throw new Error(`CreatorProfile ${input.creatorProfileId} not found`)
  }

  if (existing.subscriptionTier === input.newTier) {
    return { previousTier: existing.subscriptionTier, changed: false }
  }

  await prisma.creatorProfile.update({
    where: { id: input.creatorProfileId },
    data: {
      subscriptionTier: input.newTier,
      tierChangedAt: new Date(),
      // Only admin actions stamp tierChangedById; webhook-driven flips
      // leave it null so the admin UI can render "self-paid via Stripe"
      // vs "promoted by admin X" later.
      tierChangedById: input.actor.kind === 'admin' ? input.actor.userId : null,
    },
  })

  await logAudit({
    entityType: 'CreatorProfile',
    entityId: existing.id,
    action: 'CREATOR_TIER_CHANGE',
    actorId: input.actor.kind === 'admin' ? input.actor.userId : null,
    actorRole: input.actor.kind === 'admin' ? 'ADMIN' : 'SYSTEM',
    fromValue: existing.subscriptionTier,
    toValue: input.newTier,
    payload: {
      creatorDisplayName: existing.displayName,
      creatorUserId: existing.userId,
      ...(input.actor.kind === 'system' && input.actor.label
        ? { systemSource: input.actor.label }
        : {}),
      ...(input.payload ?? {}),
    },
  })

  return { previousTier: existing.subscriptionTier, changed: true }
}
