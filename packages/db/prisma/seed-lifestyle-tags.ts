// V1.1 LOCKED Layer 4 LifestyleTag vocabulary — 30 tags across 3 groups.
//
// Source of truth: docs/MARKETPLACE_DESIGN.md §2 Layer 4 (locked
// vocabulary, 2026-06-01 Pavel decision). Idempotent — upsert keyed by
// slug.
//
// Groups:
//   LIFESTYLE — diet / preparation orientations (Keto, Vegan, GF, etc.)
//   AUDIENCE  — intended consumer cohort (Kids, Athletes, Pets, etc.)
//   TREND     — emerging buyer-side trend terms (Microbiome, Mood, etc.)

import { type PrismaClient, type LifestyleTagGroup } from '@prisma/client'

interface SeedLifestyleTag {
  slug: string
  name: string
  group: LifestyleTagGroup
}

const LIFESTYLE_TAGS: SeedLifestyleTag[] = [
  // LIFESTYLE (13)
  { slug: 'keto', name: 'Keto', group: 'LIFESTYLE' },
  { slug: 'paleo', name: 'Paleo', group: 'LIFESTYLE' },
  { slug: 'vegan', name: 'Vegan', group: 'LIFESTYLE' },
  { slug: 'vegetarian', name: 'Vegetarian', group: 'LIFESTYLE' },
  { slug: 'gluten-free', name: 'Gluten-Free', group: 'LIFESTYLE' },
  { slug: 'dairy-free', name: 'Dairy-Free', group: 'LIFESTYLE' },
  { slug: 'sugar-free', name: 'Sugar-Free', group: 'LIFESTYLE' },
  { slug: 'low-carb', name: 'Low-Carb', group: 'LIFESTYLE' },
  { slug: 'high-protein', name: 'High-Protein', group: 'LIFESTYLE' },
  { slug: 'organic', name: 'Organic', group: 'LIFESTYLE' },
  { slug: 'non-gmo', name: 'Non-GMO', group: 'LIFESTYLE' },
  { slug: 'plant-based', name: 'Plant-Based', group: 'LIFESTYLE' },
  { slug: 'whole30', name: 'Whole30', group: 'LIFESTYLE' },
  // AUDIENCE (6)
  { slug: 'kids', name: 'Kids', group: 'AUDIENCE' },
  { slug: 'adults', name: 'Adults', group: 'AUDIENCE' },
  { slug: 'seniors', name: 'Seniors', group: 'AUDIENCE' },
  { slug: 'athletes', name: 'Athletes', group: 'AUDIENCE' },
  { slug: 'pregnancy-safe', name: 'Pregnancy-Safe', group: 'AUDIENCE' },
  { slug: 'pets', name: 'Pets', group: 'AUDIENCE' },
  // TREND (11)
  { slug: 'functional', name: 'Functional', group: 'TREND' },
  { slug: 'adaptogenic', name: 'Adaptogenic', group: 'TREND' },
  { slug: 'microbiome', name: 'Microbiome', group: 'TREND' },
  { slug: 'mood', name: 'Mood', group: 'TREND' },
  { slug: 'energy', name: 'Energy', group: 'TREND' },
  { slug: 'sleep', name: 'Sleep', group: 'TREND' },
  { slug: 'immunity', name: 'Immunity', group: 'TREND' },
  { slug: 'beauty-from-within', name: 'Beauty-from-Within', group: 'TREND' },
  { slug: 'sustainable-packaging', name: 'Sustainable Packaging', group: 'TREND' },
  { slug: 'single-origin', name: 'Single-Origin', group: 'TREND' },
  { slug: 'small-batch', name: 'Small-Batch', group: 'TREND' },
]

export async function seedLifestyleTags(prisma: PrismaClient): Promise<void> {
  console.log('🌱 Seeding LifestyleTag vocabulary (Layer 4 — LOCKED)…')

  // Group order for displayOrder calculation per group bucket.
  let lifestyleIdx = 0
  let audienceIdx = 0
  let trendIdx = 0

  for (const t of LIFESTYLE_TAGS) {
    let order = 0
    if (t.group === 'LIFESTYLE') order = ++lifestyleIdx * 10
    else if (t.group === 'AUDIENCE') order = ++audienceIdx * 10
    else order = ++trendIdx * 10

    await prisma.lifestyleTag.upsert({
      where: { slug: t.slug },
      create: {
        slug: t.slug,
        name: t.name,
        group: t.group,
        displayOrder: order,
        isActive: true,
      },
      update: {
        name: t.name,
        group: t.group,
        displayOrder: order,
        isActive: true,
      },
    })
  }

  console.log(`✅ LifestyleTags: ${LIFESTYLE_TAGS.length} upserted across 3 groups.`)
}
