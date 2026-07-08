'use server'

// Manufacturer co-partner nomination (D7) — BUILT DARK.
// docs/legal/NOMINATION_LIABILITY_D7_FRAMEWORK.md. A MANUFACTURER directs a
// specific downstream print/pack partner as its co-partner for a leg it does not
// service itself, overriding automated rotation. The nominator is the
// manufacturer ORG (Partner); nominatorUserId records who acted (the consent
// record). Every action gates on isNominationEnabled() (fails closed) so the
// feature is a no-op until counsel clears D7 + an admin flips the switch.
//
// This replaces the earlier, wrongly-scoped creator-side action.

import { prisma, isNominationEnabled } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

// A manufacturer nominates only for legs it doesn't service itself.
type NominatableLeg = 'COPACKING' | 'LABEL_PRINTING'

export type NominateResult = { ok: true; nominationId: string } | { ok: false; error: string }

const DARK: NominateResult = { ok: false, error: 'Partner nomination is not available yet.' }

/** Resolve the acting user's manufacturer org. */
async function actingPartnerId(userId: string): Promise<string | null> {
  const p = await prisma.partner.findUnique({ where: { userId }, select: { id: true } })
  return p?.id ?? null
}

export async function nominateExistingPartner(input: {
  nominatedPartnerId: string
  serviceType: NominatableLeg
  /** Version of the D7 nomination-responsibility terms the manufacturer accepted. */
  acceptedTermsVersion: string
}): Promise<NominateResult> {
  if (!(await isNominationEnabled())) return DARK // gate
  const user = await requireUser()
  const nominatorPartnerId = await actingPartnerId(user.id)
  if (!nominatorPartnerId) return { ok: false, error: 'No manufacturer account found.' }
  if (nominatorPartnerId === input.nominatedPartnerId)
    return { ok: false, error: 'You cannot nominate your own company.' }
  if (!input.acceptedTermsVersion) return { ok: false, error: 'You must accept the nomination terms.' }

  const partner = await prisma.partner.findUnique({
    where: { id: input.nominatedPartnerId },
    select: { id: true, status: true },
  })
  if (!partner) return { ok: false, error: 'Partner not found.' }

  const status = partner.status === 'ACTIVE' ? 'PENDING_ACTIVATION' : 'PENDING_ONBOARDING'

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent') ?? null

  const nomination = await prisma.partnerNomination.create({
    data: {
      nominatorPartnerId,
      nominatorUserId: user.id,
      nominatedPartnerId: partner.id,
      serviceType: input.serviceType,
      visibility: 'PRIVATE_TO_INVITER',
      status,
      consentTermsVersion: input.acceptedTermsVersion,
      consentAt: new Date(),
      consentIp: ip,
      consentUserAgent: userAgent,
    },
    select: { id: true },
  })

  await logAuditAs(user, {
    entityType: 'PartnerNomination',
    entityId: nomination.id,
    action: 'PARTNER_NOMINATED',
    toValue: partner.id,
    payload: {
      nominatorPartnerId,
      nominatedPartnerId: partner.id,
      serviceType: input.serviceType,
      consentTermsVersion: input.acceptedTermsVersion,
    },
  })

  revalidatePath('/co-partners')
  return { ok: true, nominationId: nomination.id }
}

/** The manufacturer unpins a co-partner it nominated. Gated + ownership-checked + audited. */
export async function revokeNomination(nominationId: string): Promise<NominateResult> {
  if (!(await isNominationEnabled())) return DARK // gate
  const user = await requireUser()
  const nominatorPartnerId = await actingPartnerId(user.id)
  if (!nominatorPartnerId) return { ok: false, error: 'No manufacturer account found.' }

  const nom = await prisma.partnerNomination.findUnique({
    where: { id: nominationId },
    select: { id: true, nominatorPartnerId: true, status: true },
  })
  if (!nom || nom.nominatorPartnerId !== nominatorPartnerId)
    return { ok: false, error: 'Nomination not found.' }

  await prisma.partnerNomination.update({
    where: { id: nominationId },
    data: { status: 'REVOKED' },
  })
  await logAuditAs(user, {
    entityType: 'PartnerNomination',
    entityId: nominationId,
    action: 'NOMINATION_REVOKED',
    fromValue: nom.status,
    toValue: 'REVOKED',
  })

  revalidatePath('/co-partners')
  return { ok: true, nominationId }
}

/** This manufacturer's own nominations (for the co-partners surface). Read-only. */
export async function listMyNominations() {
  const user = await requireUser()
  const nominatorPartnerId = await actingPartnerId(user.id)
  if (!nominatorPartnerId) return []
  return prisma.partnerNomination.findMany({
    where: { nominatorPartnerId, status: { not: 'REVOKED' } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      nominatedPartnerId: true,
      serviceType: true,
      status: true,
      createdAt: true,
      nominatedPartner: { select: { companyName: true } },
    },
  })
}
