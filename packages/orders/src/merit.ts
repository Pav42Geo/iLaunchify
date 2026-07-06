// Manufacturer Merit Engine — the pure, fair scoring core
// (docs/MANUFACTURER_MERIT_ENGINE.md). Turns a manufacturer's signals into a
// 0–100 MeritScore across four pillars, then the badge that score + evidence
// qualifies for. Everything here is PURE (plain data in, result out) so it's
// deterministic and unit-tested; loaders (prisma) and hysteresis/assignment
// (the nightly cron) live outside.
//
// Fairness is built in, not bolted on:
//   • Bayesian shrinkage on craft AND ops rates → low-volume shops sit near the
//     cohort mean, so ONE bad review barely moves a high-volume manufacturer.
//   • Rates, never raw counts → a 100-order shop with 3 issues (3%) beats a
//     10-order shop with 2 issues (20%).
//   • Contribution explicitly REWARDS volume/resources, but is capped so it can
//     lift standing without ever masking a craft failure.
//   • Peer-relative: every pillar is scored against the manufacturer's cohort.
//   • New = neutral (≈50 on craft/reliability), never zero, never "bad".
// The engine only ever produces a POSITIVE badge (Verified → Trusted → Premier);
// there is no "bad" state to compute.

export type MeritBadge = 'VERIFIED' | 'TRUSTED' | 'PREMIER'

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface MeritSignals {
  // Craft
  ratingBayesian: number | null // 0..5, already smoothed (partner-rating); null = no ratings yet
  ratingCount: number
  // Reliability — fractions 0..1 (null = no data); defect is per-100-orders
  onTimeRate: number | null
  acceptRate: number | null
  defectRatePer100: number | null // ATTRIBUTED defects only (out-of-scope excluded upstream)
  // Evidence
  ordersCompleted: number
  monthsActive: number
  // Contribution
  productCount: number
  fulfilledUnits: number
  gmvCents: number
  // Standing
  cleanRecencyDays: number | null // days since last UPHELD defect/strike; null = never had one
  inGrace: boolean // within the new-shop grace window (promote-only; consumed by the cron)
}

/** Peer baselines for relative scoring. Pass cohort means; neutral defaults are safe. */
export interface MeritCohort {
  ratingBayesianMean: number // e.g. 3.75
  onTimeRateMean: number // e.g. 0.90
  acceptRateMean: number // e.g. 0.95
  defectRatePer100Mean: number // e.g. 3
  ordersMedian: number // cohort median completed orders (contribution reference)
}

export interface MeritPolicy {
  /** Pillar weights — MUST sum to 100. */
  weights: { craft: number; reliability: number; contribution: number; standing: number }
  /** MeritScore gates (0..100), trusted < premier. */
  thresholds: { trusted: number; premier: number }
  evidence: {
    trustedMinOrders: number
    trustedMinMonths: number
    premierMinOrders: number
    premierMinMonths: number
    premierMaxDefectPer100: number // clean-record ceiling for Premier
  }
  /** Bayesian confidence for ops rates — orders needed before full weight (shrinks to cohort). */
  opsConfidence: number
  /** Fee (bps) per badge — recorded here for MM-5; the pure engine does NOT apply it. */
  feeBpsByBadge: Record<MeritBadge, number>
}

export interface MeritResult {
  meritScore: number // 0..100, 1dp
  pillars: { craft: number; reliability: number; contribution: number; standing: number } // each 0..100
  qualifiedBadge: MeritBadge
  eligibility: { trusted: boolean; premier: boolean }
  /** Human "why not higher" — transparency is the #1 dispute-reducer. */
  gaps: string[]
}

// ---------------------------------------------------------------------------
// Shape constants — the "engineering" of the curves (the admin tunes weights/
// thresholds/evidence/fees via MeritPolicy; these shape each pillar's response).
// ---------------------------------------------------------------------------

const CRAFT_SPREAD = 40 // rating points above cohort × this = score delta (≈100 at +1.25)
const DEFECT_ZERO_AT = 2 // defect = 2× cohort mean → 0; = cohort mean → 50; = 0 → 100
const TENURE_TARGET_MONTHS = 12 // months active for full tenure credit
const RECENCY_WINDOW_DAYS = 90 // an upheld defect inside this window dents standing
const RECENCY_MAX_PENALTY = 30 // max standing points removed for a very recent defect
const BREADTH_BONUS_CAP = 10 // product-breadth bump on contribution

export const DEFAULT_MERIT_POLICY: MeritPolicy = {
  weights: { craft: 40, reliability: 30, contribution: 20, standing: 10 },
  thresholds: { trusted: 62, premier: 82 },
  evidence: {
    trustedMinOrders: 10,
    trustedMinMonths: 3,
    premierMinOrders: 50,
    premierMinMonths: 6,
    premierMaxDefectPer100: 5,
  },
  opsConfidence: 15,
  feeBpsByBadge: { VERIFIED: 450, TRUSTED: 250, PREMIER: 0 }, // 4.5% / 2.5% / 0% (Pavel 2026-07-06)
}

// ---------------------------------------------------------------------------

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))
const round1 = (v: number) => Math.round(v * 10) / 10

/** Bayesian shrink of a rate toward the cohort mean at low volume. */
function shrinkRate(rate: number, cohortMean: number, n: number, confidence: number): number {
  return (confidence * cohortMean + n * rate) / (confidence + Math.max(0, n))
}

/** Craft — Bayesian rating relative to the cohort mean; null = neutral (≈50), never 0. */
function craftPillar(s: MeritSignals, c: MeritCohort): number {
  if (s.ratingBayesian == null || s.ratingCount === 0) return 50
  return clamp(50 + (s.ratingBayesian - c.ratingBayesianMean) * CRAFT_SPREAD)
}

/** Reliability — on-time, accept, and (inverse) defect, each cohort-shrunk; drops null parts. */
function reliabilityPillar(s: MeritSignals, c: MeritCohort, conf: number): number {
  const n = s.ordersCompleted
  const parts: number[] = []
  if (s.onTimeRate != null) parts.push(clamp(shrinkRate(s.onTimeRate, c.onTimeRateMean, n, conf) * 100))
  if (s.acceptRate != null) parts.push(clamp(shrinkRate(s.acceptRate, c.acceptRateMean, n, conf) * 100))
  if (s.defectRatePer100 != null) {
    const d = shrinkRate(s.defectRatePer100, c.defectRatePer100Mean, n, conf)
    const ref = Math.max(0.5, c.defectRatePer100Mean) * DEFECT_ZERO_AT
    parts.push(clamp(100 * (1 - d / ref)))
  }
  if (parts.length === 0) return 50 // no ops data → neutral
  return parts.reduce((a, b) => a + b, 0) / parts.length
}

/** Contribution — log-scaled completed-order volume vs cohort + a small breadth bonus. */
function contributionPillar(s: MeritSignals, c: MeritCohort): number {
  const ref = Math.log(1 + 2 * Math.max(1, c.ordersMedian))
  const vol = ref > 0 ? (Math.log(1 + Math.max(0, s.ordersCompleted)) / ref) * 100 : 0
  const breadth = Math.min(BREADTH_BONUS_CAP, Math.max(0, s.productCount))
  return clamp(vol + breadth)
}

/** Standing — tenure with a recent-upheld-defect dent. */
function standingPillar(s: MeritSignals): number {
  const tenure = clamp((s.monthsActive / TENURE_TARGET_MONTHS) * 100)
  let penalty = 0
  if (s.cleanRecencyDays != null && s.cleanRecencyDays < RECENCY_WINDOW_DAYS) {
    penalty = RECENCY_MAX_PENALTY * (1 - s.cleanRecencyDays / RECENCY_WINDOW_DAYS)
  }
  return clamp(tenure - penalty)
}

/**
 * Compute a manufacturer's MeritScore, pillar breakdown, and the badge it
 * qualifies for right now. Pure + deterministic. Hysteresis (sustained
 * promotion / warned demotion) is applied by the caller against prior snapshots.
 */
export function computeMeritScore(
  signals: MeritSignals,
  policy: MeritPolicy = DEFAULT_MERIT_POLICY,
  cohort: MeritCohort,
): MeritResult {
  const w = policy.weights
  const pillars = {
    craft: round1(craftPillar(signals, cohort)),
    reliability: round1(reliabilityPillar(signals, cohort, policy.opsConfidence)),
    contribution: round1(contributionPillar(signals, cohort)),
    standing: round1(standingPillar(signals)),
  }
  const wsum = w.craft + w.reliability + w.contribution + w.standing || 1
  const meritScore = round1(
    (pillars.craft * w.craft +
      pillars.reliability * w.reliability +
      pillars.contribution * w.contribution +
      pillars.standing * w.standing) /
      wsum,
  )

  const defect = signals.defectRatePer100 ?? 0
  const trusted =
    meritScore >= policy.thresholds.trusted &&
    signals.ordersCompleted >= policy.evidence.trustedMinOrders &&
    signals.monthsActive >= policy.evidence.trustedMinMonths
  const premier =
    meritScore >= policy.thresholds.premier &&
    signals.ordersCompleted >= policy.evidence.premierMinOrders &&
    signals.monthsActive >= policy.evidence.premierMinMonths &&
    defect <= policy.evidence.premierMaxDefectPer100

  const qualifiedBadge: MeritBadge = premier ? 'PREMIER' : trusted ? 'TRUSTED' : 'VERIFIED'

  return {
    meritScore,
    pillars,
    qualifiedBadge,
    eligibility: { trusted, premier },
    gaps: buildGaps(meritScore, pillars, signals, policy),
  }
}

/** A few plain-language reasons the badge isn't higher (for the standing card). */
function buildGaps(
  score: number,
  pillars: MeritResult['pillars'],
  s: MeritSignals,
  p: MeritPolicy,
): string[] {
  const gaps: string[] = []
  const nextName = score < p.thresholds.trusted ? 'Trusted' : 'Premier'
  const nextScore = score < p.thresholds.trusted ? p.thresholds.trusted : p.thresholds.premier
  const minOrders = score < p.thresholds.trusted ? p.evidence.trustedMinOrders : p.evidence.premierMinOrders
  const minMonths = score < p.thresholds.trusted ? p.evidence.trustedMinMonths : p.evidence.premierMinMonths

  if (score < nextScore) gaps.push(`MeritScore ${score} — ${nextName} needs ${nextScore}`)
  if (s.ordersCompleted < minOrders)
    gaps.push(`${minOrders - s.ordersCompleted} more completed orders for ${nextName}`)
  if (s.monthsActive < minMonths)
    gaps.push(`${minMonths - s.monthsActive} more months active for ${nextName}`)
  if (nextName === 'Premier' && (s.defectRatePer100 ?? 0) > p.evidence.premierMaxDefectPer100)
    gaps.push(
      `Defect rate ${s.defectRatePer100}/100 — Premier needs ≤ ${p.evidence.premierMaxDefectPer100}`,
    )
  // Point at the weakest pillar as the highest-leverage lift.
  const weakest = (Object.entries(pillars) as Array<[string, number]>).sort((a, b) => a[1] - b[1])[0]
  if (weakest && weakest[1] < 70) gaps.push(`Lowest pillar: ${weakest[0]} (${weakest[1]})`)
  return gaps
}

// ---------------------------------------------------------------------------
// Hysteresis — the anti-yo-yo layer the nightly cron applies over snapshots.
// Promotion needs the level SUSTAINED; demotion needs a longer MISS + not in
// grace; one rung at a time. One bad night never moves anyone.
// ---------------------------------------------------------------------------

export type BadgeAction = 'PROMOTE' | 'DEMOTE' | 'HOLD'

export interface BadgeSnapshotRef {
  qualifiedBadge: MeritBadge
  computedAt: Date
}

export interface BadgeRecommendation {
  action: BadgeAction
  from: MeritBadge
  to: MeritBadge
  reason: string
}

const BADGE_RANK: Record<MeritBadge, number> = { VERIFIED: 0, TRUSTED: 1, PREMIER: 2 }
const BADGE_BY_RANK: MeritBadge[] = ['VERIFIED', 'TRUSTED', 'PREMIER']

/** Lowest qualified rank across [windowStart, now]; null if history doesn't cover the window. */
function sustainedFloor(history: readonly BadgeSnapshotRef[], windowStartMs: number, nowMs: number): number | null {
  const inWin = history.filter((h) => h.computedAt.getTime() >= windowStartMs && h.computedAt.getTime() <= nowMs)
  if (inWin.length === 0) return null
  const covers = history.some((h) => h.computedAt.getTime() <= windowStartMs) // history reaches before the window
  if (!covers) return null
  return Math.min(...inWin.map((h) => BADGE_RANK[h.qualifiedBadge]))
}

/** Highest qualified rank across the window; null if history doesn't cover it. */
function windowCeil(history: readonly BadgeSnapshotRef[], windowStartMs: number, nowMs: number): number | null {
  const inWin = history.filter((h) => h.computedAt.getTime() >= windowStartMs && h.computedAt.getTime() <= nowMs)
  if (inWin.length === 0) return null
  const covers = history.some((h) => h.computedAt.getTime() <= windowStartMs)
  if (!covers) return null
  return Math.max(...inWin.map((h) => BADGE_RANK[h.qualifiedBadge]))
}

/**
 * Given the current tier and a trailing set of snapshots (INCLUDING the one just
 * computed, at `now`), decide whether to promote, demote, or hold — with
 * hysteresis. Pure; the cron acts on the result (and in shadow-mode only logs it).
 */
export function recommendBadgeChange(
  currentBadge: MeritBadge,
  history: readonly BadgeSnapshotRef[],
  policy: MeritPolicy,
  ctx: { now: Date; promoteSustainDays: number; demoteMissDays: number; inGrace: boolean },
): BadgeRecommendation {
  const cur = BADGE_RANK[currentBadge]
  const nowMs = ctx.now.getTime()
  const hold = (reason: string): BadgeRecommendation => ({ action: 'HOLD', from: currentBadge, to: currentBadge, reason })

  // Promotion — the level continuously held over the sustain window.
  const floor = sustainedFloor(history, nowMs - ctx.promoteSustainDays * 86_400_000, nowMs)
  if (floor != null && floor > cur) {
    const to = BADGE_BY_RANK[floor]!
    return { action: 'PROMOTE', from: currentBadge, to, reason: `Sustained ${to} for ${ctx.promoteSustainDays}d` }
  }

  // Demotion — one rung, only after a longer miss, never during grace.
  if (!ctx.inGrace && cur > 0) {
    const ceil = windowCeil(history, nowMs - ctx.demoteMissDays * 86_400_000, nowMs)
    if (ceil != null && ceil < cur) {
      const to = BADGE_BY_RANK[cur - 1]!
      return { action: 'DEMOTE', from: currentBadge, to, reason: `Below ${currentBadge} for ${ctx.demoteMissDays}d` }
    }
  }

  return hold(ctx.inGrace ? 'In grace window — promote-only' : 'No sustained change')
}

/** Validate an admin MeritPolicy — returns an error string, or null when valid. */
export function validateMeritPolicy(p: MeritPolicy): string | null {
  const w = p.weights
  const sum = w.craft + w.reliability + w.contribution + w.standing
  if (sum !== 100) return `Pillar weights must sum to 100 (got ${sum}).`
  if ([w.craft, w.reliability, w.contribution, w.standing].some((x) => x < 0))
    return 'Pillar weights cannot be negative.'
  if (!(p.thresholds.trusted < p.thresholds.premier))
    return 'Trusted threshold must be below Premier.'
  if ([p.thresholds.trusted, p.thresholds.premier].some((x) => x < 0 || x > 100))
    return 'Thresholds must be 0–100.'
  if (p.opsConfidence <= 0) return 'opsConfidence must be positive.'
  for (const badge of ['VERIFIED', 'TRUSTED', 'PREMIER'] as MeritBadge[]) {
    const bps = p.feeBpsByBadge[badge]
    if (bps < 0 || bps > 10_000) return `${badge} fee must be 0–10000 bps.`
  }
  return null
}
