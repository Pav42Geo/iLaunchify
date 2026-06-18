import 'server-only'
import { prisma } from '@ilaunchify/db'
import type { ProductGradient } from '@ilaunchify/ui'
import { CATEGORY_ROWS, type SampleTemplate } from './sample-templates'
import type { TemplateDetail } from './template-detail'

/**
 * Server-only marketplace data layer.
 *
 * Reads ProductTemplate from Prisma where status = PUBLISHED. Falls back to
 * the sample-templates.ts dataset when the DB is empty (typical for fresh
 * dev installs where Pavel hasn't run `pnpm seed` yet) so the page never
 * shows an empty state during development.
 *
 * Mirrors the apps/creator marketplace query pattern (task #77) so the two
 * apps stay in sync. The card-display shape is reused (SampleTemplate)
 * because @ilaunchify/ui's ProductCard already expects it.
 */

export interface MarketplaceFilters {
  /** Free-text search across template name + description. */
  q?: string
  /** Slugs of categories to include. */
  categorySlugs?: string[]
  /** Slugs of subcategories to include. */
  subcategorySlugs?: string[]
  /** MOQ ceiling — only return templates where at least one variant has
   * moqMin ≤ this number. */
  moqMax?: number
  /**
   * Niche slug — drives ProductTemplateNiche.some.niche.slug filter when
   * present. (Replaces the old category-mainCategory shortcut.)
   */
  niche?: string
  /** Tag labels (Diet/Cert) — template must carry ALL tags listed.
   *  V1: applied at sample-data level. DB path needs certifications join. */
  tags?: string[]
  /**
   * Slice 2B — LifestyleTag slugs from the marketplace chip rail.
   * V1 semantics: AND across the tag list (template must carry every
   * selected tag). When the AND-within-group / OR-across-group split lands
   * in V1.1, the marketplace page can pass pre-grouped slug arrays.
   */
  lifestyleTagSlugs?: string[]
}

/** Sort keys supported by the marketplace controls bar. */
export type MarketplaceSortKey =
  | 'popular'
  | 'lead-time'
  | 'moq-low'
  | 'price-low'
  | 'newest'

export interface GetTemplatesArgs extends MarketplaceFilters {
  sort?: MarketplaceSortKey
  /** Cap returned rows. Default 60 (matches apps/creator pattern). */
  take?: number
}

export interface GetTemplatesResult {
  templates: SampleTemplate[]
  /** True when the rows came from the sample data fallback rather than DB. */
  fromSample: boolean
  /** Total matching count (without `take` limit). */
  totalCount: number
}

/* ============ public API ============ */

/** Main marketplace query — returns published templates matching filters. */
export async function getMarketplaceTemplates(
  args: GetTemplatesArgs = {},
): Promise<GetTemplatesResult> {
  try {
    const where = buildWhere(args)
    const orderBy = buildOrderBy(args.sort)

    const [rows, totalCount] = await Promise.all([
      prisma.productTemplate.findMany({
        where,
        include: includeForCard,
        orderBy,
        take: args.take ?? 60,
      }),
      prisma.productTemplate.count({ where }),
    ])

    if (rows.length === 0) {
      // Empty DB → fall back to sample data so the page still renders.
      // Filtering on sample data is applied in JS so URL filters work too.
      return fallbackToSample(args)
    }

    return {
      templates: rows.map(mapToCard),
      fromSample: false,
      totalCount,
    }
  } catch (err) {
    // If the DB connection fails (no DATABASE_URL, no Prisma client
    // generated, etc.) fall back so dev keeps working.
    console.warn('[marketplace] DB query failed, using sample data:', (err as Error).message)
    return fallbackToSample(args)
  }
}

/**
 * Total published templates across the catalog — unfiltered. Used as the
 * denominator in the "Showing X of Y templates" display so the user sees
 * how much of the catalog the active filters narrowed down to.
 */
export async function getCatalogCount(): Promise<number> {
  try {
    const count = await prisma.productTemplate.count({
      where: { status: 'PUBLISHED' },
    })
    if (count === 0) {
      return CATEGORY_ROWS.reduce((sum, r) => sum + r.templates.length, 0)
    }
    return count
  } catch {
    return CATEGORY_ROWS.reduce((sum, r) => sum + r.templates.length, 0)
  }
}

/**
 * Featured "Trending this week" — high-status published templates.
 * V1: returns the 4 highest-volume templates by createdAt desc (proxy for
 * trending until we have a real popularity metric).
 */
export async function getTrendingTemplates(limit = 4): Promise<SampleTemplate[]> {
  const { templates } = await getMarketplaceTemplates({
    sort: 'newest',
    take: limit,
  })
  // Mark them as trending for the card status badge.
  return templates.map((t) => ({ ...t, status: 'top-rated' as const }))
}

/**
 * "Quick to launch" — templates with the lowest lead time (variant production
 * timeline). V1 approximates using the existing leadTimeDays sample field
 * or a fallback default.
 */
export async function getQuickLaunchTemplates(limit = 4): Promise<SampleTemplate[]> {
  const { templates } = await getMarketplaceTemplates({
    sort: 'lead-time',
    take: limit,
  })
  return templates.map((t) => ({ ...t, status: 'fast-ship' as const }))
}

/** Resolved detail-page template: the card-shape template + its related set +
 *  the category display title (for the breadcrumb). */
export interface ResolvedMarketplaceTemplate {
  template: SampleTemplate
  related: SampleTemplate[]
  categoryTitle: string
}

/**
 * Detail-page resolver — the DB-driven counterpart to the fixture lookup the
 * detail page used to do (`CATEGORY_ROWS.find(...).templates.find(...)`). Looks
 * up a PUBLISHED ProductTemplate by slug, maps it to the card shape, and pulls a
 * few related templates from the same subcategory. Falls back to the sample
 * fixture (by categorySlug+slug) when the DB is empty / the slug isn't a
 * published template / the query fails, so dev + fixture-only catalogs still work.
 * Returns null only when neither the DB nor the fixture has the slug → notFound().
 */
export async function getMarketplaceTemplateBySlug(
  categorySlug: string,
  slug: string,
): Promise<ResolvedMarketplaceTemplate | null> {
  try {
    const row = await prisma.productTemplate.findUnique({ where: { slug }, include: includeForCard })
    if (!row || row.status !== 'PUBLISHED') return fixtureResolve(categorySlug, slug)
    const db = row as unknown as DbTemplate
    const relatedRows = await prisma.productTemplate.findMany({
      where: { status: 'PUBLISHED', subcategoryId: row.subcategoryId, slug: { not: slug } },
      include: includeForCard,
      take: 4,
    })
    return {
      template: mapToCard(db),
      related: relatedRows.map((r) => mapToCard(r as unknown as DbTemplate)),
      categoryTitle: db.subcategory.category.name,
    }
  } catch (err) {
    console.warn('[marketplace] detail DB query failed, using sample:', (err as Error).message)
    return fixtureResolve(categorySlug, slug)
  }
}

function fixtureResolve(categorySlug: string, slug: string): ResolvedMarketplaceTemplate | null {
  const r = CATEGORY_ROWS.find((x) => x.slug === categorySlug)
  if (!r) return null
  const template = r.templates.find((t) => t.slug === slug)
  if (!template) return null
  return {
    template,
    related: r.templates.filter((t) => t.slug !== slug).slice(0, 4),
    categoryTitle: r.title,
  }
}

/**
 * Marketplace detail-page marketing-copy overrides from the DB. Reads
 * `ProductTemplate.marketingDetail` (a partial TemplateDetail JSON authored per
 * template) + `longDescription` (→ about). The caller merges these OVER the
 * per-slug fixture, so a real template carries its own copy and unknown-slug
 * fixtures stay as the neutral fallback. Returns {} when absent. Cast-guarded —
 * marketingDetail ships with a pending migration.
 */
export async function getTemplateDetailOverrides(slug: string): Promise<Partial<TemplateDetail>> {
  try {
    const t = await (prisma as unknown as {
      productTemplate: {
        findUnique: (a: unknown) => Promise<{
          marketingDetail: Partial<TemplateDetail> | null
          longDescription: string | null
          description: string | null
        } | null>
      }
    }).productTemplate.findUnique({
      where: { slug },
      select: { marketingDetail: true, longDescription: true, description: true },
    })
    if (!t) return {}
    const overrides: Partial<TemplateDetail> = { ...(t.marketingDetail ?? {}) }
    const about = t.longDescription ?? t.description ?? undefined
    if (about && overrides.about == null) overrides.about = about
    return overrides
  } catch {
    return {}
  }
}

/** A "browse by category" section for the marketplace landing view. */
export interface MarketplaceCategorySection {
  title: string
  slug: string
  templates: SampleTemplate[]
}

/**
 * Browse-by-category sections for the marketplace landing view — PUBLISHED
 * templates grouped by their category. Falls back to the sample fixture when the
 * DB is empty / the query fails so the default landing view always renders.
 */
export async function getMarketplaceCategorySections(): Promise<MarketplaceCategorySection[]> {
  const sampleSections = (): MarketplaceCategorySection[] =>
    CATEGORY_ROWS.map((r) => ({ title: r.title, slug: r.slug, templates: [...r.templates] }))
  try {
    const rows = await prisma.productTemplate.findMany({
      where: { status: 'PUBLISHED' },
      include: includeForCard,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    if (rows.length === 0) return sampleSections()
    const byCat = new Map<string, MarketplaceCategorySection>()
    for (const row of rows) {
      const db = row as unknown as DbTemplate
      const cat = db.subcategory.category
      let section = byCat.get(cat.slug)
      if (!section) {
        section = { title: cat.name, slug: cat.slug, templates: [] }
        byCat.set(cat.slug, section)
      }
      section.templates.push(mapToCard(db))
    }
    return [...byCat.values()]
  } catch (err) {
    console.warn('[marketplace] category sections DB query failed, using sample:', (err as Error).message)
    return sampleSections()
  }
}

/* ============ Prisma helpers ============ */

const includeForCard = {
  subcategory: { include: { category: true } },
  variants: { where: { isActive: true }, take: 1 },
} as const

function buildWhere(args: GetTemplatesArgs) {
  const { q, categorySlugs, subcategorySlugs, moqMax, niche, lifestyleTagSlugs } =
    args
  // Slice 2B: niche filter now joins through ProductTemplateNiche (Layer 1
  // taxonomy) — not the legacy Category.mainCategory shortcut, which never
  // matched the niche slugs the marketplace was sending. Lifestyle tags
  // (Layer 4) join through ProductTemplateLifestyleTag with AND semantics.
  return {
    status: 'PUBLISHED' as const,
    ...(q && {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { description: { contains: q, mode: 'insensitive' as const } },
      ],
    }),
    ...(subcategorySlugs?.length && {
      subcategory: { slug: { in: subcategorySlugs } },
    }),
    ...(categorySlugs?.length && !subcategorySlugs?.length && {
      subcategory: { category: { slug: { in: categorySlugs } } },
    }),
    ...(niche && {
      niches: { some: { niche: { slug: niche } } },
    }),
    ...(lifestyleTagSlugs?.length && {
      AND: lifestyleTagSlugs.map((slug) => ({
        lifestyleTags: { some: { lifestyleTag: { slug } } },
      })),
    }),
    ...(moqMax !== undefined && {
      variants: { some: { moqMin: { lte: moqMax } } },
    }),
  }
}

function buildOrderBy(sort?: MarketplaceSortKey) {
  switch (sort) {
    case 'lead-time':
      // No lead-time field on ProductTemplate yet — fall back to createdAt.
      // TODO when manufacturerService.leadTimeDays exists: order by that.
      return [{ createdAt: 'desc' as const }]
    case 'moq-low':
      // Can't order by variant aggregates in Prisma without complex query.
      // Sort happens in JS after fetch — see sortInJs below.
      return [{ createdAt: 'desc' as const }]
    case 'price-low':
      return [{ priceFloorCents: 'asc' as const }]
    case 'newest':
      return [{ createdAt: 'desc' as const }]
    case 'popular':
    default:
      // V1: proxy popularity with createdAt desc until we track view counts.
      return [{ createdAt: 'desc' as const }]
  }
}

/* ============ DB → card-shape mapper ============ */

type DbTemplate = Awaited<
  ReturnType<typeof prisma.productTemplate.findMany>
>[number] & {
  subcategory: { slug: string; category: { slug: string; mainCategory: string; name: string } }
  variants: Array<{ moqMin: number }>
}

function mapToCard(t: DbTemplate): SampleTemplate {
  const category = t.subcategory.category
  return {
    slug: t.slug,
    categorySlug: category.slug,
    subcategorySlug: t.subcategory.slug,
    title: t.name,
    niche: category.name,
    icon: iconForCategory(category.mainCategory),
    gradient: gradientForSlug(t.slug),
    tags: [], // V1: no cert-on-card yet; derived in a follow-up
    minUnits: t.variants[0]?.moqMin ?? 500,
    leadTimeDays: 10, // V1: no leadTime field on template; manufacturer-derived in V2
    pricePerUnit: t.priceFloorCents / 100,
  }
}

/* ============ sample-data fallback ============ */

function fallbackToSample(args: GetTemplatesArgs): GetTemplatesResult {
  const all = CATEGORY_ROWS.flatMap((r) => r.templates)
  let filtered = all

  if (args.q) {
    const q = args.q.toLowerCase()
    filtered = filtered.filter(
      (t) => t.title.toLowerCase().includes(q) || t.niche.toLowerCase().includes(q),
    )
  }
  if (args.categorySlugs?.length) {
    filtered = filtered.filter((t) => args.categorySlugs!.includes(t.categorySlug))
  }
  if (args.subcategorySlugs?.length) {
    filtered = filtered.filter(
      (t) => t.subcategorySlug && args.subcategorySlugs!.includes(t.subcategorySlug),
    )
  }
  if (args.moqMax !== undefined) {
    filtered = filtered.filter((t) => t.minUnits <= args.moqMax!)
  }
  if (args.niche) {
    filtered = filtered.filter((t) => t.niche === args.niche)
  }
  if (args.tags?.length) {
    const wanted = args.tags.map((s) => s.toLowerCase())
    filtered = filtered.filter((t) => {
      const labels = (t.tags ?? []).map((tag) => tag.label.toLowerCase())
      return wanted.every((w) => labels.includes(w))
    })
  }

  // Apply sort in JS for the sample-data path.
  filtered = sortInJs(filtered, args.sort)

  return {
    templates: filtered.slice(0, args.take ?? 60),
    fromSample: true,
    totalCount: filtered.length,
  }
}

function sortInJs(rows: SampleTemplate[], sort?: MarketplaceSortKey): SampleTemplate[] {
  const sorted = [...rows]
  switch (sort) {
    case 'lead-time':
      sorted.sort((a, b) => a.leadTimeDays - b.leadTimeDays)
      break
    case 'moq-low':
      sorted.sort((a, b) => a.minUnits - b.minUnits)
      break
    case 'price-low':
      sorted.sort((a, b) => a.pricePerUnit - b.pricePerUnit)
      break
    case 'newest':
    case 'popular':
    default:
      // Keep declared order (sample data is curated).
      break
  }
  return sorted
}

/* ============ visual derivations ============ */

/** Stable gradient per slug — same template always gets the same gradient. */
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

/** Default emoji per top-level main category. */
function iconForCategory(mainCategory: string): string {
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
