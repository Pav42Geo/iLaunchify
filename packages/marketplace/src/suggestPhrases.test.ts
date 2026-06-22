// Unit tests for the label-phrase evaluator (phrase-rule-eval.ts).
//
// Same convention as suggestNiches.test.ts / the @ilaunchify/auth suites:
// throw-on-failure scenarios + a runAll() aggregator, NO vitest import, so it
// type-checks under `tsc --noEmit` and runs via `node scripts/run-pure-tests.mjs`.
//
// Why this matters: this engine drives MANDATORY label phrases (FDA/CFR), and
// until now it had zero test coverage. These pin each condition kind, the AND/OR
// semantics, dedupe (highest weight + locked-takes-precedence), and the
// locked-first sort.

import {
  evaluateRules,
  type PhraseFacts,
  type EvaluablePhraseRule,
} from './phrase-rule-eval'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

// ---- Builders ----------------------------------------------------------------

function facts(over: Partial<PhraseFacts> = {}): PhraseFacts {
  return {
    labelingType: 'FOOD',
    productCategory: null,
    marketplaceCategorySlug: null,
    packingTypes: new Set<string>(),
    nutrientSource: 'NONE',
    allergens: new Set<string>(),
    bioengineered: false,
    ingredientNames: [],
    flags: {},
    ...over,
  }
}

let _n = 0
type RuleOver = Partial<Omit<EvaluablePhraseRule, 'phrase'>> & {
  phrase?: Partial<EvaluablePhraseRule['phrase']>
}
function rule(conditions: unknown, over: RuleOver = {}): EvaluablePhraseRule {
  _n += 1
  const { phrase: phraseOver, ...ruleOver } = over
  const id = ruleOver.id ?? `r${_n}`
  return {
    id,
    slug: `${id}-slug`,
    description: 'test rule',
    weight: 50,
    isLocked: false,
    isActive: true,
    conditions,
    ...ruleOver,
    phrase: {
      id: `p${_n}`,
      slug: 'phrase-slug',
      title: 'Phrase',
      body: 'body',
      category: 'GENERAL',
      requirement: 'MANDATORY',
      cfrCitation: null,
      appliesWhen: null,
      ...phraseOver,
    },
  }
}

// ---- Per-condition-kind scenarios --------------------------------------------

export const scenarioLabelingType = () => {
  const r = rule([{ kind: 'LABELING_TYPE', values: ['DIETARY_SUPPLEMENT'] }])
  assert(evaluateRules([r], facts({ labelingType: 'DIETARY_SUPPLEMENT' })).suggestions.length === 1, 'labeling match')
  assert(evaluateRules([r], facts({ labelingType: 'FOOD' })).suggestions.length === 0, 'labeling non-match')
  return true
}

export const scenarioAllergenCaseInsensitive = () => {
  const r = rule([{ kind: 'ALLERGEN_PRESENT', values: ['Milk'] }])
  assert(evaluateRules([r], facts({ allergens: new Set(['milk']) })).suggestions.length === 1, 'allergen lower-case match')
  assert(evaluateRules([r], facts({ allergens: new Set(['soy']) })).suggestions.length === 0, 'allergen non-match')
  return true
}

export const scenarioBioengineeredIgnoresValues = () => {
  const r = rule([{ kind: 'BIOENGINEERED', values: [] }])
  assert(evaluateRules([r], facts({ bioengineered: true })).suggestions.length === 1, 'BE present matches regardless of values')
  assert(evaluateRules([r], facts({ bioengineered: false })).suggestions.length === 0, 'BE absent no match')
  return true
}

export const scenarioIngredientSubstringMatch = () => {
  const r = rule([{ kind: 'INGREDIENT_MATCH', values: ['caffeine'] }])
  assert(evaluateRules([r], facts({ ingredientNames: ['anhydrous caffeine'] })).suggestions.length === 1, 'ingredient substring match')
  assert(evaluateRules([r], facts({ ingredientNames: ['taurine'] })).suggestions.length === 0, 'ingredient non-match')
  return true
}

export const scenarioPackingTypeAndProductFact = () => {
  const pack = rule([{ kind: 'PACKING_TYPE', values: ['CAN'] }])
  assert(evaluateRules([pack], facts({ packingTypes: new Set(['CAN']) })).suggestions.length === 1, 'packing match')
  const flag = rule([{ kind: 'PRODUCT_FACT', values: ['contains_alcohol'] }])
  assert(evaluateRules([flag], facts({ flags: { contains_alcohol: true } })).suggestions.length === 1, 'product-fact true matches')
  assert(evaluateRules([flag], facts({ flags: { contains_alcohol: false } })).suggestions.length === 0, 'product-fact false no match')
  return true
}

// ---- Semantics ---------------------------------------------------------------

export const scenarioAndAcrossOrWithin = () => {
  // AND across rows: needs BOTH supplement labeling AND a caffeine ingredient.
  const r = rule([
    { kind: 'LABELING_TYPE', values: ['DIETARY_SUPPLEMENT'] },
    { kind: 'INGREDIENT_MATCH', values: ['caffeine', 'guarana'] }, // OR within
  ])
  assert(
    evaluateRules([r], facts({ labelingType: 'DIETARY_SUPPLEMENT', ingredientNames: ['guarana extract'] })).suggestions.length === 1,
    'AND satisfied via OR value',
  )
  assert(
    evaluateRules([r], facts({ labelingType: 'DIETARY_SUPPLEMENT', ingredientNames: ['taurine'] })).suggestions.length === 0,
    'AND fails when second row misses',
  )
  return true
}

export const scenarioMalformedConditionsSkipped = () => {
  const good = rule([{ kind: 'LABELING_TYPE', values: ['FOOD'] }], { id: 'good' })
  const bad = rule('not-an-array', { id: 'bad' })
  const empty = rule([], { id: 'empty' })
  const res = evaluateRules([good, bad, empty], facts({ labelingType: 'FOOD' }))
  assert(res.suggestions.length === 1, 'only the good rule yields a suggestion')
  // bad + empty still recorded as non-matches in rawHits; good recorded matched.
  assert(res.rawHits.find((h) => h.ruleId === 'bad')?.matched === false, 'malformed → rawHit matched false')
  assert(res.rawHits.find((h) => h.ruleId === 'good')?.matched === true, 'good → rawHit matched true')
  return true
}

export const scenarioInactiveSkipped = () => {
  const r = rule([{ kind: 'LABELING_TYPE', values: ['FOOD'] }], { isActive: false })
  const res = evaluateRules([r], facts({ labelingType: 'FOOD' }))
  assert(res.suggestions.length === 0, 'inactive rule yields nothing')
  assert(res.rawHits.length === 0, 'inactive rule produces no rawHit')
  return true
}

export const scenarioDedupeHighestWeightLockedWins = () => {
  const lowLocked = rule([{ kind: 'LABELING_TYPE', values: ['FOOD'] }], {
    id: 'low', weight: 30, isLocked: true, phrase: { id: 'shared' },
  })
  const highOpen = rule([{ kind: 'LABELING_TYPE', values: ['FOOD'] }], {
    id: 'high', weight: 90, isLocked: false, phrase: { id: 'shared' },
  })
  const out = evaluateRules([lowLocked, highOpen], facts({ labelingType: 'FOOD' })).suggestions
  assert(out.length === 1, 'deduped to one suggestion for the shared phrase')
  assert(out[0]!.weight === 90, 'winner is the highest weight')
  assert(out[0]!.isLocked === true, 'locked-takes-precedence preserved on the winner')
  return true
}

export const scenarioLockedSortFirst = () => {
  const open = rule([{ kind: 'LABELING_TYPE', values: ['FOOD'] }], {
    id: 'open', weight: 99, isLocked: false, phrase: { id: 'pOpen', title: 'AAA' },
  })
  const locked = rule([{ kind: 'LABELING_TYPE', values: ['FOOD'] }], {
    id: 'lock', weight: 10, isLocked: true, phrase: { id: 'pLock', title: 'ZZZ' },
  })
  const out = evaluateRules([open, locked], facts({ labelingType: 'FOOD' })).suggestions
  assert(out.length === 2, 'two distinct phrases')
  assert(out[0]!.isLocked === true, 'locked sorts before higher-weight open phrase')
  return true
}

export function runAll(): void {
  scenarioLabelingType()
  scenarioAllergenCaseInsensitive()
  scenarioBioengineeredIgnoresValues()
  scenarioIngredientSubstringMatch()
  scenarioPackingTypeAndProductFact()
  scenarioAndAcrossOrWithin()
  scenarioMalformedConditionsSkipped()
  scenarioInactiveSkipped()
  scenarioDedupeHighestWeightLockedWins()
  scenarioLockedSortFirst()
}
