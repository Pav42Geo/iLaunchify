'use server'

// Partner nomination (D7) — BUILT DARK. docs/legal/NOMINATION_LIABILITY_D7_FRAMEWORK.md.
// A creator directs a specific partner for their production, overriding automated
// rotation. EVERY action here first checks isNominationEnabled() (fails closed to
// false), so the feature cannot affect anything until counsel blesses the §6
// liability allocation AND an admin flips NominationSetting.enabled. Creating a
// nomination captures the evidentiary consent (nominator accepts responsibility
// for its directed choice) + audits.

import { prisma, isNominationEnabled } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

type ServiceTypeValue = 'MANUFACTURING' | 'COPACKING' | 'LABEL_PRINTING' | 'WAREHOUSE'
type VisibilityValue = 'PUBLIC' | 'PRIVATE_TO_INVITER'

export type NominateResult = { ok: true; nominationId: string } | { ok: false; error: string }

const DARK: NominateResult = { ok: false, error: 'Partner nomination is not available yet.' }

export async function nominatePartner(input: {
  nominatedPartnerId: string
  serviceType?: ServiceTypeValue | null
  visibility?: VisibilityValue
  /** Version of the D7 nomination-responsibility terms the nominator accepted. */
  acceptedTermsVersion: string
}): Promise<NominateResult> {
  if (!(await isNominationEnabled())) return DARK // gate
  const user = await requireUser()
  if (!input.acceptedTermsVersion) return { ok: false, error: 'You must accept the nomination terms.' }

  const partner = await prisma.partner.findUnique({
    where: { id: input.nominatedPartnerId },
    select: { id: true, status: true },
  })
  if (!partner) return { ok: false, error: 'Partner not found.' }

  // An already-ACTIVE partner is pinned pending activation-complete for the leg;
  // otherwise the nomination waits on their onboarding (invite flow — next slice).
  const status = partner.status === 'ACTIVE' ? 'PENDING_ACTIVATION' : 'PENDING_ONBOARDING'

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent') ?? null

  const nomination = await prisma.partnerNomination.create({
    data: {
      nominatorUserId: user.id,
      nominatedPartnerId: partner.id,
      serviceType: input.serviceType ?? null,
      visibility: input.visibility ?? 'PRIVATE_TO_INVITER',
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
      nominatedPartnerId: partner.id,
      serviceType: input.serviceType ?? null,
      visibility: input.visibility ?? 'PRIVATE_TO_INVITER',
      consentTermsVersion: input.acceptedTermsVersion,
    },
  })

  revalidatePath('/partners')
  return { ok: true, nominationId: nomination.id }
}

/** The nominator unpins a partner they nominated. Gated + audited. */
export async function revokeNomination(nominationId: string): Promise<NominateResult> {
  if (!(await isNominationEnabled())) return DARK // gate
  const user = await requireUser()

  const nom = await prisma.partnerNomination.findUnique({
    where: { id: nominationId },
    select: { id: true, nominatorUserId: true, status: true },
  })
  if (!nom || nom.nominatorUserId !== user.id) return { ok: false, error: 'Nomination not found.' }

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

  revalidatePath('/partners')
  return { ok: true, nominationId }
}

/** The nominator's active nominations (for a future UI). Read-only. */
export async function listMyNominations() {
  const user = await requireUser()
  return prisma.partnerNomination.findMany({
    where: { nominatorUserId: user.id, status: { not: 'REVOKED' } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      nominatedPartnerId: true,
      serviceType: true,
      visibility: true,
      status: true,
      createdAt: true,
      nominatedPartner: { select: { companyName: true } },
    },
  })
}
