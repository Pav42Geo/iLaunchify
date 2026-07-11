// Matched-maker fan-out for a freshly posted brief (Pavel 2026-07-10: "the
// pool should update like a feed — matched manufacturers get notified").
//
// Uses the SAME capability derivation as the partner pool loader (niches +
// categories + MOQ floor from PUBLISHED templates on ACTIVE MANUFACTURING
// services) and the SAME fit engine with the admin's live weights, so a maker
// is notified if and only if the brief would actually surface in their pool —
// including the exclusivity window's fit floor. No phantom notifications.

import { prisma, getCoCreationSettings } from '@ilaunchify/db'
import { scoreBriefFit, type BriefFitFacts } from './brief-fit'

const FANOUT_CAP = 100 // safety valve for large partner counts (top-fit first)

export interface MatchedPartner {
  partnerId: string
  userId: string
  fitScore: number
}

export async function findMatchedPartners(
  brief: BriefFitFacts,
  /** BriefOrigin — under the default pool-access policy, non-formulating
      partners (no MANUFACTURING line) only match HAVE_RECIPE briefs. */
  origin: string,
): Promise<MatchedPartner[]> {
  const settings = await getCoCreationSettings()
  if (!settings.moduleEnabled) return [] // module kick-off switch — no fan-out while closed
  const weights = {
    claims: settings.claimsWeightPct,
    volume: settings.volumeWeightPct,
    merit: settings.meritWeightPct,
    location: settings.locationWeightPct,
  }
  // At post time the exclusivity window is (by definition) active — only
  // makers who'd actually SEE the brief right now get pinged.
  const minFit = settings.poolExclusivityDays > 0 ? settings.exclusivityMinFit : 0
  const types: ('MANUFACTURING' | 'COPACKING')[] =
    settings.poolAccessPolicy === 'MFG_ONLY' ? ['MANUFACTURING'] : ['MANUFACTURING', 'COPACKING']

  const partners = await prisma.partner.findMany({
    where: {
      status: { in: ['ACTIVE', 'INTEGRATION_ENHANCED'] },
      services: {
        some: {
          type: { in: types },
          status: 'ACTIVE',
          productTemplates: {
            some: { status: 'PUBLISHED', niches: { some: { niche: { slug: brief.nicheSlug } } } },
          },
        },
      },
    },
    select: {
      id: true,
      userId: true,
      services: {
        where: { type: { in: types }, status: 'ACTIVE' },
        select: {
          type: true,
          ratingBayesian: true,
          productTemplates: {
            where: { status: 'PUBLISHED' },
            select: {
              subcategory: { select: { categoryId: true } },
              niches: { select: { niche: { select: { slug: true } } } },
              variants: { where: { isActive: true }, select: { moqMin: true } },
            },
          },
        },
      },
    },
    take: 500,
  })

  const matched: MatchedPartner[] = []
  for (const p of partners) {
    // Mirror of the pool loader's recipe-door rule (admin-choosable policy).
    const canFormulate = p.services.some((s) => s.type === 'MANUFACTURING')
    if (
      settings.poolAccessPolicy === 'MFG_ALL_COPACK_RECIPE' &&
      !canFormulate &&
      origin !== 'HAVE_RECIPE'
    ) {
      continue
    }
    const templates = p.services.flatMap((s) => s.productTemplates)
    const nicheSlugs = [...new Set(templates.flatMap((t) => t.niches.map((n) => n.niche.slug)))]
    const categoryIds = [
      ...new Set(templates.map((t) => t.subcategory?.categoryId).filter((x): x is string => !!x)),
    ]
    const moqs = templates
      .flatMap((t) => t.variants.map((v) => v.moqMin))
      .filter((m): m is number => typeof m === 'number')
    const ratings = p.services
      .map((s) => (s.ratingBayesian === null ? null : Number(s.ratingBayesian)))
      .filter((r): r is number => r !== null)

    const fit = scoreBriefFit(
      brief,
      {
        nicheSlugs,
        categoryIds,
        claimsSupported: undefined,
        moqFloor: moqs.length ? Math.min(...moqs) : null,
        volumeCapacity: null,
        meritRating: ratings.length ? Math.max(...ratings) : null,
      },
      weights,
    )
    if (fit.eligible && fit.score >= minFit) {
      matched.push({ partnerId: p.id, userId: p.userId, fitScore: fit.score })
    }
  }

  return matched.sort((a, b) => b.fitScore - a.fitScore).slice(0, FANOUT_CAP)
}
