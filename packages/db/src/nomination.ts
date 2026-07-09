// Nomination feature gate reader (D7) — the kill switch.
// docs/legal/NOMINATION_LIABILITY_D7_FRAMEWORK.md. The whole nomination feature
// is built DARK: every nomination action/UI checks this first and no-ops when
// false. Fails CLOSED to false, so the feature cannot affect live routing until
// (a) counsel blesses the §6 liability allocation AND (b) an admin flips
// NominationSetting.enabled. Mirrors the rotation-engine enabled=false pattern.

import { prisma } from './index'

/** Is the nomination feature enabled platform-wide? Fails closed to false. */
export async function isNominationEnabled(): Promise<boolean> {
  try {
    const row = await prisma.nominationSetting
      .findUnique({ where: { id: 'singleton' }, select: { enabled: true } })
      .catch(() => null)
    return row?.enabled ?? false
  } catch {
    return false
  }
}

type NominationServiceType = 'MANUFACTURING' | 'COPACKING' | 'LABEL_PRINTING' | 'WAREHOUSE'

/**
 * Routing consumption (D7): resolve a nominator's ACTIVE nomination for a leg to
 * the nominated partner's PartnerService id — the same shape findRouting's PS-3
 * pinned-pick path already consumes (`pinnedPrintServiceId`). A caller feeds this
 * as the pin so the nominated partner bypasses auto-rotation, subject to the same
 * exclusion validation (a pin at an excluded/unhealthy service still surfaces as
 * unavailable — a nomination never rescues a failed hard filter).
 *
 * Fails CLOSED to null: returns null whenever nomination is disabled, so wiring
 * this into checkout/routing is a pure no-op until an admin flips the switch.
 */
export async function getActiveNominatedServiceId(
  nominatorPartnerId: string,
  serviceType: NominationServiceType,
): Promise<string | null> {
  if (!(await isNominationEnabled())) return null // gate — fails closed

  const nomination = await prisma.partnerNomination
    .findFirst({
      where: { nominatorPartnerId, serviceType, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { nominatedPartnerId: true },
    })
    .catch(() => null)
  if (!nomination) return null

  const service = await prisma.partnerService
    .findFirst({
      where: { partnerId: nomination.nominatedPartnerId, type: serviceType },
      select: { id: true },
    })
    .catch(() => null)
  return service?.id ?? null
}

export interface InvitationContext {
  /** The nominating manufacturer's company name (if resolvable). */
  inviterName: string | null
  /** ServiceType legs the partner was invited for. */
  legs: string[]
}

/**
 * If this partner was invited as a co-partner and hasn't gone live yet, the
 * invitation context for their onboarding banner (who invited them, for which
 * legs). Null when there's no pending invitation. Read-only, ungated (an invited
 * partner should always see why they're here).
 */
export async function getInvitationContext(
  nominatedPartnerId: string,
): Promise<InvitationContext | null> {
  const noms = await prisma.partnerNomination
    .findMany({
      where: {
        nominatedPartnerId,
        status: { in: ['PENDING_ONBOARDING', 'PENDING_ACTIVATION'] },
      },
      select: {
        serviceType: true,
        nominatorPartner: { select: { companyName: true } },
      },
    })
    .catch(() => [] as { serviceType: string | null; nominatorPartner: { companyName: string } | null }[])
  if (noms.length === 0) return null

  const legs = [...new Set(noms.map((n) => n.serviceType).filter((x): x is string => !!x))]
  const inviterName =
    noms.find((n) => n.nominatorPartner?.companyName)?.nominatorPartner?.companyName ?? null
  return { inviterName, legs }
}

export interface NominationMismatch {
  nominationId: string
  serviceType: string
  inviterUserId: string | null
  inviterName: string | null
}

/**
 * Nominations whose invited leg the partner is NOT set up for (no PartnerService
 * of that type) — the "invited for X but didn't set it up" case. Used to notify
 * the inviter + warn the invitee; the nomination stays pending (never auto-pins),
 * so a mismatch is surfaced, never silent bad data. Read-only.
 */
export async function getNominationMismatches(
  nominatedPartnerId: string,
): Promise<NominationMismatch[]> {
  const [noms, services] = await Promise.all([
    prisma.partnerNomination.findMany({
      where: {
        nominatedPartnerId,
        status: { in: ['PENDING_ONBOARDING', 'PENDING_ACTIVATION'] },
        serviceType: { not: null },
      },
      select: {
        id: true,
        serviceType: true,
        nominatorPartner: { select: { userId: true, companyName: true } },
      },
    }),
    prisma.partnerService.findMany({
      where: { partnerId: nominatedPartnerId },
      select: { type: true },
    }),
  ])
  const have = new Set(services.map((s) => s.type))
  return noms
    .filter((n) => n.serviceType !== null && !have.has(n.serviceType))
    .map((n) => ({
      nominationId: n.id,
      serviceType: n.serviceType as string,
      inviterUserId: n.nominatorPartner?.userId ?? null,
      inviterName: n.nominatorPartner?.companyName ?? null,
    }))
}

export interface NominationConsoleRow {
  id: string
  nominatorPartnerId: string | null
  nominatorPartnerName: string | null
  nominatorUserId: string
  nominatorEmail: string | null
  nominatedPartnerId: string
  nominatedPartnerName: string | null
  serviceType: string | null
  visibility: string
  status: string
  rejectedReason: string | null
  consentTermsVersion: string | null
  consentAt: Date | null
  createdAt: Date
}

/**
 * Every nomination, newest first, joined to the nominated partner's name + the
 * nominator's email. For the admin console (governance + D7 consent audit). Not
 * gated — governance must see nominations regardless of the enable flag.
 */
export async function listAllNominations(limit = 100): Promise<NominationConsoleRow[]> {
  const noms = await prisma.partnerNomination.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      nominatorPartnerId: true,
      nominatorUserId: true,
      nominatedPartnerId: true,
      serviceType: true,
      visibility: true,
      status: true,
      rejectedReason: true,
      consentTermsVersion: true,
      consentAt: true,
      createdAt: true,
      nominatedPartner: { select: { companyName: true } },
      nominatorPartner: { select: { companyName: true } },
    },
  })

  const userIds = [...new Set(noms.map((n) => n.nominatorUserId))]
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
    : []
  const emailById = new Map(users.map((u) => [u.id, u.email]))

  return noms.map((n) => ({
    id: n.id,
    nominatorPartnerId: n.nominatorPartnerId ?? null,
    nominatorPartnerName: n.nominatorPartner?.companyName ?? null,
    nominatorUserId: n.nominatorUserId,
    nominatorEmail: emailById.get(n.nominatorUserId) ?? null,
    nominatedPartnerId: n.nominatedPartnerId,
    nominatedPartnerName: n.nominatedPartner?.companyName ?? null,
    serviceType: n.serviceType ?? null,
    visibility: n.visibility,
    status: n.status,
    rejectedReason: n.rejectedReason ?? null,
    consentTermsVersion: n.consentTermsVersion ?? null,
    consentAt: n.consentAt ?? null,
    createdAt: n.createdAt,
  }))
}
