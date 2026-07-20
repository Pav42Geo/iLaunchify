// MB-1 verification (non-persisting): prove the manufacturing model round-trips.
// Creates a line + config on an existing PartnerService, sets a product's batch
// fields + line, reads them back through the relations, then ROLLS BACK so nothing
// persists. Run AFTER `pnpm db:push && pnpm db:generate`.
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/check-manufacturing-schema.ts

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const ROLLBACK = Symbol('rollback')

async function main() {
  const svc =
    (await prisma.partnerService.findFirst({ where: { type: 'MANUFACTURING' }, select: { id: true, type: true } })) ??
    (await prisma.partnerService.findFirst({ select: { id: true, type: true } }))
  if (!svc) {
    console.log('No PartnerService to attach to — run the partner seed first.')
    return
  }
  console.log(`Attaching manufacturing line + config to PartnerService ${svc.id} (${svc.type}) in a rolled-back tx…\n`)

  try {
    await prisma.$transaction(async (tx) => {
      // A real-shaped line from the prototype (§2): kettle 1000-unit batch base at
      // $310/h, 2.5h changeover, max 40 batches. changeoverMinutes = hours × 60.
      const line = await tx.partnerManufacturingLine.create({
        data: {
          partnerServiceId: svc.id,
          name: 'Kettle line',
          loadedRateCentsPerHour: 31000,
          changeoverMinutes: 150,
          maxBatchesPerRun: 40,
          weeklyCapacityHours: 40,
          allergenClass: 'nut-free segregated',
          status: 'ACTIVE',
        },
        select: { id: true, name: true, loadedRateCentsPerHour: true, changeoverMinutes: true, maxBatchesPerRun: true },
      })
      await tx.partnerManufacturingConfig.create({
        data: {
          partnerServiceId: svc.id,
          minOrderValueCents: 250000,
          overrunPolicyPct: 100,
          selfFillMaxUnits: 15000,
          overflowCoPackerServiceId: null,
        },
      })

      // A product runs on this line with its OWN batch size (per-product MOQ).
      const tpl = await tx.productTemplate.findFirst({ select: { id: true, name: true } })
      let tplBack: { unitsPerBatch: number | null; batchTimeMinutes: number | null; manufacturingLineId: string | null } | null = null
      if (tpl) {
        tplBack = await tx.productTemplate.update({
          where: { id: tpl.id },
          data: { unitsPerBatch: 1000, batchTimeMinutes: 180, manufacturingLineId: line.id },
          select: { unitsPerBatch: true, batchTimeMinutes: true, manufacturingLineId: true },
        })
      }

      const readback = await tx.partnerService.findUnique({
        where: { id: svc.id },
        select: {
          manufacturingLines: { select: { name: true, loadedRateCentsPerHour: true, changeoverMinutes: true, maxBatchesPerRun: true } },
          manufacturingConfig: { select: { minOrderValueCents: true, overrunPolicyPct: true, selfFillMaxUnits: true } },
        },
      })
      console.log('LINES:')
      for (const l of readback!.manufacturingLines)
        console.log(`  • ${l.name}: $${(l.loadedRateCentsPerHour / 100).toFixed(0)}/h, ${l.changeoverMinutes}m changeover, max ${l.maxBatchesPerRun} batches`)
      const c = readback!.manufacturingConfig
      console.log(`CONFIG: MOV $${((c?.minOrderValueCents ?? 0) / 100).toFixed(0)}, overrun ${c?.overrunPolicyPct}%, self-fill ${c?.selfFillMaxUnits}`)
      if (tplBack) console.log(`PRODUCT BATCH: ${tplBack.unitsPerBatch} units/batch, ${tplBack.batchTimeMinutes}m, on line ${tplBack.manufacturingLineId}`)
      else console.log('PRODUCT BATCH: (no ProductTemplate to attach to — skipped)')

      throw ROLLBACK // nothing persists
    })
  } catch (e) {
    if (e !== ROLLBACK) throw e
  }
  console.log('\n✓ Manufacturing model round-trips (line + config + product batch). Rolled back, nothing persisted.')
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
