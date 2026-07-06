// Print sourcing signal — ONE pure function every surface consults
// (docs/PRINT_PROVIDER_SELECTION.md §2). Provider cards, Design Studio print
// spec, checkout review, findRouting, cancellation policy, and admin views all
// call this; NO surface re-derives it locally. That single-source rule is the
// whole point: appearance/hiding of print providers is routing-grade logic.

export type LabelingModeValue = 'IN_HOUSE' | 'EXTERNAL_ALLOWED' | 'EXTERNAL_REQUIRED'

export interface PrintSourcingProduct {
  /** Product.printSourcingMode — manufacturer's per-product override. */
  printSourcingMode?: LabelingModeValue | null
}

export interface PrintSourcingService {
  /** PartnerService.labelingMode — the manufacturing service's default. */
  labelingMode: LabelingModeValue
}

/**
 * Product override wins; else the service default.
 * - IN_HOUSE          → never show provider cards; routing skips printer search.
 * - EXTERNAL_ALLOWED  → cards shown; owner self-label remains the fallback.
 * - EXTERNAL_REQUIRED → cards shown; NO eligible printer = publish/checkout
 *                       pre-flight FAILURE (never silently self-labels).
 */
export function effectivePrintSourcing(
  product: PrintSourcingProduct | null | undefined,
  manufacturerService: PrintSourcingService,
): LabelingModeValue {
  return product?.printSourcingMode ?? manufacturerService.labelingMode
}

/** Whether the product detail page renders provider cards at all (§3). */
export function showsPrintProviderCards(mode: LabelingModeValue): boolean {
  return mode !== 'IN_HOUSE'
}

/** Whether routing may fall back to owner self-label (§2 routing changes). */
export function allowsSelfLabelFallback(mode: LabelingModeValue): boolean {
  return mode !== 'EXTERNAL_REQUIRED'
}
