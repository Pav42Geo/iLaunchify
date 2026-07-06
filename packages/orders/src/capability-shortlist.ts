// rankCapabilityShortlist — the deterministic adjacency ranker behind the
// PrintCapabilityRequest broadcast (docs/PRINT_PROVIDER_SELECTION.md §10.2).
//
// When a template's print coverage is 0, the RFQ machinery fans the requirement
// tuple out to a SMART SHORTLIST of onboarded LABEL_PRINTING services. "Smart"
// here means "structured + deterministic" — NO admin, NO AI. We rank the pool
// by how ADJACENT each printer's declared offerings are to the uncovered spec:
//
//   (a) same decorationMethod on a DIFFERENT packagingType — strongest signal,
//       they already own the press for this decoration.
//   (b) same packagingType, different decorationMethod — they run this format.
//   (c) same printProcess (from the §7 physics matrix) — process-level fit.
//   (d) geo proximity — same region as the manufacturer (label-hop freight, PS-3d).
//   (e) rating (Bayesian) — quality tiebreak.
//
// Pure: the caller fetches candidate offerings; this function only ranks. It is
// unit-tested (compiled-node pattern — vitest can't run in the Cowork sandbox)
// so the broadcast order can never silently drift.

// ---------------------------------------------------------------------------
// Inputs (plain data — no prisma)
// ---------------------------------------------------------------------------

/** The denormalized requirement tuple an uncovered template broadcasts (§10.2). */
export interface CapabilityRequirementTuple {
  packagingTypeId: string
  /** May be null at the coarse template level (decoration is per-component). */
  decorationMethod?: string | null
  /** Physics-matrix hint, when derivable. */
  printProcessHint?: string | null
  /** Region LABEL of the manufacturer (not identity) — geo adjacency only. */
  manufacturerRegion?: string | null
}

/** One onboarded LABEL_PRINTING service the broadcast could reach. */
export interface ShortlistCandidate {
  serviceId: string
  /** Region label (state/region code) for geo adjacency; null = unknown. */
  region?: string | null
  /** Bayesian rating (FB-F) — null when the printer has no ratings yet. */
  ratingBayesian?: number | null
  /** The printer's ACTIVE offerings, flattened to the adjacency signals. */
  offerings: ReadonlyArray<{
    packagingTypeId: string
    decorationMethod: string
    printProcess?: string | null
  }>
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface ShortlistSignals {
  /** (a) — same decoration, different packaging type. */
  sameMethodOtherType: boolean
  /** (b) — same packaging type, different decoration. */
  sameTypeOtherMethod: boolean
  /** (c) — same print process as the hint. */
  sameProcess: boolean
  /** (d) — same region as the manufacturer. */
  sameRegion: boolean
  /** (e) — Bayesian rating (null = unrated). */
  ratingBayesian: number | null
  /** True when NONE of (a)–(d) fired — pure long-shot, ranked last. */
  noAdjacency: boolean
}

export interface ShortlistRanked {
  serviceId: string
  /** Monotonic adjacency score (higher = closer). For display/telemetry. */
  score: number
  signals: ShortlistSignals
}

// ---------------------------------------------------------------------------
// Weights — spaced so the score encodes the exact priority a > b > c > d > rating.
// Each tier dominates the sum of everything below it, so the numeric score is a
// faithful lexicographic key; serviceId breaks any remaining exact tie.
// ---------------------------------------------------------------------------

const W_SAME_METHOD_OTHER_TYPE = 100_000 // (a)
const W_SAME_TYPE_OTHER_METHOD = 10_000 // (b)
const W_SAME_PROCESS = 1_000 // (c)
const W_SAME_REGION = 100 // (d)
// rating ∈ [0,5] → ×10 → [0,50], strictly below W_SAME_REGION so it never
// outweighs a geo match. Unrated (null) contributes 0.

const DEFAULT_LIMIT = 10 // §10.2 "Top N (admin-tunable, default 10)"

/**
 * Rank onboarded printers by adjacency to an uncovered requirement tuple.
 * Deterministic: sorts by score desc, then serviceId asc. Candidates with no
 * adjacency at all are still returned (ranked last) — the broadcast can widen
 * bands over successive weeks, but the caller decides how deep to go via `limit`.
 */
export function rankCapabilityShortlist(
  candidates: readonly ShortlistCandidate[],
  tuple: CapabilityRequirementTuple,
  opts: { limit?: number } = {},
): ShortlistRanked[] {
  const limit = opts.limit ?? DEFAULT_LIMIT

  const ranked = candidates.map((c) => {
    const signals = signalsFor(c, tuple)
    return { serviceId: c.serviceId, score: scoreOf(signals), signals }
  })

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.serviceId < b.serviceId ? -1 : a.serviceId > b.serviceId ? 1 : 0
  })

  return limit >= 0 ? ranked.slice(0, limit) : ranked
}

function signalsFor(
  c: ShortlistCandidate,
  tuple: CapabilityRequirementTuple,
): ShortlistSignals {
  const method = tuple.decorationMethod ?? null
  const process = tuple.printProcessHint ?? null

  // (a) same decoration on a DIFFERENT packaging type — only meaningful when the
  // tuple actually names a decoration method.
  const sameMethodOtherType =
    method != null &&
    c.offerings.some(
      (o) => o.decorationMethod === method && o.packagingTypeId !== tuple.packagingTypeId,
    )

  // (b) same packaging type, DIFFERENT decoration (an exact-combo holder already
  // covers the template and wouldn't be shortlisted, but we still count the type
  // match as adjacency for anyone offering the type with another decoration).
  const sameTypeOtherMethod = c.offerings.some(
    (o) => o.packagingTypeId === tuple.packagingTypeId && o.decorationMethod !== method,
  )

  // (c) same print process anywhere in their catalog.
  const sameProcess =
    process != null && c.offerings.some((o) => (o.printProcess ?? null) === process)

  // (d) geo — same region label as the manufacturer (both must be known).
  const sameRegion =
    tuple.manufacturerRegion != null &&
    c.region != null &&
    c.region === tuple.manufacturerRegion

  const ratingBayesian = c.ratingBayesian ?? null
  const noAdjacency =
    !sameMethodOtherType && !sameTypeOtherMethod && !sameProcess && !sameRegion

  return { sameMethodOtherType, sameTypeOtherMethod, sameProcess, sameRegion, ratingBayesian, noAdjacency }
}

function scoreOf(s: ShortlistSignals): number {
  let score = 0
  if (s.sameMethodOtherType) score += W_SAME_METHOD_OTHER_TYPE
  if (s.sameTypeOtherMethod) score += W_SAME_TYPE_OTHER_METHOD
  if (s.sameProcess) score += W_SAME_PROCESS
  if (s.sameRegion) score += W_SAME_REGION
  if (s.ratingBayesian != null) score += Math.max(0, Math.min(5, s.ratingBayesian)) * 10
  return score
}
