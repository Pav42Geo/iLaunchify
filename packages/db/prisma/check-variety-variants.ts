// #34 ground truth (read-only): the REAL variant rows for every multi-flavor
// (variety) product, so we author pack sizes PRECISELY (by SKU) instead of parsing
// format strings, which mis-read sizes as counts. Shows unitsPerPack, SKU, active
// state, and whether there are stale duplicate variants to clean.
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/check-variety-variants.ts

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const templates = await prisma.productTemplate.findMany({
    where: { maxFlavorsPerPack: { not: null } },
    orderBy: { name: 'asc' },
    select: {
      name: true,
      slug: true,
      status: true,
      maxFlavorsPerPack: true,
      variants: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          sku: true,
          flavor: true,
          containerFormat: true,
          unitsPerPack: true,
          pricePerPackCents: true,
          moqMin: true,
          isActive: true,
        },
      },
    },
  })

  for (const t of templates) {
    const packVariants = t.variants.filter((v) => v.flavor === null)
    const authored = packVariants.filter((v) => (v.unitsPerPack ?? 0) > 0)
    console.log(`\n${t.name}  [${t.slug}]  status ${t.status}  maxFlavors ${t.maxFlavorsPerPack}`)
    console.log(`   ${t.variants.length} variants · ${packVariants.length} flavor-null · ${authored.length} with a pack size`)
    for (const v of t.variants) {
      const dot = v.isActive ? '●' : '○'
      const flavor = v.flavor ?? '(no flavor)'
      const up = v.unitsPerPack != null ? `unitsPerPack ${v.unitsPerPack}` : 'unitsPerPack —'
      const pp = v.pricePerPackCents != null ? `$${(v.pricePerPackCents / 100).toFixed(2)}/pack` : 'no pack price'
      console.log(`     ${dot} ${flavor} · "${v.containerFormat}" · ${up} · ${pp} · moq ${v.moqMin} · sku ${v.sku ?? '—'}`)
    }
  }
  console.log('')
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
