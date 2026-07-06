// Smart Rotation Engine — pure selection core (docs/SMART_ROTATION_ENGINE.md §2.2, SR-1).
//
// Replaces the arbitrary `eligiblePrinters[0]` pick on the print leg (and later
// generalizes to FC/manufacturer pools). PURE + dependency-free: callers run the
// hard filters (§7 capability + ops gates) FIRST and hand in only survivors —
// rotation NEVER rescues a failed filter. Pinned picks (PS-3) and
// configuration-time bindings bypass this module entirely: a manual pick is
// never rotated away.
//
// Determinism for tests + preview: randomness comes in through `roll` (0..1);
// production callers pass Math.random(), tests/simulations pass fixed values.

export interface RotationPolicyInput {
  enabled: boolean
  poolSize: number
  mode: 'EQUAL' | 'RANDOM' | 'WEIGHTED_EXACT' | 'BEST_ONLY'
  /** WEIGHTED_EXACT — % per rank slot. Validated by validateRotationPolicy. */
  slotSharesPct: number[]
  newProviderSharePct: number
  newProviderMaxOpen: number
  ratingFloor: number | null
  /** 0–100 — how strongly distance-to-producer damps pool ranking. */
  locationBiasPct: number
  stickyReorders: boolean
}

export interface RotationCandidate {
  serviceId: string
  /** Bayesian rating (per-role prior). Null = unrated ("New"). */
  ratingBayesian: number | null
  ratingCount: number
  /** Below MIN_RATINGS_FOR_DISPLAY → eligible for the new-provider ramp. */
  isNew: boolean
  /** Ops kill switch — excluded services never enter the auto pool. */
  excludeFromAutoRotation: boolean
  /** Distance to the producing node (mi). Null = unknown (bias dimension drops). */
  distanceMiles: number | null
  /** Open (undelivered) auto-awards — caps new-provider concurrent exposure. */
  openAwardCount: number
  /** Most recent auto-award, for EQUAL (least-recently-awarded) rotation. */
  lastAwardedAt: Date | null
}

export interface RotationContext {
  policy: RotationPolicyInput
  /** Printer that produced this creator+product before (sticky reorders). */
  previousProviderServiceId?: string | null
  /** Uniform random 0..1 — injectable for tests/preview simulation. */
  roll: number
  /** Second independent roll for in-pool selection (RANDOM / WEIGHTED_EXACT). */
  poolRoll: number
}

export interface RotationDecision {
  /** Null only when no candidates were provided. */
  winnerServiceId: string | null
  /** Which rule produced the winner — audited + shown in the preview UI. */
  path:
    | 'DISABLED_FIRST_CANDIDATE'
    | 'STICKY_REORDER'
    | 'NEW_PROVIDER_DIVERSION'
    | 'POOL_EQUAL'
    | 'POOL_RANDOM'
    | 'POOL_WEIGHTED_EXACT'
    | 'POOL_BEST_ONLY'
    | 'NO_CANDIDATES'
  /** The ranked pool the split ran over (empty for early paths). */
  pool: Array<{ serviceId: string; rankScore: number }>
  /** Full per-candidate trace for PrintAwardLog.decisionJson. */
  trace: Array<{
    serviceId: string
    ratingBayesian: number | null
    isNew: boolean
    excluded: boolean
    rankScore: number | null
  }>
}

/** slotSharesPct must be non-empty, non-negative, and sum to exactly 100. */
export function validateRotationPolicy(p: RotationPolicyInput): string | null {
  if (p.poolSize < 1 || p.poolSize > 25) return 'Pool size must be between 1 and 25'
  if (p.newProviderSharePct < 0 || p.newProviderSharePct > 100)
    return 'New-provider share must be 0–100%'
  if (p.newProviderMaxOpen < 0) return 'New-provider max open awards cannot be negative'
  if (p.locationBiasPct < 0 || p.locationBiasPct > 100) return 'Location bias must be 0–100%'
  if (p.mode === 'WEIGHTED_EXACT') {
    if (p.slotSharesPct.length === 0) return 'WEIGHTED_EXACT needs at least one slot share'
    if (p.slotSharesPct.length > p.poolSize)
      return 'More slot shares than the pool size'
    if (p.slotSharesPct.some((s) => s < 0)) return 'Slot shares cannot be negative'
    const sum = p.slotSharesPct.reduce((a, b) => a + b, 0)
    if (sum !== 100) return `Slot shares must sum to exactly 100 (got ${sum})`
  }
  return null
}

/**
 * Rank score: rating first, optionally damped by distance to the producer.
 * Higher = better. Unrated candidates rank by the pool median so the ramp —
 * not the ranking — controls their exposure.
 */
function rankScore(
  c: RotationCandidate,
  medianRating: number,
  maxDistance: number,
  locationBiasPct: number,
): number {
  const rating = c.ratingBayesian ?? medianRating
  if (locationBiasPct <= 0 || c.distanceMiles === null || maxDistance <= 0) return rating
  const proximity = 1 - c.distanceMiles / maxDistance // 1 = at the producer's door
  const bias = locationBiasPct / 100
  // Rating on a 0..5 scale; proximity scaled to the same magnitude before mixing.
  return rating * (1 - bias) + proximity * 5 * bias
}

export function selectRotatingProvider(
  candidates: RotationCandidate[],
  ctx: RotationContext,
): RotationDecision {
  const { policy } = ctx
  if (candidates.length === 0) {
    return { winnerServiceId: null, path: 'NO_CANDIDATES', pool: [], trace: [] }
  }

  // Engine off → EXACT pre-SR behavior: first candidate in caller order.
  if (!policy.enabled) {
    return {
      winnerServiceId: candidates[0]!.serviceId,
      path: 'DISABLED_FIRST_CANDIDATE',
      pool: [],
      trace: candidates.map((c) => ({
        serviceId: c.serviceId,
        ratingBayesian: c.ratingBayesian,
        isNew: c.isNew,
        excluded: false,
        rankScore: null,
      })),
    }
  }

  const usable = candidates.filter((c) => !c.excludeFromAutoRotation)
  const fallbackAll = usable.length > 0 ? usable : candidates // never strand an order on the kill switch

  // 1 — sticky reorder: same provider as last time, still in the candidate set.
  if (policy.stickyReorders && ctx.previousProviderServiceId) {
    const prev = candidates.find((c) => c.serviceId === ctx.previousProviderServiceId)
    if (prev) {
      return {
        winnerServiceId: prev.serviceId,
        path: 'STICKY_REORDER',
        pool: [],
        trace: traceOf(candidates, null),
      }
    }
  }

  // 2 — new-provider diversion (exposure ramp): probability gate + open-award cap.
  if (policy.newProviderSharePct > 0 && ctx.roll < policy.newProviderSharePct / 100) {
    const rampable = fallbackAll.filter(
      (c) => c.isNew && c.openAwardCount < policy.newProviderMaxOpen,
    )
    if (rampable.length > 0) {
      // Least-exposed first; stable tie-break for reproducibility.
      rampable.sort(
        (a, b) => a.openAwardCount - b.openAwardCount || a.serviceId.localeCompare(b.serviceId),
      )
      return {
        winnerServiceId: rampable[0]!.serviceId,
        path: 'NEW_PROVIDER_DIVERSION',
        pool: [],
        trace: traceOf(candidates, null),
      }
    }
  }

  // 3 — pool: rank by rating (floor applied), optional location damping, top N.
  const rated = fallbackAll.filter((c) => c.ratingBayesian !== null) as Array<
    RotationCandidate & { ratingBayesian: number }
  >
  const medianRating =
    rated.length > 0
      ? rated.map((c) => c.ratingBayesian).sort((a, b) => a - b)[Math.floor(rated.length / 2)]!
      : 2.5
  const floored = fallbackAll.filter(
    (c) =>
      policy.ratingFloor === null ||
      c.ratingBayesian === null || // unrated: the ramp caps them, the floor doesn't kill them
      c.ratingBayesian >= policy.ratingFloor,
  )
  const poolSource = floored.length > 0 ? floored : fallbackAll
  const maxDistance = Math.max(0, ...poolSource.map((c) => c.distanceMiles ?? 0))

  const scored = poolSource
    .map((c) => ({
      c,
      score: rankScore(c, medianRating, maxDistance, policy.locationBiasPct),
    }))
    .sort((a, b) => b.score - a.score || a.c.serviceId.localeCompare(b.c.serviceId))

  const pool = scored.slice(0, Math.max(1, policy.poolSize))
  const poolOut = pool.map((p) => ({ serviceId: p.c.serviceId, rankScore: p.score }))
  const scoreByService = new Map(scored.map((s) => [s.c.serviceId, s.score]))
  const trace = traceOf(candidates, scoreByService)

  // 4 — split.
  if (policy.mode === 'BEST_ONLY' || pool.length === 1) {
    return { winnerServiceId: pool[0]!.c.serviceId, path: 'POOL_BEST_ONLY', pool: poolOut, trace }
  }
  if (policy.mode === 'RANDOM') {
    const idx = Math.min(pool.length - 1, Math.floor(ctx.poolRoll * pool.length))
    return { winnerServiceId: pool[idx]!.c.serviceId, path: 'POOL_RANDOM', pool: poolOut, trace }
  }
  if (policy.mode === 'WEIGHTED_EXACT') {
    // Slots map to pool ranks; shares beyond the pool renormalize onto it.
    const shares = policy.slotSharesPct.slice(0, pool.length)
    const total = shares.reduce((a, b) => a + b, 0)
    if (total > 0) {
      let acc = 0
      const target = ctx.poolRoll * total
      for (let i = 0; i < shares.length; i++) {
        acc += shares[i]!
        if (target < acc) {
          return {
            winnerServiceId: pool[i]!.c.serviceId,
            path: 'POOL_WEIGHTED_EXACT',
            pool: poolOut,
            trace,
          }
        }
      }
    }
    return {
      winnerServiceId: pool[0]!.c.serviceId,
      path: 'POOL_WEIGHTED_EXACT',
      pool: poolOut,
      trace,
    }
  }
  // EQUAL — least-recently-awarded in the pool (never-awarded sorts first).
  const byLastAward = [...pool].sort((a, b) => {
    const aT = a.c.lastAwardedAt?.getTime() ?? 0
    const bT = b.c.lastAwardedAt?.getTime() ?? 0
    if (aT !== bT) return aT - bT
    return b.score - a.score || a.c.serviceId.localeCompare(b.c.serviceId)
  })
  return { winnerServiceId: byLastAward[0]!.c.serviceId, path: 'POOL_EQUAL', pool: poolOut, trace }
}

function traceOf(
  candidates: RotationCandidate[],
  scores: Map<string, number> | null,
): RotationDecision['trace'] {
  return candidates.map((c) => ({
    serviceId: c.serviceId,
    ratingBayesian: c.ratingBayesian,
    isNew: c.isNew,
    excluded: c.excludeFromAutoRotation,
    rankScore: scores?.get(c.serviceId) ?? null,
  }))
}

/** PrintAwardLog.decisionJson payload. */
export function buildRotationAwardPayload(
  decision: RotationDecision,
  policy: RotationPolicyInput,
  rolls: { roll: number; poolRoll: number },
) {
  return {
    path: decision.path,
    winner: decision.winnerServiceId,
    pool: decision.pool,
    candidates: decision.trace,
    policy: {
      enabled: policy.enabled,
      poolSize: policy.poolSize,
      mode: policy.mode,
      slotSharesPct: policy.slotSharesPct,
      newProviderSharePct: policy.newProviderSharePct,
      newProviderMaxOpen: policy.newProviderMaxOpen,
      ratingFloor: policy.ratingFloor,
      locationBiasPct: policy.locationBiasPct,
      stickyReorders: policy.stickyReorders,
    },
    rolls,
  }
}
