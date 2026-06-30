// Self-contained tests for the pure backfill transforms (no Prisma, no DB).
// Run: cd packages/db && pnpm exec tsx prisma/backfill-flavor-recipes.test.ts

import { extrasToGrams, planFlavorRecipe, parseExtras, type BaseSlotInput, type BaseOptionalInput } from './flavor-recipe-backfill-plan'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`) } else { console.log(`  ✓ ${msg}`) }
}
function eq(a: unknown, b: unknown, msg: string) { assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`) }

console.log('extrasToGrams')
eq(extrasToGrams(5, 'g'), { grams: 5, assumed: false }, 'grams pass through')
eq(extrasToGrams(500, 'mg'), { grams: 0.5, assumed: false }, 'mg → g')
eq(extrasToGrams(2, 'kg'), { grams: 2000, assumed: false }, 'kg → g')
eq(extrasToGrams(1, 'oz').grams.toFixed(4), '28.3495', 'oz → g')
eq(extrasToGrams(10, undefined), { grams: 10, assumed: true }, 'unknown unit assumed grams')
eq(extrasToGrams(null, 'g'), { grams: 0, assumed: false }, 'null qty → 0')

console.log('parseExtras')
eq(parseExtras(null), [], 'null → []')
eq(parseExtras([{ ingredientId: 'i1', name: 'Strawberry note', qty: 5, unit: 'g' }]),
   [{ ingredientId: 'i1', name: 'Strawberry note', qty: 5, unit: 'g' }], 'well-formed entry')
eq(parseExtras([{ name: 'custom', qty: 1, unit: 'g' }])[0]!.ingredientId, null, 'missing ingredientId → null')

console.log('planFlavorRecipe')
const baseSlots: BaseSlotInput[] = [
  { baseIngredientId: 'oats', weightG: { toString: () => '100' }, costPerKgCents: 200, displayOrder: 0, allowReplacement: true, label: null, description: null,
    replacements: [{ ingredientId: 'glutenfree-oats', weightGOverride: { toString: () => '100' }, displayOrder: 0, calloutText: 'GF option' }] },
  { baseIngredientId: 'sugar', weightG: { toString: () => '30' }, costPerKgCents: 150, displayOrder: 1, allowReplacement: true, label: null, description: null, replacements: [] },
]
const baseOptionals: BaseOptionalInput[] = [
  { ingredientId: 'theanine', weightG: { toString: () => '0.2' }, displayOrder: 0, calloutText: 'calm focus' },
  { ingredientId: 'theanine', weightG: { toString: () => '0.2' }, displayOrder: 1, calloutText: 'dup' }, // duplicate → de-duped
]

const plan = planFlavorRecipe({ slots: baseSlots, optionals: baseOptionals }, [
  { ingredientId: 'strawberry', name: 'Strawberry note', qty: 5, unit: 'g' },
  { name: 'mystery dust', qty: 1, unit: 'g' }, // no ingredientId → skipped
])

eq(plan.slots.length, 3, '2 base + 1 extra slot')
eq(plan.slots.map((s) => s.origin), ['base', 'base', 'extra'], 'extras appended after base')
eq(plan.slots.map((s) => s.displayOrder), [0, 1, 2], 'displayOrder is contiguous')
eq(plan.slots[2]!.baseIngredientId, 'strawberry', 'extra slot uses ingredientId')
eq(plan.slots[2]!.weightG, '5', 'extra slot weight in grams')
eq(plan.slots[2]!.allowReplacement, false, 'extra slot not replaceable')
eq(plan.slots[0]!.replacements.length, 1, 'base replacement cloned')
eq(plan.slots[0]!.replacements[0]!.ingredientId, 'glutenfree-oats', 'replacement ingredient preserved')
eq(plan.optionals.length, 1, 'optionals de-duped by ingredient')
eq(plan.skippedExtras.length, 1, 'extra without ingredientId skipped')

console.log('planFlavorRecipe — extras-only (no base recipe)')
const extrasOnly = planFlavorRecipe({ slots: [], optionals: [] }, [{ ingredientId: 'x', name: 'X', qty: 250, unit: 'mg' }])
eq(extrasOnly.slots.length, 1, 'single extra becomes a slot')
eq(extrasOnly.slots[0]!.weightG, '0.25', '250mg → 0.25g')

console.log(failures === 0 ? '\n✅ all backfill transform tests passed' : `\n❌ ${failures} failing`)
process.exit(failures === 0 ? 0 : 1)
