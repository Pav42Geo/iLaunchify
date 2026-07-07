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
import type { ProductCardProps } from '@ilaunchify/ui'
import { getMarketingSession } from '@/lib/session'
import { creatorUrl } from '@/lib/app-urls'

function iconForNiche(name: string, main?: string | null): string {
  const s = `${name} ${main ?? ''}`.toLowerCase()
  if (/coffee|espresso|brew/.test(s)) return '☕'
  if (/\btea\b|matcha/.test(s)) return '🍵'
  if (/water|hydration|beverage|drink|tonic|sparkl/.test(s)) return '🥤'
  if (/supplement|vitamin|capsule|pill|gummies|magnesium|collagen/.test(s)) return '💊'
  if (/protein|bar|snack|cookie|granola|pretzel|choc/.test(s)) return '🍪'
  if (/pet|dog|cat/.test(s)) return '🐾'
  if (/powder|greens|mix/.test(s)) return '🥣'
  return '📦'
}

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
  try {
    const rows = await prisma.favorite.findMany({
      where: {
        creatorId: profile.id,
        kind: 'PRODUCT_TEMPLATE',
        productTemplateId: { in: templateIds },
      },
      select: { productTemplateId: true },
    })
    return rows.map((r) => r.productTemplateId as string)
  } catch {
    // Stale Prisma client before the Favorite model lands — degrade to none.
    return []
  }
}

/**
 * Every template id the current creator has favorited — seeds the marketplace
 * FavoritesProvider so grid-card hearts render their saved state on first paint.
 * Empty for guests.
 */
export async function getAllFavoritedTemplateIds(): Promise<string[]> {
  const session = await getMarketingSession()
  if (!session?.user || session.user.role !== 'CREATOR') return []
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) return []
  try {
    const rows = await prisma.favorite.findMany({
      where: { creatorId: profile.id, kind: 'PRODUCT_TEMPLATE', productTemplateId: { not: null } },
      select: { productTemplateId: true },
    })
    return rows.map((r) => r.productTemplateId as string)
  } catch {
    // Stale Prisma client before the Favorite model lands — degrade to none so
    // the marketplace layout never 500s.
    return []
  }
}

/**
 * The creator's favorited marketplace templates as canonical <ProductCard>
 * props — used by the marketplace header peek + "See all" modal so the whole
 * favorites experience stays IN the marketplace (docs/FAVORITES_MANAGEMENT.md
 * §11). Hrefs are RELATIVE (same-app) so opening a favorite navigates within
 * the marketplace, never out to the dashboard. Empty for guests / stale client.
 */
export async function getFavoritedTemplateCards(): Promise<ProductCardProps[]> {
  const ids = await getAllFavoritedTemplateIds()
  if (ids.length === 0) return []
  try {
    const rows = await prisma.productTemplate.findMany({
      where: { id: { in: ids }, status: 'PUBLISHED' },
      select: {
        id: true,
        name: true,
        slug: true,
        priceFloorCents: true,
        subcategory: {
          select: { slug: true, category: { select: { slug: true, name: true, mainCategory: true } } },
        },
        variants: { select: { moqMin: true, leadTimeDays: true } },
      },
    })
    return rows.map((t) => {
      const moqs = t.variants.map((v) => v.moqMin).filter((n): n is number => typeof n === 'number')
      const leads = t.variants.map((v) => v.leadTimeDays).filter((n): n is number => typeof n === 'number')
      return {
        href: `/marketplace/${t.subcategory.category.slug}/${t.subcategory.slug}/${t.slug}`,
        templateId: t.id,
        title: t.name,
        niche: t.subcategory.category.name,
        icon: iconForNiche(t.name, t.subcategory.category.mainCategory),
        minUnits: moqs.length ? Math.min(...moqs) : 500,
        leadTimeDays: leads.length ? Math.min(...leads) : 14,
        pricePerUnit: t.priceFloorCents / 100,
        verified: true,
      }
    })
  } catch {
    return []
  }
}
