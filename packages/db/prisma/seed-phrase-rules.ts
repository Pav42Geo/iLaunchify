// Seed — deterministic PhraseRule rows that drive the per-product label-phrase
// engine (packages/marketplace/suggestPhrases). Mirrors seed-niche-rules.ts.
//
// For every MandatoryPhrase in the catalog we create one or more rules:
//   • OVERRIDES[slug] — conditional phrases whose trigger is an allergen, an
//     ingredient match, or a manufacturer product-fact flag (not just the
//     labeling type). Each entry can contribute multiple rules (OR semantics:
//     separate rules targeting the same phrase dedupe to a single suggestion).
//   • Default rule — every other phrase gets a LABELING_TYPE rule built from its
//     own `labelingTypes`. MANDATORY → locked (pinned, can't be removed);
//     RECOMMENDED → unlocked optional suggestion. A few catalog-MANDATORY but
//     genuinely-advisory phrases are listed in ADVISORY_UNLOCK so they surface
//     unlocked.
//
// Idempotent (upsert by slug). Run after seed-mandatory-phrases.

import { PrismaClient } from '@prisma/client'

type Cond = { kind: string; values: string[] }
interface RuleDef {
  conditions: Cond[]
  isLocked?: boolean
  weight?: number
  note?: string
}

// Catalog-MANDATORY phrases that are really advisory — surface unlocked.
const ADVISORY_UNLOCK = new Set<string>([
  'allergen-may-contain',
  'supplement-pregnancy-consult',
  'discontinue-if-irritation',
  'storage-refrigerate-after-opening',
  'storage-cool-dry-place',
])

const ALLERGEN_VALUES = [
  'milk',
  'eggs',
  'egg',
  'fish',
  'shellfish',
  'crustacean shellfish',
  'tree_nuts',
  'tree nuts',
  'peanuts',
  'wheat',
  'soybeans',
  'soy',
  'sesame',
]

// Conditional phrases — trigger is recipe- or fact-driven, NOT labeling type.
const OVERRIDES: Record<string, RuleDef[]> = {
  // ---- Allergen / ingredient-triggered ----
  'allergen-contains-statement': [
    { conditions: [{ kind: 'ALLERGEN_PRESENT', values: ALLERGEN_VALUES }], isLocked: true, weight: 95 },
  ],
  'allergen-may-contain': [
    { conditions: [{ kind: 'ALLERGEN_PRESENT', values: ALLERGEN_VALUES }], isLocked: false, weight: 40 },
  ],
  'sulfites-declaration': [
    { conditions: [{ kind: 'ALLERGEN_PRESENT', values: ['sulfites'] }], isLocked: true, weight: 90 },
    { conditions: [{ kind: 'INGREDIENT_MATCH', values: ['sulfite', 'metabisulfite', 'sulfur dioxide'] }], isLocked: true, weight: 90 },
  ],
  phenylketonurics: [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['containsAspartame'] }], isLocked: true, weight: 90 },
    { conditions: [{ kind: 'INGREDIENT_MATCH', values: ['aspartame'] }], isLocked: true, weight: 90 },
  ],
  'bioengineered-disclosure': [
    { conditions: [{ kind: 'BIOENGINEERED', values: ['true'] }], isLocked: true, weight: 90 },
  ],
  'iron-overdose-warning': [
    { conditions: [{ kind: 'INGREDIENT_MATCH', values: ['iron', 'ferrous', 'ferric'] }], isLocked: true, weight: 90 },
  ],
  'psyllium-choking-notice': [
    { conditions: [{ kind: 'INGREDIENT_MATCH', values: ['psyllium'] }], isLocked: true, weight: 85 },
  ],
  'otc-acetaminophen-liver-warning': [
    { conditions: [{ kind: 'INGREDIENT_MATCH', values: ['acetaminophen'] }], isLocked: true, weight: 90 },
  ],
  'otc-reyes-syndrome-warning': [
    { conditions: [{ kind: 'INGREDIENT_MATCH', values: ['aspirin', 'salicylate', 'carbaspirin'] }], isLocked: true, weight: 85 },
  ],
  'fdc-yellow-5-declaration': [
    { conditions: [{ kind: 'INGREDIENT_MATCH', values: ['yellow no. 5', 'yellow 5', 'tartrazine'] }], isLocked: true, weight: 85 },
  ],
  'alcohol-fdc-yellow-5': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isAlcoholBeverage'] }, { kind: 'INGREDIENT_MATCH', values: ['yellow no. 5', 'yellow 5', 'tartrazine'] }], isLocked: true, weight: 85 },
  ],
  'alcohol-cochineal-carmine': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isAlcoholBeverage'] }, { kind: 'INGREDIENT_MATCH', values: ['cochineal', 'carmine'] }], isLocked: true, weight: 85 },
  ],

  // ---- Product-fact-triggered (claims / representation / packaging) ----
  'dshea-disclaimer': [
    { conditions: [{ kind: 'LABELING_TYPE', values: ['DIETARY_SUPPLEMENT'] }, { kind: 'PRODUCT_FACT', values: ['makesStructureFunctionClaims'] }], isLocked: true, weight: 90 },
  ],
  'tamper-evident-seal': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['tamperEvidentPackaging'] }], isLocked: true, weight: 80 },
  ],
  'self-pressurized-food-warning': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isSelfPressurized'] }], isLocked: true, weight: 85 },
  ],
  'cosmetic-aerosol-warning': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isSelfPressurized'] }], isLocked: true, weight: 85 },
  ],
  'protein-weight-reduction-warning': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['representedForWeightReduction'] }], isLocked: true, weight: 85 },
  ],
  'juice-percentage-declaration': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isJuiceBeverage'] }], isLocked: true, weight: 85 },
  ],
  'unpasteurized-juice-warning': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isUnpasteurizedJuice'] }], isLocked: true, weight: 90 },
  ],
  'country-of-origin-marking': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isImported'] }], isLocked: true, weight: 80 },
  ],
  'gluten-free-wheat-processed-statement': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['claimsGlutenFreeWithWheat'] }], isLocked: true, weight: 80 },
  ],
  'artificial-flavor-declaration': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['hasArtificialFlavor'] }], isLocked: true, weight: 80 },
  ],
  'chemical-preservative-declaration': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['hasChemicalPreservative'] }], isLocked: true, weight: 80 },
  ],
  'otc-sunscreen-skin-cancer-alert': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isSunscreen'] }], isLocked: true, weight: 85 },
  ],
  'otc-sunscreen-use': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isSunscreen'] }], isLocked: true, weight: 85 },
  ],
  'otc-for-external-use-only': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isTopicalOtc'] }], isLocked: true, weight: 80 },
  ],
  'cosmetic-suntanning-no-sunscreen': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isSuntanningProduct'] }], isLocked: true, weight: 85 },
  ],
  'cosmetic-mocra-professional-use': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isProfessionalUseOnly'] }], isLocked: true, weight: 80 },
  ],
  'cosmetic-safety-not-determined': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['safetyNotSubstantiated'] }], isLocked: true, weight: 80 },
  ],
  'cosmetic-feminine-deodorant-spray': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isFeminineDeodorantSpray'] }], isLocked: true, weight: 80 },
  ],
  'cosmetic-foaming-bath-caution': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isFoamingBath'] }], isLocked: true, weight: 80 },
  ],
  'cosmetic-coal-tar-hair-dye': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isCoalTarHairDye'] }], isLocked: true, weight: 80 },
  ],
  'pet-supplemental-feeding-only': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isSupplementalPetFood'] }], isLocked: true, weight: 80 },
  ],
  // ---- Alcohol regime (always when it's an alcohol beverage) ----
  'alcohol-government-warning': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isAlcoholBeverage'] }], isLocked: true, weight: 95 },
  ],
  'alcohol-content-statement': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isAlcoholBeverage'] }], isLocked: true, weight: 85 },
  ],
  'alcohol-class-type-designation': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isAlcoholBeverage'] }], isLocked: true, weight: 80 },
  ],
  'alcohol-bottler-importer-name': [
    { conditions: [{ kind: 'PRODUCT_FACT', values: ['isAlcoholBeverage'] }], isLocked: true, weight: 80 },
  ],
}

export async function seedPhraseRules(prisma: PrismaClient): Promise<void> {
  const phrases = await prisma.mandatoryPhrase.findMany({
    select: { id: true, slug: true, title: true, requirement: true, labelingTypes: true },
  })
  const byId = new Map(phrases.map((p) => [p.slug, p]))

  // Build the full set of (ruleSlug → rule) to upsert.
  type PendingRule = {
    slug: string
    mandatoryPhraseId: string
    description: string
    isLocked: boolean
    weight: number
    conditions: Cond[]
  }
  const pending: PendingRule[] = []

  for (const p of phrases) {
    const overrides = OVERRIDES[p.slug]
    if (overrides) {
      overrides.forEach((def, i) => {
        pending.push({
          slug: overrides.length > 1 ? `auto-${p.slug}-${i}` : `auto-${p.slug}`,
          mandatoryPhraseId: p.id,
          description: `${p.title} — ${def.note ?? 'conditional trigger'}`,
          isLocked: def.isLocked ?? p.requirement === 'MANDATORY',
          weight: def.weight ?? (p.requirement === 'MANDATORY' ? 80 : 30),
          conditions: def.conditions,
        })
      })
      continue
    }
    // Default LABELING_TYPE rule from the phrase's own labelingTypes.
    if (p.labelingTypes.length === 0) continue
    const locked = p.requirement === 'MANDATORY' && !ADVISORY_UNLOCK.has(p.slug)
    pending.push({
      slug: `auto-${p.slug}`,
      mandatoryPhraseId: p.id,
      description: `${p.title} — applies to ${p.labelingTypes.join(', ')}`,
      isLocked: locked,
      weight: locked ? 80 : p.requirement === 'MANDATORY' ? 40 : 30,
      conditions: [{ kind: 'LABELING_TYPE', values: p.labelingTypes }],
    })
  }

  for (const r of pending) {
    await prisma.phraseRule.upsert({
      where: { slug: r.slug },
      create: {
        slug: r.slug,
        mandatoryPhraseId: r.mandatoryPhraseId,
        description: r.description,
        isLocked: r.isLocked,
        weight: r.weight,
        conditions: r.conditions,
        isActive: true,
      },
      update: {
        mandatoryPhraseId: r.mandatoryPhraseId,
        description: r.description,
        isLocked: r.isLocked,
        weight: r.weight,
        conditions: r.conditions,
      },
    })
  }

  // Sanity: flag any OVERRIDES slug that didn't match a catalog phrase.
  const missing = Object.keys(OVERRIDES).filter((s) => !byId.has(s))
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.warn(`  ⚠ phrase-rules: ${missing.length} override slug(s) not in catalog: ${missing.join(', ')}`)
  }
  // eslint-disable-next-line no-console
  console.log(`  ✓ Seeded ${pending.length} phrase rules across ${phrases.length} phrases`)
}

// Standalone run: `tsx prisma/seed-phrase-rules.ts`
if (process.argv[1]?.endsWith('seed-phrase-rules.ts')) {
  const prisma = new PrismaClient()
  seedPhraseRules(prisma)
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
