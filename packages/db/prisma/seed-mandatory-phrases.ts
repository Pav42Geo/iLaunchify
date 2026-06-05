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
