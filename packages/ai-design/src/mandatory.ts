// =============================================================================
// AI Packaging Generator — P0 Mandatory-Element Pack engine (AI_PACKAGING_GENERATOR §6).
//
// PURE + deterministic. The differentiator: for a product's domain (labelingType)
// × market, this resolves the REQUIRED and RECOMMENDED on-pack elements — Statement
// of Identity, net quantity, the regulated Facts panel, ingredients, allergens,
// manufacturer of record, plus domain warnings/disclaimers and recommended marks.
// These are rendered by the deterministic TRUTH layer (recipe engine / product data
// / brand kit), NEVER by the image model.
//
// evaluateCompliance() turns "which elements are satisfied" into a coverage report
// that gates export — the generator cannot emit a non-compliant artifact.
//
// US is fully populated and ACTIVE. CA/EU are schema-ready stubs (return the base
// pack today) per the Markets+Regions plan. No DB, no model — extends the FDA rule
// packs conceptually but stays a free-standing engine.
// =============================================================================

/** Mirrors Prisma LabelingType (kept local so this engine has zero deps). */
export type LabelingDomain = 'FOOD' | 'DIETARY_SUPPLEMENT' | 'PET_PRODUCT' | 'OTC' | 'COSMETIC'

/** Regulatory jurisdiction. US active; others schema-ready. */
export type MarketCode = 'US' | 'CA' | 'EU'

/** On-pack element kinds. Names mirror FrameKind where a frame slot exists. */
export type LabelElementKind =
  | 'STATEMENT_OF_IDENTITY'
  | 'NET_QUANTITY'
  | 'MANUFACTURER'
  | 'INGREDIENTS'
  | 'ALLERGENS'
  | 'NUTRITION_FACTS'
  | 'SUPPLEMENT_FACTS'
  | 'DRUG_FACTS'
  | 'GUARANTEED_ANALYSIS'
  | 'INCI_DECLARATION'
  | 'WARNINGS'
  | 'DIRECTIONS'
  | 'DISCLAIMER'
  | 'BARCODE'
  | 'RECYCLING_MARK'
  | 'CERTIFICATIONS'
  | 'PAO_SYMBOL'

export type Requirement = 'REQUIRED' | 'RECOMMENDED'

/** How the truth layer fills this element — drives the compositor (P1). */
export type SatisfiedBy = 'PRODUCT_DATA' | 'RECIPE_ENGINE' | 'BRAND_KIT' | 'COMPLIANCE_PACK' | 'AUTHOR'

export interface MandatoryElement {
  kind: LabelElementKind
  requirement: Requirement
  /** Human label for the coverage chip / report. */
  label: string
  /** Which FrameKind slot it composites into (frames.ts), if any. */
  frameKind?: string
  /** How it's filled deterministically. */
  satisfiedBy: SatisfiedBy
  /** Regulatory citation for the report / legal reproducibility. */
  citation?: string
}

// ---- shared building blocks ------------------------------------------------

const SOI: MandatoryElement = { kind: 'STATEMENT_OF_IDENTITY', requirement: 'REQUIRED', label: 'Statement of Identity', frameKind: 'STATEMENT_OF_IDENTITY', satisfiedBy: 'PRODUCT_DATA', citation: '21 CFR 101.3' }
const NET_QTY: MandatoryElement = { kind: 'NET_QUANTITY', requirement: 'REQUIRED', label: 'Net quantity of contents', frameKind: 'NET_QUANTITY', satisfiedBy: 'PRODUCT_DATA', citation: '21 CFR 101.105' }
const MANUFACTURER: MandatoryElement = { kind: 'MANUFACTURER', requirement: 'REQUIRED', label: 'Name & address of manufacturer/packer/distributor', frameKind: 'MANUFACTURER', satisfiedBy: 'PRODUCT_DATA', citation: '21 CFR 101.5' }
const INGREDIENTS: MandatoryElement = { kind: 'INGREDIENTS', requirement: 'REQUIRED', label: 'Ingredient list', frameKind: 'INGREDIENTS', satisfiedBy: 'RECIPE_ENGINE', citation: '21 CFR 101.4' }
const ALLERGENS: MandatoryElement = { kind: 'ALLERGENS', requirement: 'REQUIRED', label: 'Allergen "Contains" statement', frameKind: 'ALLERGENS', satisfiedBy: 'RECIPE_ENGINE', citation: 'FALCPA / 21 CFR 101.' }
const BARCODE: MandatoryElement = { kind: 'BARCODE', requirement: 'RECOMMENDED', label: 'GTIN / UPC barcode', frameKind: 'BARCODE', satisfiedBy: 'PRODUCT_DATA' }
const RECYCLING: MandatoryElement = { kind: 'RECYCLING_MARK', requirement: 'RECOMMENDED', label: 'Recycling / resin mark', frameKind: 'RECYCLING_MARK', satisfiedBy: 'PRODUCT_DATA' }
const CERTS: MandatoryElement = { kind: 'CERTIFICATIONS', requirement: 'RECOMMENDED', label: 'Certification badges held', frameKind: 'CERTIFICATIONS', satisfiedBy: 'PRODUCT_DATA' }

const SUPPLEMENT_DISCLAIMER: MandatoryElement = { kind: 'DISCLAIMER', requirement: 'REQUIRED', label: 'DSHEA disclaimer ("not evaluated by the FDA…")', frameKind: 'PHRASES', satisfiedBy: 'COMPLIANCE_PACK', citation: '21 CFR 101.93' }

// ---- US packs by domain ----------------------------------------------------

const US_PACKS: Record<LabelingDomain, MandatoryElement[]> = {
  FOOD: [
    SOI, NET_QTY,
    { kind: 'NUTRITION_FACTS', requirement: 'REQUIRED', label: 'Nutrition Facts panel', frameKind: 'NUTRITION_FACTS', satisfiedBy: 'RECIPE_ENGINE', citation: '21 CFR 101.9' },
    INGREDIENTS, ALLERGENS, MANUFACTURER, BARCODE, RECYCLING, CERTS,
  ],
  DIETARY_SUPPLEMENT: [
    SOI, NET_QTY,
    { kind: 'SUPPLEMENT_FACTS', requirement: 'REQUIRED', label: 'Supplement Facts panel', frameKind: 'NUTRITION_FACTS', satisfiedBy: 'RECIPE_ENGINE', citation: '21 CFR 101.36' },
    INGREDIENTS, MANUFACTURER, SUPPLEMENT_DISCLAIMER, BARCODE, RECYCLING, CERTS,
  ],
  OTC: [
    SOI, NET_QTY,
    { kind: 'DRUG_FACTS', requirement: 'REQUIRED', label: 'Drug Facts panel', frameKind: 'NUTRITION_FACTS', satisfiedBy: 'RECIPE_ENGINE', citation: '21 CFR 201.66' },
    { kind: 'WARNINGS', requirement: 'REQUIRED', label: 'Warnings', frameKind: 'PHRASES', satisfiedBy: 'AUTHOR', citation: '21 CFR 201.66(c)(5)' },
    { kind: 'DIRECTIONS', requirement: 'REQUIRED', label: 'Directions for use', frameKind: 'PHRASES', satisfiedBy: 'AUTHOR', citation: '21 CFR 201.66(c)(7)' },
    MANUFACTURER, BARCODE, RECYCLING, CERTS,
  ],
  COSMETIC: [
    SOI, NET_QTY,
    { kind: 'INCI_DECLARATION', requirement: 'REQUIRED', label: 'Ingredient declaration (INCI)', frameKind: 'INGREDIENTS', satisfiedBy: 'RECIPE_ENGINE', citation: '21 CFR 701.3' },
    MANUFACTURER,
    { kind: 'WARNINGS', requirement: 'RECOMMENDED', label: 'Cosmetic warnings (if applicable)', frameKind: 'PHRASES', satisfiedBy: 'AUTHOR', citation: '21 CFR 740' },
    { kind: 'PAO_SYMBOL', requirement: 'RECOMMENDED', label: 'Period-after-opening symbol', frameKind: 'LABELING_SYMBOL', satisfiedBy: 'AUTHOR' },
    BARCODE, RECYCLING, CERTS,
  ],
  PET_PRODUCT: [
    SOI, NET_QTY,
    { kind: 'GUARANTEED_ANALYSIS', requirement: 'REQUIRED', label: 'Guaranteed Analysis (AAFCO)', frameKind: 'NUTRITION_FACTS', satisfiedBy: 'RECIPE_ENGINE', citation: 'AAFCO Model Regs' },
    INGREDIENTS,
    { kind: 'DIRECTIONS', requirement: 'REQUIRED', label: 'Feeding directions', frameKind: 'PHRASES', satisfiedBy: 'AUTHOR', citation: 'AAFCO' },
    MANUFACTURER, BARCODE, RECYCLING, CERTS,
  ],
}

/**
 * Required + recommended on-pack elements for a domain × market.
 * US is active; CA/EU return the US base today (schema-ready for jurisdiction packs).
 */
export function requiredElements(domain: LabelingDomain, _market: MarketCode = 'US'): MandatoryElement[] {
  // Markets other than US currently reuse the base pack; jurisdiction-specific
  // deltas (e-mark, bilingual panels, etc.) land additively here later.
  return US_PACKS[domain].slice()
}

/**
 * Bridge: which mandatory element(s) a die-line FRAME satisfies, given the domain.
 * Takes the FrameKind as a plain string so this engine stays dependency-free (the
 * names mirror @ilaunchify/ui's FrameKind). The facts slot resolves to the domain's
 * specific panel; the ingredients slot resolves to INCI for cosmetics. Ambiguous
 * frames (PHRASES) return [] — the app marks those satisfied explicitly when it
 * renders the actual disclaimer/warning/direction text.
 */
export function elementKindsForFrame(frameKind: string, domain: LabelingDomain): LabelElementKind[] {
  switch (frameKind) {
    case 'NUTRITION_FACTS':
      // The single "facts" frame slot resolves to the domain's panel.
      switch (domain) {
        case 'FOOD':
          return ['NUTRITION_FACTS']
        case 'DIETARY_SUPPLEMENT':
          return ['SUPPLEMENT_FACTS']
        case 'OTC':
          return ['DRUG_FACTS']
        case 'PET_PRODUCT':
          return ['GUARANTEED_ANALYSIS']
        case 'COSMETIC':
          return [] // cosmetics have no facts panel
      }
      return []
    case 'INGREDIENTS':
      return domain === 'COSMETIC' ? ['INCI_DECLARATION'] : ['INGREDIENTS']
    case 'ALLERGENS':
      return ['ALLERGENS']
    case 'STATEMENT_OF_IDENTITY':
      return ['STATEMENT_OF_IDENTITY']
    case 'NET_QUANTITY':
      return ['NET_QUANTITY']
    case 'MANUFACTURER':
      return ['MANUFACTURER']
    case 'BARCODE':
      return ['BARCODE']
    case 'RECYCLING_MARK':
      return ['RECYCLING_MARK']
    case 'CERTIFICATIONS':
      return ['CERTIFICATIONS']
    case 'LABELING_SYMBOL':
      return domain === 'COSMETIC' ? ['PAO_SYMBOL'] : []
    default:
      return [] // LOGO/IMAGERY/CUSTOM/PHRASES/COMPOSTABILITY/DISPOSAL — no mandatory element
  }
}

/** Collapse the frames present on a design into the set of mandatory elements satisfied. */
export function satisfiedElementsFromFrames(frameKinds: ReadonlyArray<string>, domain: LabelingDomain): LabelElementKind[] {
  const out = new Set<LabelElementKind>()
  for (const fk of frameKinds) for (const ek of elementKindsForFrame(fk, domain)) out.add(ek)
  return [...out]
}

export interface ComplianceReport {
  domain: LabelingDomain
  market: MarketCode
  /** Required elements still missing from the design. */
  missingRequired: MandatoryElement[]
  /** Recommended elements not yet present (offer to add). */
  availableRecommended: MandatoryElement[]
  /** Required elements that are satisfied. */
  satisfiedRequired: MandatoryElement[]
  /** True when every required element is present — export gate. */
  complete: boolean
  /** satisfiedRequired / totalRequired, 0..1, rounded to 2dp. */
  coverageScore: number
  /** "9/9 required present" style summary. */
  summary: string
}

/**
 * PACKAGE-LEVEL compliance for a multi-die-line package (Coordinated sets, §15).
 * On a jar (front label + top label) or any multi-label pack, a mandatory element
 * only has to appear on ONE surface of the package — not every label. So we UNION
 * the satisfied element kinds across all the package's surfaces, then score once.
 */
export function evaluateCompliancePackage(
  domain: LabelingDomain,
  satisfiedPerSurface: ReadonlyArray<ReadonlyArray<LabelElementKind>>,
  market: MarketCode = 'US',
): ComplianceReport {
  const union = new Set<LabelElementKind>()
  for (const surface of satisfiedPerSurface) for (const k of surface) union.add(k)
  return evaluateCompliance(domain, [...union], market)
}

/**
 * Score a design against its domain × market pack. `satisfied` is the set of element
 * kinds the design already provides (truth layer rendered them). Gates export.
 */
export function evaluateCompliance(
  domain: LabelingDomain,
  satisfied: ReadonlyArray<LabelElementKind>,
  market: MarketCode = 'US',
): ComplianceReport {
  const have = new Set<LabelElementKind>(satisfied)
  const pack = requiredElements(domain, market)
  const required = pack.filter((e) => e.requirement === 'REQUIRED')
  const recommended = pack.filter((e) => e.requirement === 'RECOMMENDED')

  const missingRequired = required.filter((e) => !have.has(e.kind))
  const satisfiedRequired = required.filter((e) => have.has(e.kind))
  const availableRecommended = recommended.filter((e) => !have.has(e.kind))

  const total = required.length
  const coverageScore = total === 0 ? 1 : Math.round((satisfiedRequired.length / total) * 100) / 100
  const complete = missingRequired.length === 0

  return {
    domain,
    market,
    missingRequired,
    availableRecommended,
    satisfiedRequired,
    complete,
    coverageScore,
    summary: `${satisfiedRequired.length}/${total} required present`,
  }
}
