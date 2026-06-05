// Seed — canonical mandatory label phrases (admin-managed catalog).
//
// Replaces the ad-hoc `disclosures` JSON with a curated, editable catalog the
// compliance scanner + label renderer can reference. Starter set spans the
// categories (allergen / disclaimer / warning / identity) and labeling types.
// Idempotent (upsert by slug). FINAL legal text should be counsel-reviewed.

import { PrismaClient } from '@prisma/client'
import type { MandatoryPhraseCategory } from '@prisma/client'

interface PhraseSeed {
  slug: string
  title: string
  body: string
  category: MandatoryPhraseCategory
  labelingTypes: string[]
  cfrCitation?: string
  appliesWhen?: string
}

const PHRASES: PhraseSeed[] = [
  {
    slug: 'dshea-disclaimer',
    title: 'DSHEA Disclaimer',
    body: 'These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease.',
    category: 'DISCLAIMER',
    labelingTypes: ['DIETARY_SUPPLEMENT'],
    cfrCitation: '21 CFR 101.93(b)',
    appliesWhen: 'A structure/function claim appears on the label.',
  },
  {
    slug: 'iron-overdose-warning',
    title: 'Iron Overdose Warning',
    body: 'Accidental overdose of iron-containing products is a leading cause of fatal poisoning in children under 6. Keep this product out of reach of children. In case of accidental overdose, call a doctor or poison control center immediately.',
    category: 'WARNING',
    labelingTypes: ['DIETARY_SUPPLEMENT', 'FOOD'],
    cfrCitation: '21 CFR 101.17(e)',
    appliesWhen: '≥30 mg iron per serving in a solid oral dosage form.',
  },
  {
    slug: 'allergen-contains-statement',
    title: 'Allergen "Contains" Statement',
    body: 'Contains: [list each major food allergen present, e.g. Milk, Eggs, Wheat, Soy, Peanuts, Tree Nuts, Fish, Shellfish, Sesame].',
    category: 'ALLERGEN',
    labelingTypes: ['FOOD', 'DIETARY_SUPPLEMENT'],
    cfrCitation: '21 CFR 101 (FALCPA / FASTER Act)',
    appliesWhen: 'The product contains one of the 9 major food allergens.',
  },
  {
    slug: 'keep-out-of-reach-children',
    title: 'Keep Out of Reach of Children',
    body: 'Keep out of reach of children. In case of overdose, get medical help or contact a Poison Control Center right away.',
    category: 'WARNING',
    labelingTypes: ['OTC'],
    cfrCitation: '21 CFR 201.66(c)(5)(x)',
    appliesWhen: 'All OTC drug products.',
  },
  {
    slug: 'phenylketonurics',
    title: 'Phenylketonurics Warning',
    body: 'Phenylketonurics: Contains Phenylalanine.',
    category: 'WARNING',
    labelingTypes: ['FOOD', 'DIETARY_SUPPLEMENT'],
    cfrCitation: '21 CFR 172.804(e)',
    appliesWhen: 'The product contains aspartame.',
  },
  {
    slug: 'bioengineered-disclosure',
    title: 'Bioengineered Food Disclosure',
    body: 'Contains a bioengineered food ingredient.',
    category: 'DISCLAIMER',
    labelingTypes: ['FOOD', 'DIETARY_SUPPLEMENT'],
    cfrCitation: '7 CFR 66 (USDA NBFDS)',
    appliesWhen: 'The product contains a detectable bioengineered ingredient.',
  },
  {
    slug: 'otc-acetaminophen-liver-warning',
    title: 'OTC Liver Warning (Acetaminophen)',
    body: 'Liver warning: This product contains acetaminophen. Severe liver damage may occur if you take more than the maximum daily amount, with other drugs containing acetaminophen, or 3 or more alcoholic drinks every day while using this product.',
    category: 'WARNING',
    labelingTypes: ['OTC'],
    cfrCitation: '21 CFR 201.326',
    appliesWhen: 'Acetaminophen is an active ingredient.',
  },
  {
    slug: 'manufacturer-distributor-statement',
    title: 'Manufacturer / Distributor Statement',
    body: 'Manufactured for: [Brand Name], [City, State, ZIP].',
    category: 'IDENTITY',
    labelingTypes: ['FOOD', 'DIETARY_SUPPLEMENT', 'OTC'],
    cfrCitation: '21 CFR 101.5',
    appliesWhen: 'All packaged products — name + place of business of the responsible firm.',
  },
  {
    slug: 'aafco-nutritional-adequacy',
    title: 'AAFCO Nutritional Adequacy Statement',
    body: '[Product] is formulated to meet the nutritional levels established by the AAFCO Dog (or Cat) Food Nutrient Profiles for [life stage].',
    category: 'DISCLAIMER',
    labelingTypes: ['PET_PRODUCT'],
    cfrCitation: 'AAFCO Model Pet Food Regulations',
    appliesWhen: 'Pet food labeled "complete and balanced".',
  },
  // ---- Brought over from the Studio's hardcoded phrase chips (compliance-relevant) ----
  {
    slug: 'allergen-may-contain',
    title: 'Allergen "May Contain" Advisory',
    body: 'May contain traces of [allergens, e.g. tree nuts, peanuts].',
    category: 'ALLERGEN',
    labelingTypes: ['FOOD', 'DIETARY_SUPPLEMENT', 'BEVERAGE'],
    cfrCitation: '21 CFR 101 (advisory)',
    appliesWhen: 'Shared-line cross-contact is possible.',
  },
  {
    slug: 'alcohol-government-warning',
    title: 'Alcohol Government Warning',
    body: 'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.',
    category: 'WARNING',
    labelingTypes: ['BEVERAGE', 'FOOD'],
    cfrCitation: '27 CFR 16.21',
    appliesWhen: 'Alcoholic beverage ≥ 0.5% ABV.',
  },
  {
    slug: 'tamper-evident-seal',
    title: 'Tamper-Evident Seal Notice',
    body: 'Do not use if the printed safety seal under the cap is broken or missing.',
    category: 'WARNING',
    labelingTypes: ['DIETARY_SUPPLEMENT', 'OTC', 'FOOD'],
    cfrCitation: '21 CFR 211.132',
    appliesWhen: 'Tamper-evident packaging.',
  },
  {
    slug: 'supplement-pregnancy-consult',
    title: 'Pregnancy / Medication Consult',
    body: 'If you are pregnant, nursing, taking medication, or have a medical condition, consult your healthcare provider before use.',
    category: 'WARNING',
    labelingTypes: ['DIETARY_SUPPLEMENT'],
    appliesWhen: 'Dietary supplements (advisory).',
  },
  {
    slug: 'discontinue-if-irritation',
    title: 'Discontinue If Adverse Reaction',
    body: 'Discontinue use and consult a doctor if any adverse reaction or irritation occurs.',
    category: 'WARNING',
    labelingTypes: ['DIETARY_SUPPLEMENT', 'COSMETIC'],
    appliesWhen: 'Topical or ingestible products (advisory).',
  },
  {
    slug: 'storage-refrigerate-after-opening',
    title: 'Storage — Refrigerate After Opening',
    body: 'Refrigerate after opening. Use within [N] days.',
    category: 'DIRECTIONS',
    labelingTypes: ['FOOD', 'BEVERAGE'],
    appliesWhen: 'Perishable after opening.',
  },
  {
    slug: 'storage-cool-dry-place',
    title: 'Storage — Cool, Dry Place',
    body: 'Store in a cool, dry place away from direct sunlight.',
    category: 'DIRECTIONS',
    labelingTypes: ['FOOD', 'DIETARY_SUPPLEMENT', 'BEVERAGE'],
    appliesWhen: 'Shelf-stable products.',
  },
  {
    slug: 'net-quantity-statement',
    title: 'Net Quantity of Contents',
    body: 'Net Wt [X] oz ([Y] g) — US customary first, metric in parentheses, placed in the bottom 30% of the principal display panel.',
    category: 'IDENTITY',
    labelingTypes: ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'BEVERAGE'],
    cfrCitation: '21 CFR 101.105',
    appliesWhen: 'All packaged products.',
  },
  {
    slug: 'ingredient-statement',
    title: 'Ingredient Statement',
    body: 'Ingredients: [list every ingredient in descending order of predominance by weight, using common or usual names].',
    category: 'IDENTITY',
    labelingTypes: ['FOOD', 'DIETARY_SUPPLEMENT', 'BEVERAGE'],
    cfrCitation: '21 CFR 101.4',
    appliesWhen: 'Multi-ingredient products.',
  },
]

export async function seedMandatoryPhrases(prisma: PrismaClient): Promise<void> {
  for (let i = 0; i < PHRASES.length; i++) {
    const p = PHRASES[i]!
    await prisma.mandatoryPhrase.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        title: p.title,
        body: p.body,
        category: p.category,
        labelingTypes: p.labelingTypes,
        cfrCitation: p.cfrCitation ?? null,
        appliesWhen: p.appliesWhen ?? null,
        displayOrder: i,
        isActive: true,
      },
      update: {
        title: p.title,
        body: p.body,
        category: p.category,
        labelingTypes: p.labelingTypes,
        cfrCitation: p.cfrCitation ?? null,
        appliesWhen: p.appliesWhen ?? null,
        displayOrder: i,
      },
    })
  }
  // eslint-disable-next-line no-console
  console.log(`  ✓ Seeded ${PHRASES.length} mandatory phrases`)
}

// Standalone run: `tsx prisma/seed-mandatory-phrases.ts`
if (process.argv[1]?.endsWith('seed-mandatory-phrases.ts')) {
  const prisma = new PrismaClient()
  seedMandatoryPhrases(prisma)
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
