import 'server-only'
import { prisma, Prisma } from '@ilaunchify/db'
import type { ProductGradient } from '@ilaunchify/ui'
import { effectiveFlavorLead } from '@ilaunchify/ui'
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
   * selected tag). Kept for back-compat; the grouped diet/audience/trend
   * params below are the §7 surface (OR within group, AND across groups).
   */
  lifestyleTagSlugs?: string[]

  /* ===== §7 full filter set (docs/MARKETPLACE_DESIGN.md, 2026-06-18) ===== */
  /** Format (Layer 3) — single ManufacturingFormat enum value (e.g. 'POWDER'). */
  format?: string
  /** Diet — LifestyleTag LIFESTYLE-group slugs. OR within the group. */
  dietSlugs?: string[]
  /** Audience — LifestyleTag AUDIENCE-group slugs. OR within the group. */
  audienceSlugs?: string[]
  /** Trend — LifestyleTag TREND-group slugs (More-filters). OR within. */
  trendSlugs?: string[]
  /** Lead-time bucket: 'lt2w' | '2-4w' | '4-8w' | '8w+' (variant leadTimeDays). */
  leadBucket?: string
  /** Market code (single-select): 'US' | 'CA' | 'EU'. */
  marketCode?: string
  /** Certification slugs (More-filters) — CertificateType.slug, VERIFIED only. */
  certSlugs?: string[]
  /** Allergen-free claim slugs (More-filters): 'dairy-free','gluten-free',… */
  allergenFreeSlugs?: string[]
  /** Manufacturing-process slugs (More-filters): 'cold-pressed','freeze-dried',… */
  processSlugs?: string[]
  /** Packaging parent groups — ContainerCategory values (e.g. 'BOTTLE','POUCH'). */
  packagingParents?: string[]
  /** Packaging child types — PackagingType.slug. */
  packagingChildren?: string[]

  /* ===== Commerce filters (2026-06-30) ===== */
  /** Max per-unit price in CENTS (ProductTemplate.priceFloorCents ≤ this). */
  maxPriceCents?: number
  /** Max net content (numeric, unit-agnostic) — variant.netContentValue ≤ this. */
  maxNetContent?: number
  /** Build-your-own / pick-N only (packingProfile.isCustomizable). */
  customizableOnly?: boolean
  /** Multi-flavor / variety packs only (MULTI packing or maxFlavorsPerPack > 1). */
  varietyOnly?: boolean
  /** Has at least one enabled sample option. */
  sampleOnly?: boolean
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

    const heroMap = await getHeroImageMap(rows.map((r) => ({ id: r.id, imageAssetId: r.imageAssetId })))
    return {
      templates: rows.map((r) => mapToCard(r as unknown as DbTemplate, heroMap.get(r.id))),
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
    const heroMap = await getHeroImageMap(
      [row, ...relatedRows].map((r) => ({ id: r.id, imageAssetId: r.imageAssetId })),
    )
    return {
      template: mapToCard(db, heroMap.get(db.id)),
      related: relatedRows.map((r) => mapToCard(r as unknown as DbTemplate, heroMap.get(r.id))),
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
    const heroMap = await getHeroImageMap(rows.map((r) => ({ id: r.id, imageAssetId: r.imageAssetId })))
    const byCat = new Map<string, MarketplaceCategorySection>()
    for (const row of rows) {
      const db = row as unknown as DbTemplate
      const cat = db.subcategory.category
      let section = byCat.get(cat.slug)
      if (!section) {
        section = { title: cat.name, slug: cat.slug, templates: [] }
        byCat.set(cat.slug, section)
      }
      section.templates.push(mapToCard(db, heroMap.get(db.id)))
    }
    return [...byCat.values()]
  } catch (err) {
    console.warn('[marketplace] category sections DB query failed, using sample:', (err as Error).message)
    return sampleSections()
  }
}

/** Category header info for the /marketplace/[category] page. */
export interface MarketplaceCategoryInfo {
  slug: string
  title: string
  /** Product domain (LabelingType) this category belongs to — scopes the Format /
   *  Manufacturing-process filters to relevant options. null when unknown (fixture). */
  domain?: string | null
}

/**
 * Resolve a category by slug from the DB (name + active check), so the category
 * page header + notFound come from real data, not the CATEGORY_ROWS fixture.
 * Falls back to the fixture title when the DB is empty / errors; returns null
 * only when neither knows the slug → notFound().
 */
export async function getMarketplaceCategory(slug: string): Promise<MarketplaceCategoryInfo | null> {
  const fixture = (): MarketplaceCategoryInfo | null => {
    const r = CATEGORY_ROWS.find((x) => x.slug === slug)
    return r ? { slug: r.slug, title: r.title } : null
  }
  try {
    // labelingType is cast-guarded (pending-migration column on Category).
    const cat = await (prisma as unknown as {
      category: { findUnique: (a: unknown) => Promise<{ slug: string; name: string; isActive: boolean; labelingType: string | null } | null> }
    }).category.findUnique({
      where: { slug },
      select: { slug: true, name: true, isActive: true, labelingType: true },
    })
    if (cat && cat.isActive !== false) return { slug: cat.slug, title: cat.name, domain: cat.labelingType }
    // Inactive or missing in DB → fixture (keeps demo categories rendering).
    return fixture() ?? (cat ? { slug: cat.slug, title: cat.name, domain: cat.labelingType } : null)
  } catch {
    return fixture()
  }
}

/**
 * Count of PUBLISHED templates in a category (the catalog denominator the
 * category page shows). Fixture count fallback when the DB is empty.
 */
export async function getCategoryTemplateCount(slug: string): Promise<number> {
  const fixtureCount = () => CATEGORY_ROWS.find((x) => x.slug === slug)?.templates.length ?? 0
  try {
    const n = await prisma.productTemplate.count({
      where: { status: 'PUBLISHED', subcategory: { category: { slug } } },
    })
    return n > 0 ? n : fixtureCount()
  } catch {
    return fixtureCount()
  }
}

/* ============ Prisma helpers ============ */

const includeForCard = {
  subcategory: { include: { category: true } },
  // All active variants (not take:1) so the card can show the LOWEST MOQ + lead
  // time across them ("from" semantics).
  variants: { where: { isActive: true }, select: { moqMin: true, leadTimeDays: true } },
  // Lifestyle tags → card chips (diet/cert-ish). Capped to 3 in mapToCard.
  lifestyleTags: { include: { lifestyleTag: { select: { name: true, slug: true } } } },
  // Active flavor presets' per-flavor lead overrides — GLOBAL FLOOR model
  // (docs/PER_FLAVOR_RECIPES.md §4): the card lead rises only when a flavor
  // extends the product standard. leadTimeDays is a real column post-push; reads
  // are cast-guarded in mapToCard (the DbTemplate intersection types it optional).
  // The whole include is cast to Prisma.ProductTemplateInclude because the
  // (possibly stale) generated client may not yet type FlavorPreset.leadTimeDays.
  flavorPresets: { where: { status: 'ACTIVE' }, select: { leadTimeDays: true } },
  // Earned manufacturer badge (Merit) → anonymous trust tier on the PDP. Tier only;
  // NEVER the partner name/location (orchestration thesis — no partner identity).
  manufacturerService: { select: { partner: { select: { tier: true } } } },
} as Prisma.ProductTemplateInclude

/** Lead-time bucket → variant leadTimeDays range (days). */
function leadRange(bucket?: string): { gte?: number; lte?: number } | undefined {
  switch (bucket) {
    case 'lt2w':
      return { lte: 14 }
    case '2-4w':
      return { gte: 15, lte: 28 }
    case '4-8w':
      return { gte: 29, lte: 56 }
    case '8w+':
      return { gte: 57 }
    default:
      return undefined
  }
}

function buildWhere(args: GetTemplatesArgs): Prisma.ProductTemplateWhereInput {
  const {
    q, categorySlugs, subcategorySlugs, moqMax, niche, lifestyleTagSlugs,
    format, dietSlugs, audienceSlugs, trendSlugs, leadBucket, marketCode,
    certSlugs, allergenFreeSlugs, processSlugs, packagingParents, packagingChildren,
    maxPriceCents, maxNetContent, customizableOnly, varietyOnly, sampleOnly,
  } = args

  // §7 semantics: OR within a group, AND across groups. Each clause that must
  // co-hold is pushed into `and`; clauses with a single field stay top-level.
  const and: Record<string, unknown>[] = []

  // Lifestyle groups (Layer 4) — Diet / Audience / Trend. OR within each group.
  const lifeGroup = (slugs?: string[]) => {
    if (slugs?.length) {
      and.push({ lifestyleTags: { some: { lifestyleTag: { slug: { in: slugs } } } } })
    }
  }
  lifeGroup(dietSlugs)
  lifeGroup(audienceSlugs)
  lifeGroup(trendSlugs)
  // Legacy generic tag list (AND per tag) — kept for back-compat `?tag=`.
  if (lifestyleTagSlugs?.length) {
    for (const slug of lifestyleTagSlugs) {
      and.push({ lifestyleTags: { some: { lifestyleTag: { slug } } } })
    }
  }

  // Certifications (More-filters) — VERIFIED instances of the selected types.
  if (certSlugs?.length) {
    and.push({
      certificates: {
        some: {
          instance: { status: 'VERIFIED', certificateType: { slug: { in: certSlugs } } },
        },
      },
    })
  }

  // Variant-scoped numeric/relation filters (MOQ, lead time, packaging).
  if (moqMax !== undefined) and.push({ variants: { some: { moqMin: { lte: moqMax } } } })
  const lead = leadRange(leadBucket)
  if (lead) and.push({ variants: { some: { leadTimeDays: lead } } })
  if (packagingParents?.length) {
    and.push({ variants: { some: { packagingType: { containerCategory: { in: packagingParents } } } } })
  }
  if (packagingChildren?.length) {
    and.push({ variants: { some: { packagingType: { slug: { in: packagingChildren } } } } })
  }

  // Commerce filters (2026-06-30).
  if (typeof maxNetContent === 'number') {
    and.push({ variants: { some: { netContentValue: { lte: maxNetContent } } } })
  }
  // Multi-flavor / variety: MULTI packing profile OR a variety pack (max flavors > 1).
  if (varietyOnly) {
    and.push({ OR: [{ packingProfile: { flavorMode: 'MULTI' } }, { maxFlavorsPerPack: { gt: 1 } }] })
  }

  const where: Record<string, unknown> = {
    status: 'PUBLISHED',
    ...(q && {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
    }),
    ...(subcategorySlugs?.length && { subcategory: { slug: { in: subcategorySlugs } } }),
    ...(categorySlugs?.length && !subcategorySlugs?.length && {
      subcategory: { category: { slug: { in: categorySlugs } } },
    }),
    ...(niche && { niches: { some: { niche: { slug: niche } } } }),
    // New §7 dimensions (cast at return — these columns ship with a pending
    // migration so the generated client may not type them yet).
    ...(format && { manufacturingFormat: format }),
    ...(marketCode && { marketCodes: { has: marketCode } }),
    ...(allergenFreeSlugs?.length && { allergenFreeClaims: { hasSome: allergenFreeSlugs } }),
    ...(processSlugs?.length && { manufacturingProcesses: { hasSome: processSlugs } }),
    // Commerce filters that map to a single top-level field/relation.
    ...(typeof maxPriceCents === 'number' && { priceFloorCents: { lte: maxPriceCents } }),
    ...(customizableOnly && { packingProfile: { isCustomizable: true } }),
    ...(sampleOnly && { sampleOptions: { some: { enabled: true } } }),
    ...(and.length ? { AND: and } : {}),
  }
  return where as unknown as Prisma.ProductTemplateWhereInput
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
      // Merit perk — marketplace ranking boost (docs/PARTNER_TIER_VS_MERIT.md
      // "new perk model"): on the DEFAULT / recommended view, a manufacturer's
      // earned badge lifts its products up (Premier > Trusted > Verified — the
      // PartnerTier enum's declared order), then newest within a badge. A NUDGE,
      // not a takeover: the explicit sorts (Newest / Price / MOQ / Lead-time) are
      // left pure, so a new shop always surfaces there and within a badge recency
      // wins. Inert while standing is uniform (all Verified during merit shadow) —
      // it activates naturally as badges diverge. Products with no manufacturer
      // pinned are an edge case (owner-pinned model) and simply order by createdAt.
      return [
        { manufacturerService: { partner: { tier: 'desc' as const } } },
        { createdAt: 'desc' as const },
      ]
  }
}

/* ============ DB → card-shape mapper ============ */

type DbTemplate = Awaited<
  ReturnType<typeof prisma.productTemplate.findMany>
>[number] & {
  subcategory: { slug: string; category: { slug: string; mainCategory: string; name: string } }
  variants: Array<{ moqMin: number; leadTimeDays: number }>
  lifestyleTags?: Array<{ lifestyleTag: { name: string; slug: string } }>
  // Rating columns ship with a pending migration; typed via the intersection so
  // reads compile against the (possibly stale) generated client.
  ratingAvg?: number | null
  ratingCount?: number
  // Manufacturing process slugs (ProductTemplate.manufacturingProcesses) — drives
  // the PDP "Process" fact. Empty/absent → the page shows "--".
  manufacturingProcesses?: string[]
  // Per-flavor recipes — GLOBAL FLOOR lead model (docs/PER_FLAVOR_RECIPES.md §4).
  // `leadTimeRepeatDays` = product standard (global) lead; flavorPresets' leadTimeDays
  // are optional per-flavor extensions. Both post-date some generated clients →
  // typed optional so reads compile (cast-guarded at use).
  leadTimeRepeatDays?: number | null
  flavorPresets?: Array<{ leadTimeDays: number | null }>
  // Earned manufacturer badge (Merit) — tier only, no identity. Optional so reads
  // compile against a possibly-stale client / null-manufacturer templates.
  manufacturerService?: { partner: { tier: string | null } | null } | null
}

/**
 * Card lead — GLOBAL FLOOR model (docs/PER_FLAVOR_RECIPES.md §4). The product
 * STANDARD lead (`leadTimeRepeatDays`) is the floor; the card rises only when a
 * flavor extends it: `max(standard, max effective flavor lead)`. No changeover —
 * the card is the static worst-case display value, not a live order quote.
 *
 * Fallback: when the standard is unset (non-migrated products) we keep the prior
 * min-variant value so existing cards are byte-for-byte unchanged. All reads are
 * cast-guarded by the optional DbTemplate fields.
 */
function computeCardLead(t: DbTemplate, variantLeads: number[]): number {
  const minVariant = variantLeads.length ? Math.min(...variantLeads) : 10
  const standard = t.leadTimeRepeatDays
  if (standard == null) return minVariant // non-migrated → unchanged
  const flavorLeads = (t.flavorPresets ?? []).map((f) => f.leadTimeDays ?? null)
  // Floor at the standard; a flavor only raises it (effectiveFlavorLead).
  return flavorLeads.reduce<number>(
    (max, f) => Math.max(max, effectiveFlavorLead(f, standard)),
    standard,
  )
}

function mapToCard(t: DbTemplate, heroUrl?: string): SampleTemplate {
  const category = t.subcategory.category
  const moqs = t.variants.map((v) => v.moqMin).filter((n): n is number => typeof n === 'number')
  const leads = t.variants.map((v) => v.leadTimeDays).filter((n): n is number => typeof n === 'number')
  // Card lead — GLOBAL FLOOR (docs/PER_FLAVOR_RECIPES.md §4): the product STANDARD
  // lead is the floor; the card rises only when a flavor extends it
  // (max(standard, max flavor lead)). When the standard is unset (non-migrated
  // products), keep the current min-variant value so cards are unchanged.
  const cardLead = computeCardLead(t, leads)
  // Card chips from lifestyle tags (real data, domain-agnostic). Cap 3 for density.
  const tags = (t.lifestyleTags ?? []).slice(0, 3).map((j) => ({
    label: j.lifestyleTag.name,
    organic: j.lifestyleTag.slug === 'organic',
  }))
  return {
    templateId: t.id,
    slug: t.slug,
    categorySlug: category.slug,
    subcategorySlug: t.subcategory.slug,
    title: t.name,
    niche: category.name,
    icon: iconForCategory(category.mainCategory),
    gradient: gradientForSlug(t.slug),
    imageUrl: heroUrl, // real product hero when available; card falls back to gradient
    tags,
    minUnits: moqs.length ? Math.min(...moqs) : 500,
    leadTimeDays: cardLead,
    pricePerUnit: t.priceFloorCents / 100,
    ratingAvg: t.ratingAvg ?? null,
    ratingCount: t.ratingCount ?? 0,
    processSlugs: t.manufacturingProcesses ?? [],
    // Anonymous earned badge — only elevated tiers surface (Verified = baseline).
    manufacturerBadge:
      t.manufacturerService?.partner?.tier === 'TRUSTED' || t.manufacturerService?.partner?.tier === 'PREMIER'
        ? (t.manufacturerService.partner.tier as 'TRUSTED' | 'PREMIER')
        : null,
  }
}

/**
 * Batch-resolve the hero image URL per template (one query). Assets are stored
 * with ownerType 'PRODUCT' + ownerId = template id; the hero is the one whose id
 * matches ProductTemplate.imageAssetId, else the earliest. Returns a Map of
 * templateId → publicUrl; empty on error so cards fall back to the gradient.
 */
async function getHeroImageMap(
  rows: Array<{ id: string; imageAssetId: string | null }>,
): Promise<Map<string, string>> {
  const ids = rows.map((r) => r.id)
  if (ids.length === 0) return new Map()
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
      const heroId = heroIdByOwner.get(owner)
      const hero = list.find((x) => x.id === heroId) ?? list[0]
      if (hero) out.set(owner, hero.url)
    }
    return out
  } catch {
    return new Map()
  }
}

/**
 * All public images for one template's detail-page gallery (hero first), so the
 * gallery shows real product shots instead of the emoji+gradient placeholder.
 * Returns [] on empty/error → the gallery falls back to the placeholder.
 */
export async function getTemplateGalleryImages(slug: string): Promise<string[]> {
  try {
    const tpl = await prisma.productTemplate.findUnique({
      where: { slug },
      select: { id: true, imageAssetId: true },
    })
    if (!tpl) return []
    const assets = await prisma.asset.findMany({
      where: {
        ownerType: 'PRODUCT',
        ownerId: tpl.id,
        type: { in: ['PRODUCT_IMAGE', 'HERO_IMAGE'] },
        publicUrl: { not: null },
      },
      select: { id: true, publicUrl: true },
      orderBy: { createdAt: 'asc' },
    })
    return [...assets]
      .sort((a, b) => (a.id === tpl.imageAssetId ? -1 : b.id === tpl.imageAssetId ? 1 : 0))
      .map((a) => a.publicUrl as string)
  } catch {
    return []
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
