// One full owned Product per ProductTemplate (2026-07-04) — so EVERY catalog product is testable
// in the Design Studio + checkout with real data, without launching from the marketplace.
//
// For each PUBLISHED ProductTemplate it ensures the demo creator OWNS a Product bound to that
// template's first active variant, with a Recipe + ingredients, and (for multi-flavor templates) a
// SELECTED flavor subset (first 2–3 FlavorPresets) so the selection-threading + Product-picture modal
// can be tested end-to-end. Idempotent.
//
// Prereqs: run seed-backfill-full.ts FIRST (gives templates their variants' packagingType + pricing +
// FlavorPresets). Owner via VARIETY_DEMO_BRAND_ID (preferred) or VARIETY_DEMO_EMAIL → CreatorProfile.
//
// Run on the Mac (after migrations):
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/seed-owned-products.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const EMAIL = process.env.VARIETY_DEMO_EMAIL ?? 'georgiev.pavel@gmail.com'

function categoryFor(labelingType: string | null): 'FOOD' | 'SUPPLEMENT' | 'COSMETIC' | 'PET' | 'BEVERAGE_FUNCTIONAL' {
  switch (labelingType) {
    case 'DIETARY_SUPPLEMENT': return 'SUPPLEMENT'
    case 'COSMETIC': return 'COSMETIC'
    case 'PET_PRODUCT': return 'PET'
    default: return 'FOOD'
  }
}

async function main() {
  // ---- owner brand + market + ingredients ----------------------------------
  const brandIdEnv = process.env.VARIETY_DEMO_BRAND_ID
  let brandId: string
  if (brandIdEnv) {
    const b = await prisma.brand.findUnique({ where: { id: brandIdEnv }, select: { id: true } })
    if (!b) throw new Error(`No Brand with id ${brandIdEnv}.`)
    brandId = b.id
  } else {
    const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } })
    if (!user) throw new Error(`No User with email ${EMAIL}. Set VARIETY_DEMO_BRAND_ID instead.`)
    const profile = await prisma.creatorProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, displayName: 'Demo Creator', handle: `demo-${user.id.slice(0, 12)}` },
      select: { id: true },
    })
    brandId =
      (await prisma.brand.findFirst({ where: { creatorProfileId: profile.id }, select: { id: true } }))?.id ??
      (await prisma.brand.create({ data: { creatorProfileId: profile.id, name: 'Demo Brand', handle: `demo-brand-${profile.id.slice(0, 10)}` }, select: { id: true } })).id
  }

  const market =
    (await prisma.market.findFirst({ where: { code: 'US' }, select: { id: true } })) ??
    (await prisma.market.findFirst({ select: { id: true } }))
  if (!market) throw new Error('No Market row — run the markets seed first.')

  const ingredients = await prisma.ingredient.findMany({ take: 6, orderBy: { name: 'asc' }, select: { id: true } })
  if (ingredients.length === 0) throw new Error('No Ingredient rows — run the ingredient seed first.')

  const templates = await prisma.productTemplate.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      id: true, name: true, slug: true, labelingType: true,
      variants: { where: { isActive: true }, take: 1, select: { id: true } },
      flavorPresets: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' }, select: { id: true } },
    },
  })

  let created = 0
  let updated = 0

  for (const t of templates) {
    const variant = t.variants[0]
    if (!variant) { console.warn(`  skip ${t.name} — no active variant`); continue }

    const slug = `demo-${t.slug}`
    const category = categoryFor(t.labelingType)
    const existing = await prisma.product.findFirst({ where: { brandId, slug }, select: { id: true } })

    const productId = existing
      ? (await prisma.product.update({
          where: { id: existing.id },
          data: { productTemplateId: t.id, variantId: variant.id, marketId: market.id, category, status: 'PUBLISHED' },
          select: { id: true },
        })).id
      : (await prisma.product.create({
          data: { brandId, marketId: market.id, slug, name: `${t.name} (demo)`, category, status: 'PUBLISHED', productTemplateId: t.id, variantId: variant.id },
          select: { id: true },
        })).id
    existing ? updated++ : created++

    // Recipe + ingredients.
    const recipe = await prisma.recipe.upsert({
      where: { productId },
      update: { servingSizeG: 30, servingsPerContainer: 10 },
      create: { productId, servingSizeG: 30, servingsPerContainer: 10 },
      select: { id: true },
    })
    await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } })
    await prisma.recipeIngredient.createMany({
      data: ingredients.slice(0, 4).map((ing, i) => ({ recipeId: recipe.id, ingredientId: ing.id, weightG: 100 - i * 12, position: i })),
    })

    // Selected flavor subset (first 2–3) — tests selection scoping. Cast-guarded (new column).
    if (t.flavorPresets.length >= 2) {
      const selected = t.flavorPresets.slice(0, Math.min(3, t.flavorPresets.length)).map((f) => f.id)
      await (prisma as unknown as { product: { update: (a: unknown) => Promise<unknown> } }).product
        .update({ where: { id: productId }, data: { selectedFlavorPresetIds: selected } })
        .catch(() => {})
    }
  }

  console.log('\n✅ Owned products seeded (one per template).')
  console.log(`   Templates: ${templates.length} · created ${created} · updated ${updated}`)
  console.log(`   Owner brand: ${brandId}`)
  console.log('   Open the Studio for any: http://localhost:3000/products/<id>/design/canvas')
  console.log('   (Multi-flavor templates get a 2–3 flavor SELECTED subset to test scoping.)\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
