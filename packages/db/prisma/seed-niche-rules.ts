// V1.1 NicheRule deterministic auto-assignment seed — 12 initial rules.
//
// Each rule maps a set of conditions to a target Niche. Conditions are AND
// across the array and OR within values. The engine evaluates rules at
// ProductTemplate submit, accumulates suggested niches, and writes
// NicheAssignmentAudit rows. isLocked=true means the manufacturer cannot
// remove the niche assignment (e.g., PET_PRODUCT → Pet Wellness).
//
// Source: Pavel decisions 2026-06-02. Idempotent — upsert keyed by slug.

import type { PrismaClient } from '@prisma/client'

type ConditionKind =
  | 'LABELING_TYPE'
  | 'CATEGORY'
  | 'SUBCATEGORY'
  | 'CERT_ATTACHED'
  | 'LIFESTYLE_TAG'

interface SeedNicheRule {
  slug: string
  nicheSlug: string
  description: string
  weight: number
  locked: boolean
  conditions: Array<{ kind: ConditionKind; values: string[] }>
}

const NICHE_RULES: SeedNicheRule[] = [
  // PET — locked (manufacturer can't remove)
  {
    slug: 'pet-products-labeling',
    nicheSlug: 'pet-wellness',
    weight: 100,
    locked: true,
    description: 'Pet products always surface in Pet Wellness niche',
    conditions: [{ kind: 'LABELING_TYPE', values: ['PET_PRODUCT'] }],
  },
  // BEAUTY — strong
  {
    slug: 'cosmetic-labeling',
    nicheSlug: 'beauty',
    weight: 90,
    locked: false,
    description: 'Cosmetic-labeled products go to Beauty & Self-Care',
    conditions: [{ kind: 'LABELING_TYPE', values: ['COSMETIC'] }],
  },
  {
    slug: 'cosmetics-category',
    nicheSlug: 'beauty',
    weight: 85,
    locked: false,
    description: 'Cosmetics & Personal Care category goes to Beauty',
    conditions: [{ kind: 'CATEGORY', values: ['cosmetics-personal-care'] }],
  },
  // ENERGY & PERFORMANCE
  {
    slug: 'energy-subcats',
    nicheSlug: 'energy-performance',
    weight: 85,
    locked: false,
    description: 'Pre-workout / energy / electrolyte / recovery subcategories',
    conditions: [
      {
        kind: 'SUBCATEGORY',
        values: [
          'pre-workout',
          'energy-drinks',
          'electrolyte-drinks',
          'recovery-products',
          'protein-powders',
          'protein-shakes',
        ],
      },
    ],
  },
  // WELLNESS
  {
    slug: 'wellness-subcats',
    nicheSlug: 'wellness',
    weight: 85,
    locked: false,
    description: 'Adaptogen / wellness tonic / probiotics / sleep / herbal subcategories',
    conditions: [
      {
        kind: 'SUBCATEGORY',
        values: [
          'adaptogen-drinks',
          'wellness-tonics',
          'probiotics',
          'sleep-supplements',
          'herbal-supplements',
          'greens-powders',
        ],
      },
    ],
  },
  // BEAUTY supplements + collagen + face masks
  {
    slug: 'beauty-subcats',
    nicheSlug: 'beauty',
    weight: 80,
    locked: false,
    description: 'Collagen / face masks / beauty supplements / lip care subcategories',
    conditions: [
      {
        kind: 'SUBCATEGORY',
        values: ['collagen', 'beauty-supplements', 'face-masks', 'lip-care'],
      },
    ],
  },
  // HEALTHY LIFESTYLE — cert/tag driven
  {
    slug: 'healthy-lifestyle-organic',
    nicheSlug: 'healthy-lifestyle',
    weight: 70,
    locked: false,
    description: 'Organic / Non-GMO / Gluten-free certified products',
    conditions: [
      {
        kind: 'CERT_ATTACHED',
        values: [
          'usda-organic',
          'non-gmo-project',
          'gluten-free-certification-organization',
        ],
      },
    ],
  },
  {
    slug: 'healthy-lifestyle-tags',
    nicheSlug: 'healthy-lifestyle',
    weight: 65,
    locked: false,
    description: 'Vegan / Keto / Gluten-free / Sugar-free lifestyle tags',
    conditions: [
      {
        kind: 'LIFESTYLE_TAG',
        values: ['vegan', 'keto', 'gluten-free', 'sugar-free', 'plant-based', 'whole30'],
      },
    ],
  },
  // GOURMET
  {
    slug: 'gourmet-subcats',
    nicheSlug: 'gourmet',
    weight: 80,
    locked: false,
    description: 'Specialty sauces / spices / oils / meal kits',
    conditions: [
      {
        kind: 'SUBCATEGORY',
        values: ['sauces', 'spices', 'seasonings', 'cooking-oils', 'meal-kits', 'marinades', 'condiments'],
      },
    ],
  },
  // FAMILY & KIDS — locked
  {
    slug: 'baby-kids-category',
    nicheSlug: 'family-kids',
    weight: 100,
    locked: true,
    description: 'Baby & Kids Nutrition category always in Family & Kids',
    conditions: [{ kind: 'CATEGORY', values: ['baby-kids-nutrition'] }],
  },
  // SOCIAL & LIFESTYLE
  {
    slug: 'gift-seasonal-category',
    nicheSlug: 'social-lifestyle',
    weight: 85,
    locked: false,
    description: 'Gift & Seasonal category goes to Social & Lifestyle',
    conditions: [{ kind: 'CATEGORY', values: ['gift-seasonal'] }],
  },
  {
    slug: 'mocktails-subcats',
    nicheSlug: 'social-lifestyle',
    weight: 75,
    locked: false,
    description: 'Mocktail / cocktail-mixer / party subcategories',
    conditions: [
      { kind: 'SUBCATEGORY', values: ['mocktails', 'lemonades', 'sodas'] },
    ],
  },
]

export async function seedNicheRules(prisma: PrismaClient): Promise<void> {
  console.log('🌱 Seeding NicheRule auto-assignment engine…')

  let upserted = 0
  let missingNiches = 0
  for (const r of NICHE_RULES) {
    const niche = await prisma.niche.findUnique({ where: { slug: r.nicheSlug } })
    if (!niche) {
      console.warn(`  ⚠ NicheRule ${r.slug}: niche ${r.nicheSlug} not found — skipping (ensure seedNiches ran first)`)
      missingNiches++
      continue
    }
    await prisma.nicheRule.upsert({
      where: { slug: r.slug },
      create: {
        slug: r.slug,
        nicheId: niche.id,
        description: r.description,
        weight: r.weight,
        isLocked: r.locked,
        isActive: true,
        conditions: r.conditions as unknown as object,
      },
      update: {
        nicheId: niche.id,
        description: r.description,
        weight: r.weight,
        isLocked: r.locked,
        isActive: true,
        conditions: r.conditions as unknown as object,
      },
    })
    upserted++
  }

  console.log(`✅ NicheRules: ${upserted} upserted` + (missingNiches ? ` (${missingNiches} missing niches)` : ''))
}
