// =============================================================================
// NON-PACK FLAVOR-DELTA PARITY REPORT.
//
// WHY THIS EXISTS. The non-pack flavor delta must appear in the charge EXACTLY as
// the PDP shows it (PP-0: PDP === estimate === charge). The unit pin in
// packages/plans/src/goods-basis.test.ts proves the SSOT arithmetic; this proves
// it over the REAL seeded rows (tiers + the premium preset's priceDeltaCents), per
// quantity, so a human can eyeball parity before placing a real Stripe order.
//
// Run:  pnpm --filter @ilaunchify/db seed:flavor-delta   (seed the fixture first)
//       pnpm --filter @ilaunchify/db report:flavor-delta
//
// The three pricing formulas are REPRODUCED inline (like scripts/pp0-delta-report),
// not imported: @ilaunchify/plans depends on @ilaunchify/db, so importing it here
// would be a package cycle. They are pinned line-for-line to source below; if the
// SSOT changes and this drifts, the report lies, so keep them in sync.
// =============================================================================

import { PrismaClient } from '@prisma/client'
import { FLAVOR_DELTA_SLUG } from './seed-flavor-delta-fixture'

type Band = { minQty: number; perUnitCents: number }

// pickPricingBand — packages/plans/src/pricing-band.ts: the HIGHEST band whose
// minQty <= units. (pickPricingBandIndex + the band it selects.)
function pickPerUnitCents(bands: readonly Band[], units: number): number | null {
  let found: Band | null = null
  for (const b of bands) if (b.minQty <= units) found = b // bands are ascending by minQty
  return found ? found.perUnitCents : null
}

// tierGoodsCents — packages/plans/src/pricing-band.ts:128 :
//   max(0, round(band.perUnitCents) * floor(units))
function tierGoodsCents(bands: readonly Band[], units: number): number | null {
  const perUnit = pickPerUnitCents(bands, units)
  if (perUnit == null) return null
  return Math.max(0, Math.round(perUnit) * Math.max(0, Math.floor(units)))
}

// resolveGoods TIER arm — packages/plans/src/goods-basis.ts:106 (the change under
// test): goods = max(0, round(tierGoods) + round(flavorDeltaTotalCents)).
function chargeGoodsCents(tierGoods: number, flavorDeltaTotalCents: number): number {
  return Math.max(0, Math.round(tierGoods) + Math.round(flavorDeltaTotalCents))
}

// PDP non-pack goods — apps/marketing/.../ProductDetailConfigurator.tsx:469 + 473 :
//   unitGoodsCents = max(0, goodsUnitCents + flavorDeltaCents); PRODUCT line = unitGoodsCents * quantity
function pdpGoodsCents(perUnitCents: number, flavorDeltaCentsPerUnit: number, qty: number): number {
  const unitGoodsCents = Math.max(0, perUnitCents + flavorDeltaCentsPerUnit)
  return unitGoodsCents * qty
}

const QUANTITIES = [50, 100, 250, 500, 1000, 2500]

async function main() {
  const prisma = new PrismaClient()
  try {
    const tpl = await prisma.productTemplate.findUnique({
      where: { slug: FLAVOR_DELTA_SLUG },
      select: {
        id: true,
        name: true,
        pricingTiers: { orderBy: { sortOrder: 'asc' }, select: { minQty: true, perUnitCostCents: true } },
        flavorPresets: {
          where: { status: 'ACTIVE' },
          orderBy: { sortOrder: 'asc' },
          select: { name: true, priceDeltaCents: true },
        },
      },
    })

    if (!tpl) {
      console.error(
        `✗ Template "${FLAVOR_DELTA_SLUG}" not found. Seed it first: pnpm --filter @ilaunchify/db seed:flavor-delta`,
      )
      process.exit(1)
    }

    const bands: Band[] = tpl.pricingTiers.map((t) => ({ minQty: t.minQty, perUnitCents: t.perUnitCostCents }))
    const premium = tpl.flavorPresets.find((p) => p.priceDeltaCents > 0) ?? tpl.flavorPresets[0]
    if (!bands.length || !premium) {
      console.error('✗ Fixture is missing pricing tiers or an ACTIVE flavor preset. Re-seed.')
      process.exit(1)
    }

    const delta = premium.priceDeltaCents
    console.log(`\nNon-pack flavor-delta parity — ${tpl.name}`)
    console.log(`Flavor "${premium.name}" delta = ${delta}c/unit\n`)
    console.log('  qty   band/unit   PDP goods   charge goods   match')
    console.log('  ────  ─────────   ─────────   ────────────   ─────')

    let allMatch = true
    for (const qty of QUANTITIES) {
      const perUnit = pickPerUnitCents(bands, qty)
      if (perUnit == null) {
        console.log(`  ${String(qty).padStart(4)}   (no band — below MOQ floor)`)
        continue
      }
      const pdp = pdpGoodsCents(perUnit, delta, qty)
      const tier = tierGoodsCents(bands, qty)!
      const charge = chargeGoodsCents(tier, delta * qty)
      const ok = pdp === charge
      allMatch = allMatch && ok
      console.log(
        `  ${String(qty).padStart(4)}   ${String(perUnit).padStart(6)}c    ` +
          `$${(pdp / 100).toFixed(2).padStart(8)}   $${(charge / 100).toFixed(2).padStart(9)}    ${ok ? '✓' : '✗ MISMATCH'}`,
      )
    }

    // Prove the zero-delta path is a no-op (base flavor must equal the plain band).
    const baseQty = 500
    const basePerUnit = pickPerUnitCents(bands, baseQty)!
    const baseCharge = chargeGoodsCents(tierGoodsCents(bands, baseQty)!, 0 * baseQty)
    const baseOk = baseCharge === basePerUnit * baseQty
    console.log(
      `\n  base flavor (delta 0) @ ${baseQty}: charge $${(baseCharge / 100).toFixed(2)} === band $${(
        (basePerUnit * baseQty) /
        100
      ).toFixed(2)}  ${baseOk ? '✓' : '✗'}`,
    )

    console.log('')
    if (allMatch && baseOk) {
      console.log('✓ PDP goods === charge goods for every quantity. Non-pack flavor delta is at parity.')
    } else {
      console.error('✗ PARITY BROKEN — the charge does not equal the PDP. Do NOT trust the money path.')
      process.exit(1)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
