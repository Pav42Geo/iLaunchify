// Phase L4a — FC selection Phases 2–3 (docs/LOGISTICS_AND_FULFILLMENT.md §5).
// Weighted scoring + round-robin inside the indifference band. Activates when
// ≥3 nodes pass Phase-1 eligibility (below that, nearest-eligible V1 wins).
// PURE: weights come from OrderSettings (admin-tunable), award history from
// FcAwardLog counts — callers fetch both. Weights renormalize over the
// dimensions that have data (the partner-matcher pattern).

import { rankFulfillmentCenters } from './fc-selector'
import type { FcCandidate, FcRanked, FcSelectionInput } from './fc-selector'

export interface FcScoringWeights {
  costWeightPct: number // OrderSettings.fcCostWeightPct — cost proxy (V1: distance stands in until real freight quotes)
  distanceWeightPct: number
  slaWeightPct: number // no per-node SLA data yet — auto-drops via renormalization
  capacityWeightPct: number
  rotationWeightPct: number
  storageMatchWeightPct: number
  rotationBandPct: number // indifference band, % of best score
}

export interface FcAwardHistoryEntry {
  awardCount: number
  lastAwardedAt: Date | null
}

export interface FcScoringContext {
  weights: FcScoringWeights
  /** partnerServiceId → history (from FcAwardLog, e.g. last 90 days). */
  history: Record<string, FcAwardHistoryEntry>
  totalRecentAwards: number
}

export interface FcScored {
  ranked: FcRanked
  /** Lower = better. Null for ineligible candidates. */
  score: number | null
  factors: Record<string, number>
}

export interface FcScoreResult {
  winner: FcScored | null
  scored: FcScored[]
  /** True when the rotation tiebreak (not raw score) picked the winner. */
  rotationApplied: boolean
  algorithm: 'V15_WEIGHTED_BAND' | 'V1_NEAREST_ELIGIBLE'
}

const MIN_CANDIDATES_FOR_SCORING = 3

function norm(value: number, max: number): number {
  return max > 0 ? value / max : 0
}

export function scoreAndSelectFc(
  candidates: FcCandidate[],
  input: FcSelectionInput,
  ctx: FcScoringContext,
): FcScoreResult {
  const ranked = rankFulfillmentCenters(candidates, input)
  const eligible = ranked.filter((r) => r.eligible)

  // Phase-1-only fallback: too few nodes to make weighting meaningful.
  if (eligible.length < MIN_CANDIDATES_FOR_SCORING) {
    const winner = eligible[0] ?? null
    return {
      winner: winner ? { ranked: winner, score: null, factors: {} } : null,
      scored: ranked.map((r) => ({ ranked: r, score: null, factors: {} })),
      rotationApplied: false,
      algorithm: 'V1_NEAREST_ELIGIBLE',
    }
  }

  const w = ctx.weights
  const maxDistance = Math.max(...eligible.map((r) => r.distanceMiles ?? 0))
  const distanceAvailable = eligible.some((r) => r.distanceMiles !== null)
  const capacityAvailable = eligible.some((r) => r.candidate.weeklyPalletCapacity !== null)
  const targetShare = 1 / eligible.length

  // Renormalize weights over available dimensions (SLA always drops in V1.5;
  // cost proxies onto distance until real freight quotes exist, so cost+distance
  // merge when distance is the only signal).
  const dims: Array<{ key: string; weight: number; available: boolean }> = [
    { key: 'cost', weight: w.costWeightPct, available: distanceAvailable },
    { key: 'distance', weight: w.distanceWeightPct, available: distanceAvailable },
    { key: 'sla', weight: w.slaWeightPct, available: false },
    { key: 'capacity', weight: w.capacityWeightPct, available: capacityAvailable },
    { key: 'rotation', weight: w.rotationWeightPct, available: ctx.totalRecentAwards > 0 },
    { key: 'storageMatch', weight: w.storageMatchWeightPct, available: true },
  ]
  const totalWeight = dims.filter((d) => d.available).reduce((s, d) => s + d.weight, 0)
  const wOf = (key: string): number => {
    const d = dims.find((x) => x.key === key)
    return d && d.available && totalWeight > 0 ? d.weight / totalWeight : 0
  }

  const scored: FcScored[] = ranked.map((r) => {
    if (!r.eligible) return { ranked: r, score: null, factors: {} }
    const c = r.candidate
    const factors: Record<string, number> = {}

    const distanceNorm = norm(r.distanceMiles ?? maxDistance, maxDistance)
    factors.cost = wOf('cost') * distanceNorm // proxy — see header comment
    factors.distance = wOf('distance') * distanceNorm

    if (capacityAvailable) {
      // Fuller utilization proxy: recent award share vs capacity headroom.
      const awards = ctx.history[c.partnerServiceId]?.awardCount ?? 0
      const capacity = c.weeklyPalletCapacity ?? 1
      factors.capacity = wOf('capacity') * norm(awards / Math.max(1, capacity), 1)
    }

    if (ctx.totalRecentAwards > 0) {
      const share = (ctx.history[c.partnerServiceId]?.awardCount ?? 0) / ctx.totalRecentAwards
      // Pressure only when ABOVE the fair share (never reward emptiness with negative scores).
      factors.rotation = wOf('rotation') * Math.max(0, share - targetShare)
    }

    // Exact storage-class match preferred over "can also hold colder classes".
    const exact = c.storageClasses.length > 0 && c.storageClasses.includes(input.storageClass)
    const overCapable = exact && c.storageClasses.includes('FROZEN') && input.storageClass !== 'FROZEN'
    factors.storageMatch = wOf('storageMatch') * (overCapable ? 0.5 : 0)

    const score = Object.values(factors).reduce((s, v) => s + v, 0)
    return { ranked: r, score, factors }
  })

  const eligibleScored = scored.filter((s) => s.score !== null) as Array<FcScored & { score: number }>
  eligibleScored.sort((a, b) => a.score - b.score)
  const best = eligibleScored[0]
  if (!best) return { winner: null, scored, rotationApplied: false, algorithm: 'V15_WEIGHTED_BAND' }

  // Phase 3 — rotation inside the indifference band: least-recently-awarded wins.
  const bandCeiling = best.score * (1 + Math.max(0, w.rotationBandPct) / 100)
  const band = eligibleScored.filter((s) => s.score <= bandCeiling || s.score === best.score)
  band.sort((a, b) => {
    const aLast = ctx.history[a.ranked.candidate.partnerServiceId]?.lastAwardedAt?.getTime() ?? 0
    const bLast = ctx.history[b.ranked.candidate.partnerServiceId]?.lastAwardedAt?.getTime() ?? 0
    if (aLast !== bLast) return aLast - bLast // never-awarded (0) sorts first
    return a.score - b.score
  })
  const winner = band[0] ?? best

  return {
    winner,
    scored,
    rotationApplied: winner.ranked.candidate.partnerServiceId !== best.ranked.candidate.partnerServiceId,
    algorithm: 'V15_WEIGHTED_BAND',
  }
}

/** FcAwardLog.scoreJson payload for scored selections (extends the V1 shape). */
export function buildScoredAwardPayload(result: FcScoreResult) {
  return {
    algorithm: result.algorithm,
    rotationApplied: result.rotationApplied,
    winner: result.winner?.ranked.candidate.partnerServiceId ?? null,
    candidates: result.scored.map((s) => ({
      partnerServiceId: s.ranked.candidate.partnerServiceId,
      eligible: s.ranked.eligible,
      exclusionReason: s.ranked.exclusionReason,
      distanceMiles: s.ranked.distanceMiles,
      score: s.score,
      factors: s.factors,
    })),
  }
}
