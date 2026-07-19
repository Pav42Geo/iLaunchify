// #34 (2026-07-19): apply the pack sizes the SEED already declares to the stale
// variant rows in the live DB, and clean the Hot Sauce pollution. PRECISE, not
// parsed from format strings: the SKU encodes the size (...-6PK / -12PK / -24PK /
// -2PK / -4PK), so unitsPerPack comes straight from the SKU. moqMin is currently
// UNITS-scaled; converting to PACKS (moqUnits / unitsPerPack) reproduces the seed's
// authored moqPacks exactly (verified: Sparkling 1200/6=200, 1440/12=120, 1440/24=60).
//
// pricePerPackCents is already set where the seed declares it (Sparkling, Dog Treats),
// so we only fill unitsPerPack + the packs MOQ. Idempotent (skips already-correct rows).
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/patch-variety-pack-sizes.ts

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Trailing "-<N>PK" of a SKU = the pack size. Null when the SKU carries no pack size.
function packSizeFromSku(sku: string | null): number | null {
  if (!sku) return null
  const m = sku.match(/-(\d+)PK$/i)
  if (!m) return null
  const n = parseInt(m[1]!, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

async function main() {
  // 1. Author unitsPerPack (from the SKU) + convert moqMin -> packs on the flavor-null
  //    pack variants of multi-flavor templates.
  const variants = await prisma.productTemplateVariant.findMany({
    where: { flavor: null, isActive: true, productTemplate: { maxFlavorsPerPack: { not: null } } },
    select: {
      id: true,
      sku: true,
      unitsPerPack: true,
      moqMin: true,
      productTemplate: { select: { name: true } },
    },
  })

  let authored = 0
  for (const v of variants) {
    const units = packSizeFromSku(v.sku)
    if (!units) continue // no -NPK suffix -> not a pack size variant (e.g. Hot Sauce)
    if (v.unitsPerPack === units) continue // already correct (idempotent)
    const moqPacks = Math.max(1, Math.round((v.moqMin || units) / units))
    await prisma.productTemplateVariant.update({
      where: { id: v.id },
      data: { unitsPerPack: units, moqMin: moqPacks },
    })
    console.log(`  ✓ ${v.productTemplate?.name} · ${v.sku} -> unitsPerPack ${units}, moq ${moqPacks} packs`)
    authored++
  }

  // 2. Hot Sauce (starter-hot-sauce) is NOT a variety product; strip the spurious
  //    maxFlavorsPerPack that the standalone seed-variety-demo script stamped on it.
  const hot = await prisma.productTemplate.updateMany({
    where: { slug: 'starter-hot-sauce', maxFlavorsPerPack: { not: null } },
    data: { maxFlavorsPerPack: null },
  })
  if (hot.count) console.log(`  ↩ Hot Sauce: cleared spurious maxFlavorsPerPack (single-flavor, not a variety product)`)

  console.log(`\nAuthored ${authored} pack size(s); cleaned ${hot.count} polluted template(s).`)
  if (authored === 0 && hot.count === 0) console.log('(nothing to do, everything already correct)')
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
