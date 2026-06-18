// Variety-pack demo seed (2026-06-14). Turns ONE real FOOD ProductTemplate into a
// multi-flavor variety pack so the creator pack-builder is testable end-to-end:
//   • sets packingProfileId → a MULTI PackingProfile (flavorMode = MULTI)
//   • sets maxFlavorsPerPack = 4
//   • creates 4 ACTIVE FlavorPresets, each with a distinct `extras` ingredient so
//     the live multi-column Nutrition Facts preview shows DIFFERENT columns.
//
// Idempotent: re-running re-points the same template + replaces the demo flavors.
// Target a specific template with VARIETY_DEMO_SLUG=<slug>; otherwise it picks the
// first PUBLISHED FOOD template (falling back to any FOOD template).
//
// Run (needs the OrderItemFlavor migration applied first — pnpm --filter
// @ilaunchify/db push):
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- \
//     tsx prisma/seed-variety-demo.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEMO_FLAVORS = [
  { name: 'Strawberry', swatchHex: '#E5567A' },
  { name: 'Vanilla', swatchHex: '#E8D9A0' },
  { name: 'Chocolate', swatchHex: '#5C3317' },
  { name: 'Mango', swatchHex: '#F2A93B' },
]

async function main() {
  // 1. A MULTI packing profile (prefer the "mixed" one; fall back to any MULTI).
  const profile =
    (await prisma.packingProfile.findFirst({ where: { slug: 'multi-flavor-mixed' } })) ??
    (await prisma.packingProfile.findFirst({ where: { flavorMode: 'MULTI', isActive: true } }))
  if (!profile) throw new Error('No MULTI PackingProfile found — run the main seed first (seed-packing-types).')

  // 2. The target FOOD template.
  const slug = process.env.VARIETY_DEMO_SLUG
  const template =
    (slug
      ? await prisma.productTemplate.findUnique({ where: { slug }, include: { subcategory: { include: { category: true } } } })
      : null) ??
    (await prisma.productTemplate.findFirst({
      where: { labelingType: 'FOOD', status: 'PUBLISHED' },
      include: { subcategory: { include: { category: true } } },
      orderBy: { name: 'asc' },
    })) ??
    (await prisma.productTemplate.findFirst({
      where: { labelingType: 'FOOD' },
      include: { subcategory: { include: { category: true } } },
      orderBy: { name: 'asc' },
    }))
  if (!template) throw new Error('No FOOD ProductTemplate found — run the main catalog seed first.')

  // 3. Three+ ingredients to use as per-flavor extras (so columns differ).
  const ingredients = await prisma.ingredient.findMany({
    take: DEMO_FLAVORS.length,
    orderBy: { name: 'asc' },
    select: { id: true, name: true, internalName: true, labelDeclarationName: true },
  })
  if (ingredients.length === 0) throw new Error('No Ingredient rows found — run the catalog/ingredient seed first.')

  // 4. Point the template at the MULTI profile + set the flavor cap.
  await prisma.productTemplate.update({
    where: { id: template.id },
    data: { packingProfileId: profile.id, maxFlavorsPerPack: 4 },
  })

  // 5. Replace the demo flavors (idempotent) with per-flavor extras.
  const demoNames = DEMO_FLAVORS.map((f) => f.name)
  await prisma.flavorPreset.deleteMany({ where: { productTemplateId: template.id, name: { in: demoNames } } })
  await prisma.flavorPreset.createMany({
    data: DEMO_FLAVORS.map((f, i) => {
      const ing = ingredients[i % ingredients.length]!
      return {
        productTemplateId: template.id,
        name: f.name,
        statementOfIdentity: `${f.name} Flavored ${template.name}`,
        swatchHex: f.swatchHex,
        slotResolution: [],
        // A small flavor-only ingredient line → distinct nutrition column per flavor.
        extras: [{ ingredientId: ing.id, name: ing.internalName ?? ing.name, qty: 5, unit: 'g' }],
        status: 'ACTIVE',
        sortOrder: i,
      }
    }),
  })

  const cat = template.subcategory?.category?.slug
  const sub = template.subcategory?.slug
  const url = cat && sub ? `/marketplace/${cat}/${sub}/${template.slug}` : `(template slug: ${template.slug})`
  console.log('\n✅ Variety-pack demo ready.')
  console.log(`   Template : ${template.name} (${template.slug}) · status ${template.status}`)
  console.log(`   Profile  : ${profile.name} (flavorMode MULTI) · maxFlavorsPerPack 4`)
  console.log(`   Flavors  : ${demoNames.join(', ')}`)
  console.log(`   Marketplace detail (PackBuilder + live quote): ${url}`)
  console.log('   To see the live LABEL preview: customise this product as a creator, then')
  console.log('   open Checkout → Step 2 (Production). The pack-builder + variety panel render there.\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
