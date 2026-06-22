// Unit tests for the restricted-category eligibility gate (evaluateRestrictions.ts).
//
// runAll() convention (no vitest import) — runs via `node scripts/run-pure-tests.mjs`.
//
// Why this matters: this is a HARD BLOCK at checkout (LABELING ≠ LICENSING). The
// engine's own comments make precise false-positive claims — bare "hemp" must
// stay legal (hemp-seed oil), "nicotine" must not match "nicotinamide" (vitamin
// B3), alcohol triggers on the self-declared fact NOT ingredient words ("rum" is
// a substring of "spectrum"/"serum"). These tests pin those invariants so a
// future edit to the rule deck can't silently over- or under-block.

import { evaluateProductRestrictions, type RestrictionInput } from './evaluateRestrictions'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

function codes(input: RestrictionInput): string[] {
  return evaluateProductRestrictions(input).map((h) => h.code).sort()
}

export const scenarioEligibleConventional = () => {
  const hits = codes({
    labelingType: 'FOOD',
    phraseFacts: { isAlcoholBeverage: false },
    ingredientNames: ['cane sugar', 'natural flavor', 'citric acid'],
  })
  assert(hits.length === 0, `conventional product should be eligible, got ${hits.join(',')}`)
  return true
}

export const scenarioAlcoholFactNotIngredient = () => {
  // Fact trips it.
  assert(codes({ phraseFacts: { isAlcoholBeverage: true } }).includes('alcohol'), 'isAlcoholBeverage fact → alcohol block')
  // But beverage *words* in legal conventional ingredients must NOT trip it
  // (alcohol has no ingredientMatches — "rum" ⊂ "spectrum", red wine vinegar…).
  assert(
    codes({ ingredientNames: ['red wine vinegar', 'rum extract', 'spectrum oil blend'] }).length === 0,
    'alcohol must not trigger on ingredient words',
  )
  return true
}

export const scenarioHempCbdButNotHempSeed = () => {
  assert(codes({ ingredientNames: ['broad-spectrum hemp extract'] }).includes('hemp-cbd'), 'hemp extract → hemp-cbd block')
  assert(codes({ ingredientNames: ['CBD isolate'] }).includes('hemp-cbd'), 'cbd → hemp-cbd block (case-insensitive)')
  assert(codes({ phraseFacts: { isHempCbd: true } }).includes('hemp-cbd'), 'isHempCbd fact → hemp-cbd block')
  // Hemp-SEED foods are legal — bare "hemp" must not trip the gate.
  assert(
    codes({ ingredientNames: ['hemp seed oil', 'hemp hearts', 'hemp protein'] }).length === 0,
    'hemp-seed foods must stay eligible',
  )
  return true
}

export const scenarioNicotineNotNicotinamide = () => {
  assert(codes({ ingredientNames: ['nicotine salt'] }).includes('tobacco-nicotine'), 'nicotine → tobacco block')
  assert(codes({ phraseFacts: { isTobaccoNicotine: true } }).includes('tobacco-nicotine'), 'fact → tobacco block')
  // Vitamin B3 must NOT trip the nicotine rule.
  assert(
    codes({ ingredientNames: ['nicotinamide', 'niacinamide'] }).length === 0,
    'nicotinamide (B3) must stay eligible',
  )
  return true
}

export const scenarioOtcLabelingType = () => {
  assert(codes({ labelingType: 'OTC' }).includes('otc-drug'), 'OTC labeling → otc-drug block')
  assert(codes({ labelingType: 'DIETARY_SUPPLEMENT' }).length === 0, 'supplement labeling is eligible')
  return true
}

export const scenarioKratom = () => {
  assert(codes({ ingredientNames: ['kratom leaf powder'] }).includes('kratom'), 'kratom → block')
  assert(codes({ ingredientNames: ['mitragyna speciosa extract'] }).includes('kratom'), 'mitragyna → block')
  return true
}

export const scenarioMultipleHitsAndEvidence = () => {
  const hits = evaluateProductRestrictions({
    labelingType: 'OTC',
    phraseFacts: { isAlcoholBeverage: true },
    ingredientNames: ['cbd oil'],
  })
  const byCode = new Map(hits.map((h) => [h.code, h]))
  assert(byCode.has('otc-drug') && byCode.has('alcohol') && byCode.has('hemp-cbd'), 'three independent rules all hit')
  assert(byCode.get('otc-drug')!.matchedBy === 'labelingType' && byCode.get('otc-drug')!.evidence === 'OTC', 'otc evidence')
  assert(byCode.get('alcohol')!.matchedBy === 'fact' && byCode.get('alcohol')!.evidence === 'isAlcoholBeverage', 'alcohol evidence')
  assert(byCode.get('hemp-cbd')!.matchedBy === 'ingredient', 'hemp-cbd matched by ingredient')
  return true
}

export const scenarioOnePerRuleNoDuplicates = () => {
  // Two CBD-ish ingredients still produce a single hemp-cbd hit (one per rule).
  const hits = evaluateProductRestrictions({ ingredientNames: ['cbd', 'cannabidiol extract'] })
  assert(hits.filter((h) => h.code === 'hemp-cbd').length === 1, 'one hit per rule even with multiple matches')
  return true
}

export function runAll(): void {
  scenarioEligibleConventional()
  scenarioAlcoholFactNotIngredient()
  scenarioHempCbdButNotHempSeed()
  scenarioNicotineNotNicotinamide()
  scenarioOtcLabelingType()
  scenarioKratom()
  scenarioMultipleHitsAndEvidence()
  scenarioOnePerRuleNoDuplicates()
}
