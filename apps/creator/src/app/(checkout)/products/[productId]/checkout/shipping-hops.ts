// PS-3d — per-hop shipping (docs/PRINT_PROVIDER_SELECTION.md §8; Pavel
// 2026-07-06: the printer→applier label hop bills to the creator's SHIPPING
// line, and the summary keeps ONE Shipping line with an expandable per-hop
// breakdown). Pure module — both the estimate action and placeOrder import
// from here so the number the creator saw is the number that books.

export interface ShippingHop {
  kind: 'LABELS' | 'FINISHED_GOODS'
  /** Human line for the breakdown, e.g. "Labels: print partner → manufacturer". */
  label: string
  cents: number
}

/**
 * V1 flat model for the label freight hop (printer → applier). Printed labels
 * / sleeves are lightweight parcel freight: a small base + slow per-unit
 * growth, nothing like finished-goods pallet rates. Admin-tunable rate card
 * lands with the logistics settings pass; until then this mirrors the flat
 * fallback style of estimateFlatShipping.
 *
 *   500 units  → $15.00
 * 1 000 units  → $18.00
 * 5 000 units  → $42.00
 */
export function estimateLabelHopCents(physicalUnits: number): number {
  if (physicalUnits <= 0) return 0
  return 1200 + Math.ceil(physicalUnits / 500) * 300
}

/** Breakdown copy for the label hop, by who applies. */
export function labelHopCopy(applier: 'MANUFACTURER' | 'FC'): string {
  return applier === 'FC'
    ? 'Labels: print partner → fulfillment center'
    : 'Labels: print partner → manufacturer'
}
