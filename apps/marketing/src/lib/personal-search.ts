import 'server-only'
import { prisma } from '@ilaunchify/db'
import type { PersonalProduct } from './marketplace-search'

/**
 * Personal-search corpus — the logged-in creator's OWN products for the search
 * "For you" layer: everything they've FAVORITED plus everything they've
 * PREVIOUSLY ORDERED, resolved to the marketplace card shape and flagged with
 * `saved` / `reorderedAt`. The client fetches this once on focus and matches it
 * locally as the user types (no per-keystroke DB cost).
 *
 * Deliberately self-contained (its own tiny mappers, defensive Prisma access)
 * so it never depends on the in-flight Favorites code and never throws into the
 * search path — any failure degrades to an empty corpus and normal search.
 */

const GRADIENTS = ['mint', 'pink', 'coral', 'lime', 'yellow', 'cyan', 'purple', 'blush', 'sky']

function gradientForSlug(slug: string): string {
  let hash = 0
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]!
}

function iconForCategory(mainCategory: string | null | undefined): string {
  switch ((mainCategory ?? '').toLowerCase()) {
    case 'beverages':
      return '🥤'
    case 'supplements':
      return '💊'
    case 'food':
      return '🥣'
    default:
      return '📦'
  }
}

/** Batch-resolve hero image URLs (mirrors the marketplace card resolver). */
async function heroImages(rows: Array<{ id: string; imageAssetId: string | null }>): Promise<Map<string, string>> {
  const ids = rows.map((r) => r.id)
  if (!ids.length) return new Map()
  try {
    const assets = await prisma.asset.findMany({
      where: {
        ownerType: 'PRODUCT',
        ownerId: { in: ids },
        type: { in: ['PRODUCT_IMAGE', 'HERO_IMAGE'] },
        publicUrl: { not: null },
      },
      select: { ownerId: true, id: true, publicUrl: true },
      orderBy: { createdAt: 'asc' },
    })
    const heroIdByOwner = new Map(rows.map((r) => [r.id, r.imageAssetId]))
    const byOwner = new Map<string, { id: string; url: string }[]>()
    for (const a of assets) {
      if (!a.ownerId || !a.publicUrl) continue
      const list = byOwner.get(a.ownerId) ?? []
      list.push({ id: a.id, url: a.publicUrl })
      byOwner.set(a.ownerId, list)
    }
    const out = new Map<string, string>()
    for (const [owner, list] of byOwner) {
      const hero = list.find((x) => x.id === heroIdByOwner.get(owner)) ?? list[0]
      if (hero) out.set(owner, hero.url)
    }
    return out
  } catch {
    return new Map()
  }
}

/** Favorite template ids for a creator — defensive: the Favorite model may not
 *  be generated yet in this checkout, so access it through a cast and swallow. */
async function favoriteTemplateIds(creatorId: string): Promise<string[]> {
  const model = (prisma as unknown as {
    favorite?: {
      findMany: (a: unknown) => Promise<Array<{ productTemplateId: string | null }>>
    }
  }).favorite
  if (!model) return []
  try {
    const rows = await model.findMany({
      where: { creatorId, kind: 'PRODUCT_TEMPLATE', productTemplateId: { not: null } },
      select: { productTemplateId: true },
    })
    return rows.map((r) => r.productTemplateId).filter((id): id is string => !!id)
  } catch {
    return []
  }
}

/** Template id → most-recent order date (ISO) for a creator's past orders. */
async function orderedTemplateDates(userId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    const orders = await prisma.order.findMany({
      where: { creatorUserId: userId, status: { notIn: ['PENDING_PAYMENT', 'CANCELLED'] } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        createdAt: true,
        items: { select: { product: { select: { productTemplateId: true } } } },
      },
    })
    for (const o of orders) {
      for (const it of o.items) {
        const tid = it.product?.productTemplateId
        if (tid && !out.has(tid)) out.set(tid, o.createdAt.toISOString())
      }
    }
  } catch {
    /* orders unavailable → no reorder signal */
  }
  return out
}

export async function getPersonalProducts(userId: string): Promise<PersonalProduct[]> {
  try {
    const profile = await prisma.creatorProfile.findUnique({ where: { userId }, select: { id: true } })
    const creatorId = profile?.id

    const [favIds, orderedAt] = await Promise.all([
      creatorId ? favoriteTemplateIds(creatorId) : Promise.resolve([]),
      orderedTemplateDates(userId),
    ])

    const favSet = new Set(favIds)
    const ids = [...new Set([...favIds, ...orderedAt.keys()])]
    if (!ids.length) return []

    const rows = await prisma.productTemplate.findMany({
      where: { id: { in: ids }, status: 'PUBLISHED' },
      select: {
        id: true,
        name: true,
        slug: true,
        priceFloorCents: true,
        imageAssetId: true,
        subcategory: {
          select: { slug: true, category: { select: { slug: true, name: true, mainCategory: true } } },
        },
        variants: { where: { isActive: true }, select: { moqMin: true, leadTimeDays: true } },
        lifestyleTags: { include: { lifestyleTag: { select: { name: true } } } },
      },
    })

    const heroMap = await heroImages(rows.map((r) => ({ id: r.id, imageAssetId: r.imageAssetId })))

    return rows.map((r): PersonalProduct => {
      const cat = r.subcategory.category
      const moqs = r.variants.map((v) => v.moqMin).filter((n): n is number => typeof n === 'number')
      const leads = r.variants.map((v) => v.leadTimeDays).filter((n): n is number => typeof n === 'number')
      return {
        slug: r.slug,
        title: r.name,
        niche: cat.name,
        categorySlug: cat.slug,
        subcategorySlug: r.subcategory.slug,
        href: `/marketplace/${cat.slug}/${r.subcategory.slug ?? 'all'}/${r.slug}`,
        icon: iconForCategory(cat.mainCategory),
        gradient: gradientForSlug(r.slug),
        imageUrl: heroMap.get(r.id),
        pricePerUnit: r.priceFloorCents / 100,
        minUnits: moqs.length ? Math.min(...moqs) : 500,
        leadTimeDays: leads.length ? Math.min(...leads) : 10,
        tags: (r.lifestyleTags ?? []).slice(0, 3).map((j) => j.lifestyleTag.name),
        badge: null,
        saved: favSet.has(r.id),
        reorderedAt: orderedAt.get(r.id),
      }
    })
  } catch (err) {
    console.warn('[marketplace/personal] failed:', (err as Error).message)
    return []
  }
}
