// FOLLOW THE MONEY FORWARD (2026-07-18). The charge is proven; now trace where the
// $5,742.40 the creator paid actually GOES. The platform holds 100% (separate
// charges + transfers) and must pay OUT to the manufacturer, printer, warehouse.
// That payout half has never run for a real order either.
//
// This reads the latest order's dispatches + transfers and reconciles the flow:
//   creator paid  =  platform fee (kept) + shipping + production
//   production    =  sum of partner dispatch costs + platform production margin
//
// WHY IT MATTERS: dispatch cost is set by estimateDispatchCosts (dispatch-planner),
// a "naive V1" split of manufacturer 30% / printer 8% / co-packer 7% of the
// CREATOR'S price. Nobody authored those ratios - they are the payout-side twin of
// the Blocker-2 buildup. This script makes the consequence visible in dollars so
// the model can be a decision, not an accident.
//
// READ-ONLY. Writes nothing.
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/verify-order-routing.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const usd = (c: number | null | undefined) => (c == null ? 'null' : `$${(c / 100).toFixed(2)}`)
const pad = (s: string, n = 11) => s.padStart(n)
const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '-')

async function main() {
  const order = await prisma.order.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { items: true, charge: true, dispatches: true },
  })
  if (!order) {
    console.log('\nNo orders yet.\n')
    return
  }

  console.log(`\n=== ORDER ${order.orderNumber ?? order.id} =========================`)
  console.log(`  status        ${order.status}`)
  console.log(`  creator paid  ${usd(order.totalCents)}  (production ${usd(order.subtotalCents)} + fee ${usd(order.platformFeeCents)} + shipping ${usd(order.shippingCents)} + tax ${usd(order.taxCents)})`)

  // Resolve partner names for the dispatch legs.
  const svcIds = [...new Set(order.dispatches.map((d) => d.partnerServiceId))]
  const services = svcIds.length
    ? await prisma.partnerService.findMany({
        where: { id: { in: svcIds } },
        select: { id: true, type: true, partner: { select: { companyName: true } } },
      })
    : []
  const svcName = new Map(services.map((s) => [s.id, `${s.partner?.companyName ?? '?'} (${s.type})`]))

  console.log(`\n=== DISPATCHES (what routing created) ==================`)
  if (order.dispatches.length === 0) {
    console.log(`  NONE. status=${order.status} but no OrderDispatch rows.`)
    console.log(`  If status is ROUTING and this stays empty, routing did not fan out.`)
  }
  let partnerPayoutCents = 0
  let meritWithheldCents = 0
  for (const d of order.dispatches) {
    partnerPayoutCents += d.costCents
    meritWithheldCents += d.meritFeeCents ?? 0
    console.log(
      `  ${d.type.padEnd(9)} ${pad(usd(d.costCents))}  ${d.meritFeeCents ? `merit -${usd(d.meritFeeCents)} ` : ''}` +
        `${d.status.padEnd(16)} ${svcName.get(d.partnerServiceId) ?? d.partnerServiceId}`,
    )
  }

  // ── The reconciliation the charge proof could not see ────────────────────────
  const production = order.subtotalCents
  const platformProductionMargin = production - partnerPayoutCents

  console.log(`\n=== WHERE THE PRODUCTION DOLLAR GOES ==================`)
  console.log(`  production (creator paid)   ${pad(usd(production))}`)
  console.log(`  -> partners (dispatch cost) ${pad(usd(partnerPayoutCents))}   ${pct(partnerPayoutCents, production)}`)
  console.log(`  -> platform margin          ${pad(usd(platformProductionMargin))}   ${pct(platformProductionMargin, production)}`)
  if (meritWithheldCents > 0) {
    console.log(`     (of the partner share, merit withholds ${usd(meritWithheldCents)} back to the platform)`)
  }
  console.log(`\n  + platform fee (kept)       ${pad(usd(order.platformFeeCents))}`)
  console.log(`  = platform keeps total      ${pad(usd(platformProductionMargin + (order.platformFeeCents ?? 0) + meritWithheldCents))}`)

  // The tell: a 30/8/7 fabricated split means partners get ~38% and the platform
  // pockets ~62% of production from a ratio nobody authored.
  if (production > 0) {
    const partnerPctNum = (partnerPayoutCents / production) * 100
    console.log(`\n=== READING ==========================================`)
    if (Math.abs(partnerPctNum - 45) < 20 && order.dispatches.length > 0) {
      console.log(`  Partners receive ${pct(partnerPayoutCents, production)} of production; the platform keeps`)
      console.log(`  ${pct(platformProductionMargin, production)}. That ratio is NOT authored by anyone: dispatch cost =`)
      console.log(`  estimateDispatchCosts() = 30% mfr / 8% printer / 7% co-pack of the`)
      console.log(`  CREATOR's price. It is the payout-side twin of the Blocker-2 buildup.`)
      console.log(`  Whether that spread is intended is a Pavel decision, not a bug to`)
      console.log(`  silently "fix" - same shape as the units/packs call.`)
    }
  }

  // ── Payouts actually executed (Transfer rows) ────────────────────────────────
  const transfers = order.charge
    ? await prisma.transfer.findMany({
        where: { chargeId: order.charge.id },
        select: { destinationType: true, amountCents: true, nettedCents: true, meritFeeCents: true, reason: true, status: true, stripeTransferId: true },
      })
    : []
  console.log(`\n=== TRANSFERS (payouts actually executed) =============`)
  if (transfers.length === 0) {
    console.log(`  NONE yet. Transfers are created by a PARTNER action`)
    console.log(`  (orders/[dispatchId] complete), not automatically at charge time.`)
    console.log(`  So the payout Stripe leg is still unproven - the mirror of where the`)
    console.log(`  CHARGE was this morning. A partner must accept + complete a dispatch.`)
  }
  for (const t of transfers) {
    console.log(
      `  ${String(t.destinationType).padEnd(12)} ${pad(usd(t.amountCents))}  ${t.reason} ${t.status}` +
        `${t.meritFeeCents ? ` (merit -${usd(t.meritFeeCents)})` : ''}  ${t.stripeTransferId ?? '(no stripe id)'}`,
    )
  }
  console.log('')
}

main()
  .catch((e) => {
    console.error('\nFAILED:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
