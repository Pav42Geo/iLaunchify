// @ilaunchify/marketplace — restricted-category eligibility evaluator.
//
// LABELING ≠ LICENSING. The phrase engine (suggestPhrases) governs what must be
// PRINTED on a label. THIS evaluator governs whether a product is ELIGIBLE to be
// produced + ordered on the platform at all.
//
// The locked taxonomy is conventional CPG only — it deliberately has no alcohol,
// hemp/CBD, tobacco/nicotine, OTC-drug, or kratom categories, because those
// require licensing / permitting iLaunchify does not support yet (TTB permits +
// COLA + three-tier for alcohol; FDA drug-establishment registration + cGMP for
// OTC; FDA CTP / PMTA for tobacco; FDA-restricted status for CBD in food/
// supplements). Nothing technically stops a creator from building a product that
// trips one of those signals — a manufacturer self-declares an `isAlcoholBeverage`
// product fact, picks an OTC labeling type, or a recipe names a CBD ingredient.
//
// This is a pure, data-driven evaluator (mirrors phraseFacts.ts). The checkout
// server action calls it and HARD-BLOCKS the order when any rule hits. It is
// assistive, never a guarantee — the operator gates eligibility; it does not
// assume the producer's regulatory role.
//
// No Prisma import — pure function. The caller loads the product facts.
// =============================================================================

export interface RestrictedRuleMatch {
  /** ProductTemplate.labelingType values that trip this rule. */
  labelingTypes?: string[]
  /** phraseFacts keys (manufacturer self-declared) that trip this rule when true. */
  facts?: string[]
  /**
   * Lowercased substrings matched against recipe ingredient names. Kept
   * deliberately narrow to avoid false positives on legal conventional
   * ingredients (e.g. "hemp seed oil" is legal; only "hemp extract"/"cbd" are
   * restricted — so we match the latter, never bare "hemp").
   */
  ingredientMatches?: string[]
}

export interface RestrictedRule {
  /** Stable machine code — also the audit payload + admin badge key. */
  code: string
  /** Short human label for the banner. */
  label: string
  /** One sentence: why it's blocked + what licensing it needs. */
  detail: string
  /** Optional governing-authority citation for the disclosure. */
  citation?: string
  match: RestrictedRuleMatch
}

/**
 * The restricted-category rule set. Additive + data-driven: add a row to gate a
 * new category. A product hits a rule if ANY of its match dimensions matches
 * (labelingType OR a true fact OR an ingredient-name substring).
 */
export const RESTRICTED_RULES: RestrictedRule[] = [
  {
    code: 'alcohol',
    label: 'Alcohol beverage',
    detail:
      'Alcohol beverages require a TTB Federal Basic Permit, label pre-approval (COLA), and state licensing under the three-tier system — which iLaunchify does not support yet.',
    citation: '27 U.S.C. 201 et seq. (FAA Act) · 27 CFR 1, 4, 5, 7',
    // Ingredient-name matching is deliberately OMITTED for alcohol: on a food
    // marketplace the beverage words appear in legal conventional ingredients
    // (red wine vinegar, rum/brandy extract & flavoring, beer-batter mix, and
    // "rum" is even a substring of "spectrum"/"serum"). The manufacturer's
    // self-declared isAlcoholBeverage fact is the reliable, false-positive-free
    // trigger here.
    match: {
      facts: ['isAlcoholBeverage'],
    },
  },
  {
    code: 'hemp-cbd',
    label: 'Hemp / CBD',
    detail:
      'CBD and hemp-extract products are restricted by the FDA in food and dietary supplements (FD&C Act §301(ll)) and are not permitted on iLaunchify. Hemp-seed-derived foods (oil, hearts, protein) are not affected.',
    citation: 'FD&C Act §301(ll) · 21 U.S.C. 331(ll)',
    match: {
      facts: ['isHempCbd'],
      // Deliberately exclude bare "hemp" — hemp SEED foods are legal. Match the
      // restricted extracts/cannabinoids only.
      ingredientMatches: [
        'cbd',
        'cannabidiol',
        'hemp extract',
        'hemp-derived extract',
        'cannabinoid',
        'delta-8',
        'delta 8',
        'delta-9',
        'delta 9',
        'thc',
        'cannabis',
        'full-spectrum hemp',
        'broad-spectrum hemp',
      ],
    },
  },
  {
    code: 'tobacco-nicotine',
    label: 'Tobacco / nicotine',
    detail:
      'Tobacco and nicotine products fall under FDA Center for Tobacco Products authority (PMTA / registration) and are not permitted on iLaunchify.',
    citation: 'FD&C Act Ch. IX · 21 U.S.C. 387 et seq.',
    match: {
      facts: ['isTobaccoNicotine'],
      // "nicotine" (with trailing e) does not substring-match "nicotinamide"
      // (vitamin B3), so this is safe.
      ingredientMatches: ['nicotine', 'tobacco'],
    },
  },
  {
    code: 'otc-drug',
    label: 'OTC drug',
    detail:
      'Over-the-counter drug products require FDA drug-establishment registration, an applicable OTC monograph or approval, and cGMP — which iLaunchify does not support yet.',
    citation: '21 CFR 207, 330, 211',
    match: {
      labelingTypes: ['OTC'],
    },
  },
  {
    code: 'kratom',
    label: 'Kratom',
    detail:
      'Kratom (Mitragyna speciosa) is not an FDA-approved dietary ingredient, is banned in several states, and is not permitted on iLaunchify.',
    citation: 'FDA import alert 54-15',
    match: {
      ingredientMatches: ['kratom', 'mitragyna'],
    },
  },
]

export interface RestrictionInput {
  /** ProductTemplate.labelingType (null when the product has no template). */
  labelingType?: string | null
  /** ProductTemplate.phraseFacts JSON — manufacturer self-declared yes/no flags. */
  phraseFacts?: Record<string, unknown> | null
  /** Recipe ingredient names (label-declaration name preferred). Any casing. */
  ingredientNames?: string[]
}

export interface RestrictionHit {
  code: string
  label: string
  detail: string
  citation?: string
  /** Which dimension tripped — for the audit payload + "why" disclosure. */
  matchedBy: 'labelingType' | 'fact' | 'ingredient'
  /** The concrete value that matched (the labeling type, fact key, or ingredient). */
  evidence: string
}

/**
 * Evaluate a product against every restricted-category rule.
 * Pure + deterministic. Returns one hit per matched rule (first matching
 * dimension wins as the evidence). Empty array = eligible.
 */
export function evaluateProductRestrictions(input: RestrictionInput): RestrictionHit[] {
  const labelingType = input.labelingType ?? null
  const facts = input.phraseFacts ?? {}
  const names = (input.ingredientNames ?? []).map((n) => n.toLowerCase())

  const hits: RestrictionHit[] = []

  for (const rule of RESTRICTED_RULES) {
    const m = rule.match

    // 1. labelingType
    if (labelingType && m.labelingTypes?.includes(labelingType)) {
      hits.push({ ...toHitBase(rule), matchedBy: 'labelingType', evidence: labelingType })
      continue
    }

    // 2. manufacturer self-declared facts
    const matchedFact = m.facts?.find((k) => facts[k] === true)
    if (matchedFact) {
      hits.push({ ...toHitBase(rule), matchedBy: 'fact', evidence: matchedFact })
      continue
    }

    // 3. ingredient-name substring
    let matchedIngredient: string | undefined
    if (m.ingredientMatches) {
      for (const needle of m.ingredientMatches) {
        const hit = names.find((n) => n.includes(needle))
        if (hit) {
          matchedIngredient = hit
          break
        }
      }
    }
    if (matchedIngredient) {
      hits.push({ ...toHitBase(rule), matchedBy: 'ingredient', evidence: matchedIngredient })
      continue
    }
  }

  return hits
}

function toHitBase(rule: RestrictedRule): Omit<RestrictionHit, 'matchedBy' | 'evidence'> {
  return { code: rule.code, label: rule.label, detail: rule.detail, citation: rule.citation }
}
