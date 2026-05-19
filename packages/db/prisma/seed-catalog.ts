// Catalog seed — categories, subcategories, sample ProductTemplates.
//
// Imported from FOD-reference/backend/exports/category-tree-export.json
// (the 18-cat / 85-subcat structure from Pavel's old admin).
// V1 ships 12 categories: Food (6), Beverages (3), Supplements (3).
// V1.5+ adds Other: Pet, Baby, Cooking Ingredients, Edible Gifts.
//
// Run alongside the main seed.ts.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// V1 category subset — matches RESEARCH_SYNTHESIS_2026-05-18.md scope
const V1_CATEGORIES = [
  // ===== FOOD =====
  {
    externalId: 'cat-snacks',
    name: 'Snacks & Confectionery',
    slug: 'snacks-confectionery',
    mainCategory: 'Food',
    icon: '🍿',
    color: '#FF6B6B',
    displayOrder: 1,
    regulatoryRequirements: { rulePackId: 'us-fda-food-2026', labelType: 'NUTRITION_FACTS' },
    subcategories: [
      { externalId: 'sub-chocolate', name: 'Chocolate & Candy', slug: 'chocolate-candy' },
      { externalId: 'sub-chips', name: 'Chips & Crisps', slug: 'chips-crisps' },
      { externalId: 'sub-nuts', name: 'Nuts & Seeds', slug: 'nuts-seeds' },
      { externalId: 'sub-cookies', name: 'Cookies & Biscuits', slug: 'cookies-biscuits' },
      { externalId: 'sub-bars', name: 'Granola & Energy Bars', slug: 'granola-energy-bars' },
      { externalId: 'sub-dried-fruit', name: 'Dried Fruits & Veggies', slug: 'dried-fruits-veggies' },
      { externalId: 'sub-popcorn', name: 'Popcorn & Puffed Snacks', slug: 'popcorn-puffed-snacks' },
    ],
  },
  {
    externalId: 'cat-pantry',
    name: 'Pantry Staples',
    slug: 'pantry-staples',
    mainCategory: 'Food',
    icon: '🥫',
    color: '#4ECDC4',
    displayOrder: 2,
    regulatoryRequirements: { rulePackId: 'us-fda-food-2026', labelType: 'NUTRITION_FACTS' },
    subcategories: [
      { externalId: 'sub-pasta', name: 'Pasta & Noodles', slug: 'pasta-noodles' },
      { externalId: 'sub-rice', name: 'Rice & Grains', slug: 'rice-grains' },
      { externalId: 'sub-flour', name: 'Flour & Baking Mixes', slug: 'flour-baking-mixes' },
      { externalId: 'sub-oils', name: 'Cooking Oils & Vinegars', slug: 'cooking-oils-vinegars' },
      { externalId: 'sub-spices', name: 'Spices & Seasonings', slug: 'spices-seasonings' },
    ],
  },
  {
    externalId: 'cat-breakfast',
    name: 'Breakfast Foods',
    slug: 'breakfast-foods',
    mainCategory: 'Food',
    icon: '🥣',
    color: '#FFD93D',
    displayOrder: 3,
    regulatoryRequirements: { rulePackId: 'us-fda-food-2026', labelType: 'NUTRITION_FACTS' },
    subcategories: [
      { externalId: 'sub-cereals', name: 'Cereals', slug: 'cereals' },
      { externalId: 'sub-oatmeal', name: 'Oatmeals & Porridges', slug: 'oatmeals-porridges' },
      { externalId: 'sub-pancakes', name: 'Pancake & Waffle Mixes', slug: 'pancake-waffle-mixes' },
    ],
  },
  {
    externalId: 'cat-baking',
    name: 'Baking & Desserts',
    slug: 'baking-desserts',
    mainCategory: 'Food',
    icon: '🧁',
    color: '#FF6B9D',
    displayOrder: 4,
    regulatoryRequirements: { rulePackId: 'us-fda-food-2026', labelType: 'NUTRITION_FACTS' },
    subcategories: [
      { externalId: 'sub-cake-mixes', name: 'Cake Mixes', slug: 'cake-mixes' },
      { externalId: 'sub-cookie-mixes', name: 'Brownie & Cookie Mixes', slug: 'brownie-cookie-mixes' },
    ],
  },
  {
    externalId: 'cat-specialty',
    name: 'Specialty Foods',
    slug: 'specialty-foods',
    mainCategory: 'Food',
    icon: '🌟',
    color: '#A78BFA',
    displayOrder: 5,
    regulatoryRequirements: { rulePackId: 'us-fda-food-2026', labelType: 'NUTRITION_FACTS' },
    subcategories: [
      { externalId: 'sub-vegan', name: 'Vegan & Plant-Based Foods', slug: 'vegan-plant-based' },
      { externalId: 'sub-keto', name: 'Keto & Low-Carb Foods', slug: 'keto-low-carb' },
      { externalId: 'sub-glutenfree', name: 'Gluten-Free Foods', slug: 'gluten-free' },
    ],
  },
  // ===== BEVERAGES =====
  {
    externalId: 'cat-hot-bev',
    name: 'Hot Beverages',
    slug: 'hot-beverages',
    mainCategory: 'Beverages',
    icon: '☕',
    color: '#8B5E3C',
    displayOrder: 6,
    regulatoryRequirements: { rulePackId: 'us-fda-food-2026', labelType: 'NUTRITION_FACTS' },
    subcategories: [
      { externalId: 'sub-coffee', name: 'Coffee', slug: 'coffee' },
      { externalId: 'sub-tea', name: 'Tea', slug: 'tea' },
      { externalId: 'sub-chai', name: 'Chai & Specialty Blends', slug: 'chai-specialty' },
    ],
  },
  {
    externalId: 'cat-cold-bev',
    name: 'Cold Beverages',
    slug: 'cold-beverages',
    mainCategory: 'Beverages',
    icon: '🥤',
    color: '#4FC3F7',
    displayOrder: 7,
    regulatoryRequirements: { rulePackId: 'us-fda-food-2026', labelType: 'NUTRITION_FACTS' },
    subcategories: [
      { externalId: 'sub-waters', name: 'Enhanced Waters', slug: 'enhanced-waters' },
      { externalId: 'sub-kombucha', name: 'Kombucha & Fermented Drinks', slug: 'kombucha-fermented' },
      { externalId: 'sub-juices', name: 'Cold-Pressed Juices', slug: 'cold-pressed-juices' },
    ],
  },
  {
    externalId: 'cat-functional-bev',
    name: 'Functional Beverages',
    slug: 'functional-beverages',
    mainCategory: 'Beverages',
    icon: '⚡',
    color: '#FFA726',
    displayOrder: 8,
    regulatoryRequirements: { rulePackId: 'us-fda-food-2026', labelType: 'NUTRITION_FACTS' },
    subcategories: [
      { externalId: 'sub-energy', name: 'Energy Drinks', slug: 'energy-drinks' },
      { externalId: 'sub-meal-replacement', name: 'Meal Replacement Shakes', slug: 'meal-replacement' },
      { externalId: 'sub-tonics', name: 'Wellness Tonics', slug: 'wellness-tonics' },
    ],
  },
  // ===== SUPPLEMENTS =====
  {
    externalId: 'cat-vitamins',
    name: 'Vitamins & Minerals',
    slug: 'vitamins-minerals',
    mainCategory: 'Supplements',
    icon: '💊',
    color: '#66BB6A',
    displayOrder: 9,
    regulatoryRequirements: { rulePackId: 'us-fda-supplements-2026', labelType: 'SUPPLEMENT_FACTS' },
    subcategories: [
      { externalId: 'sub-multi', name: 'Multivitamins', slug: 'multivitamins' },
      { externalId: 'sub-single-vit', name: 'Single Vitamins', slug: 'single-vitamins' },
      { externalId: 'sub-minerals', name: 'Mineral Supplements', slug: 'mineral-supplements' },
    ],
  },
  {
    externalId: 'cat-protein',
    name: 'Protein Supplements',
    slug: 'protein-supplements',
    mainCategory: 'Supplements',
    icon: '💪',
    color: '#EC407A',
    displayOrder: 10,
    regulatoryRequirements: { rulePackId: 'us-fda-supplements-2026', labelType: 'SUPPLEMENT_FACTS' },
    subcategories: [
      { externalId: 'sub-whey', name: 'Whey Protein', slug: 'whey-protein' },
      { externalId: 'sub-plant-protein', name: 'Plant-Based Protein', slug: 'plant-based-protein' },
      { externalId: 'sub-collagen', name: 'Collagen Peptides', slug: 'collagen-peptides' },
    ],
  },
  {
    externalId: 'cat-specialty-supp',
    name: 'Specialty Supplements',
    slug: 'specialty-supplements',
    mainCategory: 'Supplements',
    icon: '🌿',
    color: '#26A69A',
    displayOrder: 11,
    regulatoryRequirements: { rulePackId: 'us-fda-supplements-2026', labelType: 'SUPPLEMENT_FACTS' },
    subcategories: [
      { externalId: 'sub-greens', name: 'Greens & Superfood Powders', slug: 'greens-superfood' },
      { externalId: 'sub-probiotics', name: 'Probiotics', slug: 'probiotics' },
      { externalId: 'sub-herbal', name: 'Herbal Supplements', slug: 'herbal-supplements' },
    ],
  },
  {
    externalId: 'cat-sports',
    name: 'Sports Nutrition',
    slug: 'sports-nutrition',
    mainCategory: 'Supplements',
    icon: '🏃',
    color: '#EF5350',
    displayOrder: 12,
    regulatoryRequirements: { rulePackId: 'us-fda-supplements-2026', labelType: 'SUPPLEMENT_FACTS' },
    subcategories: [
      { externalId: 'sub-preworkout', name: 'Pre-Workout Formulas', slug: 'pre-workout' },
      { externalId: 'sub-postworkout', name: 'Post-Workout Recovery', slug: 'post-workout' },
    ],
  },
] as const

export async function seedCatalog(opts: { manufacturerServiceId: string }) {
  // Idempotency: categories + subcategories are safe to re-upsert (externalId unique),
  // but ProductTemplates with their slot/replacement/optional tree are not — they'd
  // pile up duplicates or fail on the unique constraint. So if templates already
  // exist, refresh categories only and skip the rest.
  const templateCount = await prisma.productTemplate.count()
  const skipTemplates = templateCount > 0
  if (skipTemplates) {
    console.log(
      `Catalog: ${templateCount} ProductTemplate(s) already exist — refreshing categories only, skipping template seed.`,
    )
  }

  console.log('Seeding catalog (12 categories, ~40 subcategories)...')

  for (const cat of V1_CATEGORIES) {
    const dbCat = await prisma.category.upsert({
      where: { externalId: cat.externalId },
      update: {},
      create: {
        externalId: cat.externalId,
        name: cat.name,
        slug: cat.slug,
        mainCategory: cat.mainCategory,
        icon: cat.icon,
        color: cat.color,
        displayOrder: cat.displayOrder,
        regulatoryRequirements: cat.regulatoryRequirements,
      },
    })

    for (const [idx, sub] of cat.subcategories.entries()) {
      await prisma.subcategory.upsert({
        where: { externalId: sub.externalId },
        update: {},
        create: {
          externalId: sub.externalId,
          categoryId: dbCat.id,
          name: sub.name,
          slug: sub.slug,
          displayOrder: idx,
          packagingOptions: {},
        },
      })
    }
  }

  console.log(`Seeded ${V1_CATEGORIES.length} categories.`)

  if (skipTemplates) {
    console.log('Skipping ProductTemplate seed (already populated).')
    return
  }

  // ---- Sample ProductTemplates ----
  // Each template has slots (BASE + replacement options) and optionals.
  // The Ingredient names match what's already in the seed.

  // Helper: ingredient by name
  async function ing(name: string) {
    const i = await prisma.ingredient.findFirst({ where: { name } })
    if (!i) throw new Error(`Ingredient missing in seed: ${name}`)
    return i
  }

  const subcategories = await prisma.subcategory.findMany()
  const subBy = (slug: string) => {
    const s = subcategories.find((x) => x.slug === slug)
    if (!s) throw new Error(`Subcategory missing: ${slug}`)
    return s
  }

  const dieCuts = await prisma.dieCutTemplate.findMany()
  const dc = (slug: string) => dieCuts.find((x) => x.slug === slug)

  // ---- Whey Protein Powder template ----
  const wheyTemplate = await prisma.productTemplate.upsert({
    where: { slug: 'whey-protein-powder' },
    update: {},
    create: {
      slug: 'whey-protein-powder',
      subcategoryId: subBy('whey-protein').id,
      manufacturerServiceId: opts.manufacturerServiceId,
      status: 'PUBLISHED',
      name: 'Whey Protein Powder',
      description:
        'Classic whey isolate base. Swap the sweetener, swap the protein source, or add functional extras.',
      priceFloorCents: 2999,
      unitCostCents: 1200,
      variants: {
        create: [
          { flavor: 'Vanilla',   containerFormat: '907g (2lb) tub', servingsPerContainer: 30, servingSizeG: 30, servingSizeDesc: '1 scoop (30g)', moqMin: 500, moqMax: 5000, leadTimeDays: 28, dieCutTemplateId: dc('round-2')?.id },
          { flavor: 'Chocolate', containerFormat: '907g (2lb) tub', servingsPerContainer: 30, servingSizeG: 30, servingSizeDesc: '1 scoop (30g)', moqMin: 500, moqMax: 5000, leadTimeDays: 28, dieCutTemplateId: dc('round-2')?.id },
          { flavor: 'Unflavored', containerFormat: '907g (2lb) tub', servingsPerContainer: 30, servingSizeG: 30, servingSizeDesc: '1 scoop (30g)', moqMin: 500, moqMax: 5000, leadTimeDays: 28, dieCutTemplateId: dc('round-2')?.id },
        ],
      },
    },
  })

  // Whey slots
  const wheyProteinSlot = await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: wheyTemplate.id,
      baseIngredientId: (await ing('Whey protein isolate')).id,
      weightG: 24,
      displayOrder: 1,
      label: 'Protein source',
      description: 'The base protein — swap for plant-based if your audience prefers vegan.',
      replacements: {
        create: [
          {
            ingredientId: (await ing('Pea protein isolate')).id,
            displayOrder: 1,
            calloutText: 'Vegan — adds beany aftertaste',
          },
          {
            ingredientId: (await ing('Collagen peptides')).id,
            weightGOverride: 10,
            displayOrder: 2,
            calloutText: 'Joint + skin support, lower complete-protein content',
          },
        ],
      },
    },
  })

  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: wheyTemplate.id,
      baseIngredientId: (await ing('Stevia leaf extract')).id,
      weightG: 0.3,
      displayOrder: 2,
      label: 'Sweetener',
      replacements: {
        create: [
          {
            ingredientId: (await ing('Monk fruit extract')).id,
            displayOrder: 1,
            calloutText: 'Cleaner aftertaste',
          },
        ],
      },
    },
  })

  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: wheyTemplate.id,
      baseIngredientId: (await ing('Cocoa powder, unsweetened')).id,
      weightG: 3,
      displayOrder: 3,
      label: 'Flavor base',
      description: 'Drives the variant flavor. Vanilla variant uses vanilla extract; chocolate uses cocoa.',
      allowReplacement: false,
    },
  })

  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: wheyTemplate.id,
      baseIngredientId: (await ing('Sea salt')).id,
      weightG: 0.2,
      displayOrder: 4,
      label: 'Salt',
      allowReplacement: false,
    },
  })

  // Whey optionals
  await prisma.templateOptionalIngredient.createMany({
    data: [
      {
        productTemplateId: wheyTemplate.id,
        ingredientId: (await ing('MCT oil powder')).id,
        weightG: 2.5,
        displayOrder: 1,
        calloutText: 'Adds 7g healthy fats per serving',
      },
      {
        productTemplateId: wheyTemplate.id,
        ingredientId: (await ing('Inulin (chicory root fiber)')).id,
        weightG: 3,
        displayOrder: 2,
        calloutText: 'Adds 3g prebiotic fiber',
      },
      {
        productTemplateId: wheyTemplate.id,
        ingredientId: (await ing('Sunflower lecithin')).id,
        weightG: 0.5,
        displayOrder: 3,
        calloutText: 'Improves mixability',
      },
    ],
  })

  // ---- Multivitamin Capsule template ----
  const multiTemplate = await prisma.productTemplate.upsert({
    where: { slug: 'daily-multivitamin' },
    update: {},
    create: {
      slug: 'daily-multivitamin',
      subcategoryId: subBy('multivitamins').id,
      manufacturerServiceId: opts.manufacturerServiceId,
      status: 'PUBLISHED',
      name: 'Daily Multivitamin (Capsule)',
      description: 'Comprehensive A-Z multivitamin in a vegetable capsule.',
      priceFloorCents: 1999,
      unitCostCents: 800,
      variants: {
        create: [
          { containerFormat: '60-count bottle',  servingsPerContainer: 30, servingSizeG: 1.2, servingSizeDesc: '2 capsules', moqMin: 500, moqMax: 5000, leadTimeDays: 28, dieCutTemplateId: dc('oval-2.5x6')?.id },
          { containerFormat: '120-count bottle', servingsPerContainer: 60, servingSizeG: 1.2, servingSizeDesc: '2 capsules', moqMin: 500, moqMax: 5000, leadTimeDays: 28, dieCutTemplateId: dc('oval-2.5x6')?.id },
        ],
      },
    },
  })

  // Multivitamin slots (mostly locked, since multi formulas are dose-balanced)
  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: multiTemplate.id,
      baseIngredientId: (await ing('Vitamin D3 (cholecalciferol)')).id,
      weightG: 0.025,
      displayOrder: 1,
      label: 'Vitamin D3',
      allowReplacement: false,
    },
  })
  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: multiTemplate.id,
      baseIngredientId: (await ing('Calcium carbonate')).id,
      weightG: 0.5,
      displayOrder: 2,
      label: 'Calcium',
      allowReplacement: false,
    },
  })
  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: multiTemplate.id,
      baseIngredientId: (await ing('Ferrous bisglycinate')).id,
      weightG: 0.018,
      displayOrder: 3,
      label: 'Iron',
      description: 'Optional — skip iron entirely if your audience skews post-menopausal or male.',
      allowReplacement: true,
      replacements: {
        create: [],   // V1.5: ferrous fumarate alternative
      },
    },
  })
  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: multiTemplate.id,
      baseIngredientId: (await ing('Zinc gluconate')).id,
      weightG: 0.011,
      displayOrder: 4,
      label: 'Zinc',
      allowReplacement: false,
    },
  })

  // Multivitamin optionals
  await prisma.templateOptionalIngredient.createMany({
    data: [
      {
        productTemplateId: multiTemplate.id,
        ingredientId: (await ing('Turmeric (curcumin) extract')).id,
        weightG: 0.1,
        displayOrder: 1,
        calloutText: 'Anti-inflammatory support',
      },
      {
        productTemplateId: multiTemplate.id,
        ingredientId: (await ing('Ashwagandha extract')).id,
        weightG: 0.3,
        displayOrder: 2,
        calloutText: 'Stress + adaptogen support',
      },
    ],
  })

  // ---- Energy Drink template ----
  const energyTemplate = await prisma.productTemplate.upsert({
    where: { slug: 'clean-energy-drink' },
    update: {},
    create: {
      slug: 'clean-energy-drink',
      subcategoryId: subBy('energy-drinks').id,
      manufacturerServiceId: opts.manufacturerServiceId,
      status: 'PUBLISHED',
      name: 'Clean Energy Drink',
      description: '150mg caffeine, zero sugar. Customize the flavor pool + caffeine source.',
      priceFloorCents: 299,
      unitCostCents: 95,
      variants: {
        create: [
          { flavor: 'Tropical Citrus', containerFormat: '12oz can', servingsPerContainer: 1, servingSizeG: 355, servingSizeDesc: '1 can (355ml)', moqMin: 5000, moqMax: 50000, leadTimeDays: 42, dieCutTemplateId: dc('wrap-4x12')?.id },
          { flavor: 'Berry Burst',     containerFormat: '12oz can', servingsPerContainer: 1, servingSizeG: 355, servingSizeDesc: '1 can (355ml)', moqMin: 5000, moqMax: 50000, leadTimeDays: 42, dieCutTemplateId: dc('wrap-4x12')?.id },
        ],
      },
    },
  })

  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: energyTemplate.id,
      baseIngredientId: (await ing('Caffeine anhydrous')).id,
      weightG: 0.15,
      displayOrder: 1,
      label: 'Caffeine source',
      allowReplacement: false,
    },
  })
  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: energyTemplate.id,
      baseIngredientId: (await ing('Stevia leaf extract')).id,
      weightG: 0.05,
      displayOrder: 2,
      label: 'Sweetener',
      replacements: {
        create: [
          {
            ingredientId: (await ing('Monk fruit extract')).id,
            displayOrder: 1,
          },
        ],
      },
    },
  })
  await prisma.templateOptionalIngredient.createMany({
    data: [
      {
        productTemplateId: energyTemplate.id,
        ingredientId: (await ing('L-theanine')).id,
        weightG: 0.2,
        displayOrder: 1,
        calloutText: 'Adds 200mg L-Theanine for calmer focus',
      },
    ],
  })

  // ---- Demonstrate packing types — add advanced variants to Energy Drink ----
  // (The single-can variants above are SINGLE_FLAVOR_SINGLE_PACK by enum default.)
  await prisma.productTemplateVariant.createMany({
    data: [
      // Same-flavor 6-pack
      {
        productTemplateId: energyTemplate.id,
        flavor: 'Tropical Citrus',
        containerFormat: '6-pack (6 × 12oz can)',
        servingsPerContainer: 6,
        servingSizeG: 355,
        servingSizeDesc: '1 can (355ml)',
        moqMin: 1000,
        moqMax: 25000,
        leadTimeDays: 42,
        packingType: 'SINGLE_FLAVOR_MULTIPACK',
        flavorArrangement: 'SINGLE',
        innerPacksPerOuter: 6,
        dieCutTemplateId: dc('wrap-4x12')?.id,
      },
      // Mixed-flavor variety pack (3 Tropical + 3 Berry in one outer box)
      {
        productTemplateId: energyTemplate.id,
        flavor: null,
        containerFormat: '6-pack variety (3 Tropical + 3 Berry)',
        servingsPerContainer: 6,
        servingSizeG: 355,
        servingSizeDesc: '1 can (355ml)',
        moqMin: 1000,
        moqMax: 25000,
        leadTimeDays: 42,
        packingType: 'MULTI_FLAVOR_INDIVIDUAL_IN_OUTER',
        flavorArrangement: 'SEPARATED',
        innerPacksPerOuter: 6,
        assortmentFlavors: [
          { flavor: 'Tropical Citrus', qty: 3 },
          { flavor: 'Berry Burst', qty: 3 },
        ],
        dieCutTemplateId: dc('wrap-4x12')?.id,
      },
      // Sampler — one of each
      {
        productTemplateId: energyTemplate.id,
        flavor: null,
        containerFormat: 'Sampler 4-pack',
        servingsPerContainer: 4,
        servingSizeG: 355,
        servingSizeDesc: '1 can (355ml)',
        moqMin: 500,
        moqMax: 5000,
        leadTimeDays: 35,
        packingType: 'SAMPLER_MINI',
        flavorArrangement: 'SEPARATED',
        innerPacksPerOuter: 4,
        assortmentFlavors: [
          { flavor: 'Tropical Citrus', qty: 1 },
          { flavor: 'Berry Burst', qty: 1 },
          { flavor: 'Lime', qty: 1 },
          { flavor: 'Watermelon', qty: 1 },
        ],
        dieCutTemplateId: dc('wrap-4x12')?.id,
      },
      // Customer picks N of M
      {
        productTemplateId: energyTemplate.id,
        flavor: null,
        containerFormat: '12-pack: pick any 12 flavors',
        servingsPerContainer: 12,
        servingSizeG: 355,
        servingSizeDesc: '1 can (355ml)',
        moqMin: 2000,
        moqMax: 25000,
        leadTimeDays: 49,
        packingType: 'CUSTOMIZABLE_PICK_N',
        flavorArrangement: 'SEPARATED',
        innerPacksPerOuter: 12,
        customerPicksCount: 12,
        dieCutTemplateId: dc('wrap-4x12')?.id,
      },
      // Subscription
      {
        productTemplateId: energyTemplate.id,
        flavor: null,
        containerFormat: 'Monthly 24-pack subscription',
        servingsPerContainer: 24,
        servingSizeG: 355,
        servingSizeDesc: '1 can (355ml)',
        moqMin: 1000,
        moqMax: 25000,
        leadTimeDays: 42,
        packingType: 'SUBSCRIPTION_ROTATING',
        flavorArrangement: 'SEPARATED',
        innerPacksPerOuter: 24,
        subscriptionInterval: 'monthly',
        dieCutTemplateId: dc('wrap-4x12')?.id,
      },
    ],
  })

  // ---- Granola Bar template (Snacks > Granola Bars) ----
  const granolaTemplate = await prisma.productTemplate.upsert({
    where: { slug: 'granola-energy-bar' },
    update: {},
    create: {
      slug: 'granola-energy-bar',
      subcategoryId: subBy('granola-energy-bars').id,
      manufacturerServiceId: opts.manufacturerServiceId,
      status: 'PUBLISHED',
      name: 'Granola Energy Bar',
      description: 'Oats + nuts + honey base. Pick a protein boost, swap the binder, add functional extras.',
      priceFloorCents: 299,
      unitCostCents: 95,
      variants: {
        create: [
          {
            flavor: 'Honey Almond',
            containerFormat: 'Single bar (45g)',
            servingsPerContainer: 1,
            servingSizeG: 45,
            servingSizeDesc: '1 bar (45g)',
            moqMin: 2000,
            moqMax: 30000,
            leadTimeDays: 35,
            packingType: 'SINGLE_FLAVOR_SINGLE_PACK',
            dieCutTemplateId: dc('rect-3x4')?.id,
          },
          {
            flavor: 'Honey Almond',
            containerFormat: '12-bar box (single flavor)',
            servingsPerContainer: 12,
            servingSizeG: 45,
            servingSizeDesc: '1 bar (45g)',
            moqMin: 2000,
            moqMax: 30000,
            leadTimeDays: 35,
            packingType: 'SINGLE_FLAVOR_MULTIPACK',
            flavorArrangement: 'SINGLE',
            innerPacksPerOuter: 12,
            dieCutTemplateId: dc('rect-3x4')?.id,
          },
          {
            flavor: null,
            containerFormat: '12-bar variety box (4 flavors × 3)',
            servingsPerContainer: 12,
            servingSizeG: 45,
            servingSizeDesc: '1 bar (45g)',
            moqMin: 2000,
            moqMax: 30000,
            leadTimeDays: 42,
            packingType: 'MULTI_FLAVOR_INDIVIDUAL_IN_OUTER',
            flavorArrangement: 'SEPARATED',
            innerPacksPerOuter: 12,
            assortmentFlavors: [
              { flavor: 'Honey Almond', qty: 3 },
              { flavor: 'Chocolate Chip', qty: 3 },
              { flavor: 'Peanut Butter', qty: 3 },
              { flavor: 'Cinnamon Raisin', qty: 3 },
            ],
            dieCutTemplateId: dc('rect-3x4')?.id,
          },
        ],
      },
    },
  })

  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: granolaTemplate.id,
      baseIngredientId: (await ing('Oats, rolled, dry')).id,
      weightG: 18,
      displayOrder: 1,
      label: 'Grain base',
      allowReplacement: false,
    },
  })
  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: granolaTemplate.id,
      baseIngredientId: (await ing('Honey')).id,
      weightG: 9,
      displayOrder: 2,
      label: 'Sweetener / binder',
      replacements: {
        create: [
          {
            ingredientId: (await ing('Stevia leaf extract')).id,
            weightGOverride: 0.2,
            displayOrder: 1,
            calloutText: 'Lower glycemic, no calories',
          },
          {
            ingredientId: (await ing('Monk fruit extract')).id,
            weightGOverride: 0.2,
            displayOrder: 2,
            calloutText: 'Zero calorie, vegan',
          },
        ],
      },
    },
  })
  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: granolaTemplate.id,
      baseIngredientId: (await ing('Almonds, raw')).id,
      weightG: 8,
      displayOrder: 3,
      label: 'Nut',
      description: 'Replace with allergen-free option to broaden audience.',
      replacements: {
        create: [
          {
            ingredientId: (await ing('Chia seeds')).id,
            displayOrder: 1,
            calloutText: 'Nut-free, adds omega-3',
          },
        ],
      },
    },
  })

  await prisma.templateOptionalIngredient.createMany({
    data: [
      {
        productTemplateId: granolaTemplate.id,
        ingredientId: (await ing('Whey protein isolate')).id,
        weightG: 5,
        displayOrder: 1,
        calloutText: 'Adds 5g protein per bar',
      },
      {
        productTemplateId: granolaTemplate.id,
        ingredientId: (await ing('Cocoa powder, unsweetened')).id,
        weightG: 2,
        displayOrder: 2,
        calloutText: 'Adds dark chocolate notes',
      },
    ],
  })

  // ---- Greens Powder template (Supplements > Greens & Superfood) ----
  const greensTemplate = await prisma.productTemplate.upsert({
    where: { slug: 'daily-greens-powder' },
    update: {},
    create: {
      slug: 'daily-greens-powder',
      subcategoryId: subBy('greens-superfood').id,
      manufacturerServiceId: opts.manufacturerServiceId,
      status: 'PUBLISHED',
      name: 'Daily Greens Powder',
      description: 'Spirulina + beetroot + maca core. Customize the flavor masker + add adaptogens.',
      priceFloorCents: 3499,
      unitCostCents: 1400,
      variants: {
        create: [
          {
            flavor: 'Unflavored',
            containerFormat: '300g tub',
            servingsPerContainer: 30,
            servingSizeG: 10,
            servingSizeDesc: '1 scoop (10g)',
            moqMin: 500,
            moqMax: 5000,
            leadTimeDays: 28,
            packingType: 'SINGLE_FLAVOR_SINGLE_PACK',
            dieCutTemplateId: dc('round-2')?.id,
          },
          {
            flavor: null,
            containerFormat: '30 single-serve sachets',
            servingsPerContainer: 30,
            servingSizeG: 10,
            servingSizeDesc: '1 sachet (10g)',
            moqMin: 500,
            moqMax: 5000,
            leadTimeDays: 35,
            packingType: 'SINGLE_FLAVOR_MULTIPACK',
            flavorArrangement: 'SINGLE',
            innerPacksPerOuter: 30,
            dieCutTemplateId: dc('sticker-2x3')?.id,
          },
          {
            flavor: null,
            containerFormat: '7-day sampler sachets',
            servingsPerContainer: 7,
            servingSizeG: 10,
            servingSizeDesc: '1 sachet (10g)',
            moqMin: 500,
            moqMax: 5000,
            leadTimeDays: 28,
            packingType: 'SAMPLER_MINI',
            flavorArrangement: 'SEPARATED',
            innerPacksPerOuter: 7,
            assortmentFlavors: [
              { flavor: 'Unflavored', qty: 2 },
              { flavor: 'Berry', qty: 2 },
              { flavor: 'Citrus', qty: 2 },
              { flavor: 'Mint', qty: 1 },
            ],
            dieCutTemplateId: dc('sticker-2x3')?.id,
          },
        ],
      },
    },
  })

  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: greensTemplate.id,
      baseIngredientId: (await ing('Spirulina powder')).id,
      weightG: 3,
      displayOrder: 1,
      label: 'Primary green',
      allowReplacement: false,
    },
  })
  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: greensTemplate.id,
      baseIngredientId: (await ing('Beetroot powder')).id,
      weightG: 2,
      displayOrder: 2,
      label: 'Root concentrate',
      allowReplacement: false,
    },
  })
  await prisma.templateIngredientSlot.create({
    data: {
      productTemplateId: greensTemplate.id,
      baseIngredientId: (await ing('Maca root powder')).id,
      weightG: 1.5,
      displayOrder: 3,
      label: 'Adaptogen',
      replacements: {
        create: [
          {
            ingredientId: (await ing('Ashwagandha extract')).id,
            displayOrder: 1,
            calloutText: 'Stress + cortisol support',
          },
        ],
      },
    },
  })

  await prisma.templateOptionalIngredient.createMany({
    data: [
      {
        productTemplateId: greensTemplate.id,
        ingredientId: (await ing('Turmeric (curcumin) extract')).id,
        weightG: 0.5,
        displayOrder: 1,
        calloutText: 'Anti-inflammatory boost',
      },
      {
        productTemplateId: greensTemplate.id,
        ingredientId: (await ing('Inulin (chicory root fiber)')).id,
        weightG: 2,
        displayOrder: 2,
        calloutText: 'Prebiotic fiber for gut health',
      },
      {
        productTemplateId: greensTemplate.id,
        ingredientId: (await ing('Collagen peptides')).id,
        weightG: 5,
        displayOrder: 3,
        calloutText: 'Skin + joint support, +5g protein',
      },
    ],
  })

  console.log('Seeded 5 ProductTemplates (Whey Protein, Multivitamin, Energy Drink, Granola Bar, Greens Powder) with packing-type variants.')
}
