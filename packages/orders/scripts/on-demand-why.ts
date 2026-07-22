// Diagnostic: WHY is the PDP's on-demand toggle (not) showing for a template?
// docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md. Reuses the REAL predicate
// (loadTemplateOnDemandEligibility), so it can never drift from the gate.
//
//   pnpm ondemand:why <template-slug-or-id>
//
// Prints the two toggle conditions: (1) ON_DEMAND bands authored, (2) the
// template-level full-service verdict with every failing reason and the raw
// fields behind it. Note: multi-flavor PACK templates never show the toggle
// regardless (per-unit on-demand is incoherent for packs).

import { prisma } from '@ilaunchify/db'
import {
  loadTemplateOnDemandEligibility,
  ON_DEMAND_INELIGIBLE_COPY,
} from '../src/on-demand-eligibility'

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: pnpm ondemand:why <template-slug-or-id>')
    process.exit(1)
  }

  const tpl = await prisma.productTemplate.findFirst({
    where: { OR: [{ slug: arg }, { id: arg }] },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      maxFlavorsPerPack: true,
      manufacturerServiceId: true,
      pricingTiers: {
        select: { fulfillmentMode: true, minQty: true, perUnitCostCents: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
  if (!tpl) {
    console.error(`✗ No ProductTemplate with slug/id "${arg}"`)
    process.exit(1)
  }

  const bulk = tpl.pricingTiers.filter((r) => r.fulfillmentMode === 'BULK_PRODUCTION')
  const od = tpl.pricingTiers.filter((r) => r.fulfillmentMode === 'ON_DEMAND')

  const isMultiPack = (tpl.maxFlavorsPerPack ?? 1) > 1
  console.log(`\n${tpl.name} (${tpl.slug ?? tpl.id}) · ${tpl.status} · ${isMultiPack ? 'MULTI-flavor pack' : 'single-flavor'}`)
  if (isMultiPack) {
    console.log('⚠ MULTI-flavor pack template: the PDP toggle is hidden in pack mode BY DESIGN.')
  }

  console.log(`\n[1] Bands: ${bulk.length} BULK, ${od.length} ON_DEMAND`)
  if (od.length === 0) {
    console.log('    ✗ No ON_DEMAND bands → toggle hidden. Seed: pnpm seed:mode-bands ' + (tpl.slug ?? tpl.id))
  } else {
    console.log('    ✓ ' + od.map((r) => `${r.minQty}+ @ $${(r.perUnitCostCents / 100).toFixed(2)}`).join(' · '))
  }

  console.log('\n[2] Template-level full-service gate:')
  const mfr = tpl.manufacturerServiceId
    ? await prisma.partnerService.findUnique({
        where: { id: tpl.manufacturerServiceId },
        select: {
          id: true,
          type: true,
          status: true,
          labelingMode: true,
          canShipParcel: true,
          partner: { select: { companyName: true } },
        },
      })
    : null
  console.log(`    manufacturerServiceId: ${tpl.manufacturerServiceId ?? 'NULL'}`)
  if (mfr) {
    console.log(
      `    service: ${mfr.partner.companyName} · type=${mfr.type} · status=${mfr.status} · labelingMode=${mfr.labelingMode} · canShipParcel=${mfr.canShipParcel}`,
    )
  }

  const verdict = await loadTemplateOnDemandEligibility(tpl.id)
  if (verdict.eligible) {
    console.log('    ✓ ELIGIBLE')
  } else {
    for (const r of verdict.reasons) console.log(`    ✗ ${r}: ${ON_DEMAND_INELIGIBLE_COPY[r]}`)
  }

  console.log(
    '\nToggle shows when [1] has ON_DEMAND bands AND [2] is eligible AND the template is not a MULTI pack.\n',
  )
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
