// Partner rating engine — dimensions registry + aggregation math (pure)
// (docs/FEEDBACK_MODULE.md §5). No prisma, no I/O; the recompute IO lives with
// the submit action (single writer of the PartnerService aggregate columns).
//
// Two different tools for two different jobs (§5.3):
//   DISPLAY  = arithmetic mean, 1 decimal, ALWAYS with the count.
//   RANKING  = Bayesian damped average (C·m + Σ)/(C + n) — raw means are
//              unreliable at low n; one lucky 5★ must not outrank 4.8×200.
// Below MIN_RATINGS_FOR_DISPLAY the UI shows "New", never stars.

// ---------------------------------------------------------------------------
// Dimensions registry (§5.2) — one-word metrics, concrete on purpose (concrete
// criteria measurably reduce halo error). Slugs are the PartnerRating.dimensions
// JSON keys; NEVER rename a slug without a data migration.
// ---------------------------------------------------------------------------

export type RatedRole = 'MANUFACTURER' | 'PRINTER' | 'COPACKER' | 'WAREHOUSE'

export interface RatingDimensionDef {
  slug: string
  label: string // one word (the Amazon-modal row label)
  sublabel: string // one line — what "5 stars" means here
}

export const RATING_DIMENSIONS: Record<RatedRole, readonly RatingDimensionDef[]> = {
  MANUFACTURER: [
    { slug: 'quality', label: 'Quality', sublabel: 'Matched the approved spec/recipe' },
    { slug: 'consistency', label: 'Consistency', sublabel: 'Unit-to-unit uniformity' },
    { slug: 'speed', label: 'Speed', sublabel: 'Production vs the quoted lead time' },
    { slug: 'communication', label: 'Communication', sublabel: 'Updates, ETA honesty, responsiveness' },
  ],
  PRINTER: [
    { slug: 'print-quality', label: 'Print', sublabel: 'Sharpness, finish, materials' },
    { slug: 'color', label: 'Color', sublabel: 'Matched the approved proof' },
    { slug: 'proofing', label: 'Proofing', sublabel: 'Proof turnaround + collaboration' },
    { slug: 'speed', label: 'Speed', sublabel: 'Print vs the quoted lead time' },
  ],
  COPACKER: [
    { slug: 'assembly', label: 'Assembly', sublabel: 'Kit/bundle correctness' },
    { slug: 'packaging', label: 'Packaging', sublabel: 'Pack quality + protection' },
    { slug: 'accuracy', label: 'Accuracy', sublabel: 'Right items, right counts' },
    { slug: 'speed', label: 'Speed', sublabel: 'Turnaround' },
  ],
  WAREHOUSE: [
    { slug: 'receiving', label: 'Receiving', sublabel: 'Inbound confirmed promptly' },
    { slug: 'fulfillment', label: 'Fulfillment', sublabel: 'Pick/pack/ship speed' },
    { slug: 'accuracy', label: 'Accuracy', sublabel: 'Right stock, right counts' },
    { slug: 'handling', label: 'Handling', sublabel: 'Condition on arrival' },
  ],
}

/** DispatchType → rated role (dispatch cards on the rating page). */
export function ratedRoleForDispatchType(type: string): RatedRole {
  if (type === 'PRODUCT') return 'MANUFACTURER'
  if (type === 'LABEL') return 'PRINTER'
  if (type === 'COPACKING') return 'COPACKER'
  return 'WAREHOUSE'
}

// ---------------------------------------------------------------------------
// Per-response math
// ---------------------------------------------------------------------------

export type DimensionScores = Record<string, number>

/**
 * Validate a submission for a role: every score must belong to the role's
 * registry, be an integer 1–5, and at least one dimension must be rated
 * (partial submissions allowed — unrated rows are skipped, not zeroed).
 */
export function validateDimensionScores(
  role: RatedRole,
  scores: DimensionScores,
): { ok: true; clean: DimensionScores } | { ok: false; error: string } {
  const allowed = new Set(RATING_DIMENSIONS[role].map((d) => d.slug))
  const clean: DimensionScores = {}
  for (const [slug, v] of Object.entries(scores)) {
    if (!allowed.has(slug)) return { ok: false, error: `Unknown dimension "${slug}" for ${role}` }
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      return { ok: false, error: `"${slug}" must be a whole star count 1–5` }
    }
    clean[slug] = v
  }
  if (Object.keys(clean).length === 0) return { ok: false, error: 'Rate at least one dimension' }
  return { ok: true, clean }
}

/** Per-response overall = mean of its dimensions (no separate overall question — halo). */
export function overallFromDimensions(scores: DimensionScores): number {
  const values = Object.values(scores)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.round(mean * 100) / 100
}

// ---------------------------------------------------------------------------
// Aggregation (§5.3)
// ---------------------------------------------------------------------------

/** Ranking confidence constant — fixed pre-scale; revisit at volume (25th-pct heuristic). */
export const BAYESIAN_C = 10

/** Below this count the UI shows "New" instead of stars. */
export const MIN_RATINGS_FOR_DISPLAY = 3

export interface RatingAggregate {
  /** Arithmetic mean of response overalls, 2dp — DISPLAY (with count), never ranking. */
  mean: number | null
  /** (C·prior + Σ)/(C + n), 3dp — RANKING/badging, never displayed raw. */
  bayesian: number | null
  count: number
  /** Per-dimension { mean, n } — the breakdown popover bars. */
  dims: Record<string, { mean: number; n: number }>
  /** True below MIN_RATINGS_FOR_DISPLAY — render "New", not stars. */
  isNew: boolean
}

export interface RatingLike {
  overall: number
  dimensions: DimensionScores
  /** Late/excluded responses are filtered by the CALLER (aggregates exclude late). */
}

/**
 * Fold a service's ratings into its aggregate. `prior` = the platform-wide
 * per-role mean (pass the current global mean; 3.75 is a neutral cold-start
 * default when the platform has no data at all).
 */
export function aggregateRatings(ratings: readonly RatingLike[], prior = 3.75): RatingAggregate {
  const n = ratings.length
  if (n === 0) return { mean: null, bayesian: null, count: 0, dims: {}, isNew: true }

  const sum = ratings.reduce((a, r) => a + r.overall, 0)
  const mean = Math.round((sum / n) * 100) / 100
  const bayesian = Math.round(((BAYESIAN_C * prior + sum) / (BAYESIAN_C + n)) * 1000) / 1000

  const dimAcc = new Map<string, { sum: number; n: number }>()
  for (const r of ratings) {
    for (const [slug, v] of Object.entries(r.dimensions)) {
      const acc = dimAcc.get(slug) ?? { sum: 0, n: 0 }
      acc.sum += v
      acc.n += 1
      dimAcc.set(slug, acc)
    }
  }
  const dims: RatingAggregate['dims'] = {}
  for (const [slug, acc] of dimAcc) {
    dims[slug] = { mean: Math.round((acc.sum / acc.n) * 100) / 100, n: acc.n }
  }

  return { mean, bayesian, count: n, dims, isNew: n < MIN_RATINGS_FOR_DISPLAY }
}

/** 30-day mind-change window from first submit (§5.1). */
export const RATING_EDIT_WINDOW_DAYS = 30

/** Cron timing (§5.1 / §6.3): ask at delivery+3d, one reminder at +10d. */
export const RATE_PARTNERS_ASK_AFTER_DAYS = 3
export const RATE_PARTNERS_REMIND_AFTER_DAYS = 10
