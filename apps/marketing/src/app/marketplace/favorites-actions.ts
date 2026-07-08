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
import type { ProductCardProps, FavoritesCollection } from '@ilaunchify/ui'
import { getMarketingSession } from '@/lib/session'
import { creatorUrl } from '@/lib/app-urls'
import { getProductCertBadges } from '@/lib/product-cert-badges'
import { revalidatePath } from 'next/cache'

function savedLabelFor(d: Date): string {
  return `Saved ${new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

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

  // Snapshot the current price so the favorites page can show "price dropped
  // X% since saved" (docs/FAVORITES_MANAGEMENT.md §11).
  const snap = await prisma.productTemplate.findUnique({
    where: { id: templateId },
    select: { priceFloorCents: true },
  })
  const created = await prisma.favorite.create({
    data: {
      creatorId: profile.id,
      kind: 'PRODUCT_TEMPLATE',
      productTemplateId: templateId,
      priceSnapshotCents: snap?.priceFloorCents ?? null,
    },
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

// ---------------------------------------------------------------------------
// Rich marketplace favorites payload — one fetch feeds both the header peek
// (mixed recent rows with tabs) AND the "See all" modal (canonical card grids).
// Templates link WITHIN the marketplace (relative); the creator's own Products
// link OUT to the dashboard Studio / checkout (absolute creatorUrl) — so
// products redirect in a different direction (Pavel 2026-07-07).
// ---------------------------------------------------------------------------

const PRODUCT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  COMPLIANT: 'Ready to order',
  PUBLISHED: 'Live',
  PAUSED: 'Paused',
  ARCHIVED: 'Archived',
}

export interface MarketplaceFavRow {
  kind: 'template' | 'product'
  name: string
  subtitle: string
  icon: string
  href: string
  actionLabel: string
  actionHref: string
}

export interface MarketplaceFavProductCard {
  productId: string
  name: string
  brandName: string
  status: string
  /** Studio (absolute creatorUrl — leaves the marketplace). */
  href: string
  /** Checkout / reorder (absolute creatorUrl). */
  reorderHref: string
}

export interface MarketplaceFavoritesData {
  count: number
  templateCount: number
  productCount: number
  recent: MarketplaceFavRow[]
  templateCards: ProductCardProps[]
  productCards: MarketplaceFavProductCard[]
}

const EMPTY_DATA: MarketplaceFavoritesData = {
  count: 0,
  templateCount: 0,
  productCount: 0,
  recent: [],
  templateCards: [],
  productCards: [],
}

/** Total favorites count (templates + products) for the header badge. */
export async function getFavoritesTotalCount(): Promise<number> {
  const session = await getMarketingSession()
  if (!session?.user || session.user.role !== 'CREATOR') return 0
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) return 0
  try {
    return await prisma.favorite.count({ where: { creatorId: profile.id } })
  } catch {
    return 0
  }
}

export async function getMarketplaceFavoritesData(): Promise<MarketplaceFavoritesData> {
  const session = await getMarketingSession()
  if (!session?.user || session.user.role !== 'CREATOR') return EMPTY_DATA
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) return EMPTY_DATA

  try {
    const rows = await prisma.favorite.findMany({
      where: { creatorId: profile.id },
      orderBy: { createdAt: 'desc' },
      select: {
        kind: true,
        productTemplate: {
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
        },
        product: {
          select: { id: true, name: true, status: true, brand: { select: { name: true } } },
        },
      },
    })

    const recent: MarketplaceFavRow[] = []
    const templateCards: ProductCardProps[] = []
    const productCards: MarketplaceFavProductCard[] = []

    for (const r of rows) {
      if (r.kind === 'PRODUCT_TEMPLATE' && r.productTemplate) {
        const t = r.productTemplate
        const href = `/marketplace/${t.subcategory.category.slug}/${t.subcategory.slug}/${t.slug}`
        const icon = iconForNiche(t.name, t.subcategory.category.mainCategory)
        const moqs = t.variants.map((v) => v.moqMin).filter((n): n is number => typeof n === 'number')
        const leads = t.variants.map((v) => v.leadTimeDays).filter((n): n is number => typeof n === 'number')
        templateCards.push({
          href,
          templateId: t.id,
          title: t.name,
          niche: t.subcategory.category.name,
          icon,
          minUnits: moqs.length ? Math.min(...moqs) : 500,
          leadTimeDays: leads.length ? Math.min(...leads) : 14,
          pricePerUnit: t.priceFloorCents / 100,
          verified: true,
        })
        recent.push({
          kind: 'template',
          name: t.name,
          subtitle: `${t.subcategory.category.name} · from $${(t.priceFloorCents / 100).toFixed(2)}`,
          icon,
          href,
          actionLabel: 'Customize',
          actionHref: href,
        })
      } else if (r.kind === 'PRODUCT' && r.product) {
        const p = r.product
        const studio = creatorUrl(`/products/${p.id}/design/canvas`)
        const checkout = creatorUrl(`/products/${p.id}/checkout`)
        productCards.push({
          productId: p.id,
          name: p.name,
          brandName: p.brand.name,
          status: p.status,
          href: studio,
          reorderHref: checkout,
        })
        recent.push({
          kind: 'product',
          name: p.name,
          subtitle: `${p.brand.name} · ${PRODUCT_STATUS_LABEL[p.status] ?? p.status}`,
          icon: '📦',
          href: studio,
          actionLabel: 'Reorder',
          actionHref: checkout,
        })
      }
    }

    return {
      count: rows.length,
      templateCount: templateCards.length,
      productCount: productCards.length,
      recent,
      templateCards,
      productCards,
    }
  } catch {
    return EMPTY_DATA
  }
}

// ---------------------------------------------------------------------------
// Rich favorites rows — the Amazon-style FavoriteRow payload for the full
// in-marketplace favorites page (docs/FAVORITES_MANAGEMENT.md §11). Templates
// carry trust signals (rating / manufacturer badge / certs / sample / flavors)
// + price-drop-since-saved; own products carry status + orders + reorder.
// ---------------------------------------------------------------------------

export interface FavCert {
  name: string
  iconUrl: string | null
}
export interface FavTemplateRow {
  favoriteId: string
  templateId: string
  collectionId: string | null
  href: string
  title: string
  icon: string
  metaLine: string
  priceCents: number
  priceSnapshotCents: number | null
  savedLabel: string
  note: string | null
  rating: { mean: number | null; count: number }
  manufacturerBadge: 'TRUSTED' | 'PREMIER' | null
  certs: FavCert[]
  flavorCount: number
  sampleAvailable: boolean
  unavailable: boolean
}
export interface FavProductRow {
  favoriteId: string
  productId: string
  collectionId: string | null
  href: string
  reorderHref: string
  title: string
  metaLine: string
  savedLabel: string
  note: string | null
  status: string
  secondaryNote: string
}
export interface MarketplaceFavoriteRows {
  count: number
  templateCount: number
  productCount: number
  collections: FavoritesCollection[]
  templateRows: FavTemplateRow[]
  productRows: FavProductRow[]
}

const EMPTY_ROWS: MarketplaceFavoriteRows = {
  count: 0,
  templateCount: 0,
  productCount: 0,
  collections: [],
  templateRows: [],
  productRows: [],
}

export async function getMarketplaceFavoriteRows(): Promise<MarketplaceFavoriteRows> {
  const session = await getMarketingSession()
  if (!session?.user || session.user.role !== 'CREATOR') return EMPTY_ROWS
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) return EMPTY_ROWS

  try {
    const rows = await prisma.favorite.findMany({
      where: { creatorId: profile.id },
      orderBy: { createdAt: 'desc' },
      select: {
        kind: true,
        createdAt: true,
        note: true,
        priceSnapshotCents: true,
        collectionId: true,
        productTemplate: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            priceFloorCents: true,
            ratingAvg: true,
            ratingCount: true,
            subcategory: {
              select: { slug: true, category: { select: { slug: true, name: true, mainCategory: true } } },
            },
            variants: { select: { moqMin: true, leadTimeDays: true } },
            manufacturerService: { select: { partner: { select: { tier: true } } } },
            _count: { select: { flavorPresets: true, sampleOptions: true } },
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            status: true,
            brand: { select: { name: true } },
            _count: { select: { orderItems: true } },
          },
        },
      },
    })

    const templateRows: FavTemplateRow[] = []
    const productRows: FavProductRow[] = []

    for (const r of rows) {
      if (r.kind === 'PRODUCT_TEMPLATE' && r.productTemplate) {
        const t = r.productTemplate
        const moqs = t.variants.map((v) => v.moqMin).filter((n): n is number => typeof n === 'number')
        const leads = t.variants.map((v) => v.leadTimeDays).filter((n): n is number => typeof n === 'number')
        const moq = moqs.length ? Math.min(...moqs) : 500
        const lead = leads.length ? Math.min(...leads) : 14
        const tier = t.manufacturerService?.partner?.tier
        const certBadges = await getProductCertBadges(t.slug).catch(() => [])
        templateRows.push({
          favoriteId: '', // not needed by the row; targetId drives remove
          templateId: t.id,
          collectionId: r.collectionId ?? null,
          href: `/marketplace/${t.subcategory.category.slug}/${t.subcategory.slug}/${t.slug}`,
          title: t.name,
          icon: iconForNiche(t.name, t.subcategory.category.mainCategory),
          metaLine: `${t.subcategory.category.name} · MOQ ${moq.toLocaleString()} · ${lead}-day lead`,
          priceCents: t.priceFloorCents,
          priceSnapshotCents: r.priceSnapshotCents ?? null,
          savedLabel: savedLabelFor(r.createdAt),
          note: r.note ?? null,
          rating: { mean: t.ratingAvg ?? null, count: t.ratingCount ?? 0 },
          manufacturerBadge: tier === 'TRUSTED' || tier === 'PREMIER' ? tier : null,
          certs: certBadges.map((c) => ({ name: c.name, iconUrl: c.iconUrl })),
          flavorCount: t._count.flavorPresets,
          sampleAvailable: t._count.sampleOptions > 0,
          unavailable: t.status !== 'PUBLISHED',
        })
      } else if (r.kind === 'PRODUCT' && r.product) {
        const p = r.product
        const orders = p._count.orderItems
        productRows.push({
          favoriteId: '',
          productId: p.id,
          collectionId: r.collectionId ?? null,
          href: creatorUrl(`/products/${p.id}/design/canvas`),
          reorderHref: creatorUrl(`/products/${p.id}/checkout`),
          title: p.name,
          metaLine: `${p.brand.name} · ${orders} order${orders === 1 ? '' : 's'} placed`,
          savedLabel: savedLabelFor(r.createdAt),
          note: r.note ?? null,
          status: p.status,
          secondaryNote: 'Your product · opens in your dashboard',
        })
      }
    }

    const cols = await prisma.favoriteCollection.findMany({
      where: { creatorId: profile.id },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, _count: { select: { favorites: true } } },
    })
    const collections: FavoritesCollection[] = cols.map((c) => ({ id: c.id, name: c.name, count: c._count.favorites }))

    return {
      count: rows.length,
      templateCount: templateRows.length,
      productCount: productRows.length,
      collections,
      templateRows,
      productRows,
    }
  } catch {
    return EMPTY_ROWS
  }
}

// ---- Folders (organize favorites) ----------------------------------------

async function currentCreatorProfileId(): Promise<string | null> {
  const session = await getMarketingSession()
  if (!session?.user || session.user.role !== 'CREATOR') return null
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  return profile?.id ?? null
}

export async function createCollection(name: string): Promise<{ ok: boolean; id?: string }> {
  const creatorId = await currentCreatorProfileId()
  if (!creatorId || !name.trim()) return { ok: false }
  try {
    const c = await prisma.favoriteCollection.create({
      data: { creatorId, name: name.trim().slice(0, 40) },
      select: { id: true },
    })
    revalidatePath('/marketplace/favorites')
    return { ok: true, id: c.id }
  } catch {
    return { ok: false }
  }
}

export async function deleteCollection(id: string): Promise<{ ok: boolean }> {
  const creatorId = await currentCreatorProfileId()
  if (!creatorId) return { ok: false }
  try {
    await prisma.favoriteCollection.deleteMany({ where: { id, creatorId } })
    revalidatePath('/marketplace/favorites')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function renameCollection(input: { id: string; name: string }): Promise<{ ok: boolean }> {
  const creatorId = await currentCreatorProfileId()
  if (!creatorId || !input.name.trim()) return { ok: false }
  try {
    await prisma.favoriteCollection.updateMany({
      where: { id: input.id, creatorId },
      data: { name: input.name.trim().slice(0, 40) },
    })
    revalidatePath('/marketplace/favorites')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function moveFavoriteToCollection(input: {
  kind: 'PRODUCT_TEMPLATE' | 'PRODUCT'
  targetId: string
  collectionId: string | null
}): Promise<{ ok: boolean }> {
  const creatorId = await currentCreatorProfileId()
  if (!creatorId) return { ok: false }
  try {
    const where =
      input.kind === 'PRODUCT_TEMPLATE'
        ? { creatorId_productTemplateId: { creatorId, productTemplateId: input.targetId } }
        : { creatorId_productId: { creatorId, productId: input.targetId } }
    await prisma.favorite.update({ where, data: { collectionId: input.collectionId } })
    revalidatePath('/marketplace/favorites')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Remove a favorite (either kind) for the current creator. */
export async function removeFavorite(input: {
  kind: 'PRODUCT_TEMPLATE' | 'PRODUCT'
  targetId: string
}): Promise<{ ok: boolean }> {
  const session = await getMarketingSession()
  if (!session?.user || session.user.role !== 'CREATOR') return { ok: false }
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) return { ok: false }
  try {
    const where =
      input.kind === 'PRODUCT_TEMPLATE'
        ? { creatorId_productTemplateId: { creatorId: profile.id, productTemplateId: input.targetId } }
        : { creatorId_productId: { creatorId: profile.id, productId: input.targetId } }
    const existing = await prisma.favorite.findUnique({ where, select: { id: true } })
    if (!existing) return { ok: true }
    await prisma.favorite.delete({ where: { id: existing.id } })
    await logAuditAs(
      { id: session.user.id, role: 'CREATOR' },
      { entityType: 'Favorite', entityId: existing.id, action: 'FAVORITE_REMOVED', payload: { ...input, via: 'favorites-page' } },
    )
    revalidatePath('/marketplace/favorites')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Set/clear the private note on a favorite. */
export async function setFavoriteNote(input: {
  kind: 'PRODUCT_TEMPLATE' | 'PRODUCT'
  targetId: string
  note: string
}): Promise<{ ok: boolean }> {
  const session = await getMarketingSession()
  if (!session?.user || session.user.role !== 'CREATOR') return { ok: false }
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) return { ok: false }
  try {
    const where =
      input.kind === 'PRODUCT_TEMPLATE'
        ? { creatorId_productTemplateId: { creatorId: profile.id, productTemplateId: input.targetId } }
        : { creatorId_productId: { creatorId: profile.id, productId: input.targetId } }
    await prisma.favorite.update({ where, data: { note: input.note.slice(0, 280) || null } })
    revalidatePath('/marketplace/favorites')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
