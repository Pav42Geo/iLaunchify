// MB — overrun-into-price SHADOW (pure). A blending batch makes what a batch makes: an
// order that does not land on a batch multiple produces OVERRUN units, and the
// manufacturer's overrun policy (PartnerManufacturingConfig.overrunPolicyPct) decides how
// many of those the creator pays for. TODAY the charge bills exactly the ordered quantity
// (qty), ignoring overrun. This computes what the charge WOULD be under the policy, so we
// can log the delta and watch it on real orders BEFORE ever flipping the charge onto it.
//
// SHADOW-FIRST DOCTRINE: this changes no bill. It reuses billedUnits (the policy SSOT) so
// the shadow and any future flip cannot diverge. The maxBatchesPerRun ceiling is a CAPACITY
// gate, not a pricing gate, so (unlike runBatches) it does not nullify the pricing view.
//
// PURE. No prisma, no I/O.

import { billedUnits } from './batch-economics'

export interface OverrunShadowInput {
  /** The product's batch size (ProductTemplate.unitsPerBatch override, else line default). */
  unitsPerBatch: number
  /** The PRODUCTION quantity in UNITS (bandUnits — packs already expanded). */
  qtyUnits: number
  /** PartnerManufacturingConfig.overrunPolicyPct. Null/undefined ⇒ 100 (creator buys the full batch). */
  overrunPolicyPct?: number | null
  /** The unit price the order is charged at, in cents (for the delta in money). */
  unitPriceCents: number
}

export interface OverrunShadow {
  batches: number
  producedUnits: number
  overrunUnits: number
  /** Units the policy would bill: qty + round(overrun * pct/100). */
  billedUnits: number
  /** Units the charge bills TODAY (= qtyUnits). */
  chargedUnits: number
  /** billedUnits - chargedUnits (0 when the order lands on a batch multiple). */
  deltaUnits: number
  /** deltaUnits * unitPriceCents — what the flip would add to this creator's bill. */
  deltaCents: number
  /** The policy actually applied (clamped 0..100). */
  appliedPolicyPct: number
}

const posInt = (v: number): number => (Number.isFinite(v) && v > 0 ? Math.round(v) : 0)

/**
 * Compute the overrun pricing shadow, or null when there is no batch basis (no unitsPerBatch,
 * or a non-positive quantity) — in which case there is nothing to shadow and the caller logs
 * nothing. Returning null rather than a zero keeps "no data" distinct from "no overrun".
 */
export function assessOverrunShadow(input: OverrunShadowInput): OverrunShadow | null {
  const upb = posInt(input.unitsPerBatch)
  const qty = posInt(input.qtyUnits)
  if (upb === 0 || qty === 0) return null

  const batches = Math.ceil(qty / upb)
  const producedUnits = batches * upb
  const overrunUnits = producedUnits - qty
  const appliedPolicyPct = Math.max(0, Math.min(100, input.overrunPolicyPct ?? 100))
  const billed = billedUnits(overrunUnits, qty, appliedPolicyPct)
  const deltaUnits = billed - qty
  return {
    batches,
    producedUnits,
    overrunUnits,
    billedUnits: billed,
    chargedUnits: qty,
    deltaUnits,
    deltaCents: deltaUnits * Math.max(0, Math.round(input.unitPriceCents)),
    appliedPolicyPct,
  }
}
