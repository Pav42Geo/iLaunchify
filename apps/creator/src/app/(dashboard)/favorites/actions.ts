'use server'

// Favorites — private per-creator save list (docs/FAVORITES_MANAGEMENT.md, P0).
//
// A favorite is a join row owned by the creator's CreatorProfile, so it is
// private by construction. Two nullable FKs + a `kind` discriminator; exactly
// one target column is set per kind. Every toggle writes an AuditLog row.
//
// No FSM — a favorite is a simple toggle, not a lifecycle entity.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { marketingUrl } from '@/lib/marketing-url'

export type FavoritableKind = 'PRODUCT_TEMPLATE' | 'PRODUCT'

export type ToggleFavoriteResult =
  | { ok: true; saved: boolean }
  | { ok: false; error: string }

/**
 * Resolve the current creator's CreatorProfile id, or null if the caller
 * isn't a creator (admin impersonation etc. can't own favorites).
 */
async function currentCreatorId(): Promise<{ userId: string; creatorId: string } | null> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return null
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!profile) return null
  return { userId: user.id, creatorId: profile.id }
}

/**
 * Toggle a favorite on/off for the current creator. Idempotent — returns the
 * resulting saved state. The unique indexes (creatorId,productTemplateId) /
 * (creatorId,productId) back "one favorite per target."
 */
export async function toggleFavorite(input: {
  kind: FavoritableKind
  targetId: string
}): Promise<ToggleFavoriteResult> {
  const ctx = await currentCreatorId()
  if (!ctx) return { ok: false, error: 'Sign in as a creator to save favorites.' }
  const { userId, creatorId } = ctx
  const { kind, targetId } = input
  if (!targetId) return { ok: false, error: 'Missing target.' }

  // Look up any existing row for this (creator, target) via the matching
  // compound unique key.
  const existing =
    kind === 'PRODUCT_TEMPLATE'
      ? await prisma.favorite.findUnique({
          where: { creatorId_productTemplateId: { creatorId, productTemplateId: targetId } },
          select: { id: true },
        })
      : await prisma.favorite.findUnique({
          where: { creatorId_productId: { creatorId, productId: targetId } },
          select: { id: true },
        })

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } })
    await logAuditAs(
      { id: userId, role: 'CREATOR' },
      { entityType: 'Favorite', entityId: existing.id, action: 'FAVORITE_REMOVED', payload: { kind, targetId } },
    )
    revalidatePath('/favorites')
    return { ok: true, saved: false }
  }

  const created = await prisma.favorite.create({
    data: {
      creatorId,
      kind,
      productTemplateId: kind === 'PRODUCT_TEMPLATE' ? targetId : null,
      productId: kind === 'PRODUCT' ? targetId : null,
    },
    select: { id: true },
  })
  await logAuditAs(
    { id: userId, role: 'CREATOR' },
    { entityType: 'Favorite', entityId: created.id, action: 'FAVORITE_ADDED', payload: { kind, targetId } },
  )
  revalidatePath('/favorites')
  return { ok: true, saved: true }
}

/** The current creator's favorited own-Product ids (for rendering Save state on cards). */
export async function getFavoritedProductIds(): Promise<Set<string>> {
  const ctx = await currentCreatorId()
  if (!ctx) return new Set()
  const rows = await prisma.favorite.findMany({
    where: { creatorId: ctx.creatorId, kind: 'PRODUCT', productId: { not: null } },
    select: { productId: true },
  })
  return new Set(rows.map((r) => r.productId as string))
}

/** Count for the header badge. */
export async function getFavoritesCount(creatorProfileId: string): Promise<number> {
  return prisma.favorite.count({ where: { creatorId: creatorProfileId } })
}

// ---------------------------------------------------------------------------
// Header peek dropdown (docs/FAVORITES_MANAGEMENT.md §11) — fetched on open so
// it's always fresh after a toggle elsewhere.
// ---------------------------------------------------------------------------

export interface FavoritePreviewItem {
  favoriteId: string
  kind: FavoritableKind
  name: string
  subtitle: string
  /** Where the row / thumbnail links. Cross-app URLs are absolute (marketingUrl). */
  href: string
  /** Quick-action label + its href. */
  actionLabel: 'Customize' | 'Reorder'
  actionHref: string
}

export interface FavoritesPreview {
  count: number
  items: FavoritePreviewItem[]
}

const PRODUCT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  COMPLIANT: 'Ready to order',
  PUBLISHED: 'Live',
  PAUSED: 'Paused',
  ARCHIVED: 'Archived',
}

/**
 * Recent favorites for the header peek panel. Returns up to 12 recent items
 * (client filters by tab + caps the display) plus the total count.
 */
export async function getFavoritesPreview(): Promise<FavoritesPreview> {
  const ctx = await currentCreatorId()
  if (!ctx) return { count: 0, items: [] }

  const [count, rows] = await Promise.all([
    prisma.favorite.count({ where: { creatorId: ctx.creatorId } }),
    prisma.favorite.findMany({
      where: { creatorId: ctx.creatorId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        kind: true,
        productTemplate: {
          select: {
            name: true,
            slug: true,
            priceFloorCents: true,
            subcategory: { select: { slug: true, category: { select: { slug: true } } } },
          },
        },
        product: {
          select: { id: true, name: true, status: true, brand: { select: { name: true } } },
        },
      },
    }),
  ])

  const items: FavoritePreviewItem[] = []
  for (const r of rows) {
    if (r.kind === 'PRODUCT_TEMPLATE' && r.productTemplate) {
      const t = r.productTemplate
      const href = marketingUrl(
        `/marketplace/${t.subcategory.category.slug}/${t.subcategory.slug}/${t.slug}`,
      )
      items.push({
        favoriteId: r.id,
        kind: 'PRODUCT_TEMPLATE',
        name: t.name,
        subtitle: `from $${(t.priceFloorCents / 100).toFixed(2)} / unit`,
        href,
        actionLabel: 'Customize',
        actionHref: href,
      })
    } else if (r.kind === 'PRODUCT' && r.product) {
      const p = r.product
      items.push({
        favoriteId: r.id,
        kind: 'PRODUCT',
        name: p.name,
        subtitle: `${p.brand.name} · ${PRODUCT_STATUS_LABEL[p.status] ?? p.status}`,
        href: `/products/${p.id}/design/canvas`,
        actionLabel: 'Reorder',
        actionHref: `/products/${p.id}/checkout`,
      })
    }
  }

  return { count, items }
}
