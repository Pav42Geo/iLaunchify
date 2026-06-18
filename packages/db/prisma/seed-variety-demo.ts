// Variety-pack demo seed (2026-06-14). Makes the creator pack-builder testable by
// turning a FOOD ProductTemplate into a multi-flavor variety pack:
//   • packingProfileId → a MULTI PackingProfile (flavorMode = MULTI)
//   • maxFlavorsPerPack = 4
//   • 4 ACTIVE FlavorPresets, each with a distinct `extras` ingredient so the live
//     multi-column Nutrition Facts preview shows DIFFERENT columns per flavor.
//
// IMPORTANT: the marketing marketplace detail page is fixture-driven (hardcoded in
// apps/marketing/src/lib/sample-templates.ts) and NOT wired to the DB, so a seeded
// product won't appear there. The builder's real, DB-driven home is the CREATOR
// CHECKOUT. So this seed prefers a FOOD product you ALREADY OWN (so you can open its
// checkout directly) and converts ITS template. If you own no such product, it falls
// back to converting the first FOOD template and tells you to customise one first.
//
// Target the owner by email with VARIETY_DEMO_EMAIL (default: the project owner).
// Run (apply the migration first: pnpm --filter @ilaunchify/db push):
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

async function main() {
  const profile =
    (await prisma.packingProfile.findFirst({ where: { slug: 'multi-flavor-mixed' } })) ??
    (await prisma.packingProfile.findFirst({ where: { flavorMode: 'MULTI', isActive: true } }))
  if (!profile) throw new Error('No MULTI PackingProfile found — run seed-packing-types first.')

  // Prefer a FOOD product the demo creator already owns + that has a recipe (so the
  // live label preview renders). Its template becomes the variety pack.
  const ownedProduct = await prisma.product.findFirst({
    where: {
      brand: { creatorProfile: { user: { email: EMAIL } } },
      productTemplateId: { not: null },
      productTemplate: { labelingType: 'FOOD' },
      recipe: { ingredients: { some: {} } },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      productTemplateId: true,
      recipe: { select: { ingredients: { take: 4, select: { ingredientId: true } } } },
    },
  })

  let templateId: string | null = ownedProduct?.productTemplateId ?? null
  if (!templateId) {
    const template =
      (await prisma.productTemplate.findFirst({ where: { labelingType: 'FOOD', status: 'PUBLISHED' }, orderBy: { name: 'asc' } })) ??
      (await prisma.productTemplate.findFirst({ where: { labelingType: 'FOOD' }, orderBy: { name: 'asc' } }))
    if (!template) throw new Error('No FOOD ProductTemplate found — run the catalog seed first.')
    templateId = template.id
  }

  // Ingredient IDs for per-flavor extras — prefer the product's own recipe, top up
  // with global ingredients so we have one distinct extra per flavor.
  let extraIds = ownedProduct?.recipe?.ingredients.map((i) => i.ingredientId) ?? []
  if (extraIds.length < DEMO_FLAVORS.length) {
    const more = await prisma.ingredient.findMany({ take: DEMO_FLAVORS.length, orderBy: { name: 'asc' }, select: { id: true } })
    extraIds = [...new Set([...extraIds, ...more.map((m) => m.id)])]
  }
  if (extraIds.length === 0) throw new Error('No Ingredient rows found — run the ingredient seed first.')

  const tmpl = await prisma.productTemplate.update({
    where: { id: templateId },
    data: { packingProfileId: profile.id, maxFlavorsPerPack: 4 },
    select: { name: true, slug: true },
  })

  const demoNames = DEMO_FLAVORS.map((f) => f.name)
  await prisma.flavorPreset.deleteMany({ where: { productTemplateId: templateId, name: { in: demoNames } } })
  await prisma.flavorPreset.createMany({
    data: DEMO_FLAVORS.map((f, i) => ({
      productTemplateId: templateId!,
      name: f.name,
      statementOfIdentity: `${f.name} Flavored ${tmpl.name}`,
      swatchHex: f.swatchHex,
      slotResolution: [],
      extras: [{ ingredientId: extraIds[i % extraIds.length], name: `${f.name} note`, qty: 5, unit: 'g' }],
      status: 'ACTIVE',
      sortOrder: i,
    })),
  })

  console.log('\n✅ Variety-pack demo ready.')
  console.log(`   Template : ${tmpl.name} (${tmpl.slug}) → MULTI, maxFlavorsPerPack 4`)
  console.log(`   Flavors  : ${demoNames.join(', ')}`)
  if (ownedProduct) {
    console.log(`\n   ▶ Open the CREATOR checkout for your owned product "${ownedProduct.name}":`)
    console.log(`     http://localhost:3000/products/${ownedProduct.id}/checkout`)
    console.log('     Go to Step 2 (Production) — the "Build your variety pack" picker + live')
    console.log('     multi-column Nutrition Facts render there. (Migration must be applied to PAY.)')
  } else {
    console.log(`\n   ⚠ No FOOD product owned by ${EMAIL} was found.`)
    console.log(`     Customise a product of template "${tmpl.name}" as a creator first, then open`)
    console.log('     its Checkout → Step 2. (Set VARIETY_DEMO_EMAIL to a different owner if needed.)')
  }
  console.log('')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
