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
  nominatorUserId: string,
  serviceType: NominationServiceType,
): Promise<string | null> {
  if (!(await isNominationEnabled())) return null // gate — fails closed

  const nomination = await prisma.partnerNomination
    .findFirst({
      where: { nominatorUserId, serviceType, status: 'ACTIVE' },
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

export interface NominationConsoleRow {
  id: string
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
    },
  })

  const userIds = [...new Set(noms.map((n) => n.nominatorUserId))]
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
    : []
  const emailById = new Map(users.map((u) => [u.id, u.email]))

  return noms.map((n) => ({
    id: n.id,
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
