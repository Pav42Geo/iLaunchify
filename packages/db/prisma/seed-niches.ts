// V1 seed for the audience-facing Niche taxonomy.
// Idempotent — safe to re-run.
//
// Per docs/PLATFORM_SPEC.md product-plan additions 2026-06-01.
// 14 starter niches across supplement / wellness / nutrition / pet axes.
// Admin can add more via /admin/niches once that CRUD ships; partners tag
// templates with one primary + optional secondary niche via ProductTemplateNiche.

import { PrismaClient } from '@prisma/client'

interface SeedNiche {
  slug: string
  name: string
  description: string
  iconEmoji: string
  accentHex: string
  displayOrder: number
}

const STARTER_NICHES: SeedNiche[] = [
  {
    slug: 'sports-nutrition',
    name: 'Sports Nutrition',
    description: 'Pre-workout, recovery powders, BCAA/EAA, electrolytes — for athletes and performance creators.',
    iconEmoji: '🏋️',
    accentHex: '#FF2E63',
    displayOrder: 10,
  },
  {
    slug: 'weight-management',
    name: 'Weight Management',
    description: 'Meal replacements, appetite-support, thermogenics, fiber blends — for body-composition goals.',
    iconEmoji: '⚖️',
    accentHex: '#FF7A45',
    displayOrder: 20,
  },
  {
    slug: 'beauty-wellness',
    name: 'Beauty & Wellness',
    description: 'Inner-beauty supplements, collagen, biotin blends, skin-hair-nail formulas.',
    iconEmoji: '✨',
    accentHex: '#FF6FB5',
    displayOrder: 30,
  },
  {
    slug: 'pet',
    name: 'Pet',
    description: 'Treats, supplements, and functional foods for dogs, cats, and small companions. AAFCO-labeled.',
    iconEmoji: '🐾',
    accentHex: '#7BC4FF',
    displayOrder: 40,
  },
  {
    slug: 'pediatric',
    name: 'Pediatric',
    description: 'Kids vitamins, snacks, and beverages — designed for under-12 audiences and family creators.',
    iconEmoji: '🧒',
    accentHex: '#FFD166',
    displayOrder: 50,
  },
  {
    slug: 'senior',
    name: 'Senior',
    description: 'Joint, cognitive, cardiovascular, and bone-health support for 55+ audiences.',
    iconEmoji: '👵',
    accentHex: '#A78BFA',
    displayOrder: 60,
  },
  {
    slug: 'keto-low-carb',
    name: 'Keto / Low-Carb',
    description: 'Ketogenic snacks, MCT oils, electrolytes, exogenous ketones — low-net-carb formulations.',
    iconEmoji: '🥑',
    accentHex: '#7CB342',
    displayOrder: 70,
  },
  {
    slug: 'vegan-plant-based',
    name: 'Vegan / Plant-Based',
    description: 'Pea / hemp / soy proteins, plant-based meal kits, dairy-free everything.',
    iconEmoji: '🌱',
    accentHex: '#43A047',
    displayOrder: 80,
  },
  {
    slug: 'gluten-free',
    name: 'Gluten-Free',
    description: 'Certified gluten-free snacks, baking mixes, and pantry — celiac-safe production lines.',
    iconEmoji: '🌾',
    accentHex: '#D4A45A',
    displayOrder: 90,
  },
  {
    slug: 'immunity',
    name: 'Immunity',
    description: 'Elderberry, zinc, vitamin C, mushroom blends — immune-defense formulations.',
    iconEmoji: '🛡️',
    accentHex: '#EF5350',
    displayOrder: 100,
  },
  {
    slug: 'energy-pre-workout',
    name: 'Energy / Pre-Workout',
    description: 'Caffeine + functional energy stacks, nootropic blends, RTD energy drinks.',
    iconEmoji: '⚡',
    accentHex: '#FFEB3B',
    displayOrder: 110,
  },
  {
    slug: 'sleep-calm',
    name: 'Sleep / Calm',
    description: 'Melatonin, magnesium, ashwagandha, l-theanine — sleep-onset and stress-down formulas.',
    iconEmoji: '🌙',
    accentHex: '#5C6BC0',
    displayOrder: 120,
  },
  {
    slug: 'gut-health',
    name: 'Gut Health',
    description: 'Probiotics, prebiotics, digestive enzymes, fiber blends — microbiome-support formulations.',
    iconEmoji: '🦠',
    accentHex: '#26A69A',
    displayOrder: 130,
  },
  {
    slug: 'hormone-balance',
    name: 'Hormone Balance',
    description: 'Adaptogens, DIM, maca, womens / mens hormone-support stacks. Pre-natal NOT covered here.',
    iconEmoji: '🌸',
    accentHex: '#EC407A',
    displayOrder: 140,
  },
]

export async function seedNiches(prisma: PrismaClient): Promise<void> {
  console.log(`Seeding ${STARTER_NICHES.length} starter Niches...`)

  for (const n of STARTER_NICHES) {
    await prisma.niche.upsert({
      where: { slug: n.slug },
      update: {
        name: n.name,
        description: n.description,
        iconEmoji: n.iconEmoji,
        accentHex: n.accentHex,
        displayOrder: n.displayOrder,
      },
      create: {
        slug: n.slug,
        name: n.name,
        description: n.description,
        iconEmoji: n.iconEmoji,
        accentHex: n.accentHex,
        displayOrder: n.displayOrder,
        isActive: true,
      },
    })
  }

  console.log(`Seeded ${STARTER_NICHES.length} niches.`)
}
