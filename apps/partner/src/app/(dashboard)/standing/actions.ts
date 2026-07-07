'use server'

// Partner-side rating appeal (MM-4b, docs/MANUFACTURER_MERIT_ENGINE.md §5).
// A manufacturer contests a rating they believe is unfair or misattributed.
// Filing freezes their standing against demotion until an admin adjudicates.
// DENY-by-default: the contested rating must belong to a service this user can
// act on (serviceOwnedBy), and there is one appeal per rating per service.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { serviceOwnedBy } from '@/lib/partner-context'

type Result = { ok: true; appealId: string } | { ok: false; error: string }

export async function fileRatingAppeal(ratingId: string, reason: string): Promise<Result> {
  const user = await requireUser()
  const trimmed = reason.trim()
  if (trimmed.length < 20) return { ok: false, error: 'Please describe why the rating is unfair (at least 20 characters).' }

  // The rating must exist, and its service (soft FK) must be one this user may
  // work — checked with a separate DENY-by-default ownership query.
  const rating = await prisma.partnerRating.findUnique({
    where: { id: ratingId },
    select: { id: true, partnerServiceId: true },
  })
  if (!rating) return { ok: false, error: 'Rating not found.' }
  const owned = await prisma.partnerService.findFirst({
    where: { id: rating.partnerServiceId, AND: [serviceOwnedBy(user.id)] },
    select: { id: true },
  })
  if (!owned) return { ok: false, error: 'You do not have access to this rating.' }

  const existing = await prisma.ratingAppeal.findUnique({
    where: { ratingId_partnerServiceId: { ratingId, partnerServiceId: rating.partnerServiceId } },
    select: { id: true, status: true },
  })
  if (existing) return { ok: false, error: `You have already filed an appeal for this rating (${existing.status}).` }

  const appeal = await prisma.ratingAppeal.create({
    data: {
      ratingId,
      partnerServiceId: rating.partnerServiceId,
      filedByUserId: user.id,
      reason: trimmed.slice(0, 1000),
      status: 'SUBMITTED',
    },
    select: { id: true },
  })

  await logAuditAs(user, {
    entityType: 'RatingAppeal',
    entityId: appeal.id,
    action: 'RATING_APPEAL_FILED',
    toValue: 'SUBMITTED',
    payload: { ratingId, partnerServiceId: rating.partnerServiceId },
  })
  revalidatePath('/standing')
  revalidatePath('/dashboard')
  return { ok: true, appealId: appeal.id }
}
