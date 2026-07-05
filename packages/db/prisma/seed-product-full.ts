// Full-product seed for a SPECIFIC product (2026-07-04) — end-to-end Design Studio + checkout test.
//
// Populates one existing creator-owned Product (default id below, override with SEED_PRODUCT_ID)
// with everything the Studio + Product drawer + checkout read: a MULTI variety-pack template with
// FlavorPresets, volume pricing tiers, a variant (container + die-cut + packaging type), and a
// Recipe with ingredients. Idempotent (upsert / delete-then-create).
//
// Prereqs (must already be seeded): a MULTI PackingProfile (seed-packing-types), Ingredients
// (ingredient seed), a US Market, at least one ACTIVE DieCutTemplate + PackagingType. The Product,
// its Brand, and its ProductTemplate must already exist.
//
// Run on the Mac (needs DB access; apply migrations first — pnpm --filter @ilaunchify/db push):
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/seed-product-full.ts
//   (override target: SEED_PRODUCT_ID=<id> pnpm exec dotenv -e ../../.env.local -- tsx prisma/seed-product-full.ts)
//
// NOTE on the selection-threading gap (docs/SELECTION_THREADING_AUDIT.md): the creator's SELECTED
// subset has no home on Product yet, and the Studio reads the FULL flavor pool. This seed gives the
// product 6 flavors; once the loader is scoped to the selection, seed/select a 2-of-6 subset to
// prove the threading.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PRODUCT_ID = process.env.SEED_PRODUCT_ID ?? 'cmr777pjk0001dmtadu9kair7'

const FLAVORS = [
  { name: 'Strawberry', swatchHex: '#E5567A' },
  { name: 'Vanilla', swatchHex: '#E8D9A0' },
  { name: 'Chocolate', swatchHex: '#5C3317' },
  { name: 'Mango', swatchHex: '#F2A93B' },
  { name: 'Blueberry', swatchHex: '#4B6CB7' },
  { name: 'Matcha', swatchHex: '#7CB342' },
]

async function main() {
  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { id: true, brandId: true, marketId: true, productTemplateId: true, variantId: true },
  })
  if (!product) throw new Error(`No Product with id ${PRODUCT_ID}.`)
  if (!product.productTemplateId) throw new Error(`Product ${PRODUCT_ID} has no productTemplateId — bind a template first.`)
  const templateId = product.productTemplateId

  // --- Prereq lookups -------------------------------------------------------
  const profile =
    (await prisma.packingProfile.findFirst({ where: { slug: 'multi-flavor-mixed' }, select: { id: true } })) ??
    (await prisma.packingProfile.findFirst({ where: { flavorMode: 'MULTI', isActive: true }, select: { id: true } }))
  if (!profile) throw new Error('No MULTI PackingProfile — run seed-packing-types first.')

  const market =
    (product.marketId ? { id: product.marketId } : null) ??
    (await prisma.market.findFirst({ where: { code: 'US' }, select: { id: true } })) ??
    (await prisma.market.findFirst({ select: { id: true } }))
  if (!market) throw new Error('No Market row — run the markets seed first.')

  const ingredients = await prisma.ingredient.findMany({ take: 6, orderBy: { name: 'asc' }, select: { id: true } })
  if (ingredients.length === 0) throw new Error('No Ingredient rows — run the ingredient seed first.')

  const dieCut = await prisma.dieCutTemplate.findFirst({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true } })
  const packagingType = await (
    prisma as unknown as { packagingType: { findFirst: (a: unknown) => Promise<{ id: string } | null> } }
  ).packagingType
    .findFirst({ where: { status: 'ACTIVE' }, orderBy: { displayName: 'asc' }, select: { id: true } })
    .catch(() => null)

  // --- 1. Template → MULTI variety pack + published -------------------------
  await prisma.productTemplate.update({
    where: { id: templateId },
    data: { packingProfileId: profile.id, maxFlavorsPerPack: 4, status: 'PUBLISHED' },
  })

  // --- 2. FlavorPresets (idempotent replace of these names) -----------------
  const names = FLAVORS.map((f) => f.name)
  await prisma.flavorPreset.deleteMany({ where: { productTemplateId: templateId, name: { in: names } } })
  await prisma.flavorPreset.createMany({
    data: FLAVORS.map((f, i) => ({
      productTemplateId: templateId,
      name: f.name,
      statementOfIdentity: `${f.name} Flavored Drink Mix`,
      swatchHex: f.swatchHex,
      slotResolution: [],
      // DISTINCT per-flavor extras — different ingredients (offset by i) + varied quantities — so the
      // per-flavor Facts panels + recipe lists visibly DIFFER when testing the Product-picture modal.
      extras: [
        { ingredientId: ingredients[(i + 1) % ingredients.length]!.id, name: `${f.name} base note`, qty: 4 + i * 3, unit: 'g' },
        { ingredientId: ingredients[(i + 3) % ingredients.length]!.id, name: `${f.name} accent`, qty: 1 + i, unit: 'g' },
      ],
      status: 'ACTIVE',
      sortOrder: i,
    })),
  })

  // --- 3. Variant (container + die-cut + packaging type) --------------------
  const existingVariant =
    (product.variantId ? { id: product.variantId } : null) ??
    (await prisma.productTemplateVariant.findFirst({ where: { productTemplateId: templateId }, select: { id: true } }))
  const variantData = {
    flavor: null as string | null,
    containerFormat: '355 mL can',
    containerSizeG: 355,
    servingsPerContainer: 1,
    servingSizeG: 355,
    servingSizeDesc: '1 can (355 mL)',
    netContentValue: 355,
    netContentUnit: 'mL',
    netContentDisplay: '12 fl oz (355 mL)',
    sku: `FULL-${PRODUCT_ID.slice(0, 8)}`,
    moqMin: 500,
    moqMax: 20000,
    leadTimeDays: 21,
    shelfLifeDays: 365,
    dieCutTemplateId: dieCut?.id ?? null,
    ...(packagingType ? { packagingTypeId: packagingType.id } : {}),
  }
  const variantId = existingVariant
    ? (await prisma.productTemplateVariant.update({ where: { id: existingVariant.id }, data: variantData, select: { id: true } })).id
    : (await prisma.productTemplateVariant.create({ data: { productTemplateId: templateId, ...variantData }, select: { id: true } })).id

  // --- 4. Bind variant + market + category onto the Product -----------------
  await prisma.product.update({
    where: { id: product.id },
    data: { variantId, marketId: market.id, category: 'FOOD', status: 'PUBLISHED' },
  })

  // --- 5. Volume pricing tiers (idempotent replace) -------------------------
  await prisma.productTemplatePricingTier.deleteMany({ where: { productTemplateId: templateId } })
  await prisma.productTemplatePricingTier.createMany({
    data: [
      { productTemplateId: templateId, sortOrder: 0, minQty: 500, maxQty: 999, perUnitCostCents: 535, perUnitFloorCents: 480 },
      { productTemplateId: templateId, sortOrder: 1, minQty: 1000, maxQty: 4999, perUnitCostCents: 460, perUnitFloorCents: 410 },
      { productTemplateId: templateId, sortOrder: 2, minQty: 5000, maxQty: null, perUnitCostCents: 395, perUnitFloorCents: 350 },
    ],
  })

  // --- 6. Recipe + ingredients ---------------------------------------------
  const recipe = await prisma.recipe.upsert({
    where: { productId: product.id },
    update: { servingSizeG: 30, servingsPerContainer: 10 },
    create: { productId: product.id, servingSizeG: 30, servingsPerContainer: 10 },
    select: { id: true },
  })
  await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } })
  await prisma.recipeIngredient.createMany({
    data: ingredients.slice(0, 4).map((ing, i) => ({ recipeId: recipe.id, ingredientId: ing.id, weightG: 100 - i * 10, position: i })),
  })

  console.log('\n✅ Full product seeded.')
  console.log(`   Product : ${PRODUCT_ID}`)
  console.log(`   Template: ${templateId} → MULTI · 6 flavors · 3 pricing tiers`)
  console.log(`   Variant : ${variantId} (355 mL can · die-cut ${dieCut?.id ?? 'none'} · packaging ${packagingType?.id ?? 'none'})`)
  console.log('   Studio  : http://localhost:3000/products/' + PRODUCT_ID + '/design/canvas')
  console.log('   Checkout: http://localhost:3000/products/' + PRODUCT_ID + '/checkout\n')
  console.log('   ⚠ Selection threading gap: the Studio still shows all 6 flavors (not the creator\'s subset).')
  console.log('     See docs/SELECTION_THREADING_AUDIT.md — Code must scope the loader to the selection.\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
