import 'server-only'
import { prisma } from '@ilaunchify/db'

/**
 * Slice 2B — product-detail-page taxonomy chips.
 *
 * For a given ProductTemplate slug, return:
 *  - niches[]        — Layer 1 niches the template is tagged with
 *  - lifestyleTags[] — Layer 4 lifestyle/audience/trend tags
 *
 * The detail page renders both as small pill chip strips below the
 * product title (linking to /launch/<niche> and /marketplace?tag=<slug>
 * respectively). When the template carries zero of either, the page
 * hides the strip — same graceful-degradation pattern as the niche
 * landing page.
 *
 * Throws are swallowed — empty arrays return so the page never breaks.
 * Not cached (per-slug + low-frequency surface; tag the cache only when
 * we observe real load).
 */

export interface ProductNicheChip {
  slug: string
  name: string
  iconEmoji: string | null
  accentHex: string | null
}

export interface ProductLifestyleTagChip {
  slug: string
  name: string
  group: string
  iconEmoji: string | null
}

export interface ProductTaxonomyChips {
  niches: ProductNicheChip[]
  lifestyleTags: ProductLifestyleTagChip[]
}

const EMPTY: ProductTaxonomyChips = { niches: [], lifestyleTags: [] }

export async function getProductTaxonomyChips(
  templateSlug: string,
): Promise<ProductTaxonomyChips> {
  try {
    const row = await prisma.productTemplate.findUnique({
      where: { slug: templateSlug },
      select: {
        niches: {
          include: {
            niche: {
              select: {
                slug: true,
                name: true,
                iconEmoji: true,
                accentHex: true,
                isActive: true,
                displayOrder: true,
              },
            },
          },
          orderBy: { isPrimary: 'desc' },
        },
        lifestyleTags: {
          include: {
            lifestyleTag: {
              select: {
                slug: true,
                name: true,
                group: true,
                iconEmoji: true,
                isActive: true,
                displayOrder: true,
              },
            },
          },
        },
      },
    })
    if (!row) return EMPTY
    return {
      niches: row.niches
        .filter((n) => n.niche.isActive)
        .map((n) => ({
          slug: n.niche.slug,
          name: n.niche.name,
          iconEmoji: n.niche.iconEmoji,
          accentHex: n.niche.accentHex,
        })),
      lifestyleTags: row.lifestyleTags
        .filter((t) => t.lifestyleTag.isActive)
        .map((t) => ({
          slug: t.lifestyleTag.slug,
          name: t.lifestyleTag.name,
          group: t.lifestyleTag.group,
          iconEmoji: t.lifestyleTag.iconEmoji,
        })),
    }
  } catch (err) {
    console.warn(
      '[product-taxonomy-db] getProductTaxonomyChips failed:',
      (err as Error).message,
    )
    return EMPTY
  }
}
