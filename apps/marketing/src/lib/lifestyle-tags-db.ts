import 'server-only'
import { unstable_cache } from 'next/cache'
import { prisma } from '@ilaunchify/db'

/**
 * Slice 2B — DB-driven LifestyleTag loader.
 *
 * Lifestyle tags are Layer 4 of the marketplace taxonomy
 * (docs/MARKETPLACE_DESIGN.md §2 + schema enum LifestyleTagGroup):
 *
 *   LIFESTYLE   — Keto, Paleo, Vegan, Gluten-free, …
 *   AUDIENCE    — Kids, Adults, Athletes, …
 *   TREND       — Functional, Adaptogenic, Sleep, Immunity, …
 *
 * Used by:
 *  - /marketplace filter chip rail (multi-select, URL-driven `?tag=keto&tag=vegan`)
 *  - product detail page chip strip
 *  - /launch/[niche] surfaces (V2)
 *
 * Cached for 30s, tagged 'marketplace-niches' so admin CRUD can revalidate
 * with one call (sharing the tag with niche loaders keeps the cache surface
 * tiny).
 */

export type LifestyleTagGroup = 'LIFESTYLE' | 'AUDIENCE' | 'TREND'

export interface MarketplaceLifestyleTag {
  slug: string
  name: string
  group: LifestyleTagGroup
  description: string | null
  iconEmoji: string | null
  accentHex: string | null
}

export interface LifestyleTagGroups {
  lifestyle: MarketplaceLifestyleTag[]
  audience: MarketplaceLifestyleTag[]
  trend: MarketplaceLifestyleTag[]
}

/** Empty group bucket. */
const EMPTY: LifestyleTagGroups = { lifestyle: [], audience: [], trend: [] }

/** Load all active lifestyle tags, grouped by their LifestyleTagGroup enum. */
export const loadLifestyleTagGroups = unstable_cache(
  async (): Promise<LifestyleTagGroups> => {
    try {
      const rows = await prisma.lifestyleTag.findMany({
        where: { isActive: true },
        orderBy: [{ group: 'asc' }, { displayOrder: 'asc' }],
        select: {
          slug: true,
          name: true,
          group: true,
          description: true,
          iconEmoji: true,
          accentHex: true,
        },
      })
      const out: LifestyleTagGroups = {
        lifestyle: [],
        audience: [],
        trend: [],
      }
      for (const r of rows) {
        const entry: MarketplaceLifestyleTag = {
          slug: r.slug,
          name: r.name,
          group: r.group as LifestyleTagGroup,
          description: r.description,
          iconEmoji: r.iconEmoji,
          accentHex: r.accentHex,
        }
        if (r.group === 'LIFESTYLE') out.lifestyle.push(entry)
        else if (r.group === 'AUDIENCE') out.audience.push(entry)
        else if (r.group === 'TREND') out.trend.push(entry)
      }
      return out
    } catch (err) {
      console.warn(
        '[lifestyle-tags-db] loadLifestyleTagGroups failed:',
        (err as Error).message,
      )
      return EMPTY
    }
  },
  ['marketing.loadLifestyleTagGroups'],
  { revalidate: 30, tags: ['marketplace-niches'] },
)

/** Load a flat list, used when callers just want everything in declared order. */
export async function loadActiveLifestyleTags(): Promise<MarketplaceLifestyleTag[]> {
  const groups = await loadLifestyleTagGroups()
  return [...groups.lifestyle, ...groups.audience, ...groups.trend]
}
