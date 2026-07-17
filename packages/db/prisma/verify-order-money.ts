// THE VERIFICATION (task #13): did the real path charge what the PDP showed?
//
// Everything fixed today was verified STATICALLY: by reading code, by pins, by
// mutation tests. All of that is real, and none of it has ever executed. Every bug
// in this cleanup was found by reading, which is exactly why reading kept finding
// more, and why I once told Pavel something false about the unification. This
// script makes the money path assert itself against the DATABASE, once.
//
// It re-derives the price INDEPENDENTLY from the template's partner-authored bands
// and compares that against what the Order stored and what Stripe was asked for.
// Deliberately does NOT import @ilaunchify/plans: verifying with the same function
// that computed the number only proves a function equals itself. That was exactly
// the flaw in the old estimate-vs-charge pin (both sides read the same wrong source
// and agreed with each other). So the arithmetic below is transcribed by hand from
// the spec, on purpose. If it disagrees with the app, ONE of us is wrong and that
// is the entire point.
//
// RUN (after placing an order in the UI):
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/verify-order-money.ts
//
// READ-ONLY. Writes nothing.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const usd = (c: number | null | undefined) => (c == null ? 'null' : `$${(c / 100).toFixed(2)}`)
const pad = (s: string, n = 12) => s.padStart(n)

/**
 * Independent re-derivation of the band pick: the LAST band whose minQty <= qty,
 * in sortOrder, falling back to the first. Mirrors the SPEC, not the implementation.
 */
function bandUnitCents(bands: { minQty: number; perUnitCostCents: number }[], qty: number): number | null {
  if (bands.length === 0) return null
  let found: { minQty: number; perUnitCostCents: number } | null = null
  for (const b of bands) if (b.minQty <= qty) found = b
  return (found ?? bands[0]!).perUnitCostCents
}

async function main() {
  const order = await prisma.order.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      items: true,
      charge: true,
    },
  })

  if (!order) {
    console.log('\nNo orders in the DB yet. Place one in the UI first, then re-run.\n')
    return
  }

  // ── IS THIS EVEN A REAL ORDER? ─────────────────────────────────────────────
  //
  // First run of this script surfaced a SEEDED order from 13 days earlier and
  // reported "SUBTOTAL IS BELOW GOODS" in alarming asterisks. That was my checker
  // crying wolf: the seed writes a flat $5.00/unit that never went through the
  // pricer, so of course it disagrees with the band. A checker that cries wolf on
  // its very first run is worse than no checker, because the next real alarm gets
  // waved away. So: detect it and say so plainly.
  //
  // `platformFeeBps` is the tell. Every order placed through placeOrder snapshots
  // the creator's tier rate onto it (PP-0). null means the row never went through
  // the charge path at all: it is seed data or predates the fee snapshot, and NONE
  // of today's fixes ever touched it.
  const isPrePP0 = order.platformFeeBps == null
  if (isPrePP0) {
    console.log(`\n*** THIS ORDER DID NOT COME FROM THE CHARGE PATH. ***`)
    console.log(`  platformFeeBps is null, which placeOrder always snapshots. So this is`)
    console.log(`  seed data (or predates PP-0). None of today's fixes applied to it, and`)
    console.log(`  comparing it against the bands is meaningless: the seed wrote a flat`)
    console.log(`  unit price that never went through the pricer.`)
    console.log(`\n  Place a NEW order through the UI, then re-run. Everything below is`)
    console.log(`  reported for context only: ignore the verdict.\n`)
  }

  const item = order.items[0]
  const product = item
    ? await prisma.product.findUnique({
        where: { id: item.productId },
        select: {
          name: true,
          productTemplateId: true,
          productTemplate: {
            select: {
              slug: true,
              pricingTiers: {
                orderBy: { sortOrder: 'asc' },
                select: { minQty: true, perUnitCostCents: true },
              },
            },
          },
        },
      })
    : null

  console.log(`\n=== LATEST ORDER ============================================`)
  console.log(`  id / number   ${order.id}  ${order.orderNumber ?? ''}`)
  console.log(`  placed        ${order.createdAt.toISOString()}`)
  console.log(`  status        ${order.status}   type=${order.orderType}${order.sampleKind ? ` sample=${order.sampleKind}` : ''}`)
  console.log(`  product       ${product?.name ?? '(unknown)'}`)
  console.log(`  template      ${product?.productTemplate?.slug ?? 'NONE (template-less!)'}`)
  console.log(`  items         ${order.items.length}`)
  for (const i of order.items) {
    const isPack = i.packCount != null
    console.log(
      `    qty=${i.quantity}  unit=${usd(i.unitPriceCents)}  total=${usd(i.totalCents)}` +
        (isPack ? `  [PACK x${i.packCount} of ${i.packUnitsPerPack}, ${usd(i.pricePerPackCentsSnapshot)}/pack, basis=${i.pricingBasisSnapshot}]` : '  [non-pack]'),
    )
  }

  console.log(`\n=== WHAT WE STORED ==========================================`)
  console.log(`  subtotal      ${pad(usd(order.subtotalCents))}`)
  console.log(`  platform fee  ${pad(usd(order.platformFeeCents))}   @ ${order.platformFeeBps} bps   source=${order.platformFeeSource}`)
  console.log(`  shipping      ${pad(usd(order.shippingCents))}`)
  console.log(`  tax           ${pad(usd(order.taxCents))}`)
  console.log(`  TOTAL         ${pad(usd(order.totalCents))}`)

  console.log(`\n=== WHAT STRIPE ACTUALLY CHARGED ============================`)
  if (!order.charge) {
    console.log(`  (no Charge row)`)
    console.log(`  A Charge is only written by the charge.succeeded webhook. No row means`)
    console.log(`  either the payment was never completed, or the webhook never arrived.`)
    console.log(`  If you DID pay: check 'stripe listen' is running and forwarding.`)
  } else {
    const c = order.charge
    console.log(`  amount        ${pad(usd(c.amountCents))}   status=${c.status}`)
    console.log(`  appFee (ours) ${pad(usd(c.applicationFeeCents))}   <- OUR bookkeeping, never sent to Stripe`)
    console.log(`  paymentIntent ${c.stripePaymentIntentId}`)
    console.log(`  charge        ${c.stripeChargeId}`)
    if (c.riskLevel) console.log(`  radar         ${c.riskLevel}${c.riskScore != null ? ` (${c.riskScore})` : ''}`)
  }

  // ── The independent re-derivation ───────────────────────────────────────────
  console.log(`\n=== INDEPENDENT RE-DERIVATION (from the partner's own bands) =`)
  const tiers = product?.productTemplate?.pricingTiers ?? []

  if (!item) {
    console.log(`  Order has no items. Nothing to re-derive.`)
  } else if (item.packCount != null) {
    // PACK_PRICE basis: the creator-agreed pack price extended over packCount.
    const expectedGoods = (item.pricePerPackCentsSnapshot ?? 0) * item.packCount
    console.log(`  basis         PACK_PRICE`)
    console.log(`  ${item.packCount} packs x ${usd(item.pricePerPackCentsSnapshot)} = ${usd(expectedGoods)} goods`)
    console.log(`  (add-ons + fee are checked against the stored subtotal below)`)
    report(order, expectedGoods, isPrePP0)
  } else if (tiers.length === 0) {
    console.log(`  *** This template has NO pricing tiers.`)
    console.log(`  Post-#16 this order should have been REFUSED (resolveGoods -> null).`)
    console.log(`  An order existing here IS the finding. Investigate before shipping.`)
  } else {
    const unit = bandUnitCents(tiers, item.quantity)!
    const goods = unit * item.quantity
    console.log(`  basis         TIER_PRICE`)
    console.log(`  bands         ${tiers.map((t) => `${t.minQty}+:${usd(t.perUnitCostCents)}`).join('  ')}`)
    console.log(`  matched unit  ${pad(usd(unit))}  for qty ${item.quantity}`)
    console.log(`  goods         ${pad(usd(goods))}`)
    report(order, goods, isPrePP0)
  }
  console.log('')
}

/**
 * Compare the stored money against a goods figure we derived ourselves.
 *
 * NOTE the subtotal check is the load-bearing one. `subtotalCents` is the
 * production basis, so it equals goods PLUS any creator-picked add-ons (finishes,
 * decoration, component upgrades). A mismatch is only a BUG if you picked no
 * add-ons; otherwise the delta should equal exactly what you picked. Stated
 * explicitly because a checker that cries wolf gets ignored, which is how the
 * original 89.9% gap survived a passing test suite.
 */
function report(
  order: { subtotalCents: number; totalCents: number; platformFeeCents: number | null; platformFeeBps: number | null; shippingCents: number; taxCents: number; charge: { amountCents: number } | null },
  goodsCents: number,
  isPrePP0 = false,
) {
  // A pre-PP-0 / seeded row cannot fail these checks in any meaningful way, so it
  // must not be allowed to print '***'. See the isPrePP0 note above.
  const flag = (bad: boolean, msg: string) => (isPrePP0 ? '(n/a - seed row)' : bad ? msg : 'MATCH')
  const addOns = order.subtotalCents - goodsCents
  const expectedFee = Math.round((order.subtotalCents * (order.platformFeeBps ?? 0)) / 10_000)
  const expectedTotal = order.subtotalCents + expectedFee + order.shippingCents + order.taxCents

  console.log(`\n=== VERDICT =================================================`)
  console.log(`  stored subtotal   ${pad(usd(order.subtotalCents))}   = goods ${usd(goodsCents)} + add-ons ${usd(addOns)}`)
  if (addOns < 0 && !isPrePP0) {
    console.log(`     *** SUBTOTAL IS BELOW GOODS. The charge is under the band price.`)
  } else if (addOns < 0) {
    console.log(`     (below goods, but this row never went through the pricer: expected)`)
  } else if (addOns > 0) {
    console.log(`     (add-ons should equal the finishes/decoration/components you picked)`)
  }

  const feeOk = order.platformFeeCents === expectedFee
  console.log(`  fee               ${pad(usd(order.platformFeeCents))}   expected ${usd(expectedFee)}   ${flag(!feeOk, '*** MISMATCH ***')}`)
  console.log(`     (fee base EXCLUDES shipping: we quote it and keep the margin, so a`)
  console.log(`      partner cannot shift production price into it. LOCKED fee-base rule.)`)

  const totalOk = order.totalCents === expectedTotal
  console.log(`  total             ${pad(usd(order.totalCents))}   expected ${usd(expectedTotal)}   ${flag(!totalOk, `*** OFF BY ${usd(order.totalCents - expectedTotal)} ***`)}`)

  if (order.charge) {
    const chargeOk = order.charge.amountCents === order.totalCents
    console.log(`  stripe charged    ${pad(usd(order.charge.amountCents))}   stored   ${usd(order.totalCents)}   ${flag(!chargeOk, `*** OFF BY ${usd(order.charge.amountCents - order.totalCents)} ***`)}`)
    if (chargeOk && totalOk && feeOk && !isPrePP0) {
      console.log(`\n  >>> The number we showed, the number we stored, and the number Stripe`)
      console.log(`      took are the same. That has never been true before today.`)
    }
  } else {
    console.log(`  stripe charged    (no Charge row - payment not completed or webhook missing)`)
  }
}

main()
  .catch((e) => {
    console.error('\nFAILED:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
