// Golden self-test for the mandatory-element pack engine. Run via:
//   tsc --module commonjs ... mandatory.test.ts && node mandatory.test.js
import { requiredElements, evaluateCompliance, type LabelElementKind } from './mandatory'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}

export function runMandatorySelfTest(): void {
  // 1. FOOD/US requires the Nutrition Facts panel + SoI + net qty + ingredients + allergens.
  const food = requiredElements('FOOD', 'US')
  const foodReq = food.filter((e) => e.requirement === 'REQUIRED').map((e) => e.kind)
  for (const k of ['STATEMENT_OF_IDENTITY', 'NET_QUANTITY', 'NUTRITION_FACTS', 'INGREDIENTS', 'ALLERGENS', 'MANUFACTURER'] as LabelElementKind[]) {
    assert(foodReq.includes(k), `FOOD requires ${k}`)
  }
  assert(food.some((e) => e.kind === 'BARCODE' && e.requirement === 'RECOMMENDED'), 'BARCODE recommended for FOOD')

  // 2. Each required element declares how the truth layer fills it (no AUTHOR gaps for food panels).
  const facts = food.find((e) => e.kind === 'NUTRITION_FACTS')
  assert(facts?.satisfiedBy === 'RECIPE_ENGINE' && facts.frameKind === 'NUTRITION_FACTS', 'facts from recipe engine → frame slot')

  // 3. Supplement requires Supplement Facts + the DSHEA disclaimer.
  const supp = requiredElements('DIETARY_SUPPLEMENT').map((e) => e.kind)
  assert(supp.includes('SUPPLEMENT_FACTS'), 'supp requires Supplement Facts')
  assert(supp.includes('DISCLAIMER'), 'supp requires DSHEA disclaimer')

  // 4. OTC requires Drug Facts + warnings + directions; cosmetic requires INCI, no facts panel.
  const otc = requiredElements('OTC').filter((e) => e.requirement === 'REQUIRED').map((e) => e.kind)
  assert(otc.includes('DRUG_FACTS') && otc.includes('WARNINGS') && otc.includes('DIRECTIONS'), 'OTC reqs')
  const cos = requiredElements('COSMETIC').map((e) => e.kind)
  assert(cos.includes('INCI_DECLARATION') && !cos.includes('NUTRITION_FACTS'), 'cosmetic INCI, no facts')

  // 5. Pet requires Guaranteed Analysis + feeding directions.
  const pet = requiredElements('PET_PRODUCT').filter((e) => e.requirement === 'REQUIRED').map((e) => e.kind)
  assert(pet.includes('GUARANTEED_ANALYSIS') && pet.includes('DIRECTIONS'), 'pet reqs')

  // 6. evaluateCompliance: incomplete → not complete, names the gaps.
  const partial = evaluateCompliance('FOOD', ['STATEMENT_OF_IDENTITY', 'NET_QUANTITY', 'NUTRITION_FACTS', 'INGREDIENTS'])
  assert(!partial.complete, 'missing allergens+manufacturer → not complete')
  assert(partial.missingRequired.some((e) => e.kind === 'ALLERGENS'), 'allergens flagged missing')
  assert(partial.missingRequired.some((e) => e.kind === 'MANUFACTURER'), 'manufacturer flagged missing')
  assert(partial.coverageScore > 0 && partial.coverageScore < 1, 'partial score between 0 and 1')

  // 7. Full required set → complete, score 1, recommended still surfaced.
  const full = evaluateCompliance('FOOD', ['STATEMENT_OF_IDENTITY', 'NET_QUANTITY', 'NUTRITION_FACTS', 'INGREDIENTS', 'ALLERGENS', 'MANUFACTURER'])
  assert(full.complete && full.coverageScore === 1, 'all required → complete, score 1')
  assert(full.availableRecommended.some((e) => e.kind === 'BARCODE'), 'barcode still offered as recommended')
  assert(/\/\d/.test(full.summary), 'summary like "6/6 required present"')

  console.log('Mandatory golden: PASS')
}

runMandatorySelfTest()
