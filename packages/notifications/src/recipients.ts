// P3 role-routed recipients — docs/PARTNER_ROLE_ACCOUNTS.md §6.3.
//
// Resolution (PRINT_PRODUCTION_WORKFLOW §2.2 scopes):
//   OPERATIONAL events (dispatches, receiving, releases, proofs) →
//     org admins + members holding an active service membership on THAT
//     service. Founders count as admins (lazily-backfilled membership rows).
//   COMMERCIAL events (payouts, docs/compliance, contract) →
//     org admins only.
//
// Fallback safety: when a partner has NO membership rows yet (legacy row
// whose founder never loaded the dashboard since P3), fall back to the
// founder pointer (Partner.userId) so notifications never silently drop.

import { prisma } from '@ilaunchify/db'
import { dispatchNotification, type DispatchInput } from './dispatcher'

/** Users who should hear OPERATIONAL events for a specific service. */
export async function partnerServiceRecipients(partnerServiceId: string): Promise<string[]> {
  const service = await prisma.partnerService.findUnique({
    where: { id: partnerServiceId },
    select: {
      partnerId: true,
      partner: {
        select: {
          userId: true,
          memberships: {
            where: { removedAt: null, isAdmin: true },
            select: { userId: true },
          },
        },
      },
      serviceMemberships: {
        where: { removedAt: null, partnerMembership: { removedAt: null } },
        select: { partnerMembership: { select: { userId: true } } },
      },
    },
  })
  if (!service) return []

  const ids = new Set<string>()
  for (const m of service.partner.memberships) ids.add(m.userId)
  for (const sm of service.serviceMemberships) ids.add(sm.partnerMembership.userId)
  if (ids.size === 0) ids.add(service.partner.userId) // pre-P3 fallback
  return [...ids]
}

/** Users who should hear COMMERCIAL events for a partner org. */
export async function partnerOrgAdminRecipients(partnerId: string): Promise<string[]> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: {
      userId: true,
      memberships: {
        where: { removedAt: null, isAdmin: true },
        select: { userId: true },
      },
    },
  })
  if (!partner) return []
  const ids = new Set(partner.memberships.map((m) => m.userId))
  if (ids.size === 0) ids.add(partner.userId)
  return [...ids]
}

/** Fan one event to every operational recipient of a service (best-effort). */
export async function dispatchToPartnerService(
  partnerServiceId: string,
  input: Omit<DispatchInput, 'userId'>,
): Promise<number> {
  const recipients = await partnerServiceRecipients(partnerServiceId)
  await Promise.allSettled(recipients.map((userId) => dispatchNotification({ ...input, userId })))
  return recipients.length
}

/** Fan one event to every org admin of a partner (best-effort). */
export async function dispatchToPartnerAdmins(
  partnerId: string,
  input: Omit<DispatchInput, 'userId'>,
): Promise<number> {
  const recipients = await partnerOrgAdminRecipients(partnerId)
  await Promise.allSettled(recipients.map((userId) => dispatchNotification({ ...input, userId })))
  return recipients.length
}
