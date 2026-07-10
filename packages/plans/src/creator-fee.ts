// Creator platform-fee resolver — the SINGLE source of truth for the creator-side
// production fee (docs/FEE_MODEL_RECONCILIATION_SPEC_2026-07-09).
//
// Decision (Pavel 2026-07-09): the creator pays the platform a production fee equal
// to their SUBSCRIPTION-TIER rate — Maker 15% / Builder 12% / Agency 8% — which is
// admin-editable from Tiers & Plans (the FeeRule rows). This RETIRES the flat 5%
// OrderSettings.productionFeeBps as the creator-fee source, and the manufacturer
// merit fee (4.5/2.5/0%) is a SEPARATE payout withhold (see
// packages/orders/manufacturer-merit-fee.ts), never added to the creator's charge.
//
// STRUCTURE mirrors the merit split: a PURE core (creatorFeeFromRule / creatorFeeCents)
// that unit-tests without prisma, plus a thin prisma-backed wrapper
// (resolveCreatorFeeBps) that reads the admin-editable FeeRule via lookupFeeRate.
// Every charge path (checkout cart-actions, channel reorders) calls the wrapper —
// nothing else recomputes a platform fee. That is what keeps "fee shown == fee
// charged" true and stops the flat-5% / 15-12-8 drift the audit found.

import { creatorTierToPlanCode, lookupFeeRate, type FeeRuleValue } from './lookups'
import { FEE_EVENTS } from './codes'

export type CreatorFeeSource = 'TIER_RULE' | 'FALLBACK'

export interface CreatorFee {
  /** Platform production fee, in basis points (1500 / 1200 / 800). */
  feeBps: number
  /** TIER_RULE = resolved from the tier's FeeRule; FALLBACK = no rule configured. */
  source: CreatorFeeSource
}

export type CreatorTier = 'maker' | 'builder' | 'agency'

/**
 * Fallback fee when a creator has no plan-specific FeeRule (e.g. seed not run, or a
 * tier without a rule). Pavel 2026-07-09: fall back to the MAKER rate (15%) — the
 * conservative default — NEVER the retired flat 5%.
 */
export const CREATOR_FEE_FALLBACK_BPS = 1500

// ─── PURE CORE (unit-tested, no prisma) ──────────────────────────────────────

/**
 * Convert a resolved FeeRule into fee bps. ratePercent is a percent (15.00), so
 * ×100 → bps (1500). Returns the FALLBACK bps + source when the rule (or its
 * ratePercent) is missing. Pure — safe to unit-test and to call from anywhere.
 */
export function creatorFeeFromRule(rule: FeeRuleValue | null | undefined): CreatorFee {
  if (rule?.ratePercent == null || !Number.isFinite(rule.ratePercent)) {
    return { feeBps: CREATOR_FEE_FALLBACK_BPS, source: 'FALLBACK' }
  }
  return { feeBps: Math.round(rule.ratePercent * 100), source: 'TIER_RULE' }
}

/** The flat/min/max knobs a FeeRule may carry (all optional; null = unset). */
export interface FeeRuleBounds {
  flatCents?: number | null
  minCents?: number | null
  maxCents?: number | null
}

/**
 * Compute the creator application fee in cents for a given base + bps, applying the
 * FeeRule's flat/min/max bounds. ONE rounding function for every charge path
 * (Math.round) — the audit found floor-vs-round drift between checkout and channel
 * reorders; this unifies it. Never returns negative. Pure.
 */
export function creatorFeeCents(baseCents: number, feeBps: number, bounds?: FeeRuleBounds): number {
  const pct = Math.round((baseCents * feeBps) / 10000)
  let fee = pct + (bounds?.flatCents ?? 0)
  if (bounds?.minCents != null) fee = Math.max(fee, bounds.minCents)
  if (bounds?.maxCents != null) fee = Math.min(fee, bounds.maxCents)
  return Math.max(fee, 0)
}

// ─── PRISMA-BACKED WRAPPER (the seam every charge path calls) ─────────────────

/**
 * Resolve the creator's platform fee bps for a tier from the admin-editable FeeRule.
 * Reads the cached FeeRule (invalidated on admin edit) via lookupFeeRate, then the
 * pure core. Never throws — any lookup gap falls back to the MAKER rate.
 *
 * Callers should snapshot the returned feeBps + source onto the Order at checkout
 * (Order.platformFeeBps / platformFeeSource) so historical orders reproduce.
 */
export async function resolveCreatorFeeBps(tier: CreatorTier): Promise<CreatorFee> {
  try {
    const rule = await lookupFeeRate(creatorTierToPlanCode(tier), FEE_EVENTS.PRODUCTION_ORDER_SUBTOTAL)
    return creatorFeeFromRule(rule)
  } catch {
    return { feeBps: CREATOR_FEE_FALLBACK_BPS, source: 'FALLBACK' }
  }
}

/** Convenience: resolve the fee bounds (flat/min/max) for a tier, for creatorFeeCents. */
export async function resolveCreatorFeeBounds(tier: CreatorTier): Promise<FeeRuleBounds> {
  try {
    const rule = await lookupFeeRate(creatorTierToPlanCode(tier), FEE_EVENTS.PRODUCTION_ORDER_SUBTOTAL)
    return { flatCents: rule?.flatCents ?? null, minCents: rule?.minCents ?? null, maxCents: rule?.maxCents ?? null }
  } catch {
    return {}
  }
}
