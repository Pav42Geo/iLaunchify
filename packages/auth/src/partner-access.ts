// P3 multi-seat partner access resolution — docs/PRINT_PRODUCTION_WORKFLOW.md
// §2.2 + docs/PARTNER_ROLE_ACCOUNTS.md §5 (D1 LOCKED).
//
// THE one place that answers "which Partner can this user act for, and how".
// Resolution order:
//   1. Founder of record (Partner.userId — kept @unique) → full access,
//      backfilled lazily into a PartnerMembership(isAdmin) row so the team
//      surface and notification routing see founders like everyone else.
//   2. Active PartnerMembership (removedAt null) → org access; isAdmin gates
//      commercial surfaces (billing, payouts, team, contract).
//   3. Service scoping via PartnerServiceMembership: non-admin members see
//      only their services' operational queues.
//
// Tenant isolation is threat #1 (SECURITY_ARCHITECTURE) — new partner-app
// guards should call this instead of hand-rolling `partner: { userId }`.
// Existing founder-only guards stay CORRECT (founders pass both paths); they
// become INCOMPLETE for teammates and migrate to this helper surface by
// surface.

import { prisma } from '@ilaunchify/db'

export interface PartnerAccess {
  partnerId: string
  /** Founder of record (Partner.userId). */
  isFounder: boolean
  /** Org-wide admin (founder always true). */
  isAdmin: boolean
  membershipId: string
  /** Service ids this user may work: admins/founders = all; members = scoped. */
  serviceIds: string[]
  /** Service-scoped roles keyed by partnerServiceId (empty for admins unless also scoped). */
  serviceRoles: Record<string, string[]>
}

/**
 * Resolve partner access for a user. Returns null when the user has no
 * partner affiliation at all. Never throws on missing membership — the
 * founder path lazily creates its membership row (idempotent upsert).
 */
// lastActiveAt stamping — throttled to one write per window so the dashboard
// layout's per-request call doesn't hammer the row (§2.2 shared metadata).
const LAST_ACTIVE_THROTTLE_MS = 15 * 60 * 1000

function stampLastActive(membershipId: string, lastActiveAt: Date | null) {
  if (lastActiveAt && Date.now() - lastActiveAt.getTime() < LAST_ACTIVE_THROTTLE_MS) return
  void prisma.partnerMembership
    .update({ where: { id: membershipId }, data: { lastActiveAt: new Date() } })
    .catch(() => {}) // fire-and-forget; presence data is best-effort
}

export async function getPartnerAccess(userId: string): Promise<PartnerAccess | null> {
  // Path 1 — founder of record.
  const founded = await prisma.partner.findUnique({
    where: { userId },
    select: { id: true, services: { select: { id: true } } },
  })
  if (founded) {
    // Lazy backfill so team lists + role routing include the founder.
    const membership = await prisma.partnerMembership.upsert({
      where: { partnerId_userId: { partnerId: founded.id, userId } },
      create: { partnerId: founded.id, userId, isAdmin: true },
      update: { isAdmin: true, removedAt: null }, // founder can't be soft-removed
      select: { id: true, lastActiveAt: true },
    })
    stampLastActive(membership.id, membership.lastActiveAt)
    return {
      partnerId: founded.id,
      isFounder: true,
      isAdmin: true,
      membershipId: membership.id,
      serviceIds: founded.services.map((s) => s.id),
      serviceRoles: {},
    }
  }

  // Path 2 — invited teammate. V1: one partner org per user (first active
  // membership wins; multi-org users are out of scope until pulled in).
  const membership = await prisma.partnerMembership.findFirst({
    where: { userId, removedAt: null },
    orderBy: { acceptedAt: 'asc' },
    select: {
      id: true,
      partnerId: true,
      isAdmin: true,
      lastActiveAt: true,
      partner: { select: { services: { select: { id: true } } } },
      serviceMemberships: {
        where: { removedAt: null },
        select: { partnerServiceId: true, roles: true },
      },
    },
  })
  if (!membership) return null
  stampLastActive(membership.id, membership.lastActiveAt)

  const serviceRoles: Record<string, string[]> = {}
  for (const sm of membership.serviceMemberships) {
    serviceRoles[sm.partnerServiceId] = sm.roles as string[]
  }
  const allServiceIds = membership.partner.services.map((s) => s.id)
  return {
    partnerId: membership.partnerId,
    isFounder: false,
    isAdmin: membership.isAdmin,
    membershipId: membership.id,
    serviceIds: membership.isAdmin ? allServiceIds : Object.keys(serviceRoles),
    serviceRoles,
  }
}

/** Convenience: access + throw-style guard for org-admin-only surfaces. */
export async function requirePartnerAdminAccess(userId: string): Promise<PartnerAccess | null> {
  const access = await getPartnerAccess(userId)
  return access?.isAdmin ? access : null
}
