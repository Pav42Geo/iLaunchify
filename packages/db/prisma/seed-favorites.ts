// Seed a handful of Favorites for the demo creator so the favorites surfaces
// (header peek dropdown, /favorites page, marketplace hearts) have real data to
// eyeball (docs/FAVORITES_MANAGEMENT.md). Idempotent — safe to re-run.
//
// Favorites a few PUBLISHED ProductTemplates (Marketplace tab) and, when the
// creator already owns Products, a couple of those too (My products tab).
//
// Prereqs: run migrations + the catalog seed first (needs PUBLISHED templates).
//
// Run on the Mac (after db:push + db:generate):
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/seed-favorites.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const EMAIL = process.env.FAVORITES_DEMO_EMAIL ?? 'sample-creator@ilaunchify.dev'
const TEMPLATE_COUNT = 4
const PRODUCT_COUNT = 2

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true },
  })
  if (!user) {
    throw new Error(
      `No User with email ${EMAIL}. Run the base seed (pnpm db:seed) first, or set FAVORITES_DEMO_EMAIL.`,
    )
  }

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!profile) {
    throw new Error(`User ${EMAIL} has no CreatorProfile. Run the base seed first.`)
  }
  const creatorId = profile.id

  // --- Marketplace favorites: a few PUBLISHED templates ---------------------
  const templates = await prisma.productTemplate.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    take: TEMPLATE_COUNT,
    select: { id: true, name: true },
  })
  if (templates.length === 0) {
    console.warn('[seed-favorites] No PUBLISHED ProductTemplates found — skipping template favorites.')
  }

  for (const t of templates) {
    await prisma.favorite.upsert({
      where: { creatorId_productTemplateId: { creatorId, productTemplateId: t.id } },
      update: {},
      create: { creatorId, kind: 'PRODUCT_TEMPLATE', productTemplateId: t.id },
    })
    console.log(`[seed-favorites] ★ template: ${t.name}`)
  }

  // --- My-products favorites: a couple of the creator's own Products --------
  const ownProducts = await prisma.product.findMany({
    where: { brand: { creatorProfileId: creatorId } },
    orderBy: { updatedAt: 'desc' },
    take: PRODUCT_COUNT,
    select: { id: true, name: true },
  })
  if (ownProducts.length === 0) {
    console.warn(
      '[seed-favorites] Creator owns no Products yet — skipping product favorites. ' +
        '(Run seed-owned-products.ts with this creator to populate the "My products" tab.)',
    )
  }

  for (const p of ownProducts) {
    await prisma.favorite.upsert({
      where: { creatorId_productId: { creatorId, productId: p.id } },
      update: {},
      create: { creatorId, kind: 'PRODUCT', productId: p.id },
    })
    console.log(`[seed-favorites] ★ product:  ${p.name}`)
  }

  const total = await prisma.favorite.count({ where: { creatorId } })
  console.log(
    `[seed-favorites] Done. ${EMAIL} now has ${total} favorite${total === 1 ? '' : 's'} ` +
      `(${templates.length} template${templates.length === 1 ? '' : 's'}, ${ownProducts.length} product${ownProducts.length === 1 ? '' : 's'}).`,
  )
}

main()
  .catch((err) => {
    console.error('[seed-favorites] failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
