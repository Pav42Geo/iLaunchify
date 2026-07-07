'use server'

// Marketplace favorites (docs/FAVORITES_MANAGEMENT.md §11, P0.1) — the toggle a
// creator fires from a marketplace card / product detail page. Lives in the
// MARKETING app because the marketplace does; it resolves the shared Auth.js
// session via getMarketingSession (the cookie is shared with apps/creator).
//
// Private by construction — a favorite is owned by the creator's CreatorProfile.
// Guests get a login-with-intent signal (the card redirects) rather than a dead
// tap. Every toggle writes an AuditLog row.

import { prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { getMarketingSession } from '@/lib/session'
import { creatorUrl } from '@/lib/app-urls'

export type MarketplaceToggleResult =
  | { ok: true; saved: boolean }
  | { ok: false; reason: 'GUEST'; loginUrl: string }
  | { ok: false; reason: 'ERROR'; message: string }

/**
 * Toggle a marketplace ProductTemplate favorite for the current creator.
 * Guests get { reason: 'GUEST', loginUrl } so the card can redirect to sign-in
 * with the save intent preserved in the query string.
 */
export async function toggleFavoriteFromMarketplace(input: {
  templateId: string
}): Promise<MarketplaceToggleResult> {
  const { templateId } = input
  if (!templateId) return { ok: false, reason: 'ERROR', message: 'Missing product.' }

  const session = await getMarketingSession()
  if (!session?.user || session.user.role !== 'CREATOR') {
    // Preserve the save intent — the login handler can replay it post-auth.
    return {
      ok: false,
      reason: 'GUEST',
      loginUrl: creatorUrl(`/login?favorite=PRODUCT_TEMPLATE:${encodeURIComponent(templateId)}`),
    }
  }

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) return { ok: false, reason: 'ERROR', message: 'Your creator profile is missing.' }

  const existing = await prisma.favorite.findUnique({
    where: { creatorId_productTemplateId: { creatorId: profile.id, productTemplateId: templateId } },
    select: { id: true },
  })

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } })
    await logAuditAs(
      { id: session.user.id, role: 'CREATOR' },
      {
        entityType: 'Favorite',
        entityId: existing.id,
        action: 'FAVORITE_REMOVED',
        payload: { kind: 'PRODUCT_TEMPLATE', targetId: templateId, via: 'marketplace' },
      },
    )
    return { ok: true, saved: false }
  }

  const created = await prisma.favorite.create({
    data: { creatorId: profile.id, kind: 'PRODUCT_TEMPLATE', productTemplateId: templateId },
    select: { id: true },
  })
  await logAuditAs(
    { id: session.user.id, role: 'CREATOR' },
    {
      entityType: 'Favorite',
      entityId: created.id,
      action: 'FAVORITE_ADDED',
      payload: { kind: 'PRODUCT_TEMPLATE', targetId: templateId, via: 'marketplace' },
    },
  )
  return { ok: true, saved: true }
}

/**
 * Which of the given template ids the current creator has already favorited.
 * Empty set for guests. Callers pass the ids visible on the page so we index
 * only what's rendered.
 */
export async function getFavoritedTemplateIds(templateIds: string[]): Promise<string[]> {
  if (templateIds.length === 0) return []
  const session = await getMarketingSession()
  if (!session?.user || session.user.role !== 'CREATOR') return []
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) return []
  const rows = await prisma.favorite.findMany({
    where: {
      creatorId: profile.id,
      kind: 'PRODUCT_TEMPLATE',
      productTemplateId: { in: templateIds },
    },
    select: { productTemplateId: true },
  })
  return rows.map((r) => r.productTemplateId as string)
}
