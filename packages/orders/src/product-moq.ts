// MB-5 (pure) — the product's effective manufacturing MOQ, DERIVED from batch
// economics, not read from a flat per-manufacturer number.
//
// WHY (Pavel, LOCKED): MOQ is PER-PRODUCT, not manufacturer-wide. The same maker
// runs sparkling water at 30,000 and packing-peanut spice at 5,000 because the
// BATCH SIZE differs per product, not because the shop has one global floor. So the
// floor a product must clear is "one batch of the line that makes it": you cannot
// run half a batch, so the minimum orderable quantity is exactly one batch.
//
// The line carries the DEFAULT batch (PartnerManufacturingLine.unitsPerBatch); the
// product may OVERRIDE it (ProductTemplate.unitsPerBatch). MOQ = the override if
// set, else the line default. When neither exists we fall back to the manufacturer's
// DECLARED floor (capabilities.moqMin) — that is a real number a partner typed, not
// an invented one, so this is a legitimate basis, not a fabrication.
//
// PURE. No prisma, no I/O. routing.ts does the DB read and passes plain numbers.

export interface ProductMoqInput {
  /** ProductTemplate.unitsPerBatch — the product's batch-size override, if any. */
  productUnitsPerBatch?: number | null
  /** PartnerManufacturingLine.unitsPerBatch — the assigned line's default batch. */
  lineUnitsPerBatch?: number | null
  /** capabilities.moqMin — the manufacturer's declared flat floor (the legacy basis). */
  declaredMoqMin?: number | null
}

export type ProductMoqBasis = 'PRODUCT_BATCH' | 'LINE_BATCH' | 'DECLARED_FLOOR' | 'NONE'

export interface ProductMoq {
  /** The minimum orderable quantity, in units. 0 = no floor known. */
  moqUnits: number
  /** Which input the floor came from (for snapshotting / diagnostics). */
  basis: ProductMoqBasis
}

const posInt = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null

/**
 * Resolve the product's MOQ by DECLARED preference, never by max or invention:
 *   1. PRODUCT_BATCH   — the product overrides the batch size → one product batch.
 *   2. LINE_BATCH      — no override → one batch of the assigned line.
 *   3. DECLARED_FLOOR  — no batch data at all → the manufacturer's typed moqMin.
 *   4. NONE            — nothing declared → 0 (no floor; caller decides, does not invent).
 *
 * The preference order is the point: a product-specific batch is the truest floor,
 * a line default is the next truest, and the flat declared floor is the legacy
 * basis we are migrating OFF. Returning NONE (0) rather than a guess keeps the
 * "no fabricated number" doctrine intact.
 */
export function deriveProductMoq(input: ProductMoqInput): ProductMoq {
  const product = posInt(input.productUnitsPerBatch)
  if (product !== null) return { moqUnits: product, basis: 'PRODUCT_BATCH' }

  const line = posInt(input.lineUnitsPerBatch)
  if (line !== null) return { moqUnits: line, basis: 'LINE_BATCH' }

  const declared = posInt(input.declaredMoqMin)
  if (declared !== null) return { moqUnits: declared, basis: 'DECLARED_FLOOR' }

  return { moqUnits: 0, basis: 'NONE' }
}

/**
 * Does the batch-derived MOQ DISAGREE with the flat declared floor? Used shadow-first
 * in routing: we log a divergence without changing the gate, so we can watch the new
 * basis against the old before flipping the gate onto it. A divergence is exactly the
 * bug MB-5 fixes (a per-product batch floor the flat number could never express).
 */
export function moqDivergence(input: ProductMoqInput): { derived: ProductMoq; declaredMoqMin: number; diverges: boolean } {
  const derived = deriveProductMoq(input)
  const declaredMoqMin = posInt(input.declaredMoqMin) ?? 0
  // Only a batch-sourced floor can meaningfully diverge from the declared one.
  const diverges = (derived.basis === 'PRODUCT_BATCH' || derived.basis === 'LINE_BATCH') && derived.moqUnits !== declaredMoqMin
  return { derived, declaredMoqMin, diverges }
}
