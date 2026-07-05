// Per-flavor label safety — submit completeness gate (docs/PER_FLAVOR_LABEL_SAFETY_UX.md §Verify).
//
// PURE + unit-testable. Given the flavors the creator SELECTED for this product (not the full
// template pool), which of them already have a saved label design, and whether an aggregate label
// is required, decide whether the product is ready to submit. Code calls this from the Studio submit
// gate and renders the checklist; this module makes no side effects.

export interface CompletenessInput {
  /** The flavors the creator selected for THIS product (subset of the template pool). */
  flavors: { id: string; name: string }[]
  /** Flavor ids that have a saved Design (label). */
  savedFlavorIds: readonly string[]
  /** True when the pack also needs a single aggregate/outer label (AGGREGATE topology). */
  needsAggregate: boolean
  /** Whether that aggregate label has been saved. */
  aggregateSaved: boolean
}

export interface CompletenessResult {
  /** True when every selected flavor has a label and the aggregate (if required) exists. */
  complete: boolean
  /** Names of selected flavors still missing a label. */
  missingFlavors: string[]
  /** True when an aggregate label is required but not yet saved. */
  missingAggregate: boolean
}

export function checkFlavorCompleteness(input: CompletenessInput): CompletenessResult {
  const saved = new Set(input.savedFlavorIds)
  const missingFlavors = input.flavors.filter((f) => !saved.has(f.id)).map((f) => f.name)
  const missingAggregate = input.needsAggregate && !input.aggregateSaved
  return {
    complete: missingFlavors.length === 0 && !missingAggregate,
    missingFlavors,
    missingAggregate,
  }
}
