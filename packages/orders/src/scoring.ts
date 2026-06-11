// B4 — partner-matching scoring (pure).
//
// Ranks the manufacturing candidates that already PASS the hard gates (category
// fit, MOQ range, payouts enabled) so routing picks the best fit instead of the
// first match. Pure + dependency-free so it unit-tests without a DB; the Prisma
// reads + candidate extraction live in routing.ts.
//
// Dimensions (each normalized 0..1, weighted, applicable dims renormalized):
//   • capability — capacity headroom above the order qty (more room to absorb
//     growth/reorders = better). Always applicable.
//   • proximity  — region/country closeness to the order destination. Applied
//     only when a destination is known (else omitted, not penalized).
//   • cert       — does the partner hold an active market certification for the
//     order's target market? Applied only when a target market is specified.

export interface MatchCandidate {
  serviceId: string
  moqMin: number
  /** Number.POSITIVE_INFINITY when the service declares no upper bound. */
  moqMax: number
  partnerCountry: string
  partnerRegionId: string | null
  /** Market ids the partner holds an ACTIVE, non-expired certification for. */
  certifiedMarketIds: string[]
}

export interface MatchWeights {
  capability: number
  proximity: number
  cert: number
}

export interface MatchContext {
  quantity: number
  /** Optional — proximity is scored only when a destination is known. */
  destinationCountry?: string | null
  destinationRegionId?: string | null
  /** Optional — cert coverage is scored only when a target market is given. */
  targetMarketId?: string | null
  /** Admin-tunable dimension weights (OrderSettings). Raw magnitudes — the score
   *  renormalizes by the applicable weights, so percentages work directly. */
  weights?: MatchWeights
}

export interface MatchScore {
  serviceId: string
  /** Weighted, renormalized total over the applicable dimensions (0..1). */
  total: number
  breakdown: {
    capability: number
    /** null when no destination was supplied (dimension not applicable). */
    proximity: number | null
    /** null when no target market was supplied (dimension not applicable). */
    cert: number | null
  }
}

const WEIGHTS = { capability: 0.4, proximity: 0.35, cert: 0.25 } as const

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/** Capacity headroom above the order qty, 0..1. Larger ceiling vs qty = higher. */
export function capabilityScore(candidate: MatchCandidate, quantity: number): number {
  if (quantity < candidate.moqMin || quantity > candidate.moqMax) return 0
  // Treat an unbounded ceiling as ~10× the order so it still ranks well but the
  // score stays finite + comparable.
  const ceiling =
    candidate.moqMax === Number.POSITIVE_INFINITY ? Math.max(quantity * 10, 1) : candidate.moqMax
  if (ceiling <= 0) return 0
  return clamp((ceiling - quantity) / ceiling, 0, 1)
}

/** Region match (1.0) > same country (0.6) > different (0.2). */
export function proximityScore(candidate: MatchCandidate, ctx: MatchContext): number {
  if (
    ctx.destinationRegionId &&
    candidate.partnerRegionId &&
    ctx.destinationRegionId === candidate.partnerRegionId
  ) {
    return 1
  }
  if (
    ctx.destinationCountry &&
    candidate.partnerCountry &&
    ctx.destinationCountry === candidate.partnerCountry
  ) {
    return 0.6
  }
  return 0.2
}

export function scorePartnerMatch(candidate: MatchCandidate, ctx: MatchContext): MatchScore {
  const capability = capabilityScore(candidate, ctx.quantity)

  const hasDestination = !!(ctx.destinationRegionId || ctx.destinationCountry)
  const proximity = hasDestination ? proximityScore(candidate, ctx) : null

  const cert = ctx.targetMarketId
    ? candidate.certifiedMarketIds.includes(ctx.targetMarketId)
      ? 1
      : 0
    : null

  // Admin-tunable weights override the defaults; the renormalization below keeps
  // the total in 0..1 regardless of the raw magnitudes used.
  const w = ctx.weights ?? WEIGHTS
  let sum = capability * w.capability
  let wsum = w.capability
  if (proximity !== null) {
    sum += proximity * w.proximity
    wsum += w.proximity
  }
  if (cert !== null) {
    sum += cert * w.cert
    wsum += w.cert
  }

  return {
    serviceId: candidate.serviceId,
    total: wsum > 0 ? sum / wsum : 0,
    breakdown: { capability, proximity, cert },
  }
}

/**
 * Score every candidate and return them ranked best-first. Deterministic
 * tie-break by serviceId so routing is reproducible.
 */
export function rankPartnerMatches(
  candidates: MatchCandidate[],
  ctx: MatchContext,
): MatchScore[] {
  return candidates
    .map((c) => scorePartnerMatch(c, ctx))
    .sort((a, b) => b.total - a.total || a.serviceId.localeCompare(b.serviceId))
}

/** Convenience — the single best candidate, or null when there are none. */
export function pickBestMatch(
  candidates: MatchCandidate[],
  ctx: MatchContext,
): MatchScore | null {
  return rankPartnerMatches(candidates, ctx)[0] ?? null
}
