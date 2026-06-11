/**
 * Marketplace category tree — drives the "All Categories" mega menu in the
 * MarketplaceHeader subnav.
 *
 * MIRRORS the LOCKED Layer 2 taxonomy (13 categories + subcategories) from
 * packages/db/prisma/seed-categories-locked.ts — slugs/names/icons kept in sync
 * with the DB so the deep-links resolve to real category routes. Will become a
 * Prisma query (`Category.findMany({ include: { subcategories: true } })`) once
 * the DB catalog is wired into apps/marketing; until then this is the source.
 *
 * Routes:
 *   /marketplace/[categorySlug]
 *   /marketplace/[categorySlug]?subcategory=[subcategorySlug]
 */

export interface CategoryNode {
  slug: string
  name: string
  icon: string
  subcategories: SubcategoryNode[]
}

export interface SubcategoryNode {
  slug: string
  name: string
  /** Optional one-line description shown under the link in the mega menu. */
  blurb?: string
}

const s = (slug: string, name: string): SubcategoryNode => ({ slug, name })

export const CATEGORY_TREE: CategoryNode[] = [
  {
    slug: 'snacks-confectionery',
    name: 'Snacks & Confectionery',
    icon: '🍿',
    subcategories: [
      s('chips-crisps', 'Chips & Crisps'), s('popcorn', 'Popcorn'), s('nuts-seeds', 'Nuts & Seeds'),
      s('trail-mixes', 'Trail Mixes'), s('granola-bars', 'Granola Bars'), s('protein-bars', 'Protein Bars'),
      s('cookies-biscuits', 'Cookies & Biscuits'), s('candy-gummies', 'Candy & Gummies'), s('chocolate', 'Chocolate'),
      s('dried-fruits', 'Dried Fruits'), s('jerky', 'Jerky'), s('puff-snacks', 'Puff Snacks'),
    ],
  },
  {
    slug: 'pantry-staples',
    name: 'Pantry Staples',
    icon: '🥫',
    subcategories: [
      s('pasta', 'Pasta'), s('rice', 'Rice'), s('grains', 'Grains'), s('flour', 'Flour'),
      s('baking-mixes', 'Baking Mixes'), s('soup-bases', 'Soup Bases'), s('sauces', 'Sauces'),
      s('condiments', 'Condiments'), s('cooking-oils', 'Cooking Oils'), s('vinegars', 'Vinegars'),
      s('spices', 'Spices'), s('seasonings', 'Seasonings'), s('marinades', 'Marinades'),
      s('syrups', 'Syrups'), s('sweeteners', 'Sweeteners'),
    ],
  },
  {
    slug: 'breakfast-morning',
    name: 'Breakfast & Morning',
    icon: '🥣',
    subcategories: [
      s('cereals', 'Cereals'), s('oatmeal', 'Oatmeal'), s('pancake-mixes', 'Pancake Mixes'),
      s('waffle-mixes', 'Waffle Mixes'), s('breakfast-bars', 'Breakfast Bars'), s('coffee', 'Coffee'),
      s('tea', 'Tea'), s('matcha', 'Matcha'), s('spreads-jams', 'Spreads & Jams'),
    ],
  },
  {
    slug: 'baking-desserts',
    name: 'Baking & Desserts',
    icon: '🧁',
    subcategories: [
      s('cake-mixes', 'Cake Mixes'), s('brownie-mixes', 'Brownie Mixes'), s('cookie-mixes', 'Cookie Mixes'),
      s('dessert-kits', 'Dessert Kits'), s('frostings', 'Frostings'), s('toppings', 'Toppings'),
      s('baking-decorations', 'Baking Decorations'), s('pudding-mixes', 'Pudding Mixes'),
    ],
  },
  {
    slug: 'ready-meals',
    name: 'Ready Meals & Meal Solutions',
    icon: '🥗',
    subcategories: [
      s('instant-meals', 'Instant Meals'), s('meal-kits', 'Meal Kits'), s('cup-noodles', 'Cup Noodles'),
      s('freeze-dried-meals', 'Freeze-Dried Meals'), s('soup-cups', 'Soup Cups'),
      s('protein-meals', 'Protein Meals'), s('rice-bowls', 'Rice Bowls'),
    ],
  },
  {
    slug: 'coffee-tea',
    name: 'Coffee & Tea',
    icon: '☕',
    subcategories: [
      s('whole-bean-coffee', 'Whole Bean Coffee'), s('ground-coffee', 'Ground Coffee'),
      s('instant-coffee', 'Instant Coffee'), s('coffee-pods', 'Coffee Pods'), s('herbal-tea', 'Herbal Tea'),
      s('green-tea', 'Green Tea'), s('black-tea', 'Black Tea'), s('loose-leaf-tea', 'Loose-Leaf Tea'),
      s('matcha', 'Matcha'), s('functional-tea-blends', 'Functional Tea Blends'),
    ],
  },
  {
    slug: 'functional-wellness-beverages',
    name: 'Functional & Wellness Beverages',
    icon: '🧃',
    subcategories: [
      s('energy-drinks', 'Energy Drinks'), s('electrolyte-drinks', 'Electrolyte Drinks'),
      s('protein-shakes', 'Protein Shakes'), s('meal-replacement-drinks', 'Meal Replacement Drinks'),
      s('wellness-tonics', 'Wellness Tonics'), s('adaptogen-drinks', 'Adaptogen Drinks'),
      s('kombucha', 'Kombucha'), s('gut-health-drinks', 'Gut Health Drinks'), s('hydration-drinks', 'Hydration Drinks'),
    ],
  },
  {
    slug: 'refreshment-drinks',
    name: 'Refreshment Drinks',
    icon: '🥤',
    subcategories: [
      s('sparkling-water', 'Sparkling Water'), s('sodas', 'Sodas'), s('lemonades', 'Lemonades'),
      s('juice-drinks', 'Juice Drinks'), s('mocktails', 'Mocktails'), s('flavored-water', 'Flavored Water'),
      s('fruit-beverages', 'Fruit Beverages'),
    ],
  },
  {
    slug: 'supplements',
    name: 'Supplements',
    icon: '💊',
    subcategories: [
      s('multivitamins', 'Multivitamins'), s('single-vitamins', 'Single Vitamins'), s('minerals', 'Minerals'),
      s('protein-powders', 'Protein Powders'), s('collagen', 'Collagen'), s('greens-powders', 'Greens Powders'),
      s('herbal-supplements', 'Herbal Supplements'), s('omega-3', 'Omega-3'), s('probiotics', 'Probiotics'),
      s('sleep-supplements', 'Sleep Supplements'), s('focus-supplements', 'Focus Supplements'),
      s('pre-workout', 'Pre-Workout'), s('recovery-products', 'Recovery Products'), s('nootropics', 'Nootropics'),
      s('beauty-supplements', 'Beauty Supplements'),
    ],
  },
  {
    slug: 'cosmetics-personal-care',
    name: 'Cosmetics & Personal Care',
    icon: '🧴',
    subcategories: [
      s('facial-care', 'Facial Care'), s('cleansers', 'Cleansers'), s('serums', 'Serums'),
      s('moisturizers', 'Moisturizers'), s('haircare', 'Haircare'), s('shampoo', 'Shampoo'),
      s('conditioner', 'Conditioner'), s('body-wash', 'Body Wash'), s('lotion', 'Lotion'),
      s('lip-care', 'Lip Care'), s('sun-care', 'Sun Care'), s('oral-care', 'Oral Care'),
      s('mens-grooming', "Men's Grooming"), s('face-masks', 'Face Masks'),
    ],
  },
  {
    slug: 'pet-products',
    name: 'Pet Products',
    icon: '🐕',
    subcategories: [
      s('dry-food', 'Dry Food'), s('wet-food', 'Wet Food'), s('pet-treats', 'Pet Treats'),
      s('dental-treats', 'Dental Treats'), s('pet-supplements', 'Pet Supplements'), s('pet-wellness', 'Pet Wellness'),
    ],
  },
  {
    slug: 'baby-kids-nutrition',
    name: 'Baby & Kids Nutrition',
    icon: '👶',
    subcategories: [
      s('infant-formula', 'Infant Formula'), s('purees', 'Purees'), s('baby-cereals', 'Baby Cereals'),
      s('teething-snacks', 'Teething Snacks'), s('toddler-meals', 'Toddler Meals'),
      s('kids-smoothies', 'Kids Smoothies'), s('kids-vitamins', 'Kids Vitamins'),
    ],
  },
  {
    slug: 'gift-seasonal',
    name: 'Gift & Seasonal',
    icon: '🎁',
    subcategories: [
      s('gift-boxes', 'Gift Boxes'), s('holiday-bundles', 'Holiday Bundles'), s('sampler-kits', 'Sampler Kits'),
      s('subscription-boxes', 'Subscription Boxes'), s('seasonal-collections', 'Seasonal Collections'),
    ],
  },
]

export function findCategory(slug: string): CategoryNode | undefined {
  return CATEGORY_TREE.find((c) => c.slug === slug)
}
