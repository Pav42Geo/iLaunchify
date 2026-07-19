// #37 gate check (read-only): mirror templateIsPriced (bands + pack-basis) across every
// PUBLISHED template, so we confirm the extended gate doesn't wrongly BLOCK an existing
// product on a future re-publish, and DOES flag an unpriced variety pack.
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/check-price-gate.ts

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const templates = await prisma.productTemplate.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      maxFlavorsPerPack: true,
      pricingBasis: true,
      flavorPresets: { where: { status: 'ACTIVE' }, select: { unitPriceCents: true } },
      variants: { where: { isActive: true }, select: { unitsPerPack: true, pricePerPackCents: true } },
    },
  })

  for (const t of templates) {
    const bands = await prisma.productTemplatePricingTier.count({ where: { productTemplateId: t.id } })
    const reasons: string[] = []
    if (bands === 0) reasons.push('no volume bands')

    if (t.maxFlavorsPerPack != null) {
      const basis = t.pricingBasis ?? 'PER_FLAVOR'
      if (basis === 'PER_FLAVOR') {
        const flavors = t.flavorPresets
        if (flavors.length === 0) reasons.push('PER_FLAVOR but no active flavors')
        else if (flavors.some((f) => (f.unitPriceCents ?? 0) <= 0)) reasons.push('PER_FLAVOR with unpriced flavor(s)')
      } else {
        const sizes = t.variants.filter((v) => (v.unitsPerPack ?? 0) > 0)
        if (sizes.length === 0) reasons.push('PER_PACK but no pack sizes')
        else if (sizes.some((v) => (v.pricePerPackCents ?? 0) <= 0)) reasons.push('PER_PACK with unpriced pack size(s)')
      }
    }

    const passes = reasons.length === 0
    const kind = t.maxFlavorsPerPack != null ? `pack/${t.pricingBasis ?? 'PER_FLAVOR (default)'}` : 'single'
    console.log(`${passes ? '✓ publishable' : '✗ BLOCKED   '}  ${t.name}  [${kind}]${passes ? '' : '  <- ' + reasons.join(', ')}`)
  }
  console.log('')
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
