// Demo product — a FULLY-WIRED, PUBLISHED FOOD ProductTemplate built to
// exercise every customization surface end-to-end with REAL data:
//
//   • Real recipe: base ingredient slots with real nutritionPer100g.
//   • Replaceable slots: Sweetener (sugar → stevia / monk fruit) and Flavor
//     (coconut → citrus / berry) — so the Customize rail's swap UI, the live
//     Nutrition Facts recompute (FOOD engine), and the allergen "Contains"
//     recompute all have real options to act on.
//   • Optional add-ons (collagen / MCT / whey / L-theanine) — toggleable; whey
//     introduces a Milk allergen so the live "Contains" line visibly changes.
//   • A real active variant (355 mL can) with serving geometry + net content +
//     a beverage-can die-line (DieCutTemplate `wrap-4x12`).
//   • Real volume pricing tiers, so the detail page shows the price ladder.
//
// Chosen so the swaps produce OBVIOUS panel changes:
//   - Sugar (12 g) → Stevia (0.2 g): ~46 kcal + 12 g sugar drop to ~0.
//   - Flavor Coconut → Citrus: removes the "Coconut" allergen from Contains.
//   - Whey add-on: adds "Milk" to Contains (and demonstrates that add-ons are
//     allergen-aware but not yet in the nutrient math — by design).
//
// FOOD labelingType (not supplement) so it renders Nutrition Facts and the
// FOOD recompute path lights up. Lives under category
// `functional-wellness-beverages` / subcategory `adaptogen-drinks`.
//
// Additive + idempotent — safe to re-run (slots/optionals/tiers are replaced;
// the variant is updated in place to avoid orphaning any demo orders).

import { PrismaClient } from '@prisma/client'

const SLUG = 'demo-adaptogen-sparkling-tonic'
const SUBCATEGORY_SLUG = 'adaptogen-drinks'
const DIE_CUT_SLUG = 'wrap-4x12' // Beverage can wrap 4x12 in (BOTTLE_WRAP, 355 mL)

// ---- Ingredient catalog for this product (real per-100g nutrition) ----------
// nutritionPer100g keys match the @ilaunchify/nutrition engine (calories,
// totalFat, saturatedFat, sodium, totalCarbohydrate, dietaryFiber, totalSugars,
// addedSugars, protein, potassium, …). allergens use FALCPA Big-9 codes; we set
// BOTH `allergenFlags` (what recipe-detail reads) and `allergens`.
interface IngSpec {
  key: string
  name: string
  labelName: string
  category: string
  allergens?: string[]
  n: Record<string, number>
}

const INGREDIENTS: IngSpec[] = [
  { key: 'water', name: 'Carbonated Water (demo)', labelName: 'Carbonated Water', category: 'OTHER', n: { calories: 0 } },
  // Sweetener slot — base + alternates (big nutrition swing).
  { key: 'sugar', name: 'Cane Sugar (demo)', labelName: 'Cane Sugar', category: 'SWEETENER',
    n: { calories: 387, totalCarbohydrate: 100, totalSugars: 100, addedSugars: 100 } },
  { key: 'stevia', name: 'Stevia Leaf Extract (demo)', labelName: 'Stevia Leaf Extract', category: 'SWEETENER',
    n: { calories: 0 } },
  { key: 'monkfruit', name: 'Monk Fruit Extract (demo)', labelName: 'Monk Fruit Extract', category: 'SWEETENER',
    n: { calories: 0 } },
  // Adaptogen slot — base + alternates.
  { key: 'ashwagandha', name: 'Ashwagandha Extract (demo)', labelName: 'Ashwagandha Root Extract', category: 'BOTANICAL',
    n: { calories: 250, totalFat: 0.3, totalCarbohydrate: 60, dietaryFiber: 30, protein: 3 } },
  { key: 'turmeric', name: 'Turmeric Curcumin Extract (demo)', labelName: 'Turmeric Extract', category: 'BOTANICAL',
    n: { calories: 354, totalFat: 9.9, sodium: 38, totalCarbohydrate: 65, dietaryFiber: 21, protein: 7.8, potassium: 2080 } },
  { key: 'reishi', name: 'Reishi Mushroom Extract (demo)', labelName: 'Reishi Mushroom Extract', category: 'BOTANICAL',
    n: { calories: 300, totalCarbohydrate: 70, dietaryFiber: 40, protein: 10 } },
  // Flavor slot — base CARRIES a coconut allergen; alternates remove it.
  { key: 'coconut', name: 'Coconut Water Concentrate (demo)', labelName: 'Coconut Water Concentrate', category: 'OTHER',
    allergens: ['coconut'], n: { calories: 45, sodium: 105, totalCarbohydrate: 11, totalSugars: 9, potassium: 250 } },
  { key: 'citrus', name: 'Natural Citrus Flavor (demo)', labelName: 'Natural Citrus Flavor', category: 'OTHER',
    n: { calories: 0 } },
  { key: 'berry', name: 'Natural Berry Flavor (demo)', labelName: 'Natural Berry Flavor', category: 'OTHER',
    n: { calories: 0 } },
  // Fixed base ingredients.
  { key: 'citric', name: 'Citric Acid (demo)', labelName: 'Citric Acid', category: 'OTHER', n: { calories: 0 } },
  { key: 'salt', name: 'Sea Salt (demo)', labelName: 'Sea Salt', category: 'OTHER', n: { calories: 0, sodium: 38758 } },
  // Optional add-ons.
  { key: 'collagen', name: 'Collagen Peptides (demo)', labelName: 'Collagen Peptides', category: 'PROTEIN',
    n: { calories: 360, sodium: 70, protein: 90 } },
  { key: 'mct', name: 'MCT Oil Powder (demo)', labelName: 'MCT Oil Powder', category: 'FAT',
    n: { calories: 700, totalFat: 70, saturatedFat: 65 } },
  { key: 'whey', name: 'Whey Protein Isolate (demo)', labelName: 'Whey Protein Isolate', category: 'PROTEIN',
    allergens: ['milk'], n: { calories: 360, sodium: 200, totalCarbohydrate: 5, protein: 85 } },
  { key: 'theanine', name: 'L-Theanine (demo)', labelName: 'L-Theanine', category: 'AMINO_ACID',
    n: { calories: 0 } },
]

export async function seedDemoProduct(prisma: PrismaClient) {
  console.log('Seeding demo product (adaptogen sparkling tonic)...')

  // 1. Subcategory (fall back to any so the seed never hard-fails).
  const sub =
    (await prisma.subcategory.findFirst({ where: { slug: SUBCATEGORY_SLUG }, select: { id: true } })) ??
    (await prisma.subcategory.findFirst({ select: { id: true } }))
  if (!sub) {
    console.warn('  ⚠ No subcategories found — run the category seed first. Skipping demo product.')
    return
  }

  // 2. A manufacturer service to own it (optional — null is fine for display).
  const manuf = await prisma.partnerService.findFirst({
    where: { type: 'MANUFACTURING' },
    select: { id: true },
  })

  // 3. Die-line for the can.
  const dieCut = await prisma.dieCutTemplate.findFirst({
    where: { slug: DIE_CUT_SLUG },
    select: { id: true },
  })

  // 4. Ingredients (idempotent upsert by name; set both allergen fields).
  const idByKey = new Map<string, string>()
  for (const ing of INGREDIENTS) {
    const existing = await prisma.ingredient.findFirst({ where: { name: ing.name }, select: { id: true } })
    const data = {
      internalName: ing.labelName,
      labelDeclarationName: ing.labelName,
      category: ing.category as never,
      nutritionPer100g: ing.n as object,
      allergenFlags: ing.allergens ?? [],
      allergens: ing.allergens ?? [],
      source: 'LIBRARY' as never,
      ownerPartnerId: null,
      verificationStatus: 'LIBRARY_PROMOTED' as never,
    }
    if (existing) {
      await prisma.ingredient.update({ where: { id: existing.id }, data })
      idByKey.set(ing.key, existing.id)
    } else {
      const created = await prisma.ingredient.create({ data: { name: ing.name, ...data }, select: { id: true } })
      idByKey.set(ing.key, created.id)
    }
  }
  const ingId = (key: string) => {
    const id = idByKey.get(key)
    if (!id) throw new Error(`demo-product: ingredient '${key}' not created`)
    return id
  }

  // 5. ProductTemplate (PUBLISHED FOOD).
  const tpl = await prisma.productTemplate.upsert({
    where: { slug: SLUG },
    update: {
      name: 'Adaptogen Sparkling Tonic',
      subcategoryId: sub.id,
      manufacturerServiceId: manuf?.id ?? null,
      status: 'PUBLISHED',
      labelingType: 'FOOD',
      priceFloorCents: 180,
      unitCostCents: 240,
    },
    create: {
      slug: SLUG,
      name: 'Adaptogen Sparkling Tonic',
      description:
        'A lightly sparkling functional tonic. Demo product with replaceable sweetener + flavor and optional functional add-ons — built to exercise live label + allergen recompute end-to-end.',
      subcategoryId: sub.id,
      manufacturerServiceId: manuf?.id ?? null,
      status: 'PUBLISHED',
      labelingType: 'FOOD',
      priceFloorCents: 180,
      unitCostCents: 240,
    },
    select: { id: true },
  })

  // 6. Reset recipe (idempotent): clear slots (cascades replacements) + optionals.
  await prisma.templateOptionalIngredient.deleteMany({ where: { productTemplateId: tpl.id } })
  await prisma.templateIngredientSlot.deleteMany({ where: { productTemplateId: tpl.id } })

  // 7. Base slots (weights in grams per single 355 mL can; water dominates).
  // Fixed base.
  await prisma.templateIngredientSlot.create({
    data: { productTemplateId: tpl.id, baseIngredientId: ingId('water'), weightG: 330, displayOrder: 1,
      label: 'Carbonated water base', allowReplacement: false },
  })
  // Sweetener — REPLACEABLE (big nutrition swing).
  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: tpl.id, baseIngredientId: ingId('sugar'), weightG: 12, displayOrder: 2,
      label: 'Sweetener', description: 'Swap to a zero-calorie sweetener to cut sugar + calories.',
      replacements: {
        create: [
          { ingredientId: ingId('stevia'), weightGOverride: 0.2, displayOrder: 1, calloutText: 'Zero calorie · cuts ~46 kcal and 12 g sugar' },
          { ingredientId: ingId('monkfruit'), weightGOverride: 0.2, displayOrder: 2, calloutText: 'Zero calorie · cleaner aftertaste' },
        ],
      },
    },
  })
  // Adaptogen — REPLACEABLE.
  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: tpl.id, baseIngredientId: ingId('ashwagandha'), weightG: 1.5, displayOrder: 3,
      label: 'Adaptogen', description: 'The functional active. Swap to match your brand story.',
      replacements: {
        create: [
          { ingredientId: ingId('turmeric'), displayOrder: 1, calloutText: 'Anti-inflammatory positioning' },
          { ingredientId: ingId('reishi'), displayOrder: 2, calloutText: 'Calm / immune positioning' },
        ],
      },
    },
  })
  // Flavor — REPLACEABLE; base carries a Coconut allergen the swaps remove.
  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: tpl.id, baseIngredientId: ingId('coconut'), weightG: 5, displayOrder: 4,
      label: 'Flavor', description: 'Coconut base contains a tree-nut allergen; citrus/berry remove it.',
      replacements: {
        create: [
          { ingredientId: ingId('citrus'), weightGOverride: 0.5, displayOrder: 1, calloutText: 'Allergen-free · removes Coconut' },
          { ingredientId: ingId('berry'), weightGOverride: 0.5, displayOrder: 2, calloutText: 'Allergen-free · removes Coconut' },
        ],
      },
    },
  })
  // Fixed base tail.
  await prisma.templateIngredientSlot.create({
    data: { productTemplateId: tpl.id, baseIngredientId: ingId('citric'), weightG: 0.5, displayOrder: 5,
      label: 'Acidulant', allowReplacement: false },
  })
  await prisma.templateIngredientSlot.create({
    data: { productTemplateId: tpl.id, baseIngredientId: ingId('salt'), weightG: 0.1, displayOrder: 6,
      label: 'Electrolyte', allowReplacement: false },
  })

  // 8. Optional add-ons.
  await prisma.templateOptionalIngredient.createMany({
    data: [
      { productTemplateId: tpl.id, ingredientId: ingId('collagen'), weightG: 5, displayOrder: 1, calloutText: 'Adds ~4.5 g protein per can' },
      { productTemplateId: tpl.id, ingredientId: ingId('mct'), weightG: 3, displayOrder: 2, calloutText: 'Adds ~2 g MCT fats' },
      { productTemplateId: tpl.id, ingredientId: ingId('whey'), weightG: 4, displayOrder: 3, calloutText: 'Adds protein — introduces a Milk allergen' },
      { productTemplateId: tpl.id, ingredientId: ingId('theanine'), weightG: 0.2, displayOrder: 4, calloutText: '200 mg L-theanine for calm focus' },
    ],
  })

  // 9. Variant (355 mL can) — serving geometry + net content + die-line.
  const existingVariant = await prisma.productTemplateVariant.findFirst({
    where: { productTemplateId: tpl.id },
    select: { id: true },
  })
  const variantData = {
    flavor: null,
    containerFormat: '355 mL can',
    containerSizeG: 355,
    servingsPerContainer: 1,
    servingSizeG: 355,
    servingSizeDesc: '1 can (355 mL)',
    netContentValue: 355,
    netContentUnit: 'mL',
    netContentDisplay: '12 fl oz (355 mL)',
    sku: 'DEMO-TONIC-355',
    moqMin: 1000,
    moqMax: 20000,
    leadTimeDays: 21,
    shelfLifeDays: 365,
    dieCutTemplateId: dieCut?.id ?? null,
  }
  if (existingVariant) {
    await prisma.productTemplateVariant.update({ where: { id: existingVariant.id }, data: variantData })
  } else {
    await prisma.productTemplateVariant.create({ data: { productTemplateId: tpl.id, ...variantData } })
  }

  // 10. Volume pricing tiers (idempotent replace).
  await prisma.productTemplatePricingTier.deleteMany({ where: { productTemplateId: tpl.id } })
  await prisma.productTemplatePricingTier.createMany({
    data: [
      { productTemplateId: tpl.id, sortOrder: 0, minQty: 1000, maxQty: 4999, perUnitCostCents: 240, perUnitFloorCents: 200 },
      { productTemplateId: tpl.id, sortOrder: 1, minQty: 5000, maxQty: 9999, perUnitCostCents: 215, perUnitFloorCents: 185 },
      { productTemplateId: tpl.id, sortOrder: 2, minQty: 10000, maxQty: null, perUnitCostCents: 195, perUnitFloorCents: 170 },
    ],
  })

  console.log(`  ✓ ${SLUG} published (FOOD) with replaceable + optional ingredients, variant, die-line, pricing.`)
}
