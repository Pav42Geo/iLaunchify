// Golden self-test for the domain-preset engine + prompt tone. Run via:
//   tsc --module commonjs ... domainPreset.test.ts && node domainPreset.test.js
import { domainPreset, resolveDomainOptions, recommendedPackageTypes } from './domainPreset'
import { assemblePrompt } from './prompt'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}

export function runDomainPresetSelfTest(): void {
  // 1. Every domain has non-empty presets + a tone + recommended package types.
  for (const d of ['FOOD', 'DIETARY_SUPPLEMENT', 'OTC', 'COSMETIC', 'PET_PRODUCT'] as const) {
    const p = domainPreset(d)
    assert(p.styles.length > 0 && p.colors.length > 0 && p.elements.length > 0, `${d} has chip presets`)
    assert(p.promptTone.length > 0 && p.substrateHint.length > 0, `${d} has tone + substrate`)
    assert(p.packageTypes.length > 0, `${d} recommends package types`)
  }

  // 2. Domain personality is distinct: supplement = clinical/trust, cosmetic = premium,
  //    pet = playful, food = appetite. (No cross-contamination.)
  assert(domainPreset('DIETARY_SUPPLEMENT').styles.includes('Clinical'), 'supplement → Clinical')
  assert(!domainPreset('DIETARY_SUPPLEMENT').elements.includes('Doodles'), 'supplement excludes Doodles')
  assert(domainPreset('COSMETIC').styles.includes('Premium'), 'cosmetic → Premium')
  assert(domainPreset('PET_PRODUCT').elements.includes('Animals'), 'pet → Animals')
  assert(domainPreset('FOOD').elements.includes('Fruits'), 'food → Fruits')

  // 3. Recommended package types are domain-appropriate (no-die-line path only).
  assert(recommendedPackageTypes('DIETARY_SUPPLEMENT').some((t) => /bottle|jar/i.test(t)), 'supplement → bottle/jar')
  assert(recommendedPackageTypes('COSMETIC').some((t) => /tube|jar|bottle/i.test(t)), 'cosmetic → tube/jar/bottle')
  assert(recommendedPackageTypes('FOOD').some((t) => /carton|pouch|bag|box/i.test(t)), 'food → carton/pouch')

  // 4. Admin overrides REPLACE a dimension; omitted dimensions keep domain defaults.
  const tuned = resolveDomainOptions('FOOD', { styles: ['Retro', 'Retro', 'Bold'], promptTone: 'nostalgic diner' })
  assert(tuned.styles.join(',') === 'Retro,Bold', 'override styles de-duped + replaces')
  assert(tuned.promptTone === 'nostalgic diner', 'override tone replaces')
  assert(tuned.colors.length === domainPreset('FOOD').colors.length, 'omitted colours fall back to default')

  // 5. domainPreset returns a copy (non-mutating).
  const a = domainPreset('FOOD'); a.styles.push('XXX')
  assert(!domainPreset('FOOD').styles.includes('XXX'), 'domainPreset is non-mutating')

  // 6. The tone flows into the prompt as a "Mood:" clause.
  const out = assemblePrompt({ productDescriptor: 'protein powder tub', domainTone: domainPreset('DIETARY_SUPPLEMENT').promptTone })
  assert(/Mood: .*(clean|credible|health)/i.test(out.prompt), 'supplement tone woven into prompt')
  const noTone = assemblePrompt({ productDescriptor: 'protein powder tub' })
  assert(!/Mood:/.test(noTone.prompt), 'no Mood clause when no tone')

  console.log('DomainPreset golden: PASS')
}

runDomainPresetSelfTest()
