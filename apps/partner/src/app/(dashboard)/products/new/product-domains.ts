// Product Domain registry — the single config that makes the builder adapt to
// Food / Supplement / Cosmetic / Pet / OTC. Keyed on the EXISTING schema enum
// `LabelingType` (FOOD · DIETARY_SUPPLEMENT · PET_PRODUCT · OTC · COSMETIC), which
// is per-product and derived-from-category with an admin lock.
//
// Phase 0 (docs/PRODUCT_DOMAINS_ARCHITECTURE.md): terminology + label routing
// read from here instead of ad-hoc `isCosmetic` branches. Per-domain ingredient
// search adapters (DSLD/INCI/AAFCO) + dedicated label renderers land in later
// phases — `searchBuilt`/`labelBuilt` flag what's live so the UI stays honest.

export type DomainKey = 'FOOD' | 'DIETARY_SUPPLEMENT' | 'PET_PRODUCT' | 'OTC' | 'COSMETIC'

export type SearchAdapter = 'USDA' | 'DSLD' | 'INCI' | 'AAFCO'
export type LabelKind =
  | 'NUTRITION_FACTS' // 21 CFR 101.9
  | 'SUPPLEMENT_FACTS' // 21 CFR 101.36
  | 'GUARANTEED_ANALYSIS' // AAFCO
  | 'DRUG_FACTS' // 21 CFR 201.66
  | 'INCI_DECLARATION' // 21 CFR 701 (no facts box)
export type RaccTable = 'GENERAL' | 'INFANT' | 'NA'

export interface ProductDomainConfig {
  key: DomainKey
  /** Short human label, e.g. "Supplement". */
  label: string
  /** Step / activity name — "Recipe" for food, "Formulation" otherwise. */
  stepName: string
  /** Singular ingredient noun, e.g. "dietary ingredient". */
  ingredientNoun: string
  ingredientNounPlural: string
  /** Where ingredient search resolves (Phase 1+). */
  searchAdapter: SearchAdapter
  searchSourceLabel: string
  /** Whether the dedicated search adapter is live yet (else fall back + notice). */
  searchBuilt: boolean
  /** Which label artifact this domain prints. */
  labelKind: LabelKind
  /** Engine panel format when this domain renders a Facts box (else undefined). */
  panelFormat?: 'STANDARD' | 'SUPPLEMENT_FACTS'
  /** Whether a Facts panel renders at all (cosmetics = false). */
  hasFactsPanel: boolean
  /** Whether the label renderer for this domain is live yet. */
  labelBuilt: boolean
  /** RACC table that serving sizes draw from. */
  raccTable: RaccTable
  /** Extra product fields this domain needs (Phase 1+). */
  extraFields: string[]
  /** Compliance rule pack id (informational in Phase 0). */
  rulePack: string
  /** Overall readiness of the end-to-end domain flow. */
  status: 'ACTIVE' | 'PARTIAL' | 'PLANNED'
}

export const PRODUCT_DOMAINS: Record<DomainKey, ProductDomainConfig> = {
  FOOD: {
    key: 'FOOD',
    label: 'Food / Beverage',
    stepName: 'Recipe',
    ingredientNoun: 'ingredient',
    ingredientNounPlural: 'ingredients',
    searchAdapter: 'USDA',
    searchSourceLabel: 'USDA',
    searchBuilt: true,
    labelKind: 'NUTRITION_FACTS',
    panelFormat: 'STANDARD',
    hasFactsPanel: true,
    labelBuilt: true,
    raccTable: 'GENERAL',
    extraFields: [],
    rulePack: 'fda-101.9',
    status: 'ACTIVE',
  },
  DIETARY_SUPPLEMENT: {
    key: 'DIETARY_SUPPLEMENT',
    label: 'Supplement',
    stepName: 'Formulation',
    ingredientNoun: 'dietary ingredient',
    ingredientNounPlural: 'dietary ingredients',
    searchAdapter: 'DSLD',
    searchSourceLabel: 'NIH DSLD',
    searchBuilt: false, // Phase 1
    labelKind: 'SUPPLEMENT_FACTS',
    panelFormat: 'SUPPLEMENT_FACTS',
    hasFactsPanel: true,
    labelBuilt: true, // engine already renders Supplement Facts
    raccTable: 'NA',
    extraFields: ['otherIngredients', 'proprietaryBlends'],
    rulePack: 'fda-101.36',
    status: 'PARTIAL',
  },
  COSMETIC: {
    key: 'COSMETIC',
    label: 'Cosmetic',
    stepName: 'Formulation',
    ingredientNoun: 'ingredient',
    ingredientNounPlural: 'ingredients',
    searchAdapter: 'INCI',
    searchSourceLabel: 'INCI',
    searchBuilt: false, // Phase 2
    labelKind: 'INCI_DECLARATION',
    hasFactsPanel: false,
    labelBuilt: false, // INCI declaration renderer is Phase 2
    raccTable: 'NA',
    extraFields: ['mocra', 'netContents', 'adverseEventContact'],
    rulePack: 'fda-701',
    status: 'PARTIAL',
  },
  PET_PRODUCT: {
    key: 'PET_PRODUCT',
    label: 'Pet',
    stepName: 'Formulation',
    ingredientNoun: 'ingredient',
    ingredientNounPlural: 'ingredients',
    searchAdapter: 'AAFCO',
    searchSourceLabel: 'AAFCO',
    searchBuilt: false, // Phase 3
    labelKind: 'GUARANTEED_ANALYSIS',
    hasFactsPanel: false,
    labelBuilt: false, // Guaranteed Analysis renderer is Phase 3
    raccTable: 'NA',
    extraFields: ['guaranteedAnalysis', 'adequacyStatement', 'feedingDirections', 'species', 'lifeStage'],
    rulePack: 'aafco',
    status: 'PLANNED',
  },
  OTC: {
    key: 'OTC',
    label: 'OTC drug',
    stepName: 'Formulation',
    ingredientNoun: 'active ingredient',
    ingredientNounPlural: 'active ingredients',
    searchAdapter: 'DSLD',
    searchSourceLabel: 'Drug monograph',
    searchBuilt: false,
    labelKind: 'DRUG_FACTS',
    hasFactsPanel: false,
    labelBuilt: false,
    raccTable: 'NA',
    extraFields: ['activeIngredients', 'drugFacts'],
    rulePack: 'fda-201.66',
    status: 'PLANNED', // deferred (enterprise/by-request)
  },
}

/** Safe lookup with a FOOD fallback. */
export function getDomain(key: string | null | undefined): ProductDomainConfig {
  return (key && PRODUCT_DOMAINS[key as DomainKey]) || PRODUCT_DOMAINS.FOOD
}

/** Legacy labeling-type string the DeclaredPanelPanel / older code still expect
 *  ('FOOD' | 'SUPPLEMENT'). Bridges the new DomainKey to that contract. */
export function legacyLabelingType(key: DomainKey): 'FOOD' | 'SUPPLEMENT' {
  return key === 'DIETARY_SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD'
}
