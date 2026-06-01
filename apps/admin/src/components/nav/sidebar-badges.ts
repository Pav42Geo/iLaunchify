// Admin sidebar v3 — live badge counts.
//
// Server-only helper that loads the small pink-pill counts surfaced next to
// Inbox rows. Each query is a cheap COUNT(*) — runs once per admin nav render
// (admin layout is force-dynamic anyway, so caching is N/A).
//
// Order of fields here matches the order shown in the sidebar — keep aligned
// for readability.

import 'server-only'
import { prisma } from '@ilaunchify/db'
import type { SidebarBadges } from './sidebar-config'

export async function loadSidebarBadges(): Promise<SidebarBadges> {
  const [
    leadsPending,
    partnersPending,
    productsPending,
    ingredientsPending,
    certsPending,
  ] = await Promise.all([
    // Leads = Partners in DRAFT or INVITED (Phase-A legacy statuses still in
    // use by leads page). Mirrors the existing /admin/leads query so the
    // count matches what the user sees on the linked page.
    prisma.partner.count({
      where: { status: { in: ['DRAFT', 'INVITED'] } },
    }),
    // Partners pending verification = mid-funnel statuses.
    prisma.partner.count({
      where: {
        status: {
          in: ['IDENTITY_PENDING_REVIEW', 'OPS_PENDING_REVIEW', 'UNDER_REVIEW'],
        },
      },
    }),
    // Product approvals = new submissions awaiting review (matches the
    // /products?tab=new filter).
    prisma.productTemplate.count({
      where: { status: { in: ['PENDING_REVIEW', 'UNDER_REVIEW'] } },
    }),
    // Ingredient queue = SELF_ATTESTED partner-private rows (matches /admin/ingredients).
    prisma.ingredient.count({
      where: {
        source: 'PARTNER_PRIVATE',
        verificationStatus: 'SELF_ATTESTED',
      },
    }),
    // Cert reviews = PartnerCertificateInstance rows waiting for admin review.
    prisma.partnerCertificateInstance.count({
      where: { status: 'PENDING_REVIEW' },
    }).catch(() => 0),
  ])

  return {
    'leads.pending': leadsPending,
    'partners.pending': partnersPending,
    'products.pending': productsPending,
    'ingredients.pending': ingredientsPending,
    'certs.pending': certsPending,
    'inbox.total':
      leadsPending +
      partnersPending +
      productsPending +
      ingredientsPending +
      certsPending,
  }
}
