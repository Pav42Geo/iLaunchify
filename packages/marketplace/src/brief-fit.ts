// Co-creation fit engine — pure evaluator (docs/CO_CREATION_MARKETPLACE_SPEC.md §8).
// Decides (a) whether a brief may surface in a partner's Opportunity Pool at
// all (HARD filters — never weighted, mirroring the logistics rule that temp
// class + hazmat are hard filters) and (b) the 0–100 fitScore snapshotted onto
// BriefInterest.fitScore and used to rank the creator's shortlist.
//
// Pure + Prisma-free (structural facts in, result out) so it runs in
// run-vitest-suites.mjs; the DB loader that assembles PartnerFitFacts lands
// with the Opportunity Pool build. Ranking blends fit + merit + track record —
// NOT price alone (§8).
//
// V1 facts gaps (deliberate): manufacturing-format match and temp/hazmat/
// allergen gates need brief-level facts that the Brief Builder doesn't collect
// yet — wire them in as HARD filters when the fields exist. Weights are
// exported consts so a future admin console can tune them (D-CC6).

/** Facts about the brief, derived from the ProductBrief row. */
export interface BriefFitFacts {
  nicheSlug: string
  /** Layer-2 Category id (13 locked). */
  categoryId?: string | null
  claims: string[]
  targetVolume?: number | null
}

/** Facts about one manufacturer service line (assembled by the pool loader). */
export interface PartnerFitFacts {
  /** Niches this partner serves (Layer-1 slugs). HARD filter. */
  nicheSlugs: ReadonlyArray<string>
  /** Category ids this partner can produce. HARD filter when non-empty. */
  categoryIds?: ReadonlyArray<string>
  /** Claims this partner can meet (same vocabulary as brief.claims). */
  claimsSupported?: ReadonlyArray<string>
  /** Partner's minimum order quantity. HARD filter vs targetVolume. */
  moqFloor?: number | null
  /** Practical per-run capacity ceiling, if declared. Weighted, not hard. */
  volumeCapacity?: number | null
  /** Bayesian-smoothed rating 0..5 (FEEDBACK_MODULE.md). Weighted. */
  meritRating?: number | null
  /** Coarse location bias — same region as the creator. Weighted. */
  sameRegion?: boolean
}

export interface BriefFitResult {
  /** false ⇒ brief must NOT surface in this partner's pool. */
  eligible: boolean
  /** Machine-readable hard-filter failures (empty when eligible). */
  hardFails: string[]
  /** 0–100. Always 0 when ineligible. */
  score: number
  /** Per-component contribution for debug/audit payloads. */
  parts: { claims: number; volume: number; merit: number; location: number }
}

/** Weighted-score component maxima. DEFAULTS — the live values are the admin's
 *  CoCreationSettings (D-CC6 DECIDED 2026-07-10: merit stays moderate at 25 and
 *  tunable; merit is a WEIGHT, never a gate — low-merit makers keep bidding and
 *  creators judge with full information). Raw magnitudes; the scorer
 *  renormalizes so any admin combination still lands on a 0–100 score. */
export const FIT_WEIGHTS = {
  /** Claim coverage — the strongest capability signal we have at brief time. */
  claims: 40,
  /** Target volume vs partner capacity band. */
  volume: 20,
  /** Merit/rating (Bayesian) — earned standing, never purchased. */
  merit: 25,
  /** Location bias — proximity nudge, never a gate. */
  location: 15,
} as const

export interface FitWeights {
  claims: number
  volume: number
  merit: number
  location: number
}

/** Evaluate one brief against one partner's facts. `weights` defaults to
 *  FIT_WEIGHTS; pass the admin's CoCreationSettings values to tune (raw
 *  magnitudes — renormalized to a 0–100 score here). */
export function scoreBriefFit(
  brief: BriefFitFacts,
  partner: PartnerFitFacts,
  weights: FitWeights = FIT_WEIGHTS,
): BriefFitResult {
  // Renormalize so admin-tuned magnitudes always produce a 0–100 score.
  const total = weights.claims + weights.volume + weights.merit + weights.location
  const scale = total > 0 ? 100 / total : 0
  const W = {
    claims: weights.claims * scale,
    volume: weights.volume * scale,
    merit: weights.merit * scale,
    location: weights.location * scale,
  }
  const hardFails: string[] = []

  // HARD 1 — niche eligibility.
  if (!partner.nicheSlugs.includes(brief.nicheSlug)) hardFails.push('NICHE_MISMATCH')

  // HARD 2 — category capability (only when the partner declares categories).
  if (
    brief.categoryId &&
    partner.categoryIds &&
    partner.categoryIds.length > 0 &&
    !partner.categoryIds.includes(brief.categoryId)
  ) {
    hardFails.push('CATEGORY_MISMATCH')
  }

  // HARD 3 — MOQ floor: partner's minimum exceeds what the creator wants.
  if (
    typeof brief.targetVolume === 'number' &&
    brief.targetVolume > 0 &&
    typeof partner.moqFloor === 'number' &&
    partner.moqFloor > brief.targetVolume
  ) {
    hardFails.push('MOQ_ABOVE_TARGET')
  }

  if (hardFails.length > 0) {
    return { eligible: false, hardFails, score: 0, parts: { claims: 0, volume: 0, merit: 0, location: 0 } }
  }

  // WEIGHTED 1 — claim coverage (fraction of must-have claims supported).
  // No claims on the brief ⇒ full marks (nothing to miss). No declared
  // support list ⇒ neutral half credit (unknown ≠ incapable).
  const supported = new Set(partner.claimsSupported ?? [])
  const claimsPart =
    brief.claims.length === 0
      ? W.claims
      : partner.claimsSupported === undefined
        ? W.claims / 2
        : (brief.claims.filter((c) => supported.has(c)).length / brief.claims.length) *
          W.claims

  // WEIGHTED 2 — volume fit. Unknowns ⇒ neutral half credit. Within capacity
  // ⇒ full; above capacity ⇒ scaled by capacity/target (never negative).
  let volumePart = W.volume / 2
  if (
    typeof brief.targetVolume === 'number' &&
    brief.targetVolume > 0 &&
    typeof partner.volumeCapacity === 'number' &&
    partner.volumeCapacity > 0
  ) {
    volumePart =
      brief.targetVolume <= partner.volumeCapacity
        ? W.volume
        : Math.max(0, (partner.volumeCapacity / brief.targetVolume) * W.volume)
  }

  // WEIGHTED 3 — merit (0..5 → 0..max). Unrated ⇒ neutral half credit so new
  // partners aren't buried (mirrors the rotation engine's new-provider ramp).
  const meritPart =
    typeof partner.meritRating === 'number'
      ? (Math.min(Math.max(partner.meritRating, 0), 5) / 5) * W.merit
      : W.merit / 2

  // WEIGHTED 4 — location bias.
  const locationPart = partner.sameRegion ? W.location : W.location / 2

  const parts = {
    claims: round1(claimsPart),
    volume: round1(volumePart),
    merit: round1(meritPart),
    location: round1(locationPart),
  }
  const score = Math.min(100, Math.max(0, Math.round(claimsPart + volumePart + meritPart + locationPart)))
  return { eligible: true, hardFails: [], score, parts }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
