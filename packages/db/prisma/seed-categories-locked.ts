// V1.1 LOCKED Layer 2 taxonomy — 13 categories + 121 subcategories.
//
// Source of truth: docs/MARKETPLACE_DESIGN.md §2 + Pavel's
// marketplace-decisions 2026-06-01 lock (Option A: Layer 2 canonical,
// Niche references Subcategory via NicheSubcategory junction).
//
// IDEMPOTENT — safe to re-run. Upsert keyed by slug since every locked
// category + subcategory has a stable, kebab-case slug.
//
// IMPORTANT: This supersedes the legacy seed-catalog.ts category list
// (which was a port of FOD's externalId-keyed tree). seed.ts no longer
// calls seedCatalog() for that reason — when conflicting slugs exist
// (e.g. 'energy-drinks' lives in both), this file wins.

import type { PrismaClient } from '@prisma/client'

interface LockedSubcategory {
  slug: string
  name: string
  description?: string
}

interface LockedCategory {
  slug: string
  name: string
  mainCategory: 'Food' | 'Beverages' | 'Supplements' | 'Other'
  icon: string
  displayOrder: number
  description: string
  subcategories: LockedSubcategory[]
}

// Product domain (LabelingType) each locked category belongs to. Drives the
// New Product flow: a product can only be filed under a category whose domain
// matches its chosen labelingType. Subcategories inherit via their parent.
// Keyed by slug so it stays in lockstep with the 13 locked categories below.
type Domain = 'FOOD' | 'DIETARY_SUPPLEMENT' | 'COSMETIC' | 'PET_PRODUCT' | 'OTC'
const CATEGORY_DOMAIN: Record<string, Domain> = {
  'snacks-confectionery': 'FOOD',
  'pantry-staples': 'FOOD',
  'breakfast-morning': 'FOOD',
  'baking-desserts': 'FOOD',
  'ready-meals': 'FOOD',
  'coffee-tea': 'FOOD',
  'functional-wellness-beverages': 'FOOD',
  'refreshment-drinks': 'FOOD',
  'baby-kids-nutrition': 'FOOD',
  'gift-seasonal': 'FOOD',
  supplements: 'DIETARY_SUPPLEMENT',
  'cosmetics-personal-care': 'COSMETIC',
  'pet-products': 'PET_PRODUCT',
}
function domainForSlug(slug: string): Domain {
  return CATEGORY_DOMAIN[slug] ?? 'FOOD'
}

// Categories preserved in the taxonomy but hidden from the product flow for now
// (no meaningful production domain). Reseeds keep them inactive.
const INACTIVE_CATEGORY_SLUGS = new Set<string>(['gift-seasonal'])
function activeForSlug(slug: string): boolean {
  return !INACTIVE_CATEGORY_SLUGS.has(slug)
}

// Helper — title-case a kebab slug for fallback subcategory names.
function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => {
      if (w.toLowerCase() === 'gmo') return 'GMO'
      if (w.toLowerCase() === 'mct') return 'MCT'
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

// Build a default name + description for a subcategory.
function sub(slug: string, nameOverride?: string, description?: string): LockedSubcategory {
  const name = nameOverride ?? titleCaseSlug(slug)
  return { slug, name, description: description ?? `${name} products.` }
}

const LOCKED_CATEGORIES: LockedCategory[] = [
  // 1. Snacks & Confectionery (Food)
  {
    slug: 'snacks-confectionery',
    name: 'Snacks & Confectionery',
    mainCategory: 'Food',
    icon: '🍿',
    displayOrder: 10,
    description: 'Chips, popcorn, nuts, bars, candy, chocolate, jerky, and dried-fruit snacks.',
    subcategories: [
      sub('chips-crisps', 'Chips & Crisps'),
      sub('popcorn', 'Popcorn'),
      sub('nuts-seeds', 'Nuts & Seeds'),
      sub('trail-mixes', 'Trail Mixes'),
      sub('granola-bars', 'Granola Bars'),
      sub('protein-bars', 'Protein Bars'),
      sub('cookies-biscuits', 'Cookies & Biscuits'),
      sub('candy-gummies', 'Candy & Gummies'),
      sub('chocolate', 'Chocolate'),
      sub('dried-fruits', 'Dried Fruits'),
      sub('jerky', 'Jerky'),
      sub('puff-snacks', 'Puff Snacks'),
    ],
  },
  // 2. Pantry Staples (Food)
  {
    slug: 'pantry-staples',
    name: 'Pantry Staples',
    mainCategory: 'Food',
    icon: '🥫',
    displayOrder: 20,
    description: 'Everyday cooking essentials — pasta, rice, oils, vinegars, spices, sauces, syrups, and seasonings.',
    subcategories: [
      sub('pasta', 'Pasta'),
      sub('rice', 'Rice'),
      sub('grains', 'Grains'),
      sub('flour', 'Flour'),
      sub('baking-mixes', 'Baking Mixes'),
      sub('soup-bases', 'Soup Bases'),
      sub('sauces', 'Sauces'),
      sub('condiments', 'Condiments'),
      sub('cooking-oils', 'Cooking Oils'),
      sub('vinegars', 'Vinegars'),
      sub('spices', 'Spices'),
      sub('seasonings', 'Seasonings'),
      sub('marinades', 'Marinades'),
      sub('syrups', 'Syrups'),
      sub('sweeteners', 'Sweeteners'),
    ],
  },
  // 3. Breakfast & Morning (Food)
  {
    slug: 'breakfast-morning',
    name: 'Breakfast & Morning',
    mainCategory: 'Food',
    icon: '🥣',
    displayOrder: 30,
    description: 'Cereals, oatmeal, mixes, bars, spreads, and morning beverages.',
    subcategories: [
      sub('cereals', 'Cereals'),
      sub('oatmeal', 'Oatmeal'),
      sub('pancake-mixes', 'Pancake Mixes'),
      sub('waffle-mixes', 'Waffle Mixes'),
      sub('breakfast-bars', 'Breakfast Bars'),
      sub('coffee', 'Coffee'),
      sub('tea', 'Tea'),
      sub('matcha', 'Matcha'),
      sub('spreads-jams', 'Spreads & Jams'),
    ],
  },
  // 4. Baking & Desserts (Food)
  {
    slug: 'baking-desserts',
    name: 'Baking & Desserts',
    mainCategory: 'Food',
    icon: '🧁',
    displayOrder: 40,
    description: 'Cake mixes, dessert kits, frostings, toppings, and baking accessories.',
    subcategories: [
      sub('cake-mixes', 'Cake Mixes'),
      sub('brownie-mixes', 'Brownie Mixes'),
      sub('cookie-mixes', 'Cookie Mixes'),
      sub('dessert-kits', 'Dessert Kits'),
      sub('frostings', 'Frostings'),
      sub('toppings', 'Toppings'),
      sub('baking-decorations', 'Baking Decorations'),
      sub('pudding-mixes', 'Pudding Mixes'),
    ],
  },
  // 5. Ready Meals & Meal Solutions (Food)
  {
    slug: 'ready-meals',
    name: 'Ready Meals & Meal Solutions',
    mainCategory: 'Food',
    icon: '🥗',
    displayOrder: 50,
    description: 'Heat-and-eat meals, cup noodles, freeze-dried mains, and protein-forward meal kits.',
    subcategories: [
      sub('instant-meals', 'Instant Meals'),
      sub('meal-kits', 'Meal Kits'),
      sub('cup-noodles', 'Cup Noodles'),
      sub('freeze-dried-meals', 'Freeze-Dried Meals'),
      sub('soup-cups', 'Soup Cups'),
      sub('protein-meals', 'Protein Meals'),
      sub('rice-bowls', 'Rice Bowls'),
    ],
  },
  // 6. Coffee & Tea (Beverages)
  {
    slug: 'coffee-tea',
    name: 'Coffee & Tea',
    mainCategory: 'Beverages',
    icon: '☕',
    displayOrder: 60,
    description: 'Whole bean, ground, instant, and pod coffee plus herbal, green, black, and functional teas.',
    subcategories: [
      sub('whole-bean-coffee', 'Whole Bean Coffee'),
      sub('ground-coffee', 'Ground Coffee'),
      sub('instant-coffee', 'Instant Coffee'),
      sub('coffee-pods', 'Coffee Pods'),
      sub('herbal-tea', 'Herbal Tea'),
      sub('green-tea', 'Green Tea'),
      sub('black-tea', 'Black Tea'),
      sub('loose-leaf-tea', 'Loose-Leaf Tea'),
      sub('matcha', 'Matcha'),
      sub('functional-tea-blends', 'Functional Tea Blends'),
    ],
  },
  // 7. Functional & Wellness Beverages (Beverages)
  {
    slug: 'functional-wellness-beverages',
    name: 'Functional & Wellness Beverages',
    mainCategory: 'Beverages',
    icon: '🧃',
    displayOrder: 70,
    description: 'Energy, electrolyte, protein, wellness tonic, adaptogen, kombucha, and gut-health drinks.',
    subcategories: [
      sub('energy-drinks', 'Energy Drinks'),
      sub('electrolyte-drinks', 'Electrolyte Drinks'),
      sub('protein-shakes', 'Protein Shakes'),
      sub('meal-replacement-drinks', 'Meal Replacement Drinks'),
      sub('wellness-tonics', 'Wellness Tonics'),
      sub('adaptogen-drinks', 'Adaptogen Drinks'),
      sub('kombucha', 'Kombucha'),
      sub('gut-health-drinks', 'Gut Health Drinks'),
      sub('hydration-drinks', 'Hydration Drinks'),
    ],
  },
  // 8. Refreshment Drinks (Beverages)
  {
    slug: 'refreshment-drinks',
    name: 'Refreshment Drinks',
    mainCategory: 'Beverages',
    icon: '🥤',
    displayOrder: 80,
    description: 'Sparkling water, sodas, lemonades, juice drinks, mocktails, and flavored water.',
    subcategories: [
      sub('sparkling-water', 'Sparkling Water'),
      sub('sodas', 'Sodas'),
      sub('lemonades', 'Lemonades'),
      sub('juice-drinks', 'Juice Drinks'),
      sub('mocktails', 'Mocktails'),
      sub('flavored-water', 'Flavored Water'),
      sub('fruit-beverages', 'Fruit Beverages'),
    ],
  },
  // 9. Supplements (Supplements)
  {
    slug: 'supplements',
    name: 'Supplements',
    mainCategory: 'Supplements',
    icon: '💊',
    displayOrder: 90,
    description: 'Vitamins, minerals, protein powders, greens, collagen, herbals, omegas, probiotics, and functional supplement formulas.',
    subcategories: [
      sub('multivitamins', 'Multivitamins'),
      sub('single-vitamins', 'Single Vitamins'),
      sub('minerals', 'Minerals'),
      sub('protein-powders', 'Protein Powders'),
      sub('collagen', 'Collagen'),
      sub('greens-powders', 'Greens Powders'),
      sub('herbal-supplements', 'Herbal Supplements'),
      sub('omega-3', 'Omega-3'),
      sub('probiotics', 'Probiotics'),
      sub('sleep-supplements', 'Sleep Supplements'),
      sub('focus-supplements', 'Focus Supplements'),
      // Added per Pavel: niche-driven additions to supplements category
      sub('pre-workout', 'Pre-Workout'),
      sub('recovery-products', 'Recovery Products'),
      sub('nootropics', 'Nootropics'),
      sub('beauty-supplements', 'Beauty Supplements'),
    ],
  },
  // 10. Cosmetics & Personal Care (Other)
  {
    slug: 'cosmetics-personal-care',
    name: 'Cosmetics & Personal Care',
    mainCategory: 'Other',
    icon: '🧴',
    displayOrder: 100,
    description: 'Skincare, haircare, body care, lip care, sun, oral, and grooming products.',
    subcategories: [
      sub('facial-care', 'Facial Care'),
      sub('cleansers', 'Cleansers'),
      sub('serums', 'Serums'),
      sub('moisturizers', 'Moisturizers'),
      sub('haircare', 'Haircare'),
      sub('shampoo', 'Shampoo'),
      sub('conditioner', 'Conditioner'),
      sub('body-wash', 'Body Wash'),
      sub('lotion', 'Lotion'),
      sub('lip-care', 'Lip Care'),
      sub('sun-care', 'Sun Care'),
      sub('oral-care', 'Oral Care'),
      sub('mens-grooming', "Men's Grooming"),
      // Added per Pavel: niche-driven additions
      sub('face-masks', 'Face Masks'),
      // Note (Pavel decision 2026-06-02): we keep beauty-from-within drinkable
      // collagens/etc under functional-wellness-beverages > collagen + the
      // supplements > beauty-supplements + cosmetics > face-masks paths. We
      // intentionally did NOT mirror a beauty-drinks subcategory in cosmetics
      // — the existing functional-wellness-beverages homes those.
    ],
  },
  // 11. Pet Products (Other)
  {
    slug: 'pet-products',
    name: 'Pet Products',
    mainCategory: 'Other',
    icon: '🐕',
    displayOrder: 110,
    description: 'Dog and cat food, treats, dental chews, supplements, and pet wellness products.',
    subcategories: [
      sub('dry-food', 'Dry Food'),
      sub('wet-food', 'Wet Food'),
      sub('pet-treats', 'Pet Treats'),
      sub('dental-treats', 'Dental Treats'),
      sub('pet-supplements', 'Pet Supplements'),
      sub('pet-wellness', 'Pet Wellness'),
    ],
  },
  // 12. Baby & Kids Nutrition (Other)
  {
    slug: 'baby-kids-nutrition',
    name: 'Baby & Kids Nutrition',
    mainCategory: 'Other',
    icon: '👶',
    displayOrder: 120,
    description: 'Infant formula, purees, toddler meals, baby cereals, teething snacks, and kid-friendly nutrition.',
    subcategories: [
      sub('infant-formula', 'Infant Formula'),
      sub('purees', 'Purees'),
      sub('baby-cereals', 'Baby Cereals'),
      sub('teething-snacks', 'Teething Snacks'),
      sub('toddler-meals', 'Toddler Meals'),
      sub('kids-smoothies', 'Kids Smoothies'),
      sub('kids-vitamins', 'Kids Vitamins'),
    ],
  },
  // 13. Gift & Seasonal (Other)
  {
    slug: 'gift-seasonal',
    name: 'Gift & Seasonal',
    mainCategory: 'Other',
    icon: '🎁',
    displayOrder: 130,
    description: 'Gift boxes, holiday bundles, sampler kits, subscription boxes, and seasonal collections.',
    subcategories: [
      sub('gift-boxes', 'Gift Boxes'),
      sub('holiday-bundles', 'Holiday Bundles'),
      sub('sampler-kits', 'Sampler Kits'),
      sub('subscription-boxes', 'Subscription Boxes'),
      sub('seasonal-collections', 'Seasonal Collections'),
    ],
  },
]

export async function seedCategoriesLocked(prisma: PrismaClient): Promise<void> {
  console.log('🌱 Seeding LOCKED Layer 2 taxonomy (13 categories + 121 subcategories, MARKETPLACE_DESIGN §2)…')

  let totalSubs = 0
  for (const cat of LOCKED_CATEGORIES) {
    // External ID is synthesized from slug so the row plays nicely with the
    // legacy externalId-keyed seed-catalog.ts if its tables coexist during
    // a transition release. Prefix 'loc-' to namespace away from FOD ids.
    const externalId = `loc-${cat.slug}`

    const dbCat = await prisma.category.upsert({
      where: { slug: cat.slug },
      create: {
        externalId,
        slug: cat.slug,
        name: cat.name,
        mainCategory: cat.mainCategory,
        labelingType: domainForSlug(cat.slug),
        icon: cat.icon,
        displayOrder: cat.displayOrder,
        description: cat.description,
        isActive: activeForSlug(cat.slug),
      },
      update: {
        name: cat.name,
        mainCategory: cat.mainCategory,
        labelingType: domainForSlug(cat.slug),
        icon: cat.icon,
        displayOrder: cat.displayOrder,
        description: cat.description,
        isActive: activeForSlug(cat.slug),
      },
    })

    for (const [idx, s] of cat.subcategories.entries()) {
      const subExternalId = `loc-sub-${s.slug}`
      await prisma.subcategory.upsert({
        where: { slug: s.slug },
        create: {
          externalId: subExternalId,
          categoryId: dbCat.id,
          slug: s.slug,
          name: s.name,
          description: s.description,
          displayOrder: (idx + 1) * 10,
          isActive: true,
        },
        update: {
          // Re-point parent if necessary (handles cross-category moves) and
          // refresh display fields. Slug + externalId are stable so we
          // leave them alone.
          categoryId: dbCat.id,
          name: s.name,
          description: s.description,
          displayOrder: (idx + 1) * 10,
          isActive: true,
        },
      })
      totalSubs++
    }
  }

  console.log(`✅ Categories: ${LOCKED_CATEGORIES.length} categories + ${totalSubs} subcategories upserted.`)
}
