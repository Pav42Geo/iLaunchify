// Variety-pack demo seed (2026-06-14). Gives you a GUARANTEED end-to-end test of
// the creator pack-builder by ensuring a creator-owned FOOD product whose template
// is a multi-flavor variety pack, then printing its checkout URL.
//
// What it does (idempotent):
//   1. Converts a FOOD ProductTemplate → MULTI packing profile + maxFlavorsPerPack 4
//      + 4 ACTIVE FlavorPresets (distinct per-flavor extras → different label columns).
//   2. Ensures the demo creator (by email) has a CreatorProfile + Brand.
//   3. Ensures that creator OWNS a Product of that template, with a Recipe (so the
//      live multi-column Nutrition Facts preview renders).
//   4. Prints the creator checkout URL (open it → Step 2 → the pack-builder + label).
//
// NOTE: the marketing marketplace detail page is fixture-driven (not DB-wired), so a
// seeded product won't appear there — the builder's real home is the CREATOR checkout.
//
// Set the owner with VARIETY_DEMO_EMAIL. The owner's User must already exist (log into
// the creator app once). Run (apply the migration first: pnpm --filter @ilaunchify/db push):
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/seed-variety-demo.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEMO_FLAVORS = [
  { name: 'Strawberry', swatchHex: '#E5567A' },
  { name: 'Vanilla', swatchHex: '#E8D9A0' },
  { name: 'Chocolate', swatchHex: '#5C3317' },
  { name: 'Mango', swatchHex: '#F2A93B' },
]
const EMAIL = process.env.VARIETY_DEMO_EMAIL ?? 'georgiev.pavel@gmail.com'
const PRODUCT_SLUG = 'variety-demo-pack'

async function main() {
  // --- 1. MULTI packing profile + a FOOD template ---------------------------
  const profile =
    (await prisma.packingProfile.findFirst({ where: { slug: 'multi-flavor-mixed' } })) ??
    (await prisma.packingProfile.findFirst({ where: { flavorMode: 'MULTI', isActive: true } }))
  if (!profile) throw new Error('No MULTI PackingProfile found — run seed-packing-types first.')

  const template =
    (await prisma.productTemplate.findFirst({ where: { labelingType: 'FOOD', status: 'PUBLISHED' }, orderBy: { name: 'asc' } })) ??
    (await prisma.productTemplate.findFirst({ where: { labelingType: 'FOOD' }, orderBy: { name: 'asc' } }))
  if (!template) throw new Error('No FOOD ProductTemplate found — run the catalog seed first.')

  // --- 2. Owner: User (must exist) → CreatorProfile → Brand -----------------
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } })
  if (!user) throw new Error(`No User with email ${EMAIL}. Log into the creator app (localhost:3000) once, then re-run. Or set VARIETY_DEMO_EMAIL.`)

  const creatorProfile = await prisma.creatorProfile.upsert({
    where: { userId: user.id },
    update: {},
    // handle is a required UNIQUE slug — derive it from the user id so re-runs +
    // multiple owners never collide.
    create: { userId: user.id, displayName: 'Demo Creator', handle: `demo-${user.id.slice(0, 12)}` },
    select: { id: true },
  })
  const brand =
    (await prisma.brand.findFirst({ where: { creatorProfileId: creatorProfile.id }, select: { id: true } })) ??
    (await prisma.brand.create({
      data: { creatorProfileId: creatorProfile.id, name: 'Demo Brand', handle: `demo-brand-${creatorProfile.id.slice(0, 10)}` },
      select: { id: true },
    }))

  const market =
    (await prisma.market.findFirst({ where: { code: 'US' }, select: { id: true } })) ??
    (await prisma.market.findFirst({ select: { id: true } }))
  if (!market) throw new Error('No Market row found — run the markets seed first.')

  // --- 3. Three ingredients for the recipe + flavor extras ------------------
  const ingredients = await prisma.ingredient.findMany({ take: 4, orderBy: { name: 'asc' }, select: { id: true } })
  if (ingredients.length === 0) throw new Error('No Ingredient rows found — run the ingredient seed first.')

  // --- 4. Convert the template to a variety pack ----------------------------
  await prisma.productTemplate.update({
    where: { id: template.id },
    data: { packingProfileId: profile.id, maxFlavorsPerPack: 4 },
  })
  const demoNames = DEMO_FLAVORS.map((f) => f.name)
  await prisma.flavorPreset.deleteMany({ where: { productTemplateId: template.id, name: { in: demoNames } } })
  await prisma.flavorPreset.createMany({
    data: DEMO_FLAVORS.map((f, i) => ({
      productTemplateId: template.id,
      name: f.name,
      statementOfIdentity: `${f.name} Flavored ${template.name}`,
      swatchHex: f.swatchHex,
      slotResolution: [],
      extras: [{ ingredientId: ingredients[i % ingredients.length]!.id, name: `${f.name} note`, qty: 5, unit: 'g' }],
      status: 'ACTIVE',
      sortOrder: i,
    })),
  })

  // --- 5. Ensure the owned Product (+ recipe) -------------------------------
  const existing = await prisma.product.findFirst({ where: { brandId: brand.id, slug: PRODUCT_SLUG }, select: { id: true } })
  const product = existing
    ? await prisma.product.update({
        where: { id: existing.id },
        data: { productTemplateId: template.id, marketId: market.id, status: 'PUBLISHED', category: 'FOOD' },
        select: { id: true },
      })
    : await prisma.product.create({
        data: {
          brandId: brand.id,
          marketId: market.id,
          slug: PRODUCT_SLUG,
          name: `${template.name} Variety Pack`,
          category: 'FOOD',
          status: 'PUBLISHED',
          productTemplateId: template.id,
        },
        select: { id: true },
      })

  const recipe = await prisma.recipe.upsert({
    where: { productId: product.id },
    update: { servingSizeG: 30, servingsPerContainer: 10 },
    create: { productId: product.id, servingSizeG: 30, servingsPerContainer: 10 },
    select: { id: true },
  })
  await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } })
  await prisma.recipeIngredient.createMany({
    data: ingredients.slice(0, 3).map((ing, i) => ({ recipeId: recipe.id, ingredientId: ing.id, weightG: 100 - i * 10, position: i })),
  })

  console.log('\n✅ Variety-pack demo ready.')
  console.log(`   Template : ${template.name} (${template.slug}) → MULTI, 4 flavors`)
  console.log(`   Owner    : ${EMAIL} · brand ${brand.id}`)
  console.log(`   Product  : ${template.name} Variety Pack (id ${product.id})`)
  console.log('\n   ▶ Open the CREATOR checkout, then go to Step 2 (Production):')
  console.log(`     http://localhost:3000/products/${product.id}/checkout`)
  console.log('     The "Build your variety pack" picker + live multi-column Nutrition Facts')
  console.log('     render there. (Pay needs the OrderItemFlavor migration applied.)\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
