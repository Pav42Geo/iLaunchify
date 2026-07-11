// P2 label compliance pre-check (CO_CREATION_MARKETPLACE_SPEC §16 P2,
// 2026-07-10). PURE, display-oriented readiness pass over the room's computed
// label (RoomRecipeLabelView) — per-domain checks of the MANDATORY label
// elements, honest about what's missing and why it matters.
//
// Deliberately NOT the Python compliance service (services/compliance): that
// evaluates full rule packs against a persisted Recipe; this is the room's
// in-flight early-warning system over data we already computed through
// @ilaunchify/nutrition. NON-GATING: it informs, it never blocks — the
// creator can still materialize and finish in the Studio (where the full
// compliance scan runs).
//
// Runs in run-vitest-suites.mjs (packages/ui/src/lib).

export interface RoomComplianceItem {
  id: string
  severity: 'BLOCKING' | 'WARNING'
  message: string
  /** Regulation anchor for the tooltip, e.g. "21 CFR 101.9". */
  cfr?: string
}

export interface RoomComplianceReport {
  outcome: 'READY' | 'READY_WITH_WARNINGS' | 'NOT_READY'
  items: RoomComplianceItem[]
}

/** Structural subset of RoomRecipeLabelView the checks need (kept loose so
 *  the pure test file doesn't drag in the whole shell type). */
export interface RoomLabelLike {
  domain: string
  coverage: { resolved: number; total: number; unresolvedNames: string[] }
  serving: { sizeG: number | null; perContainer: number | null; netQuantity: unknown | null }
  panel: unknown | null
  statement: string | null
  containsLine: string | null
  containsIncomplete: boolean
  inciText: string | null
  petOrder: string[] | null
  otherIngredients: string[] | null
  petGa: { rows: { label: string; value: string }[]; adequacyStatement: string | null; feedingDirections: string | null } | null
  drugFacts: {
    activeIngredients: { name: string; purpose: string }[]
    uses: string[]
    warnings: { text: string }[]
    directions: string
    inactiveIngredients: string
  } | null
}

export function checkRoomLabelReadiness(label: RoomLabelLike): RoomComplianceReport {
  const items: RoomComplianceItem[] = []
  const push = (id: string, severity: RoomComplianceItem['severity'], message: string, cfr?: string) =>
    items.push({ id, severity, message, ...(cfr ? { cfr } : {}) })

  const isFoodish = label.domain === 'FOOD' || label.domain === 'BEVERAGE_FUNCTIONAL'

  // ── Universal — ingredient resolution + FALCPA safety gate ────────────────
  if (label.coverage.total > 0 && label.coverage.resolved < label.coverage.total) {
    push(
      'coverage',
      'WARNING',
      `${label.coverage.total - label.coverage.resolved} of ${label.coverage.total} ingredients unmatched — facts are computed from partial data`,
    )
  }
  if ((isFoodish || label.domain === 'SUPPLEMENT') && label.containsIncomplete) {
    push(
      'falcpa',
      'BLOCKING',
      'Allergen (Contains) statement pending — every ingredient must resolve before it can print',
      'FALCPA §203',
    )
  }

  // ── Domain-specific mandatory elements ────────────────────────────────────
  if (isFoodish) {
    if (!label.panel) {
      push('panel', 'BLOCKING', 'Nutrition Facts panel missing — add serving size and servings per container', '21 CFR 101.9')
    }
    if (!label.statement) {
      push('statement', 'BLOCKING', 'Ingredient statement missing — matched rows need gram amounts', '21 CFR 101.4')
    }
    if (!label.serving.netQuantity) {
      push('netqty', 'BLOCKING', 'Net quantity of contents missing', '21 CFR 101.105')
    }
  } else if (label.domain === 'SUPPLEMENT') {
    if (!label.panel) {
      push('panel', 'BLOCKING', 'Supplement Facts panel missing — add the structured formulation (per-serving amounts)', '21 CFR 101.36')
    }
    if (!label.serving.netQuantity) {
      push('netqty', 'WARNING', 'Net quantity of contents not set yet', '21 CFR 101.105')
    }
  } else if (label.domain === 'COSMETIC') {
    if (!label.inciText) {
      push('inci', 'BLOCKING', 'INCI ingredient declaration missing — match rows to catalog ingredients', '21 CFR 701.3')
    }
    if (!label.serving.netQuantity) {
      push('netqty', 'WARNING', 'Net quantity of contents not set yet', '21 CFR 701.13')
    }
  } else if (label.domain === 'PET') {
    if (!label.petOrder) {
      push('ingredients', 'BLOCKING', 'Ingredient list missing — matched rows need gram amounts (descending weight)', 'AAFCO')
    }
    if (!label.petGa || label.petGa.rows.length === 0) {
      push('ga', 'BLOCKING', 'Guaranteed Analysis missing — enter the values from lab results', 'AAFCO')
    } else {
      if (!label.petGa.adequacyStatement) {
        push('adequacy', 'WARNING', 'Nutritional adequacy statement not set', 'AAFCO')
      }
      if (!label.petGa.feedingDirections) {
        push('feeding', 'WARNING', 'Feeding directions not set', 'AAFCO')
      }
    }
  } else if (label.domain === 'OTC') {
    if (!label.drugFacts) {
      push('drugfacts', 'BLOCKING', 'Drug Facts missing — a panel needs at least one active ingredient', '21 CFR 201.66')
    } else {
      if (!label.drugFacts.directions.trim()) {
        push('directions', 'BLOCKING', 'Directions are required on a Drug Facts panel', '21 CFR 201.66(c)(6)')
      }
      if (label.drugFacts.uses.length === 0) {
        push('uses', 'WARNING', 'No Uses listed yet', '21 CFR 201.66(c)(4)')
      }
      if (label.drugFacts.warnings.length === 0) {
        push('warnings', 'WARNING', 'No Warnings listed yet — most OTC monographs require them', '21 CFR 201.66(c)(5)')
      }
      if (!label.drugFacts.inactiveIngredients.trim()) {
        push('inactive', 'WARNING', 'Inactive ingredients not listed yet', '21 CFR 201.66(c)(8)')
      }
    }
  }

  const blocking = items.some((i) => i.severity === 'BLOCKING')
  return {
    outcome: blocking ? 'NOT_READY' : items.length > 0 ? 'READY_WITH_WARNINGS' : 'READY',
    items,
  }
}
