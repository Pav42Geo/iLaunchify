// Creator platform-fee resolver: the SINGLE source of truth for the creator-side
// production fee (docs/FEE_MODEL_RECONCILIATION_SPEC_2026-07-09).
//
// Decision (Pavel 2026-07-09): the creator pays the platform a production fee equal
// to their SUBSCRIPTION-TIER rate, Maker 15% / Builder 12% / Agency 8%, which is
// admin-editable from Tiers & Plans (the FeeRule rows). This RETIRES the flat 5%
// OrderSettings.productionFeeBps as the creator-fee source, and the manufacturer
// merit fee (4.5/2.5/0%) is a SEPARATE payout withhold (see
// packages/orders/manufacturer-merit-fee.ts), never added to the creator's charge.
//
// THIS FILE IS THE PRISMA-BACKED HALF. The pure half moved to ./creator-fee-math
// (PP-0b, 2026-07-16) and is re-exported below so every existing import keeps
// working. The split was not cosmetic: this file imports ./lookups, which is
// server-only (it eagerly imports prisma), so anything importing the pure core
// from here dragged a DB client behind it. That blocked the client-side
// configurator (which then hand-rolled the fee and dropped the bounds) and the
// pure pins. Import from './creator-fee-math' when you need only the math.
//
// Every charge path (checkout cart-actions, channel reorders) calls the wrapper.
// Nothing else recomputes a platform fee. That is what keeps "fee shown == fee
// charged" true and stops the flat-5% / 15-12-8 drift the audit found.

import { creatorTierToPlanCode, lookupFeeRate } from './lookups'
import { FEE_EVENTS } from './codes'
import { creatorFeeFromRule, CREATOR_FEE_FALLBACK_BPS } from './creator-fee-math'
import type { CreatorFee, CreatorTier, FeeRuleBounds } from './creator-fee-math'

// Re-exported so `from './creator-fee'` and `from '@ilaunchify/plans'` keep
// resolving exactly as before. New client-side code should import the subpath
// '@ilaunchify/plans/math' instead, which cannot reach prisma.
export { creatorFeeFromRule, creatorFeeCents, CREATOR_FEE_FALLBACK_BPS } from './creator-fee-math'
export type { CreatorFee, CreatorFeeSource, CreatorTier, FeeRuleBounds } from './creator-fee-math'

// ─── PRISMA-BACKED WRAPPER (the seam every charge path calls) ─────────────────

/**
 * Resolve the creator's platform fee bps for a tier from the admin-editable FeeRule.
 * Reads the cached FeeRule (invalidated on admin edit) via lookupFeeRate, then the
 * pure core. Never throws: any lookup gap falls back to the MAKER rate.
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
