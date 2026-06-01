import 'server-only'
import { unstable_cache } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import type { ProductCardProps, ProductGradient } from '@ilaunchify/ui'

/**
 * Slice 2B — niche-scoped content helpers used by /launch/[niche].
 *
 * These map raw Prisma rows into the shapes the marketing-app components
 * already expect:
 *  - getNicheSubcategoryCards → simple list of subcategory cards
 *  - getNicheProductCards     → ProductCardProps[] for the curated grid
 *
 * Both fall back to an empty array on error/no data so the niche landing
 * page degrades gracefully (the consuming page hides the section when
 * empty).
 */

/* ============ subcategory cards ============ */

export interface NicheSubcategoryCard {
  slug: string
  name: string
  categorySlug: string
  categoryName: string
}

/**
 * Hydrate the niche's surfaced subcategory slugs into card-ready rows
 * (slug + name + parent category info so we can route to
 * /marketplace/[category]/[subcategory]).
 */
export async function getNicheSubcategoryCards(
  subcategorySlugs: string[],
): Promise<NicheSubcategoryCard[]> {
  if (subcategorySlugs.length === 0) return []
  try {
    const rows = await prisma.subcategory.findMany({
      where: { slug: { in: subcategorySlugs }, isActive: true },
      select: {
        slug: true,
        name: true,
        displayOrder: true,
        category: { select: { slug: true, name: true } },
      },
    })
    // Preserve the order from subcategorySlugs (which mirrors the
    // NicheSubcategory.displayOrder coming out of the loader) when possible.
    const indexBySlug = new Map(subcategorySlugs.map((s, i) => [s, i]))
    return rows
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        categorySlug: r.category.slug,
        categoryName: r.category.name,
      }))
      .sort((a, b) => (indexBySlug.get(a.slug) ?? 0) - (indexBySlug.get(b.slug) ?? 0))
  } catch (err) {
    console.warn(
      '[niche-content-db] getNicheSubcategoryCards failed:',
      (err as Error).message,
    )
    return []
  }
}

/* ============ product cards ============ */

type NicheProductCard = Omit<ProductCardProps, 'onFavorite' | 'favorited'>

/**
 * Stable pastel gradient per template slug. Mirrors the helper in
 * `lib/templates.ts` so cards keep the same colour everywhere a template
 * is rendered.
 */
function gradientForSlug(slug: string): ProductGradient {
  const palette: ProductGradient[] = [
    'mint',
    'pink',
    'coral',
    'lime',
    'yellow',
    'cyan',
    'purple',
    'blush',
    'sky',
  ]
  const hash = Array.from(slug).reduce((a, c) => a + c.charCodeAt(0), 0)
  return palette[hash % palette.length]!
}

function iconForMainCategory(mainCategory: string): string {
  switch (mainCategory.toLowerCase()) {
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

/**
 * Cached internally — same 30s TTL + 'marketplace-niches' tag as the
 * niche loaders. The cache key includes the slug + limit so each niche
 * gets its own bucket.
 */
const fetchNicheProductCards = unstable_cache(
  async (nicheSlug: string, limit: number): Promise<NicheProductCard[]> => {
    try {
      const rows = await prisma.productTemplate.findMany({
        where: {
          status: 'PUBLISHED',
          niches: { some: { niche: { slug: nicheSlug } } },
        },
        include: {
          subcategory: { include: { category: true } },
          variants: { where: { isActive: true }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })

      return rows.map((t) => {
        const category = t.subcategory.category
        return {
          href: `/marketplace/${category.slug}/${t.subcategory.slug}/${t.slug}`,
          title: t.name,
          niche: category.name,
          icon: iconForMainCategory(category.mainCategory),
          gradient: gradientForSlug(t.slug),
          tags: [],
          minUnits: t.variants[0]?.moqMin ?? 500,
          leadTimeDays: 10,
          pricePerUnit: t.priceFloorCents / 100,
        }
      })
    } catch (err) {
      console.warn(
        '[niche-content-db] fetchNicheProductCards failed:',
        (err as Error).message,
      )
      return []
    }
  },
  ['marketing.fetchNicheProductCards'],
  { revalidate: 30, tags: ['marketplace-niches'] },
)

export async function getNicheProductCards(
  nicheSlug: string,
  limit = 12,
): Promise<NicheProductCard[]> {
  return fetchNicheProductCards(nicheSlug, limit)
}
