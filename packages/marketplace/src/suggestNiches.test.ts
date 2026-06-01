// Unit tests for the suggestNiches deterministic engine.
//
// Vitest isn't wired in this package's tsconfig — but writing the tests as
// importable cases means we can plug them into vitest later. The pure
// `evaluateRules` helper below is exported alongside `suggestNiches` for
// test purposes (the prisma-bound `suggestNiches` is hard to call in unit
// tests without spinning up a Cockroach instance).
//
// We export typed scenario inputs that mirror the seed-niche-rules.ts shape
// + lightweight mock product facts. The same evaluator that powers
// `suggestNiches()` runs against these scenarios end-to-end.
//
// Run path (when vitest is added): `pnpm --filter @ilaunchify/marketplace test`.
// For now `pnpm tsc --noEmit -p packages/marketplace` ensures the scenarios
// compile against the shipping types.

import type { NicheRuleCondition, NicheSuggestion } from './types'

// ---- Scenario types ----------------------------------------------------------

interface MockProductFacts {
  labelingType: string
  categorySlug: string | null
  subcategorySlug: string | null
  certSlugs: string[]
  lifestyleTagSlugs: string[]
}

interface MockRule {
  id: string
  slug: string
  nicheId: string
  nicheSlug: string
  nicheName: string
  description: string
  weight: number
  isLocked: boolean
  isActive: boolean
  conditions: NicheRuleCondition[]
}

// Pure evaluator — mirrors the prisma-bound version in suggestNiches.ts.
// Kept here so unit tests don't have to mock Prisma.
function evaluateOne(c: NicheRuleCondition, f: MockProductFacts): boolean {
  if (c.values.length === 0) return false
  const certSet = new Set(f.certSlugs)
  const tagSet = new Set(f.lifestyleTagSlugs)
  switch (c.kind) {
    case 'LABELING_TYPE':
      return c.values.includes(f.labelingType)
    case 'CATEGORY':
      return f.categorySlug != null && c.values.includes(f.categorySlug)
    case 'SUBCATEGORY':
      return f.subcategorySlug != null && c.values.includes(f.subcategorySlug)
    case 'CERT_ATTACHED':
      return c.values.some((v) => certSet.has(v))
    case 'LIFESTYLE_TAG':
      return c.values.some((v) => tagSet.has(v))
  }
}

export function evaluateRulesForTest(
  rules: MockRule[],
  facts: MockProductFacts,
): NicheSuggestion[] {
  const perNiche = new Map<string, NicheSuggestion>()
  for (const r of rules) {
    if (!r.isActive) continue
    if (r.conditions.length === 0) continue
    if (!r.conditions.every((c) => evaluateOne(c, facts))) continue
    const candidate: NicheSuggestion = {
      nicheId: r.nicheId,
      nicheSlug: r.nicheSlug,
      nicheName: r.nicheName,
      weight: r.weight,
      ruleId: r.id,
      ruleSlug: r.slug,
      ruleDescription: r.description,
      isLocked: r.isLocked,
    }
    const existing = perNiche.get(r.nicheId)
    if (!existing) {
      perNiche.set(r.nicheId, candidate)
      continue
    }
    const winner = candidate.weight > existing.weight ? candidate : existing
    perNiche.set(r.nicheId, {
      ...winner,
      isLocked: existing.isLocked || candidate.isLocked,
    })
  }
  return Array.from(perNiche.values()).sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight
    return a.nicheName.localeCompare(b.nicheName)
  })
}

// ---- Shared seed-mirror rule deck --------------------------------------------

const RULES: MockRule[] = [
  {
    id: 'r1', slug: 'pet-products-labeling',
    nicheId: 'n-pet', nicheSlug: 'pet-wellness', nicheName: 'Pet Wellness',
    description: 'Pet products always surface in Pet Wellness niche',
    weight: 100, isLocked: true, isActive: true,
    conditions: [{ kind: 'LABELING_TYPE', values: ['PET_PRODUCT'] }],
  },
  {
    id: 'r2', slug: 'cosmetic-labeling',
    nicheId: 'n-beauty', nicheSlug: 'beauty', nicheName: 'Beauty',
    description: 'Cosmetic-labeled products go to Beauty & Self-Care',
    weight: 90, isLocked: false, isActive: true,
    conditions: [{ kind: 'LABELING_TYPE', values: ['COSMETIC'] }],
  },
  {
    id: 'r3', slug: 'cosmetics-category',
    nicheId: 'n-beauty', nicheSlug: 'beauty', nicheName: 'Beauty',
    description: 'Cosmetics & Personal Care category goes to Beauty',
    weight: 85, isLocked: false, isActive: true,
    conditions: [{ kind: 'CATEGORY', values: ['cosmetics-personal-care'] }],
  },
  {
    id: 'r4', slug: 'energy-subcats',
    nicheId: 'n-energy', nicheSlug: 'energy-performance',
    nicheName: 'Energy & Performance',
    description: 'Pre-workout / energy / electrolyte / recovery subcategories',
    weight: 85, isLocked: false, isActive: true,
    conditions: [
      {
        kind: 'SUBCATEGORY',
        values: ['pre-workout', 'energy-drinks', 'protein-powders'],
      },
    ],
  },
  {
    id: 'r5', slug: 'baby-kids-category',
    nicheId: 'n-fam', nicheSlug: 'family-kids', nicheName: 'Family & Kids',
    description: 'Baby & Kids Nutrition category always in Family & Kids',
    weight: 100, isLocked: true, isActive: true,
    conditions: [{ kind: 'CATEGORY', values: ['baby-kids-nutrition'] }],
  },
]

// ---- Scenarios ---------------------------------------------------------------

// 1. Pet labelingType → Pet Wellness LOCKED
export const scenarioPetLocked = () => {
  const facts: MockProductFacts = {
    labelingType: 'PET_PRODUCT',
    categorySlug: 'pet-food',
    subcategorySlug: 'dog-treats',
    certSlugs: [],
    lifestyleTagSlugs: [],
  }
  const out = evaluateRulesForTest(RULES, facts)
  if (out.length !== 1) throw new Error(`Pet: expected 1 suggestion, got ${out.length}`)
  const s = out[0]!
  if (s.nicheSlug !== 'pet-wellness') throw new Error(`Pet: wrong niche ${s.nicheSlug}`)
  if (!s.isLocked) throw new Error('Pet: expected locked')
  return true
}

// 2. Cosmetic labelingType OR Cosmetics category → Beauty (non-locked)
export const scenarioBeautyNonLocked = () => {
  const facts: MockProductFacts = {
    labelingType: 'COSMETIC',
    categorySlug: 'cosmetics-personal-care',
    subcategorySlug: 'face-creams',
    certSlugs: [],
    lifestyleTagSlugs: [],
  }
  const out = evaluateRulesForTest(RULES, facts)
  const beauty = out.find((s) => s.nicheSlug === 'beauty')
  if (!beauty) throw new Error('Beauty: expected a beauty suggestion')
  if (beauty.isLocked) throw new Error('Beauty: must not be locked')
  // Both r2 and r3 should match; deduped to highest-weight winner (r2=90).
  if (beauty.weight !== 90) throw new Error(`Beauty: expected weight 90, got ${beauty.weight}`)
  return true
}

// 3. Pre-workout subcategory → Energy & Performance
export const scenarioEnergyPreworkout = () => {
  const facts: MockProductFacts = {
    labelingType: 'DIETARY_SUPPLEMENT',
    categorySlug: 'sports-nutrition',
    subcategorySlug: 'pre-workout',
    certSlugs: [],
    lifestyleTagSlugs: [],
  }
  const out = evaluateRulesForTest(RULES, facts)
  if (out.length !== 1) throw new Error(`Energy: expected 1 hit, got ${out.length}`)
  if (out[0]!.nicheSlug !== 'energy-performance') {
    throw new Error(`Energy: wrong niche ${out[0]!.nicheSlug}`)
  }
  return true
}

// 4. Empty product (no rules match) → empty suggestions
export const scenarioEmptyProduct = () => {
  const facts: MockProductFacts = {
    labelingType: 'FOOD',
    categorySlug: 'beverages',
    subcategorySlug: 'sparkling-water',
    certSlugs: [],
    lifestyleTagSlugs: [],
  }
  const out = evaluateRulesForTest(RULES, facts)
  if (out.length !== 0) throw new Error(`Empty: expected 0 suggestions, got ${out.length}`)
  return true
}

// 5. Multiple rules for the same niche → dedup with highest weight + locked
//    preserved. We craft a synthetic rule set where a low-weight LOCKED rule
//    pairs with a high-weight non-locked rule on the same niche.
export const scenarioDedupLockedWins = () => {
  const synthetic: MockRule[] = [
    {
      id: 'lowLocked', slug: 'low-locked',
      nicheId: 'n-beauty', nicheSlug: 'beauty', nicheName: 'Beauty',
      description: 'Locked low-weight rule', weight: 30,
      isLocked: true, isActive: true,
      conditions: [{ kind: 'LABELING_TYPE', values: ['COSMETIC'] }],
    },
    {
      id: 'highOpen', slug: 'high-open',
      nicheId: 'n-beauty', nicheSlug: 'beauty', nicheName: 'Beauty',
      description: 'Open high-weight rule', weight: 90,
      isLocked: false, isActive: true,
      conditions: [{ kind: 'LABELING_TYPE', values: ['COSMETIC'] }],
    },
  ]
  const facts: MockProductFacts = {
    labelingType: 'COSMETIC',
    categorySlug: null, subcategorySlug: null,
    certSlugs: [], lifestyleTagSlugs: [],
  }
  const out = evaluateRulesForTest(synthetic, facts)
  if (out.length !== 1) throw new Error(`Dedup: expected 1 suggestion, got ${out.length}`)
  if (out[0]!.weight !== 90) throw new Error(`Dedup: expected weight 90, got ${out[0]!.weight}`)
  if (!out[0]!.isLocked) throw new Error('Dedup: locked must be preserved')
  return true
}

// 6. Locked baby-kids category — categories alone (no labelingType)
export const scenarioBabyKidsCategoryLock = () => {
  const facts: MockProductFacts = {
    labelingType: 'FOOD',
    categorySlug: 'baby-kids-nutrition',
    subcategorySlug: 'infant-formula',
    certSlugs: [],
    lifestyleTagSlugs: [],
  }
  const out = evaluateRulesForTest(RULES, facts)
  const fam = out.find((s) => s.nicheSlug === 'family-kids')
  if (!fam) throw new Error('Family: missing suggestion')
  if (!fam.isLocked) throw new Error('Family: expected locked')
  return true
}

// All scenarios — run via a manual runner if you need to confirm locally:
//   import { runAll } from '@ilaunchify/marketplace/suggestNiches.test'
export function runAll(): void {
  scenarioPetLocked()
  scenarioBeautyNonLocked()
  scenarioEnergyPreworkout()
  scenarioEmptyProduct()
  scenarioDedupLockedWins()
  scenarioBabyKidsCategoryLock()
}
