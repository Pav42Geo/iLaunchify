// Golden self-test for the flavor-series engine + package compliance. Run via:
//   tsc --module commonjs ... flavorSeries.test.ts && node flavorSeries.test.js
import { planFlavorSeries } from './flavorSeries'
import { evaluateCompliancePackage } from './mandatory'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}

export function runFlavorSeriesSelfTest(): void {
  const flavors = [
    { id: 'straw', name: 'Strawberry', accentHex: '#E8425B', elementCue: 'sliced strawberries' },
    { id: 'choc', name: 'Chocolate', accentHex: '#5B3A29', elementCue: 'cocoa nibs' },
    { id: 'van', name: 'Vanilla', accentHex: '#EAD9A0' },
  ]
  const plan = planFlavorSeries('MASTER1', flavors)

  // 1. One derivative per valid flavour, master seed carried.
  assert(plan.count === 3 && plan.derivatives.length === 3, 'three derivatives')
  assert(plan.masterSeed === 'MASTER1', 'master seed retained')

  // 2. Each derivative varies ONLY the flavour accent colour + element; seed is
  //    a stable function of master + flavour id (reproducible, add-one-later safe).
  const straw = plan.derivatives.find((d) => d.flavorId === 'straw')!
  assert(straw.recolor.role === 'FLAVOR_ACCENT' && straw.recolor.hex === '#E8425B', 'straw accent recolour')
  assert(straw.elementCue === 'sliced strawberries', 'straw element cue')
  assert(straw.seed === 'MASTER1:straw', 'derivative seed = master:flavorId')

  // 3. Determinism: same master + same flavour → same derivative (batch OR add-later).
  const again = planFlavorSeries('MASTER1', [flavors[0]!])
  assert(again.derivatives[0]!.seed === straw.seed, 'add-one-later yields the same seed')

  // 4. Locked invariants declare what's held constant (identical brand).
  assert(plan.lockedInvariants.some((i) => /layout/i.test(i)) && plan.lockedInvariants.some((i) => /typography/i.test(i)), 'invariants list layout + type')

  // 5. Bad hex + duplicate id are rejected (surfaced, not silently dropped).
  const bad = planFlavorSeries('M', [
    { id: 'a', name: 'A', accentHex: '#123456' },
    { id: 'a', name: 'A dup', accentHex: '#654321' },
    { id: 'b', name: 'B', accentHex: 'not-a-hex' },
  ])
  assert(bad.count === 1, 'only the one valid, unique flavour kept')
  assert(bad.rejected.some((r) => r.reason === 'duplicate id') && bad.rejected.some((r) => /invalid accent/.test(r.reason)), 'dup + bad hex rejected')

  // 6. Package-level compliance: a jar (front label has the Facts+ingredients, top
  //    label has SoI only) — union across surfaces satisfies the pack.
  const front = ['NUTRITION_FACTS', 'INGREDIENTS', 'ALLERGENS', 'MANUFACTURER', 'NET_QUANTITY'] as const
  const top = ['STATEMENT_OF_IDENTITY'] as const
  const pkg = evaluateCompliancePackage('FOOD', [front as never, top as never])
  assert(pkg.complete && pkg.coverageScore === 1, 'union of jar labels is compliant at pack level')
  // ...whereas the top label ALONE would be wildly incomplete.
  const topOnly = evaluateCompliancePackage('FOOD', [top as never])
  assert(!topOnly.complete, 'top label alone is not a compliant package')

  console.log('FlavorSeries golden: PASS')
}

runFlavorSeriesSelfTest()
