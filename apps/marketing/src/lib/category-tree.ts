/**
 * Marketplace category tree — drives the "All Categories" mega menu in the
 * MarketplaceHeader subnav. Hardcoded for V1; will become a Prisma query
 * (`Category.findMany({ include: { subcategories: true } })`) once the DB
 * catalog is fully wired in apps/marketing.
 *
 * Slugs match the file-system routes:
 *   /marketplace/[categorySlug]
 *   /marketplace/[categorySlug]/[subcategorySlug]/[templateSlug]
 *
 * Each subcategory deep-links straight into a category route with the
 * subcategory pre-filtered (?subcategory=… is honoured by the category
 * page's filter sidebar).
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

export const CATEGORY_TREE: CategoryNode[] = [
  {
    slug: 'coffee-tea',
    name: 'Coffee & Tea',
    icon: '☕',
    subcategories: [
      { slug: 'whole-bean', name: 'Whole bean coffee', blurb: 'Single-origin, blends' },
      { slug: 'cold-brew', name: 'Cold brew concentrate', blurb: 'RTD & concentrate' },
      { slug: 'matcha', name: 'Matcha', blurb: 'Ceremonial & culinary' },
      { slug: 'herbal-tea', name: 'Herbal & adaptogenic tea', blurb: 'Loose leaf & sachets' },
      { slug: 'instant', name: 'Instant coffee & tea', blurb: 'Single-serve sticks' },
    ],
  },
  {
    slug: 'functional-beverages',
    name: 'Functional & Wellness Beverages',
    icon: '🍹',
    subcategories: [
      { slug: 'energy-drinks', name: 'Energy drinks', blurb: 'Cans & RTDs' },
      { slug: 'sparkling', name: 'Sparkling functional', blurb: 'Adaptogen & nootropic seltzers' },
      { slug: 'hydration', name: 'Hydration mixes', blurb: 'Electrolyte sticks & powders' },
      { slug: 'kombucha', name: 'Kombucha & fermented', blurb: 'Probiotic drinks' },
      { slug: 'protein-shakes', name: 'Protein shakes', blurb: 'Whey, plant, collagen' },
    ],
  },
  {
    slug: 'supplements',
    name: 'Supplements',
    icon: '💊',
    subcategories: [
      { slug: 'capsules', name: 'Capsules & softgels', blurb: 'Single & multi-blend' },
      { slug: 'powders', name: 'Powders & blends', blurb: 'Tubs & sachets' },
      { slug: 'gummies', name: 'Gummies', blurb: 'Adult & kids' },
      { slug: 'liquid', name: 'Liquid tinctures', blurb: 'Drops & sprays' },
      { slug: 'pre-workout', name: 'Pre-workout', blurb: 'Stim & non-stim' },
    ],
  },
  {
    slug: 'snacks',
    name: 'Snacks & Confectionery',
    icon: '🍫',
    subcategories: [
      { slug: 'bars', name: 'Bars', blurb: 'Protein, granola, fruit & nut' },
      { slug: 'jerky', name: 'Jerky & meat snacks', blurb: 'Beef, turkey, plant' },
      { slug: 'chips', name: 'Chips & crackers', blurb: 'Better-for-you snacking' },
      { slug: 'chocolate', name: 'Chocolate & confectionery', blurb: 'Bars, bites, truffles' },
      { slug: 'dried-fruit', name: 'Dried fruit & nuts', blurb: 'Trail mixes, single-portion' },
    ],
  },
]

export function findCategory(slug: string): CategoryNode | undefined {
  return CATEGORY_TREE.find((c) => c.slug === slug)
}
