// I3 verification (docs/MANUFACTURER_INVENTORY_2026-07-27.md section 5, the
// risk center): prove the conditional decrement cannot oversell under
// concurrency. Two "checkouts" race for the same stock (100 units, 60 each)
// in concurrent interactive transactions; exactly ONE may win.
//
// Run from the repo root (same runner pattern as ondemand:why):
//   pnpm --filter @ilaunchify/db exec dotenv -e ../../.env.local -- tsx ../orders/scripts/verify-inventory-race.ts
//
// Self-contained: uses a synthetic soft-FK template id (no real ProductTemplate
// is touched; recomputeTemplateSoldOut skips ids it cannot resolve), creates
// its own inventory row, and deletes everything it created on the way out.
// Requires the I1 schema to be pushed + generated.

import { prisma } from '@ilaunchify/db'
import { consumeTemplateInventory } from '../src/template-inventory-db'

const TEMPLATE_ID = 'race-verify-synthetic-template'
const START_UNITS = 100
const ORDER_UNITS = 60

type Delegates = {
  templateFlavorInventory: {
    create: (a: unknown) => Promise<{ id: string }>
    findMany: (a: unknown) => Promise<Array<{ id: string; quantityAvailable: number }>>
    deleteMany: (a: unknown) => Promise<unknown>
  }
  templateInventoryLedger: {
    findMany: (a: unknown) => Promise<Array<{ id: string; kind: string; delta: number }>>
  }
}

async function main() {
  const db = prisma as unknown as Delegates
  if (!('templateFlavorInventory' in (prisma as unknown as Record<string, unknown>))) {
    console.error('templateFlavorInventory delegate missing: run db:push + db:generate first.')
    process.exit(2)
  }

  // Clean slate (cascade removes ledger rows).
  await db.templateFlavorInventory.deleteMany({ where: { productTemplateId: TEMPLATE_ID } })
  await db.templateFlavorInventory.create({
    data: { productTemplateId: TEMPLATE_ID, flavorPresetId: 'base', tracked: true, quantityAvailable: START_UNITS },
  })
  console.log(`Seeded ${START_UNITS} units; racing two ${ORDER_UNITS}-unit orders...`)

  const attempt = (orderId: string) =>
    prisma
      .$transaction(async (tx) => {
        const r = await consumeTemplateInventory(tx, {
          productTemplateId: TEMPLATE_ID,
          needs: [{ flavorPresetId: 'base', units: ORDER_UNITS }],
          orderId,
        })
        // Mirror production: an insufficient-stock result aborts the whole txn.
        if (!r.ok) throw new Error(r.reason)
        return r
      })
      .then(() => ({ orderId, won: true as const, reason: null as string | null }))
      .catch((err: unknown) => ({ orderId, won: false as const, reason: err instanceof Error ? err.message : String(err) }))

  const results = await Promise.all([attempt('race-order-A'), attempt('race-order-B')])
  for (const r of results) console.log(`  ${r.orderId}: ${r.won ? 'CONSUMED' : `REJECTED (${r.reason})`}`)

  const winners = results.filter((r) => r.won).length
  const rows = await db.templateFlavorInventory.findMany({
    where: { productTemplateId: TEMPLATE_ID },
    select: { id: true, quantityAvailable: true },
  })
  const left = rows[0]?.quantityAvailable ?? -1
  const ledger = rows[0]
    ? await db.templateInventoryLedger.findMany({ where: { inventoryId: rows[0].id, kind: 'ORDER_CONSUMED' }, select: { id: true, kind: true, delta: true } })
    : []

  const pass = winners === 1 && left === START_UNITS - ORDER_UNITS && ledger.length === 1 && ledger[0]?.delta === -ORDER_UNITS
  console.log(`\nwinners=${winners} (want 1)  unitsLeft=${left} (want ${START_UNITS - ORDER_UNITS})  consumedLedgerRows=${ledger.length} (want 1)`)

  await db.templateFlavorInventory.deleteMany({ where: { productTemplateId: TEMPLATE_ID } })

  if (pass) {
    console.log('\nPASS: exactly one order won the race; overselling is impossible by construction.')
    process.exit(0)
  } else {
    console.error('\nFAIL: the race invariant did not hold. Do NOT ship I3; investigate before any live order.')
    process.exit(1)
  }
}

void main().finally(() => prisma.$disconnect())
