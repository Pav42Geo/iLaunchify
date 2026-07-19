// #37 (2026-07-19): Daily Greens Sachets charges $0 for goods. It's PER_FLAVOR
// (default) with no authored flavor prices, so its pack subtotal sums to 0 (a pack
// prices on its basis, never the band). Author the per-sachet goods price = the
// tier's per-unit cost (260c), so a pack order charges the same goods a non-pack
// order would at the band, instead of nothing. Sets pricingBasis PER_FLAVOR explicit
// + each active flavor's unitPriceCents. Idempotent. Mirrors the seed-demo-catalog fix.
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/patch-daily-greens-pricing.ts

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const PER_SACHET_CENTS = 260

async function main() {
  const t = await prisma.productTemplate.findUnique({
    where: { slug: 'demo-greens-sachets' },
    select: {
      id: true,
      flavorPresets: { where: { status: 'ACTIVE' }, select: { id: true, name: true, unitPriceCents: true } },
    },
  })
  if (!t) {
    console.log('demo-greens-sachets not found')
    return
  }

  // pricingBasis + unitPriceCents are the additive pack columns getVarietyPackMatrix
  // reads via a cast; write them via a cast too so a pre-typed client can't block it.
  await (prisma as unknown as {
    productTemplate: { update: (a: unknown) => Promise<unknown> }
  }).productTemplate.update({
    where: { id: t.id },
    data: { pricingBasis: 'PER_FLAVOR' },
  })

  let n = 0
  for (const f of t.flavorPresets) {
    if ((f.unitPriceCents ?? 0) === PER_SACHET_CENTS) continue
    await (prisma as unknown as {
      flavorPreset: { update: (a: unknown) => Promise<unknown> }
    }).flavorPreset.update({
      where: { id: f.id },
      data: { unitPriceCents: PER_SACHET_CENTS },
    })
    console.log(`  ✓ ${f.name}: unitPriceCents ${PER_SACHET_CENTS} ($${(PER_SACHET_CENTS / 100).toFixed(2)}/sachet)`)
    n++
  }
  console.log(`\nSet pricingBasis PER_FLAVOR + authored ${n} flavor price(s) on Daily Greens.`)
  if (n === 0) console.log('(flavors already priced)')
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
