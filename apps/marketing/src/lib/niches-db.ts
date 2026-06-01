import 'server-only'
import { unstable_cache } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import type { ProductGradient } from '@ilaunchify/ui'
import { NICHES as HARDCODED_NICHES, type Niche as HardcodedNiche } from './niches'

/**
 * Slice 2B — DB-driven Niche loader for the marketing app.
 *
 * Dual-source model: the DB owns the canonical Niche row (slug, name,
 * description, iconEmoji, accentHex, displayOrder, isActive) and the junction
 * table NicheSubcategory; the hardcoded `niches.ts` file still owns the
 * marketing-copy layer (shortName, tagline, gradient) until that copy moves
 * into the DB later.
 *
 * Behaviour:
 *  - Reads only active niches, ordered by displayOrder asc.
 *  - Each row is hydrated by JOINing the matching `niches.ts` entry on slug.
 *  - When a DB row has no hardcoded twin, we fall back to safe defaults and
 *    log a warning so the marketplace doesn't go blank.
 *  - When the DB returns zero rows (fresh dev install pre-migration / seed),
 *    we fall back to the FULL hardcoded `NICHES` list — same reason.
 *  - The loaders are wrapped in `unstable_cache` with a 30s TTL and a
 *    'marketplace-niches' tag so admin CRUD can revalidate via
 *    `revalidateTag('marketplace-niches')`.
 *
 * Cache key strategy: niche queries are global (no user context), so cache
 * by function name only. The `loadNicheBySlug` cache picks up the slug
 * automatically via unstable_cache's argument-aware keying.
 */

/** Shape returned to consumers — merges DB row + hardcoded marketing copy. */
export interface MarketplaceNiche {
  slug: string
  name: string
  /** Subnav label — from hardcoded `niches.ts` (marketing-copy layer). */
  shortName: string
  /** Niche-landing hero tagline — from hardcoded `niches.ts`. */
  tagline: string
  description: string
  /** Emoji — DB iconEmoji wins; hardcoded `icon` is the fallback. */
  icon: string
  /** Hero gradient — from hardcoded `niches.ts` (gradient enum). */
  gradient: ProductGradient
  /** Hex accent — DB row. */
  accentHex: string
  /** Subcategory slugs surfaced via NicheSubcategory junction (Layer 2 ↔ 1). */
  subcategorySlugs: string[]
  /** Optional — populated when callers ask for it. */
  productCount?: number
}

/** Hardcoded fallback row → MarketplaceNiche shape (used when DB is empty). */
function fromHardcoded(h: HardcodedNiche): MarketplaceNiche {
  return {
    slug: h.slug,
    name: h.name,
    shortName: h.shortName,
    tagline: h.tagline,
    description: h.description,
    icon: h.icon,
    gradient: h.gradient,
    // The DB's accentHex isn't expressed in `niches.ts` (only ProductGradient
    // is). Fall back to a neutral brand pink — only used in the rare empty-
    // DB path, so safe.
    accentHex: '#FF2E63',
    subcategorySlugs: [],
  }
}

/** Hydrate a DB row by JOINing with the matching hardcoded entry. */
function hydrate(
  db: {
    slug: string
    name: string
    description: string | null
    iconEmoji: string | null
    accentHex: string | null
    subcategories: Array<{ subcategory: { slug: string } }>
  },
): MarketplaceNiche {
  const hard = HARDCODED_NICHES.find((n) => n.slug === db.slug)
  if (!hard) {
    console.warn(
      `[niches-db] DB niche "${db.slug}" has no matching entry in niches.ts — ` +
        'using fallback marketing copy. Add it to apps/marketing/src/lib/niches.ts ' +
        'or move the copy into the DB.',
    )
  }
  return {
    slug: db.slug,
    name: db.name,
    shortName: hard?.shortName ?? db.name,
    tagline: hard?.tagline ?? `${db.name} brands.`,
    description: db.description ?? hard?.description ?? '',
    // DB iconEmoji takes precedence; fall back to the hardcoded icon, then a
    // neutral package emoji.
    icon: db.iconEmoji ?? hard?.icon ?? '📦',
    gradient: hard?.gradient ?? 'pink',
    accentHex: db.accentHex ?? '#FF2E63',
    subcategorySlugs: db.subcategories.map((s) => s.subcategory.slug),
  }
}

/* ============ cached DB readers ============ */

/**
 * Load every active niche, ordered by displayOrder asc. Falls back to the
 * full hardcoded list when the DB is empty (fresh install, migration not
 * yet run).
 *
 * Cached for 30s, tagged 'marketplace-niches' so admin CRUD writes can
 * revalidate the whole marketplace surface in one call.
 */
export const loadActiveNiches = unstable_cache(
  async (): Promise<MarketplaceNiche[]> => {
    try {
      const rows = await prisma.niche.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
        include: {
          subcategories: {
            orderBy: { displayOrder: 'asc' },
            include: { subcategory: { select: { slug: true } } },
          },
        },
      })

      if (rows.length === 0) {
        console.warn(
          '[niches-db] zero active niches in DB — falling back to hardcoded ' +
            'NICHES list. Run `pnpm --filter @ilaunchify/db seed` to populate.',
        )
        return HARDCODED_NICHES.map(fromHardcoded)
      }

      return rows.map(hydrate)
    } catch (err) {
      // No DB connection / Prisma client not generated → fall back so the
      // app keeps rendering during dev bootstrapping.
      console.warn(
        '[niches-db] loadActiveNiches failed, falling back to hardcoded:',
        (err as Error).message,
      )
      return HARDCODED_NICHES.map(fromHardcoded)
    }
  },
  ['marketing.loadActiveNiches'],
  { revalidate: 30, tags: ['marketplace-niches'] },
)

/**
 * Load one niche by slug. Returns null when the slug is not found.
 *
 * Same fallback semantics as loadActiveNiches: empty DB → resolves from the
 * hardcoded list so /launch/[niche] keeps working pre-seed.
 */
export const loadNicheBySlug = unstable_cache(
  async (slug: string): Promise<MarketplaceNiche | null> => {
    try {
      const row = await prisma.niche.findUnique({
        where: { slug },
        include: {
          subcategories: {
            orderBy: { displayOrder: 'asc' },
            include: { subcategory: { select: { slug: true } } },
          },
        },
      })

      if (!row) {
        // Two cases: (1) DB has rows but none with this slug → genuine 404.
        // (2) DB is empty → check the hardcoded list as a fallback so devs
        // can still hit /launch/[niche] pre-seed.
        const anyNiche = await prisma.niche.count()
        if (anyNiche === 0) {
          const hard = HARDCODED_NICHES.find((n) => n.slug === slug)
          return hard ? fromHardcoded(hard) : null
        }
        return null
      }

      if (!row.isActive) return null
      return hydrate(row)
    } catch (err) {
      console.warn(
        '[niches-db] loadNicheBySlug failed, falling back to hardcoded:',
        (err as Error).message,
      )
      const hard = HARDCODED_NICHES.find((n) => n.slug === slug)
      return hard ? fromHardcoded(hard) : null
    }
  },
  ['marketing.loadNicheBySlug'],
  { revalidate: 30, tags: ['marketplace-niches'] },
)
