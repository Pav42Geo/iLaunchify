// #37 ground truth (read-only): why does a variety pack charge $0 for production?
// A pack prices on its BASIS (no fallback to the band): PER_FLAVOR sums the flavors'
// unitPriceCents, PER_PACK uses the variant's pricePerPackCents. So a pack is unpriced
// (production $0) when the basis's price source isn't authored. Show, per variety
// product: the basis, each flavor's unit price, and each pack variant's pack price.
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/check-variety-pricing.ts

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const templates = await (prisma as unknown as {
    productTemplate: {
      findMany: (a: unknown) => Promise<Array<{
        name: string
        slug: string
        pricingBasis: string | null
        flavorPresets: Array<{ name: string; unitPriceCents: number | null; status: string }>
        variants: Array<{ flavor: string | null; unitsPerPack: number | null; pricePerPackCents: number | null; isActive: boolean }>
      }>>
    }
  }).productTemplate.findMany({
    where: { maxFlavorsPerPack: { not: null } },
    orderBy: { name: 'asc' },
    select: {
      name: true,
      slug: true,
      pricingBasis: true,
      flavorPresets: { where: { status: 'ACTIVE' }, select: { name: true, unitPriceCents: true, status: true } },
      variants: { where: { isActive: true, flavor: null }, select: { flavor: true, unitsPerPack: true, pricePerPackCents: true, isActive: true } },
    },
  })

  for (const t of templates) {
    const basis = t.pricingBasis ?? 'PER_FLAVOR (default)'
    console.log(`\n${t.name}  [${t.slug}]  basis: ${basis}`)

    const flavorsPriced = t.flavorPresets.filter((f) => (f.unitPriceCents ?? 0) > 0).length
    console.log(`   flavor prices: ${flavorsPriced}/${t.flavorPresets.length} authored`)
    for (const f of t.flavorPresets) {
      console.log(`     - ${f.name}: ${f.unitPriceCents != null ? `${(f.unitPriceCents / 100).toFixed(2)}` : '— (unpriced)'}`)
    }
    const packsPriced = t.variants.filter((v) => (v.pricePerPackCents ?? 0) > 0).length
    console.log(`   pack prices: ${packsPriced}/${t.variants.length} authored`)
    for (const v of t.variants) {
      console.log(`     - ${v.unitsPerPack}-pack: ${v.pricePerPackCents != null ? `${(v.pricePerPackCents / 100).toFixed(2)}/pack` : '— (no pack price)'}`)
    }

    // Verdict: would this pack price to $0?
    const usesFlavor = (t.pricingBasis ?? 'PER_FLAVOR') === 'PER_FLAVOR'
    const broken = usesFlavor ? flavorsPriced === 0 : packsPriced === 0
    console.log(`   => ${broken ? 'CHARGES $0 for goods (basis price source unauthored)' : 'goods priced OK'}`)
  }
  console.log('')
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
