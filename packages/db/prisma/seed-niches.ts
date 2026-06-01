// V1 seed for Layer 1 Creator Niches — the LOCKED 8 from docs/MARKETPLACE_DESIGN.md §2 Layer 1.
//
// Idempotent — safe to re-run.
//
// IMPORTANT: This taxonomy is locked. Do NOT add niches without a Pavel
// decision. The 8 niches were derived from MARKETPLACE_DESIGN.md and
// already drive apps/marketing/src/lib/niches.ts and the /launch/[niche]
// landing pages. Keep the slugs identical so the new DB-driven niches
// join cleanly with the existing hardcoded marketing-layer hero copy
// until the marketing copy itself moves into the Niche row.
//
// Layer 1 is many-to-many with ProductTemplate (a kombucha can serve
// Wellness AND Healthy Lifestyle AND Social — confirmed §2 line 67).
// No primary/secondary distinction in V1; ProductTemplateNiche.isPrimary
// is reserved for V1.5+ if Pavel locks "primary niche drives /launch
// landing ordering."

import { PrismaClient } from '@prisma/client'

interface SeedNiche {
  slug: string
  name: string
  description: string
  iconEmoji: string
  accentHex: string
  displayOrder: number
}

// Locked source of truth — docs/MARKETPLACE_DESIGN.md §2 Layer 1.
// Slugs MUST match apps/marketing/src/lib/niches.ts. Do not edit without
// updating both sides.
const LOCKED_CREATOR_NICHES: SeedNiche[] = [
  {
    slug: 'energy-performance',
    name: 'Energy & Performance',
    description: 'Pre-workouts, RTD energy drinks, recovery powders, sports nutrition — engineered for athletes and aspirational performers.',
    iconEmoji: '⚡',
    accentHex: '#7C3AED', // purple — matches gradient in niches.ts
    displayOrder: 10,
  },
  {
    slug: 'wellness',
    name: 'Wellness & Holistic Health',
    description: 'Adaptogenic blends, nootropics, sleep aids, immunity boosters. The category that creators who care about their audience are building in.',
    iconEmoji: '🌿',
    accentHex: '#10B981', // mint
    displayOrder: 20,
  },
  {
    slug: 'beauty',
    name: 'Beauty & Self-Care',
    description: 'Skincare, haircare, body care, inner-beauty supplements. From mass-prestige to clean indie — the marketplace serves both.',
    iconEmoji: '✨',
    accentHex: '#FF2E63', // pink — brand
    displayOrder: 30,
  },
  {
    slug: 'healthy-lifestyle',
    name: 'Healthy Lifestyle',
    description: 'Plant-based, low-sugar, high-protein, functional snacks. Real food for people building real brands.',
    iconEmoji: '🥗',
    accentHex: '#B5FF3D', // lime — brand accent
    displayOrder: 40,
  },
  {
    slug: 'gourmet',
    name: 'Gourmet & Culinary',
    description: 'Specialty sauces, premium pantry, confectionery, artisan baking. Where culinary creators turn their kitchen into a brand.',
    iconEmoji: '🍫',
    accentHex: '#F97316', // coral
    displayOrder: 50,
  },
  {
    slug: 'family-kids',
    name: 'Family & Kids',
    description: 'Kids snacks, baby nutrition, family pantry, lunchbox staples. Trust matters more here than anywhere else — the marketplace surfaces only verified-clean partners.',
    iconEmoji: '👶',
    accentHex: '#FACC15', // yellow
    displayOrder: 60,
  },
  {
    slug: 'pet-wellness',
    name: 'Pet Wellness',
    description: 'Dog and cat treats, pet supplements, specialty pet food. A fast-growing niche with rabid customer loyalty.',
    iconEmoji: '🐾',
    accentHex: '#06B6D4', // cyan
    displayOrder: 70,
  },
  {
    slug: 'social-lifestyle',
    name: 'Social & Lifestyle',
    description: 'RTD cocktails, mocktails, hosting and party goods, gifting. Where lifestyle creators turn experiences into products.',
    iconEmoji: '🥂',
    accentHex: '#38BDF8', // sky
    displayOrder: 80,
  },
]

export async function seedNiches(prisma: PrismaClient): Promise<void> {
  console.log('🌱 Seeding Layer 1 Creator Niches (LOCKED — 8 from MARKETPLACE_DESIGN.md §2)...')
  let inserted = 0
  let updated = 0
  for (const n of LOCKED_CREATOR_NICHES) {
    const existing = await prisma.niche.findUnique({ where: { slug: n.slug } })
    await prisma.niche.upsert({
      where: { slug: n.slug },
      create: {
        slug: n.slug,
        name: n.name,
        description: n.description,
        iconEmoji: n.iconEmoji,
        accentHex: n.accentHex,
        displayOrder: n.displayOrder,
        isActive: true,
      },
      update: {
        name: n.name,
        description: n.description,
        iconEmoji: n.iconEmoji,
        accentHex: n.accentHex,
        displayOrder: n.displayOrder,
      },
    })
    if (existing) updated++
    else inserted++
  }
  console.log(`✅ Niches: ${inserted} inserted, ${updated} updated (8 total, locked)`)
}
