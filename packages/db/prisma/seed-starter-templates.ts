// V1 seed for iLaunchify-curated starter ProductTemplates.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.1a + task #134.
//
// Six platform-curated templates partners can clone as a head start on a
// new product. Identified by manufacturerServiceId=NULL + slug starting
// with 'starter-'. They never appear on the creator marketplace directly —
// cloning creates a partner-owned DRAFT.
//
// Each starter has:
//   - 3-5 base ingredient slots with sensible weight defaults
//   - 1 default ProductTemplateVariant (container/serving)
//   - NO packaging links (partner picks from their own catalog after clone)
//   - NO certificates (partner attaches from their own VERIFIED instances)
//
// Idempotent — safe to re-run.

import { PrismaClient } from '@prisma/client'

interface StarterIngredient {
  name: string
  weightG: number
  allergenFlags?: string[]
}

interface StarterDef {
  slug: string
  name: string
  description: string
  subcategorySlug: string // matches Subcategory.slug from the FOD catalog import
  priceFloorCents: number
  unitCostCents: number
  ingredients: StarterIngredient[]
  variant: {
    containerFormat: string
    containerSizeG: number
    servingsPerContainer: number
    servingSizeG: number
    servingSizeDesc: string
    moqMin: number
    moqMax: number
    leadTimeDays: number
  }
}

const STARTERS: StarterDef[] = [
  {
    slug: 'starter-whey-protein-powder',
    name: 'Whey Protein Powder',
    description:
      'Classic whey protein concentrate base. Ready for flavor customization (chocolate / vanilla / unflavored). Default recipe yields ~24g protein per scoop.',
    subcategorySlug: 'protein-powders',
    priceFloorCents: 350,
    unitCostCents: 350,
    ingredients: [
      { name: 'Whey Protein Concentrate (80%)', weightG: 800, allergenFlags: ['milk'] },
      { name: 'Cocoa Powder (Dutch Process)', weightG: 80 },
      { name: 'Natural Flavor (Chocolate)', weightG: 30 },
      { name: 'Stevia Leaf Extract', weightG: 5 },
      { name: 'Lecithin (Sunflower)', weightG: 10 },
    ],
    variant: {
      containerFormat: '2 lb tub',
      containerSizeG: 907,
      servingsPerContainer: 30,
      servingSizeG: 30,
      servingSizeDesc: '1 scoop (30g)',
      moqMin: 500,
      moqMax: 5000,
      leadTimeDays: 28,
    },
  },
  {
    slug: 'starter-pre-workout-powder',
    name: 'Pre-Workout Powder',
    description:
      'Caffeine + beta-alanine + citrulline base. Stim formula ready for flavoring. ~200mg caffeine per scoop.',
    subcategorySlug: 'pre-workouts',
    priceFloorCents: 280,
    unitCostCents: 280,
    ingredients: [
      { name: 'L-Citrulline Malate (2:1)', weightG: 200 },
      { name: 'Beta-Alanine', weightG: 96 },
      { name: 'Caffeine Anhydrous', weightG: 6 },
      { name: 'L-Tyrosine', weightG: 30 },
      { name: 'Natural Flavor (Watermelon)', weightG: 20 },
      { name: 'Citric Acid', weightG: 8 },
    ],
    variant: {
      containerFormat: '300g tub',
      containerSizeG: 300,
      servingsPerContainer: 30,
      servingSizeG: 10,
      servingSizeDesc: '1 scoop (10g)',
      moqMin: 500,
      moqMax: 5000,
      leadTimeDays: 28,
    },
  },
  {
    slug: 'starter-greens-powder',
    name: 'Greens Powder',
    description:
      'Daily greens blend with spirulina, chlorella, and barley grass. Aimed at the daily-wellness market.',
    subcategorySlug: 'greens-superfoods',
    priceFloorCents: 480,
    unitCostCents: 480,
    ingredients: [
      { name: 'Organic Spirulina', weightG: 90 },
      { name: 'Organic Chlorella', weightG: 60 },
      { name: 'Barley Grass Powder', weightG: 60 },
      { name: 'Wheatgrass Powder', weightG: 60, allergenFlags: ['wheat'] },
      { name: 'Acai Berry Powder', weightG: 30 },
      { name: 'Stevia Leaf Extract', weightG: 3 },
    ],
    variant: {
      containerFormat: '300g pouch',
      containerSizeG: 300,
      servingsPerContainer: 30,
      servingSizeG: 10,
      servingSizeDesc: '1 scoop (10g)',
      moqMin: 500,
      moqMax: 5000,
      leadTimeDays: 35,
    },
  },
  {
    slug: 'starter-hot-sauce',
    name: 'Hot Sauce',
    description:
      'Vinegar-aged red pepper base. Mid-heat (~5,000 SHU). Ready for flavor customization (smoky / fruity / herbal).',
    subcategorySlug: 'condiments-sauces',
    priceFloorCents: 220,
    unitCostCents: 220,
    ingredients: [
      { name: 'Red Cayenne Pepper Mash', weightG: 400 },
      { name: 'White Vinegar', weightG: 350 },
      { name: 'Sea Salt', weightG: 30 },
      { name: 'Garlic (Fresh)', weightG: 20 },
      { name: 'Xanthan Gum', weightG: 2 },
    ],
    variant: {
      containerFormat: '5 oz bottle',
      containerSizeG: 142,
      servingsPerContainer: 28,
      servingSizeG: 5,
      servingSizeDesc: '1 tsp (5g)',
      moqMin: 1000,
      moqMax: 10000,
      leadTimeDays: 21,
    },
  },
  {
    slug: 'starter-multivitamin-gummies',
    name: 'Multivitamin Gummies',
    description:
      'Pectin-based daily multivitamin gummies. Adult formula with A/C/D/E + B-complex. Sugar-coated for shelf stability.',
    subcategorySlug: 'gummies-chewables',
    priceFloorCents: 380,
    unitCostCents: 380,
    ingredients: [
      { name: 'Cane Sugar', weightG: 400 },
      { name: 'Glucose Syrup', weightG: 250 },
      { name: 'Pectin', weightG: 30 },
      { name: 'Citric Acid', weightG: 15 },
      { name: 'Vitamin Premix (A, C, D3, E, B-Complex)', weightG: 8 },
      { name: 'Natural Flavors (Mixed Berry)', weightG: 12 },
    ],
    variant: {
      containerFormat: '60-count bottle',
      containerSizeG: 240,
      servingsPerContainer: 30,
      servingSizeG: 8,
      servingSizeDesc: '2 gummies (8g)',
      moqMin: 1000,
      moqMax: 10000,
      leadTimeDays: 42,
    },
  },
  {
    slug: 'starter-oat-milk',
    name: 'Oat Milk (Shelf-Stable)',
    description:
      'Barista-blend oat milk. Foams well at espresso temperature. Shelf-stable UHT packaging.',
    subcategorySlug: 'plant-milks',
    priceFloorCents: 260,
    unitCostCents: 260,
    ingredients: [
      { name: 'Filtered Water', weightG: 870 },
      { name: 'Whole Grain Oats', weightG: 95, allergenFlags: ['wheat'] },
      { name: 'Sunflower Oil', weightG: 25 },
      { name: 'Dipotassium Phosphate', weightG: 5 },
      { name: 'Gellan Gum', weightG: 2 },
      { name: 'Sea Salt', weightG: 3 },
    ],
    variant: {
      containerFormat: '32 oz carton',
      containerSizeG: 946,
      servingsPerContainer: 4,
      servingSizeG: 240,
      servingSizeDesc: '1 cup (240ml)',
      moqMin: 1000,
      moqMax: 20000,
      leadTimeDays: 35,
    },
  },
]

export async function seedStarterTemplates(prisma: PrismaClient) {
  console.log('Seeding iLaunchify starter ProductTemplates (#134)...')

  // Look up subcategory ids — falls back to "first subcategory" if not found
  // (so the seed succeeds even on partial catalog imports). Real production
  // installs will have the full FOD catalog seeded so the slugs match.
  const allSubcategories = await prisma.subcategory.findMany({
    select: { id: true, slug: true },
  })
  if (allSubcategories.length === 0) {
    console.warn('  ⚠ No subcategories found — run the catalog seed first. Skipping starters.')
    return
  }
  const subBySlug = new Map(allSubcategories.map((s) => [s.slug, s.id] as const))
  const fallbackSubId = allSubcategories[0]!.id

  let created = 0
  let updated = 0

  for (const def of STARTERS) {
    const subId = subBySlug.get(def.subcategorySlug) ?? fallbackSubId

    // Upsert the ProductTemplate by slug
    const existing = await prisma.productTemplate.findUnique({
      where: { slug: def.slug },
      include: { ingredientSlots: true, variants: true },
    })

    if (existing) {
      // Refresh top-level fields only (don't clobber slot/variant edits if
      // someone tweaked the starter — admin can re-run cleanly by deleting
      // the row first, but typical re-runs are idempotent at the row level).
      await prisma.productTemplate.update({
        where: { slug: def.slug },
        data: {
          name: def.name,
          description: def.description,
          subcategoryId: subId,
          priceFloorCents: def.priceFloorCents,
          unitCostCents: def.unitCostCents,
        },
      })
      updated++
      continue
    }

    // Fresh create — Ingredient rows + slots + variant in one transaction
    await prisma.$transaction(async (tx) => {
      // 1. Ingredients (platform-owned — ownerPartnerId NULL, source LIBRARY,
      //    LIBRARY_PROMOTED verification). Reused across clones — see Ingredient.name
      //    upsert path below.
      const ingredientIds: string[] = []
      for (const ing of def.ingredients) {
        // Try to find existing platform ingredient with the same name
        const existing = await tx.ingredient.findFirst({
          where: {
            name: ing.name,
            source: 'LIBRARY',
            ownerPartnerId: null,
          },
          select: { id: true },
        })
        if (existing) {
          ingredientIds.push(existing.id)
          continue
        }
        const created = await tx.ingredient.create({
          data: {
            name: ing.name,
            internalName: ing.name,
            labelDeclarationName: ing.name,
            nutritionPer100g: {},
            source: 'LIBRARY',
            ownerPartnerId: null,
            verificationStatus: 'LIBRARY_PROMOTED',
            allergenFlags: ing.allergenFlags ?? [],
          },
        })
        ingredientIds.push(created.id)
      }

      // 2. ProductTemplate
      const tpl = await tx.productTemplate.create({
        data: {
          slug: def.slug,
          name: def.name,
          description: def.description,
          subcategoryId: subId,
          manufacturerServiceId: null, // platform-curated; not owned by a partner
          status: 'DRAFT',
          priceFloorCents: def.priceFloorCents,
          unitCostCents: def.unitCostCents,
        },
      })

      // 3. Slots
      await Promise.all(
        ingredientIds.map((ingredientId, i) =>
          tx.templateIngredientSlot.create({
            data: {
              productTemplateId: tpl.id,
              baseIngredientId: ingredientId,
              weightG: def.ingredients[i]!.weightG,
              displayOrder: i,
            },
          }),
        ),
      )

      // 4. Default variant
      await tx.productTemplateVariant.create({
        data: {
          productTemplateId: tpl.id,
          containerFormat: def.variant.containerFormat,
          containerSizeG: def.variant.containerSizeG,
          servingsPerContainer: def.variant.servingsPerContainer,
          servingSizeG: def.variant.servingSizeG,
          servingSizeDesc: def.variant.servingSizeDesc,
          moqMin: def.variant.moqMin,
          moqMax: def.variant.moqMax,
          leadTimeDays: def.variant.leadTimeDays,
        },
      })
    })
    created++
  }

  console.log(`  ✓ ${created} new + ${updated} updated starter templates.`)
}
