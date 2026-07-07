// Partner rating aggregate recompute — the SINGLE writer of PartnerService
// rating columns (docs/FEEDBACK_MODULE.md §5, extended for MM-4). Excludes
// ratings an appeal upheld (`excludedAt != null`) so an excluded rating stops
// counting against the manufacturer without being deleted. Used by the rating
// submit path AND the appeal-exclusion path — one source of truth.

import { prisma } from '@ilaunchify/db'
import { aggregateRatings, type DimensionScores, type RatingAggregate } from './partner-rating'

/**
 * Recompute a service's denormalized rating aggregate from its NON-excluded
 * ratings. `role` selects the platform-wide prior (neutral 3.75 cold-start).
 */
export async function recomputePartnerRatingAggregate(
  partnerServiceId: string,
  role: string,
): Promise<RatingAggregate> {
  const [ratings, globalAvg] = await Promise.all([
    prisma.partnerRating.findMany({
      where: { partnerServiceId, excludedAt: null },
      select: { overall: true, dimensions: true },
    }),
    prisma.partnerRating.aggregate({ where: { role, excludedAt: null }, _avg: { overall: true } }),
  ])
  const prior = globalAvg._avg.overall ? Number(globalAvg._avg.overall) : 3.75
  const agg = aggregateRatings(
    ratings.map((r) => ({ overall: Number(r.overall), dimensions: r.dimensions as DimensionScores })),
    prior,
  )
  await prisma.partnerService.update({
    where: { id: partnerServiceId },
    data: { ratingMean: agg.mean, ratingBayesian: agg.bayesian, ratingCount: agg.count, ratingDims: agg.dims },
  })
  return agg
}
