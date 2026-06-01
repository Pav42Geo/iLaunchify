// V1.1 Niche × Subcategory reconciliation map.
//
// Layer 1 (Niche) references Layer 2 (Subcategory) leaves via the
// NicheSubcategory junction (Option A, locked 2026-06-01). Idempotent.
//
// Where a niche's natural keyword doesn't exist verbatim in Layer 2, we
// reconcile to the closest canonical subcategory slug — better to surface
// fewer correct items than more wrong ones (Pavel: 'one primary + ≤2
// secondary niches').

import type { PrismaClient } from '@prisma/client'

// Niche slug → ordered Subcategory slugs that surface on /launch/[niche].
const NICHE_SUBCATEGORIES: Record<string, string[]> = {
  'energy-performance': [
    'energy-drinks',
    'electrolyte-drinks',
    'protein-shakes',
    'protein-powders',
    'protein-bars',
    'granola-bars',
    'focus-supplements',
    'pre-workout',
    'recovery-products',
  ],
  'wellness': [
    'herbal-supplements',
    'adaptogen-drinks',
    'functional-tea-blends',
    'wellness-tonics',
    'probiotics',
    'greens-powders',
    'sleep-supplements',
    'kombucha',
    'gut-health-drinks',
    'nootropics',
  ],
  'beauty': [
    'collagen',
    'beauty-supplements',
    'facial-care',
    'cleansers',
    'serums',
    'moisturizers',
    'haircare',
    'shampoo',
    'conditioner',
    'body-wash',
    'lotion',
    'lip-care',
    'face-masks',
  ],
  'healthy-lifestyle': [
    'granola-bars',
    'protein-bars',
    'nuts-seeds',
    'trail-mixes',
    'dried-fruits',
    'oatmeal',
    'spreads-jams',
    'sparkling-water',
    'kombucha',
    'flavored-water',
  ],
  'gourmet': [
    'sauces',
    'condiments',
    'spices',
    'seasonings',
    'marinades',
    'cooking-oils',
    'vinegars',
    'meal-kits',
    'syrups',
  ],
  'family-kids': [
    'infant-formula',
    'purees',
    'baby-cereals',
    'teething-snacks',
    'toddler-meals',
    'kids-smoothies',
    'kids-vitamins',
  ],
  'pet-wellness': [
    'dry-food',
    'wet-food',
    'pet-treats',
    'dental-treats',
    'pet-supplements',
    'pet-wellness',
  ],
  'social-lifestyle': [
    'mocktails',
    'sodas',
    'lemonades',
    'gift-boxes',
    'holiday-bundles',
    'sampler-kits',
    'subscription-boxes',
    'seasonal-collections',
  ],
}

export async function seedNicheSubcategories(prisma: PrismaClient): Promise<void> {
  console.log('🌱 Seeding NicheSubcategory junction (Layer 1 ↔ Layer 2)…')

  let totalLinks = 0
  let missingNiches = 0
  let missingSubcats = 0

  for (const [nicheSlug, subSlugs] of Object.entries(NICHE_SUBCATEGORIES)) {
    const niche = await prisma.niche.findUnique({ where: { slug: nicheSlug } })
    if (!niche) {
      console.warn(`  ⚠ Niche not found: ${nicheSlug} — skipping (ensure seedNiches ran first)`)
      missingNiches++
      continue
    }

    for (const [idx, subSlug] of subSlugs.entries()) {
      const sub = await prisma.subcategory.findUnique({ where: { slug: subSlug } })
      if (!sub) {
        console.warn(`  ⚠ Subcategory not found: ${subSlug} for niche ${nicheSlug}`)
        missingSubcats++
        continue
      }

      await prisma.nicheSubcategory.upsert({
        where: {
          nicheId_subcategoryId: { nicheId: niche.id, subcategoryId: sub.id },
        },
        create: {
          nicheId: niche.id,
          subcategoryId: sub.id,
          displayOrder: (idx + 1) * 10,
        },
        update: {
          displayOrder: (idx + 1) * 10,
        },
      })
      totalLinks++
    }
  }

  console.log(
    `✅ NicheSubcategory: ${totalLinks} junction rows upserted` +
      (missingNiches || missingSubcats
        ? ` (${missingNiches} missing niches, ${missingSubcats} missing subcategories)`
        : ''),
  )
}
