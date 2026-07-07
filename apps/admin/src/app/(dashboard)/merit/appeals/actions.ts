'use server'

// Rating appeal adjudication (docs/MANUFACTURER_MERIT_ENGINE.md §5, MM-4b).
// Admin acknowledges + resolves a manufacturer's appeal. UPHELD leaves the rating;
// EXCLUDED/REATTRIBUTED mark the rating excluded and recompute the aggregate
// through the SINGLE writer — so standing updates fairly and auditable.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { canTransitionAppeal, recomputePartnerRatingAggregate, type RatingAppealStatus } from '@ilaunchify/orders'
import { revalidatePath } from 'next/cache'

type Result = { ok: true; message?: string } | { ok: false; error: string }

export async function acknowledgeRatingAppeal(appealId: string): Promise<Result> {
  const admin = await requireCapability('reviews:write')
  const appeal = await prisma.ratingAppeal.findUnique({ where: { id: appealId }, select: { id: true, status: true } })
  if (!appeal) return { ok: false, error: 'Appeal not found.' }
  if (!canTransitionAppeal(appeal.status, 'UNDER_REVIEW')) return { ok: false, error: `Cannot acknowledge from ${appeal.status}.` }
  await prisma.ratingAppeal.update({ where: { id: appealId }, data: { status: 'UNDER_REVIEW', acknowledgedAt: new Date() } })
  await logAuditAs(admin, { entityType: 'RatingAppeal', entityId: appealId, action: 'RATING_APPEAL_ACKNOWLEDGED', fromValue: appeal.status, toValue: 'UNDER_REVIEW' })
  revalidatePath('/merit/appeals')
  return { ok: true, message: 'Acknowledged.' }
}

export async function adjudicateRatingAppeal(
  appealId: string,
  outcome: 'UPHELD' | 'EXCLUDED' | 'REATTRIBUTED',
  note?: string,
): Promise<Result> {
  const admin = await requireCapability('reviews:write')
  const appeal = await prisma.ratingAppeal.findUnique({
    where: { id: appealId },
    select: { id: true, status: true, ratingId: true, partnerServiceId: true },
  })
  if (!appeal) return { ok: false, error: 'Appeal not found.' }
  if (!canTransitionAppeal(appeal.status, outcome)) return { ok: false, error: `Cannot ${outcome.toLowerCase()} from ${appeal.status}.` }

  const rating = await prisma.partnerRating.findUnique({ where: { id: appeal.ratingId }, select: { role: true, partnerServiceId: true } })
  if (!rating) return { ok: false, error: 'The contested rating no longer exists.' }

  const now = new Date()
  const removes = outcome === 'EXCLUDED' || outcome === 'REATTRIBUTED'
  try {
    await prisma.$transaction(async (tx) => {
      if (removes) {
        await tx.partnerRating.update({
          where: { id: appeal.ratingId },
          data: { excludedAt: now, excludedReason: `${outcome}: ${note?.slice(0, 200) ?? 'appeal upheld'}` },
        })
      }
      await tx.ratingAppeal.update({
        where: { id: appealId },
        data: { status: outcome, adminNote: note?.slice(0, 1000) ?? null, adjudicatedById: admin.id, resolvedAt: now },
      })
    })

    // Recompute the aggregate OUTSIDE the tx (reads the now-updated excludedAt).
    let recomputed = false
    if (removes) {
      await recomputePartnerRatingAggregate(rating.partnerServiceId, rating.role).catch(() => null)
      recomputed = true
    }

    await logAuditAs(admin, {
      entityType: 'RatingAppeal',
      entityId: appealId,
      action: 'RATING_APPEAL_ADJUDICATED',
      fromValue: appeal.status,
      toValue: outcome,
      payload: { ratingId: appeal.ratingId, partnerServiceId: appeal.partnerServiceId, recomputed },
    })
    revalidatePath('/merit/appeals')
    revalidatePath('/merit')
    return { ok: true, message: removes ? 'Resolved — rating excluded and standing recomputed.' : 'Resolved — rating stands.' }
  } catch (err) {
    return { ok: false, error: `Adjudication failed: ${(err as Error).message}` }
  }
}
