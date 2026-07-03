// P3 guard-migration seam — docs/PARTNER_ROLE_ACCOUNTS.md §5 + build log
// slice 12. Membership-aware ownership fragments that replace the founder-only
// `partner: { userId }` pattern across the partner app.
//
// Semantics (PRINT_PRODUCTION_WORKFLOW §2.2):
//   * Org admins (isAdmin membership — founders are lazily backfilled as one
//     by getPartnerAccess in the dashboard layout) → every service.
//   * Non-admin members → only services where they hold an active
//     PartnerServiceMembership.
//
// Tenant isolation is threat #1: these fragments are DENY-by-default — no
// membership row, no rows returned. The layout calls getPartnerAccess on
// every request, which guarantees founders have their membership row before
// any of these filters run.

import { prisma } from '@ilaunchify/db'
import { getPartnerAccess, type PartnerAccess } from '@ilaunchify/auth'
import { redirect } from 'next/navigation'

/**
 * WHERE fragment for queries rooted at (or nested into) PartnerService:
 * the acting user may work this service. Use as
 *   `partnerService: serviceOwnedBy(user.id)`            (nested)
 *   `where: { type: 'WAREHOUSE', AND: [serviceOwnedBy(user.id)] }` (rooted)
 */
export function serviceOwnedBy(userId: string) {
  return {
    OR: [
      // Org admin (incl. backfilled founder) — all services of the org.
      { partner: { memberships: { some: { userId, removedAt: null, isAdmin: true } } } },
      // Service-scoped member — exactly the granted services.
      {
        serviceMemberships: {
          some: { removedAt: null, partnerMembership: { userId, removedAt: null } },
        },
      },
    ],
  }
}

/** Page-level context: access or bounce to /dashboard (nothing to see). */
export async function requirePartnerPageAccess(userId: string): Promise<PartnerAccess> {
  const access = await getPartnerAccess(userId)
  if (!access) redirect('/dashboard')
  return access
}

/** Org partner row for the acting user (founder or teammate), or null. */
export async function getActingPartner(userId: string) {
  const access = await getPartnerAccess(userId)
  if (!access) return null
  const partner = await prisma.partner.findUnique({
    where: { id: access.partnerId },
    select: { id: true, status: true, companyName: true, onboardingProgress: true },
  })
  return partner ? { partner, access } : null
}
