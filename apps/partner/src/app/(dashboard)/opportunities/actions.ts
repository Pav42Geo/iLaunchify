'use server'

// Opportunity Pool server actions — Express Interest + Withdraw.
// CO_CREATION_MARKETPLACE_SPEC §4 (EOI: fit + terms, NEVER a formula), §13
// (verified-partner gate + rate limit). Status changes via FSM asserts;
// every mutation writes AuditLog; creator gets BRIEF_INTEREST_RECEIVED.

import { revalidatePath } from 'next/cache'
import { prisma, getCoCreationSettings } from '@ilaunchify/db'
import { requireUser, getPartnerAccess, checkRateLimit } from '@ilaunchify/auth'
import { assertInterestTransition } from '@ilaunchify/orders'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchNotification } from '@ilaunchify/notifications'
import { scoreBriefFit } from '@ilaunchify/marketplace'
import { z } from 'zod'
import { loadPartnerFitFacts } from './loader'

// D-CC2 DECIDED 2026-07-10: the open-interest cap is admin-tunable via
// CoCreationSettings.maxOpenInterestsPerPartner (0 = unlimited). The daily
// rate limit stays a constant backstop against scripted spam.
const RATE_LIMIT = { scope: 'brief-interest', limit: 20, windowSec: 86_400 }

const ExpressInterestSchema = z.object({
  briefId: z.string().min(1),
  priceLow: z.number().positive().max(1_000_000).nullable(),
  priceHigh: z.number().positive().max(1_000_000).nullable(),
  moq: z.number().int().positive().max(100_000_000).nullable(),
  leadTimeWeeks: z.number().int().positive().max(520).nullable(),
  /** claim label → can we meet it (from the modal's toggle row). */
  claimFit: z.record(z.string().max(40), z.boolean()),
  offersSample: z.boolean(),
  pitch: z.string().trim().min(1, 'Add a short pitch').max(240),
})

export type ExpressInterestInput = z.infer<typeof ExpressInterestSchema>
export type ActionResult = { ok: true } | { ok: false; error: string }

async function requireActivePartner(userId: string) {
  const access = await getPartnerAccess(userId)
  if (!access) return null
  const partner = await prisma.partner.findUnique({
    where: { id: access.partnerId },
    select: { id: true, companyName: true, status: true },
  })
  if (!partner) return null
  // Verified-partner gate (§13): only live partners touch the pool.
  if (partner.status !== 'ACTIVE' && partner.status !== 'INTEGRATION_ENHANCED') return null
  return partner
}

export async function expressInterest(input: ExpressInterestInput): Promise<ActionResult> {
  const user = await requireUser()
  const partner = await requireActivePartner(user.id)
  if (!partner) return { ok: false, error: 'Only active partners can express interest' }

  const parsed = ExpressInterestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' }
  }
  const data = parsed.data

  // Anti-spam throttle (D-CC2 placeholder) — DB-backed fixed window.
  const rl = await checkRateLimit({ ...RATE_LIMIT, id: partner.id })
  if (!rl.ok) return { ok: false, error: 'Too many interests today — try again tomorrow' }

  const settings = await getCoCreationSettings()
  if (settings.maxOpenInterestsPerPartner > 0) {
    const activeCount = await prisma.briefInterest.count({
      where: { partnerId: partner.id, status: { in: ['SUBMITTED', 'SHORTLISTED'] } },
    })
    if (activeCount >= settings.maxOpenInterestsPerPartner) {
      return {
        ok: false,
        error: `You have ${settings.maxOpenInterestsPerPartner} open interests — withdraw one or wait for creators to decide`,
      }
    }
  }

  const brief = await prisma.productBrief.findUnique({
    where: { id: data.briefId },
    include: { creator: { select: { userId: true } } },
  })
  if (!brief || brief.status !== 'INTEREST_OPEN') {
    return { ok: false, error: 'This brief is no longer open for interest' }
  }

  // Re-check eligibility server-side — the pool UI already hard-filters, but
  // never trust the client (§13 tenant isolation posture).
  const facts = await loadPartnerFitFacts(partner.id)
  const fit = scoreBriefFit(
    {
      nicheSlug: brief.nicheSlug,
      categoryId: brief.categoryId,
      claims: brief.claims,
      targetVolume: brief.targetVolume,
    },
    facts,
    // Snapshot with the admin's live weights so BriefInterest.fitScore matches
    // what the pool showed the maker.
    {
      claims: settings.claimsWeightPct,
      volume: settings.volumeWeightPct,
      merit: settings.meritWeightPct,
      location: settings.locationWeightPct,
    },
  )
  if (!fit.eligible) {
    return { ok: false, error: 'This brief doesn’t match your capabilities' }
  }
  if (!facts.serviceId) {
    return { ok: false, error: 'Add an active manufacturing service first' }
  }

  if (data.priceLow !== null && data.priceHigh !== null && data.priceHigh < data.priceLow) {
    return { ok: false, error: 'Price range is inverted' }
  }

  try {
    const interest = await prisma.briefInterest.create({
      data: {
        briefId: brief.id,
        partnerId: partner.id,
        serviceId: facts.serviceId,
        status: 'SUBMITTED',
        fitScore: fit.score, // snapshot at submit (§8)
        priceLow: data.priceLow,
        priceHigh: data.priceHigh,
        moq: data.moq,
        leadTimeWeeks: data.leadTimeWeeks,
        claimFit: data.claimFit,
        offersSample: data.offersSample,
        pitch: data.pitch,
      },
    })

    await logAuditAs(user, {
      entityType: 'BriefInterest',
      entityId: interest.id,
      action: 'INTEREST_SUBMITTED',
      payload: {
        briefId: brief.id,
        fitScore: fit.score,
        fitParts: fit.parts,
        moq: data.moq,
        leadTimeWeeks: data.leadTimeWeeks,
        offersSample: data.offersSample,
      },
    })

    // Notify the creator (never throws).
    await dispatchNotification({
      userId: brief.creator.userId,
      event: 'BRIEF_INTEREST_RECEIVED',
      audience: 'creator',
      data: { briefId: brief.id, briefTitle: brief.title, partnerName: partner.companyName },
    })
  } catch (e) {
    // @@unique([briefId, partnerId]) — double submit.
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return { ok: false, error: 'You already expressed interest on this brief' }
    }
    throw e
  }

  revalidatePath('/opportunities')
  return { ok: true }
}

export async function withdrawInterest(interestId: string): Promise<ActionResult> {
  const user = await requireUser()
  const partner = await requireActivePartner(user.id)
  if (!partner) return { ok: false, error: 'Only active partners can withdraw' }

  // Ownership guard — the interest must belong to the acting partner.
  const interest = await prisma.briefInterest.findFirst({
    where: { id: interestId, partnerId: partner.id },
  })
  if (!interest) return { ok: false, error: 'Interest not found' }

  // Post-selection withdrawal has room/escrow implications (D-CC3 cluster) —
  // handled by the room flow, not this action.
  if (interest.status !== 'SUBMITTED' && interest.status !== 'SHORTLISTED') {
    return { ok: false, error: 'This interest can no longer be withdrawn from here' }
  }
  assertInterestTransition(interest.status, 'WITHDRAWN')
  await prisma.briefInterest.update({
    where: { id: interest.id },
    data: { status: 'WITHDRAWN' },
  })
  await logAuditAs(user, {
    entityType: 'BriefInterest',
    entityId: interest.id,
    action: 'INTEREST_WITHDRAWN',
    fromValue: interest.status,
    toValue: 'WITHDRAWN',
    payload: { briefId: interest.briefId },
  })

  revalidatePath('/opportunities')
  return { ok: true }
}
