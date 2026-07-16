// The PURE creator-fee math. NO prisma, NO I/O, NO imports that reach a DB.
//
// WHY THIS FILE EXISTS (PP-0b, 2026-07-16): creator-fee.ts already SAID its
// structure was "a PURE core plus a thin prisma-backed wrapper". It was, except
// both halves lived in ONE file, which imports ./lookups, which eagerly imports
// `prisma` from @ilaunchify/db and whose own line 4 reads "Server-only. Do not
// import from client code."
//
// So the pure core was unreachable from the two places that needed it most:
//
//   1. A CLIENT component. The configurator prices live as the creator picks
//      options, so the fee must recompute in the browser. It could not import
//      creatorFeeCents without dragging prisma into the client graph, so it
//      hand-rolled `Math.round((subtotal * pct) / 100)` instead and silently
//      dropped the FeeRule's flat/min/max bounds that the real charge applies.
//   2. A pure test. The order-pricing pins could not execute standalone because
//      importing creatorFeeCents pulled @ilaunchify/db in behind it.
//
// This is the same disease as estimateProductionCost (pure math trapped in a
// 'use server' file, so the charge path could not reuse it and silently omitted
// decoration). The cure is the same: give the pure thing its own file.
//
// Reachable from the client via the "@ilaunchify/plans/math" subpath, mirroring
// the @ilaunchify/ui/money precedent. Import THIS, never the barrel, from client
// code: the barrel re-exports ./lookups and therefore prisma.

export type CreatorFeeSource = 'TIER_RULE' | 'FALLBACK'
export type CreatorTier = 'maker' | 'builder' | 'agency'

export interface CreatorFee {
  /** Platform production fee, in basis points (1500 / 1200 / 800). */
  feeBps: number
  /** TIER_RULE = resolved from the tier's FeeRule; FALLBACK = no rule configured. */
  source: CreatorFeeSource
}

/**
 * Fallback fee when a creator has no plan-specific FeeRule (seed not run, or a
 * tier without a rule). Pavel 2026-07-09: fall back to the MAKER rate (15%), the
 * conservative default, NEVER the retired flat 5%.
 */
export const CREATOR_FEE_FALLBACK_BPS = 1500

/** The flat/min/max knobs a FeeRule may carry (all optional; null = unset). */
export interface FeeRuleBounds {
  flatCents?: number | null
  minCents?: number | null
  maxCents?: number | null
}

/** The shape creatorFeeFromRule reads. Structural, so it needs no lookups import. */
export interface FeeRuleRateLike {
  ratePercent?: number | null
}

/**
 * Convert a resolved FeeRule into fee bps. ratePercent is a percent (15.00), so
 * x100 -> bps (1500). Returns the FALLBACK bps + source when the rule (or its
 * ratePercent) is missing. Pure.
 */
export function creatorFeeFromRule(rule: FeeRuleRateLike | null | undefined): CreatorFee {
  if (rule?.ratePercent == null || !Number.isFinite(rule.ratePercent)) {
    return { feeBps: CREATOR_FEE_FALLBACK_BPS, source: 'FALLBACK' }
  }
  return { feeBps: Math.round(rule.ratePercent * 100), source: 'TIER_RULE' }
}

/**
 * The creator application fee in cents for a base + bps, applying the FeeRule's
 * flat/min/max bounds. ONE rounding function for every path (Math.round): the
 * audit found floor-vs-round drift between checkout and channel reorders.
 *
 * The BOUNDS are the reason this must not be hand-rolled. `Math.round(base * pct
 * / 100)` looks equivalent and is not: it silently ignores flat/min/max, so a
 * cart that hits a floor or a cap gets QUOTED unclamped and CHARGED clamped.
 * Never returns negative. Pure.
 */
export function creatorFeeCents(baseCents: number, feeBps: number, bounds?: FeeRuleBounds): number {
  const pct = Math.round((baseCents * feeBps) / 10000)
  let fee = pct + (bounds?.flatCents ?? 0)
  if (bounds?.minCents != null) fee = Math.max(fee, bounds.minCents)
  if (bounds?.maxCents != null) fee = Math.min(fee, bounds.maxCents)
  return Math.max(fee, 0)
}
