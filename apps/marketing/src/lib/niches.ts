/**
 * Niche data — 8 top-level Creator Niches from MARKETPLACE_DESIGN.md §2 Layer 1.
 *
 * DUAL-SOURCE MODEL (Slice 2B, 2026-06-02):
 *   - The Prisma `Niche` table owns the canonical row (slug, name,
 *     description, iconEmoji, accentHex, displayOrder, isActive) + the
 *     NicheSubcategory junction.
 *   - This file owns the MARKETING-COPY layer (shortName, tagline,
 *     gradient) until that copy moves into the DB.
 *
 * Consumers should call `loadActiveNiches()` / `loadNicheBySlug()` from
 * `lib/niches-db.ts` instead of reading `NICHES` directly. The loader
 * JOINs DB rows with the entries here on slug and returns the merged
 * MarketplaceNiche shape.
 *
 * `NICHES` is also the empty-DB fallback: if the marketing app boots
 * before Pavel runs the niche seed, the loader returns this list so the
 * marketplace doesn't go blank. Keep slugs identical to seed-niches.ts.
 */

import type { ProductGradient } from '@ilaunchify/ui'

export interface Niche {
  slug: string
  name: string
  /** Subnav label (shorter than full name when space is tight). */
  shortName: string
  /** One-line description shown on niche landing hero. */
  tagline: string
  /** Long-form positioning paragraph. */
  description: string
  /** Hero icon (emoji for V1). */
  icon: string
  /** Background gradient for the hero card. */
  gradient: ProductGradient
  /** Subcategory labels under this niche (admin-curated). */
  subcategories: string[]
}

export const NICHES: Niche[] = [
  {
    slug: 'energy-performance',
    name: 'Energy & Performance',
    shortName: 'Energy & Performance',
    tagline: 'For the people who push harder.',
    description:
      'Pre-workouts, RTD energy drinks, recovery powders, sports nutrition — engineered for athletes and aspirational performers.',
    icon: '⚡',
    gradient: 'purple',
    subcategories: ['Pre-workout', 'Energy drinks', 'Sports nutrition', 'Recovery'],
  },
  {
    slug: 'wellness',
    name: 'Wellness & Holistic Health',
    shortName: 'Wellness',
    tagline: 'Daily rituals, designed to last.',
    description:
      'Adaptogenic blends, nootropics, sleep aids, immunity boosters. The category that creators who care about their audience are building in.',
    icon: '🌿',
    gradient: 'mint',
    subcategories: ['Adaptogens', 'Nootropics', 'Sleep & relaxation', 'Immunity'],
  },
  {
    slug: 'beauty',
    name: 'Beauty & Self-Care',
    shortName: 'Beauty & Self-Care',
    tagline: 'The ritual is the product.',
    description:
      'Skincare, haircare, body care, inner-beauty supplements. From mass-prestige to clean indie — the marketplace serves both.',
    icon: '✨',
    gradient: 'pink',
    subcategories: ['Skincare', 'Haircare', 'Body care', 'Inner beauty supplements'],
  },
  {
    slug: 'healthy-lifestyle',
    name: 'Healthy Lifestyle',
    shortName: 'Healthy Lifestyle',
    tagline: 'For the way people actually eat.',
    description:
      'Plant-based, low-sugar, high-protein, functional snacks. Real food for people building real brands.',
    icon: '🥗',
    gradient: 'lime',
    subcategories: ['Plant-based', 'Low-sugar', 'High-protein', 'Functional snacks'],
  },
  {
    slug: 'gourmet',
    name: 'Gourmet & Culinary',
    shortName: 'Gourmet & Culinary',
    tagline: 'A pantry worth photographing.',
    description:
      'Specialty sauces, premium pantry, confectionery, artisan baking. Where culinary creators turn their kitchen into a brand.',
    icon: '🍫',
    gradient: 'coral',
    subcategories: [
      'Specialty sauces',
      'Premium pantry',
      'Confectionery',
      'Artisan baking',
    ],
  },
  {
    slug: 'family-kids',
    name: 'Family & Kids',
    shortName: 'Family & Kids',
    tagline: 'Better for them. Easier for parents.',
    description:
      'Kids snacks, baby nutrition, family pantry, lunchbox staples. Trust matters more here than anywhere else — the marketplace surfaces only verified-clean partners.',
    icon: '👶',
    gradient: 'yellow',
    subcategories: ['Kids snacks', 'Baby nutrition', 'Family pantry', 'Lunchbox'],
  },
  {
    slug: 'pet-wellness',
    name: 'Pet Wellness',
    shortName: 'Pet Wellness',
    tagline: 'For the most-loved members of the household.',
    description:
      'Dog and cat treats, pet supplements, specialty pet food. A fast-growing niche with rabid customer loyalty.',
    icon: '🐾',
    gradient: 'cyan',
    subcategories: ['Dog treats', 'Cat treats', 'Pet supplements', 'Specialty pet food'],
  },
  {
    slug: 'social-lifestyle',
    name: 'Social & Lifestyle',
    shortName: 'Social & Lifestyle',
    tagline: 'The product is the moment.',
    description:
      'RTD cocktails, mocktails, hosting and party goods, gifting. Where lifestyle creators turn experiences into products.',
    icon: '🥂',
    gradient: 'sky',
    subcategories: ['RTD cocktails', 'Mocktails', 'Hosting & party', 'Gifting'],
  },
]

export function findNiche(slug: string): Niche | undefined {
  return NICHES.find((n) => n.slug === slug)
}
