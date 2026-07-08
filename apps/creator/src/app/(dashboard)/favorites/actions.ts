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
import type { FavoritesRowData, FavoritesCollection } from '@ilaunchify/ui'
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

  // Snapshot the template's current price so the favorites page can show
  // "price dropped X% since saved" (docs/FAVORITES_MANAGEMENT.md §11).
  const priceSnapshotCents =
    kind === 'PRODUCT_TEMPLATE'
      ? (await prisma.productTemplate.findUnique({ where: { id: targetId }, select: { priceFloorCents: true } }))
          ?.priceFloorCents ?? null
      : null
  const created = await prisma.favorite.create({
    data: {
      creatorId,
      kind,
      productTemplateId: kind === 'PRODUCT_TEMPLATE' ? targetId : null,
      productId: kind === 'PRODUCT' ? targetId : null,
      priceSnapshotCents,
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

/**
 * Adapter matching the ui FavoritesProvider's saveAction signature, so the
 * canonical <ProductCard> heart on /favorites (a creator surface) removes the
 * favorite. Wraps toggleFavorite for the PRODUCT_TEMPLATE kind.
 */
export async function toggleTemplateFavorite(input: {
  templateId: string
}): Promise<{ ok: boolean; saved?: boolean; reason?: string }> {
  const r = await toggleFavorite({ kind: 'PRODUCT_TEMPLATE', targetId: input.templateId })
  return r.ok ? { ok: true, saved: r.saved } : { ok: false, reason: 'ERROR' }
}

/** The current creator's favorited own-Product ids (for rendering Save state on cards). */
export async function getFavoritedProductIds(): Promise<Set<string>> {
  const ctx = await currentCreatorId()
  if (!ctx) return new Set()
  try {
    const rows = await prisma.favorite.findMany({
      where: { creatorId: ctx.creatorId, kind: 'PRODUCT', productId: { not: null } },
      select: { productId: true },
    })
    return new Set(rows.map((r) => r.productId as string))
  } catch {
    // Stale Prisma client before the Favorite model lands — no saved state.
    return new Set()
  }
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

  try {
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
  } catch {
    // Stale Prisma client before the Favorite model lands — empty peek.
    return { count: 0, items: [] }
  }
}

// ---------------------------------------------------------------------------
// Full favorites rows for the profile /favorites page — the SAME shared
// FavoritesListView the marketplace uses, so both surfaces match. Templates
// link OUT to the marketplace (absolute marketingUrl); products stay in the
// dashboard. Certs are name-only here (the PNG badge lib is marketing-side).
// ---------------------------------------------------------------------------

function savedLabelFor(d: Date): string {
  return `Saved ${new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

/** Set/clear the private note on a favorite. */
export async function setFavoriteNote(input: {
  kind: FavoritableKind
  targetId: string
  note: string
}): Promise<{ ok: boolean }> {
  const ctx = await currentCreatorId()
  if (!ctx) return { ok: false }
  try {
    const where =
      input.kind === 'PRODUCT_TEMPLATE'
        ? { creatorId_productTemplateId: { creatorId: ctx.creatorId, productTemplateId: input.targetId } }
        : { creatorId_productId: { creatorId: ctx.creatorId, productId: input.targetId } }
    await prisma.favorite.update({ where, data: { note: input.note.slice(0, 280) || null } })
    await logAuditAs(
      { id: ctx.userId, role: 'CREATOR' },
      { entityType: 'Favorite', entityId: input.targetId, action: 'FAVORITE_NOTE_SET', payload: { kind: input.kind } },
    )
    revalidatePath('/favorites')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export interface CreatorFavoriteRows {
  collections: FavoritesCollection[]
  templateRows: FavoritesRowData[]
  productRows: FavoritesRowData[]
}

export async function getCreatorFavoriteRows(): Promise<CreatorFavoriteRows> {
  const ctx = await currentCreatorId()
  if (!ctx) return { templateRows: [], productRows: [] }
  try {
    const rows = await prisma.favorite.findMany({
      where: { creatorId: ctx.creatorId },
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
            subcategory: { select: { slug: true, category: { select: { slug: true, name: true, mainCategory: true } } } },
            variants: { select: { moqMin: true, leadTimeDays: true } },
            manufacturerService: { select: { partner: { select: { tier: true } } } },
            _count: { select: { flavorPresets: true, sampleOptions: true } },
            certificates: {
              where: { instance: { status: 'VERIFIED' } },
              select: { instance: { select: { certificateType: { select: { name: true, status: true } } } } },
            },
          },
        },
        product: {
          select: { id: true, name: true, status: true, brand: { select: { name: true } }, _count: { select: { orderItems: true } } },
        },
      },
    })

    const templateRows: FavoritesRowData[] = []
    const productRows: FavoritesRowData[] = []

    for (const r of rows) {
      if (r.kind === 'PRODUCT_TEMPLATE' && r.productTemplate) {
        const t = r.productTemplate
        const moqs = t.variants.map((v) => v.moqMin).filter((n): n is number => typeof n === 'number')
        const leads = t.variants.map((v) => v.leadTimeDays).filter((n): n is number => typeof n === 'number')
        const moq = moqs.length ? Math.min(...moqs) : 500
        const lead = leads.length ? Math.min(...leads) : 14
        const tier = t.manufacturerService?.partner?.tier
        const certNames = Array.from(
          new Set(
            t.certificates
              .map((c) => c.instance.certificateType)
              .filter((ct) => ct.status === 'ACTIVE')
              .map((ct) => ct.name),
          ),
        )
        const href = marketingUrl(`/marketplace/${t.subcategory.category.slug}/${t.subcategory.slug}/${t.slug}`)
        const unavailable = t.status !== 'PUBLISHED'
        const sampleAvailable = t._count.sampleOptions > 0
        templateRows.push({
          key: `t:${t.id}`,
          kind: 'PRODUCT_TEMPLATE',
          targetId: t.id,
          href,
          title: t.name,
          icon: iconForNiche(t.name, t.subcategory.category.mainCategory),
          metaLine: `${t.subcategory.category.name} · MOQ ${moq.toLocaleString()} · ${lead}-day lead`,
          priceCents: t.priceFloorCents,
          priceSnapshotCents: r.priceSnapshotCents ?? undefined,
          savedLabel: savedLabelFor(r.createdAt),
          note: r.note ?? undefined,
          rating: { mean: t.ratingAvg ?? null, count: t.ratingCount ?? 0 },
          manufacturerBadge: tier === 'TRUSTED' || tier === 'PREMIER' ? tier : null,
          certs: certNames.map((name) => ({ name, iconUrl: null })),
          flavorCount: t._count.flavorPresets,
          sampleAvailable,
          unavailable,
          kindTag: { label: 'Template', tone: 'template' },
          primaryAction: unavailable ? { label: 'View', href } : { label: 'Customize', href },
          secondaryLinks: sampleAvailable && !unavailable ? [{ label: 'Order sample', href }] : undefined,
          shareUrl: href,
          collectionId: r.collectionId ?? null,
        })
      } else if (r.kind === 'PRODUCT' && r.product) {
        const p = r.product
        const orders = p._count.orderItems
        productRows.push({
          key: `p:${p.id}`,
          kind: 'PRODUCT',
          targetId: p.id,
          href: `/products/${p.id}/design/canvas`,
          title: p.name,
          metaLine: `${p.brand.name} · ${orders} order${orders === 1 ? '' : 's'} placed`,
          savedLabel: savedLabelFor(r.createdAt),
          note: r.note ?? undefined,
          secondaryNote: 'Your product',
          kindTag: { label: 'Mine', tone: 'mine' },
          primaryAction: { label: 'Reorder', href: `/products/${p.id}/checkout` },
          secondaryLinks: [{ label: 'Open in Studio', href: `/products/${p.id}/design/canvas` }],
          collectionId: r.collectionId ?? null,
        })
      }
    }

    const cols = await prisma.favoriteCollection.findMany({
      where: { creatorId: ctx.creatorId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, _count: { select: { favorites: true } } },
    })
    const collections: FavoritesCollection[] = cols.map((c) => ({ id: c.id, name: c.name, count: c._count.favorites }))

    return { collections, templateRows, productRows }
  } catch {
    return { collections: [], templateRows: [], productRows: [] }
  }
}

// ---- Folders (organize favorites) ----------------------------------------

export async function createCollection(name: string): Promise<{ ok: boolean; id?: string }> {
  const ctx = await currentCreatorId()
  if (!ctx || !name.trim()) return { ok: false }
  try {
    const c = await prisma.favoriteCollection.create({
      data: { creatorId: ctx.creatorId, name: name.trim().slice(0, 40) },
      select: { id: true },
    })
    await logAuditAs(
      { id: ctx.userId, role: 'CREATOR' },
      { entityType: 'FavoriteCollection', entityId: c.id, action: 'COLLECTION_CREATED', payload: { name: name.trim() } },
    )
    revalidatePath('/favorites')
    return { ok: true, id: c.id }
  } catch {
    return { ok: false }
  }
}

export async function deleteCollection(id: string): Promise<{ ok: boolean }> {
  const ctx = await currentCreatorId()
  if (!ctx) return { ok: false }
  try {
    // Scope the delete to this creator; favorites fall back to no folder (SetNull).
    await prisma.favoriteCollection.deleteMany({ where: { id, creatorId: ctx.creatorId } })
    await logAuditAs(
      { id: ctx.userId, role: 'CREATOR' },
      { entityType: 'FavoriteCollection', entityId: id, action: 'COLLECTION_DELETED' },
    )
    revalidatePath('/favorites')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function renameCollection(input: { id: string; name: string }): Promise<{ ok: boolean }> {
  const ctx = await currentCreatorId()
  if (!ctx || !input.name.trim()) return { ok: false }
  try {
    await prisma.favoriteCollection.updateMany({
      where: { id: input.id, creatorId: ctx.creatorId },
      data: { name: input.name.trim().slice(0, 40) },
    })
    await logAuditAs(
      { id: ctx.userId, role: 'CREATOR' },
      { entityType: 'FavoriteCollection', entityId: input.id, action: 'COLLECTION_RENAMED', payload: { name: input.name.trim() } },
    )
    revalidatePath('/favorites')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function moveFavoriteToCollection(input: {
  kind: FavoritableKind
  targetId: string
  collectionId: string | null
}): Promise<{ ok: boolean }> {
  const ctx = await currentCreatorId()
  if (!ctx) return { ok: false }
  try {
    const where =
      input.kind === 'PRODUCT_TEMPLATE'
        ? { creatorId_productTemplateId: { creatorId: ctx.creatorId, productTemplateId: input.targetId } }
        : { creatorId_productId: { creatorId: ctx.creatorId, productId: input.targetId } }
    await prisma.favorite.update({ where, data: { collectionId: input.collectionId } })
    await logAuditAs(
      { id: ctx.userId, role: 'CREATOR' },
      { entityType: 'Favorite', entityId: input.targetId, action: 'FAVORITE_MOVED', payload: { kind: input.kind, collectionId: input.collectionId } },
    )
    revalidatePath('/favorites')
    return { ok: true }
  } catch {
    return { ok: false }
  }
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
