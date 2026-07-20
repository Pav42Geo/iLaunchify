// CP-1 verification (non-persisting): prove the co-pack offering model round-trips.
// Creates the prototype's two lines (auger + hand), the operations menu, and a config
// on an existing PartnerService, reads them back, then ROLLS BACK so nothing persists.
// Run AFTER `pnpm db:push && pnpm db:generate`.
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/check-copack-schema.ts

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const ROLLBACK = Symbol('rollback')

async function main() {
  const svc =
    (await prisma.partnerService.findFirst({ where: { type: 'COPACKING' }, select: { id: true, type: true } })) ??
    (await prisma.partnerService.findFirst({ select: { id: true, type: true } }))
  if (!svc) {
    console.log('No PartnerService to attach to — run the partner seed first.')
    return
  }
  console.log(`Attaching co-pack offering to PartnerService ${svc.id} (${svc.type}) in a rolled-back tx…\n`)

  try {
    await prisma.$transaction(async (tx) => {
      // Two real-shaped lines from the spec (§1): auger 3,600/h + 4h changeover @ $165/h,
      // hand 900/h + 1h changeover @ $120/h. changeoverMinutes = hours × 60.
      await tx.partnerCopackLine.createMany({
        data: [
          { partnerServiceId: svc.id, name: 'Auger line', runSpeedUnitsPerHour: 3600, changeoverMinutes: 240, lineRateCentsPerHour: 16500, minRunUnits: 1500, maxRunUnits: null, allergenClass: null, containerFormats: ['sachet', 'pouch'], fillTypes: ['powder'], status: 'ACTIVE' },
          { partnerServiceId: svc.id, name: 'Hand line', runSpeedUnitsPerHour: 900, changeoverMinutes: 60, lineRateCentsPerHour: 12000, minRunUnits: 0, maxRunUnits: 25000, allergenClass: 'peanut-free', containerFormats: ['pouch'], fillTypes: ['powder'], status: 'ACTIVE' },
        ],
      })
      await tx.partnerCopackOperation.createMany({
        data: [
          { partnerServiceId: svc.id, opType: 'FILL_CLOSE', pricingUnit: 'PER_UNIT', priceCents: 12, status: 'ACTIVE' },
          { partnerServiceId: svc.id, opType: 'LABEL_APPLY', pricingUnit: 'PER_UNIT', priceCents: 4, status: 'ACTIVE' },
          { partnerServiceId: svc.id, opType: 'KIT_ASSEMBLY', pricingUnit: 'PER_PACK', priceCents: 35, status: 'ACTIVE' },
          { partnerServiceId: svc.id, opType: 'CASE_PACK', pricingUnit: 'PER_CASE', priceCents: 80, status: 'ACTIVE' },
          { partnerServiceId: svc.id, opType: 'QC_COA', pricingUnit: 'PER_RUN', priceCents: 15000, status: 'DRAFT' },
        ],
      })
      await tx.partnerCopackConfig.create({
        data: { partnerServiceId: svc.id, minRunChargeCents: 12000, repeatRunDiscountBps: 500, rushUpliftBps: 2000, rushLeadTimeDays: 5, minOrderValueCents: 25000, weeklyCapacityUnits: 200000, baseLeadTimeDays: 14, supplyModel: 'FILL_ONLY' },
      })

      // Read it back through the PartnerService relations.
      const readback = await tx.partnerService.findUnique({
        where: { id: svc.id },
        select: {
          copackLines: { select: { name: true, runSpeedUnitsPerHour: true, changeoverMinutes: true, lineRateCentsPerHour: true, minRunUnits: true, maxRunUnits: true, fillTypes: true } },
          copackOperations: { select: { opType: true, pricingUnit: true, priceCents: true, status: true } },
          copackConfig: { select: { supplyModel: true, rushUpliftBps: true, minRunChargeCents: true, weeklyCapacityUnits: true } },
        },
      })
      console.log('LINES:')
      for (const l of readback!.copackLines) console.log(`  • ${l.name}: ${l.runSpeedUnitsPerHour}/h, ${l.changeoverMinutes}m changeover, $${(l.lineRateCentsPerHour / 100).toFixed(0)}/h, run ${l.minRunUnits}..${l.maxRunUnits ?? '∞'}, fills ${l.fillTypes.join('/')}`)
      console.log('OPERATIONS:')
      for (const o of readback!.copackOperations) console.log(`  • ${o.opType} — ${o.pricingUnit} @ $${(o.priceCents / 100).toFixed(2)} [${o.status}]`)
      console.log(`CONFIG: supply ${readback!.copackConfig?.supplyModel}, rush +${(readback!.copackConfig?.rushUpliftBps ?? 0) / 100}%, minRunCharge $${((readback!.copackConfig?.minRunChargeCents ?? 0) / 100).toFixed(0)}, cap ${readback!.copackConfig?.weeklyCapacityUnits}/wk`)

      throw ROLLBACK // nothing persists
    })
  } catch (e) {
    if (e !== ROLLBACK) throw e
  }
  console.log('\n✓ Co-pack offering model round-trips (create + relation read). Rolled back, nothing persisted.')
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
