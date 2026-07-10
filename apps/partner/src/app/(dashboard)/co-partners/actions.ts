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
import { dispatchNotification } from '@ilaunchify/notifications'
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

/**
 * Invite a NOT-yet-on-platform company as a co-partner for one or more legs.
 * Creates the User + Partner (INVITED) + a DRAFT PartnerService and a scoped
 * PENDING_ONBOARDING nomination per invited leg (atomic), then fires the
 * PARTNER_INVITED email. The invitee onboards through the STANDARD flow (full
 * partner); each leg's nomination auto-pins only once that leg is activation-
 * complete — so a wrong/missing service simply never pins (mismatch is surfaced
 * elsewhere), never corrupts. Gated + audited.
 */
export async function inviteCoPartner(input: {
  companyName: string
  contactName: string
  email: string
  serviceTypes: NominatableLeg[]
  /** Version of the D7 nomination-responsibility terms the manufacturer accepted. */
  acceptedTermsVersion: string
}): Promise<NominateResult> {
  if (!(await isNominationEnabled())) return DARK // gate
  const user = await requireUser()
  const nominatorPartnerId = await actingPartnerId(user.id)
  if (!nominatorPartnerId) return { ok: false, error: 'No manufacturer account found.' }
  if (!input.acceptedTermsVersion) return { ok: false, error: 'You must accept the nomination terms.' }

  const legs = [...new Set(input.serviceTypes)]
  if (legs.length === 0) return { ok: false, error: 'Pick at least one service to invite for.' }
  const email = input.email.trim().toLowerCase()
  if (!email) return { ok: false, error: 'An email is required.' }
  const companyName = input.companyName.trim()
  if (companyName.length < 2) return { ok: false, error: 'A company name is required.' }

  // Already on the platform → this is the nominate-existing path, not invite.
  const existing = await prisma.user.findUnique({ where: { email }, include: { partner: true } })
  if (existing?.partner) {
    return {
      ok: false,
      error: 'That company is already on iLaunchify — nominate them directly instead of inviting.',
    }
  }

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent') ?? null
  const now = new Date()

  // User + Partner(INVITED) + one DRAFT service + one scoped nomination per leg — atomic.
  const created = await prisma.user.create({
    data: {
      email,
      name: input.contactName,
      role: 'PARTNER',
      partner: {
        create: {
          companyName,
          legalName: companyName,
          status: 'INVITED',
          // Invited co-partners start PRIVATE: they serve the inviter via the
          // nomination, and are not thrown into rotation/marketplace. They can
          // switch to PUBLIC later when ready for open-market volume.
          participationMode: 'INVITED_ONLY',
          leadSource: 'manufacturer-nomination',
          leadNotes: JSON.stringify({
            invitedByPartnerId: nominatorPartnerId,
            invitedForLegs: legs,
            contactName: input.contactName,
            invitedAt: now.toISOString(),
          }),
          country: 'US',
          services: {
            create: legs.map((l) => ({
              type: l,
              status: 'DRAFT',
              disclosureLevel: 'ANONYMOUS',
              capabilities: { type: l },
            })),
          },
          // Back-relation: nominations where this new partner is the nominated party.
          nominations: {
            create: legs.map((l) => ({
              nominatorPartnerId,
              nominatorUserId: user.id,
              serviceType: l,
              visibility: 'PRIVATE_TO_INVITER' as const,
              status: 'PENDING_ONBOARDING' as const,
              consentTermsVersion: input.acceptedTermsVersion,
              consentAt: now,
              consentIp: ip,
              consentUserAgent: userAgent,
            })),
          },
        },
      },
    },
    include: {
      partner: { include: { nominations: { select: { id: true, serviceType: true } } } },
    },
  })

  const invitedPartner = created.partner
  if (!invitedPartner) return { ok: false, error: 'Could not create the invited partner.' }

  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: invitedPartner.id,
    action: 'PARTNER_LEAD_CREATE',
    payload: { email, companyName, invitedByPartnerId: nominatorPartnerId, legs },
  })
  for (const nom of invitedPartner.nominations) {
    await logAuditAs(user, {
      entityType: 'PartnerNomination',
      entityId: nom.id,
      action: 'COPARTNER_INVITED',
      toValue: invitedPartner.id,
      payload: { nominatorPartnerId, invitedPartnerId: invitedPartner.id, serviceType: nom.serviceType },
    })
  }

  // Invitation email (PARTNER_INVITED) — best-effort; dispatcher never throws.
  const onboardingUrl = `https://partners.ilaunchify.com/login?email=${encodeURIComponent(email)}`
  try {
    await dispatchNotification({
      userId: created.id,
      event: 'PARTNER_INVITED',
      audience: 'partner',
      data: { companyName, onboardingUrl },
    })
  } catch {
    /* best-effort */
  }

  revalidatePath('/co-partners')
  return { ok: true, nominationId: invitedPartner.id }
}

/**
 * Unified "add a co-partner" by email: if the email already belongs to a partner
 * on the platform, nominate them for each leg (existing path); otherwise invite
 * them (invite-new path). One entry point for the surface. Gated + audited via the
 * two underlying actions.
 */
export async function addCoPartnerByEmail(input: {
  email: string
  companyName: string
  contactName: string
  serviceTypes: NominatableLeg[]
  acceptedTermsVersion: string
}): Promise<NominateResult> {
  if (!(await isNominationEnabled())) return DARK // gate
  const legs = [...new Set(input.serviceTypes)]
  if (legs.length === 0) return { ok: false, error: 'Pick at least one service.' }
  const email = input.email.trim().toLowerCase()
  if (!email) return { ok: false, error: 'An email is required.' }

  const existing = await prisma.user.findUnique({ where: { email }, include: { partner: true } })
  if (existing?.partner) {
    // Already on the platform → nominate the existing partner for each leg.
    let last: NominateResult = { ok: false, error: 'Nothing to do.' }
    for (const leg of legs) {
      last = await nominateExistingPartner({
        nominatedPartnerId: existing.partner.id,
        serviceType: leg,
        acceptedTermsVersion: input.acceptedTermsVersion,
      })
      if (!last.ok) return last
    }
    return last
  }

  // Not on the platform → invite them.
  return inviteCoPartner({
    email,
    companyName: input.companyName,
    contactName: input.contactName,
    serviceTypes: legs,
    acceptedTermsVersion: input.acceptedTermsVersion,
  })
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
