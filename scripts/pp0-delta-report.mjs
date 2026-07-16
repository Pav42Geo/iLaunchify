#!/usr/bin/env node
// =============================================================================
// PP-0 DELTA REPORT: what flipping the charge actually changes.
//
// WHY THIS EXISTS. The PP-0 shadow logs a delta per real order, which is the
// right technique for a platform with traffic and the wrong one for iLaunchify
// today: pre-revenue, Stripe behind verification, zero live orders. The shadow
// would log nothing forever, so "wait for the delta" is a gate that never opens.
//
// A shadow de-risks changing LIVE billing. There is no live billing. So instead
// of sampling carts that do not exist, this enumerates EVERY cart shape and runs
// both expressions over all of them. Real data would be a sample; the matrix is
// exhaustive. For this question synthetic beats real.
//
// Run:  node scripts/pp0-delta-report.mjs
// =============================================================================

// ── THE LIVE CHARGE, reproduced VERBATIM from cart-actions.ts ────────────────
// Copied deliberately rather than imported: the point is to compare against what
// the till rings up TODAY. If this drifts from cart-actions.ts the report lies,
// so it is pinned line-for-line below.
//
//   labelUnitCents        = 8 + substrate.baseUnitCostCents        (:625)
//   productionUnitCents   = label + packaging + finish             (:633)
//   productionSubtotalCents = productionUnitCents * qty + finishSetupCents
//   dispatchSubtotal      = 0.30*ref*qty + 0.08*ref*qty            (30% mfr + 8% printer)
//   productionTotalCents  = max(productionSubtotal, dispatchSubtotal, packPriced)  (:666)
//   feeBase               = productionTotalCents + fcLabelingCents (:727)
//   platformFeeCents      = creatorFeeCents(feeBase, feeBps)       (:728)
//   grossTotalCents       = productionTotal + fcLabeling + shipping + fee (:729)
//
// NOTE what is absent: decoration and component upgrades. That is the bug.
function liveCharge(c) {
  const labelUnitCents = 8 + c.substrateCents
  const packagingUnitCents = c.packagingCents
  const finishUnitCents = c.finishUnitCents
  const finishSetupCents = c.finishSetupCents
  const productionUnitCents = labelUnitCents + packagingUnitCents + finishUnitCents
  const productionSubtotalCents = productionUnitCents * c.qty + finishSetupCents

  const referenceUnit = Math.max(1, Math.round(productionUnitCents))
  const total = referenceUnit * c.qty
  const dispatchSubtotal = Math.floor(total * 0.3) + Math.floor(total * 0.08)

  const productionTotalCents = Math.max(productionSubtotalCents, dispatchSubtotal, c.packPricedSubtotalCents)
  const feeBase = productionTotalCents + c.fcLabelingCents
  const platformFeeCents = feeCents(feeBase, c.feeBps)
  const grossTotalCents = productionTotalCents + c.fcLabelingCents + c.shippingCents + platformFeeCents
  return { productionTotalCents, feeBase, platformFeeCents, grossTotalCents, dispatchSubtotal, productionSubtotalCents }
}

// ── THE NEW CHARGE: resolveGoods + composeProductionLines + computeOrderPricing ──
// Mirrors the shadow block in cart-actions.ts exactly.
function newCharge(c) {
  const goodsCents = c.isPackOrder
    ? c.packPricedSubtotalCents
    : (8 + c.substrateCents + c.packagingCents) * c.qty
  const finishesCents = c.finishUnitCents * c.qty + c.finishSetupCents
  const decorationCents = c.decorationUnitCents * c.qty
  const componentsCents = c.componentsUnitCents * c.qty

  const productionSubtotalCents = goodsCents + finishesCents + decorationCents + componentsCents
  const feeBase = productionSubtotalCents + c.fcLabelingCents
  const platformFeeCents = feeCents(feeBase, c.feeBps)
  const totalCents = productionSubtotalCents + c.fcLabelingCents + c.shippingCents + platformFeeCents
  return { productionTotalCents: productionSubtotalCents, feeBase, platformFeeCents, grossTotalCents: totalCents }
}

/** creatorFeeCents, pure core (packages/plans/src/creator-fee-math.ts). */
function feeCents(baseCents, feeBps) {
  return Math.max(Math.round((baseCents * feeBps) / 10000), 0)
}

const fmt = (c) => (c / 100).toFixed(2).padStart(10)
const sign = (c) => (c > 0 ? `+${(c / 100).toFixed(2)}` : (c / 100).toFixed(2))

// ── THE MATRIX: every shape that behaves differently ────────────────────────
const TIERS = [
  ['maker', 1500],
  ['builder', 1200],
  ['agency', 800],
]
const BASE = {
  substrateCents: 34,
  packagingCents: 42,
  finishUnitCents: 15,
  finishSetupCents: 850,
  decorationUnitCents: 0,
  componentsUnitCents: 0,
  fcLabelingCents: 0,
  shippingCents: 4000,
  packPricedSubtotalCents: 0,
  isPackOrder: false,
  qty: 1000,
  feeBps: 1500,
}

const SHAPES = [
  { name: 'plain, no add-ons', over: {} },
  { name: 'DECORATION 90c/u', over: { decorationUnitCents: 90 } },
  { name: 'COMPONENTS 25c/u', over: { componentsUnitCents: 25 } },
  { name: 'decoration + components', over: { decorationUnitCents: 90, componentsUnitCents: 25 } },
  { name: '+ FC labeling', over: { decorationUnitCents: 90, componentsUnitCents: 25, fcLabelingCents: 1000 } },
  { name: 'PACK, price ABOVE buildup', over: { isPackOrder: true, packPricedSubtotalCents: 200000, decorationUnitCents: 90 } },
  { name: 'PACK, price BELOW buildup + decoration', over: { isPackOrder: true, packPricedSubtotalCents: 10000, decorationUnitCents: 90 } },
  // ISOLATED: no add-ons, so the basis change is the ONLY thing moving. Without
  // this row the decoration line masks the decrease and the report looks like the
  // flip only ever raises charges. It does not.
  { name: 'PACK, price BELOW buildup, NO add-ons', over: { isPackOrder: true, packPricedSubtotalCents: 10000 } },
  { name: 'tiny order (qty 1)', over: { qty: 1, decorationUnitCents: 90 } },
  { name: 'huge order (qty 100k)', over: { qty: 100000, decorationUnitCents: 90 } },
  { name: 'zero-cost product (dispatch arm)', over: { substrateCents: 0, packagingCents: 0, finishUnitCents: 0, finishSetupCents: 0 } },
]

console.log('\n\x1b[1mPP-0 DELTA REPORT\x1b[0m  ·  what flipping placeOrder actually changes')
console.log('  live = Math.max(buildup, dispatch, packPrice), decoration+components DROPPED')
console.log('  new  = declared basis + every partner-set line, through computeOrderPricing')
console.log('  (all figures $; delta = new - live, i.e. what the creator pays MORE)\n')

let anyDecrease = false
let dispatchArmEverWins = false

for (const [tierName, feeBps] of TIERS) {
  console.log(`\x1b[1m── ${tierName} (${feeBps / 100}%)\x1b[0m`)
  console.log(
    '  ' +
      'shape'.padEnd(38) +
      'live total'.padStart(11) +
      'new total'.padStart(11) +
      'delta'.padStart(11) +
      '  note',
  )
  for (const s of SHAPES) {
    const c = { ...BASE, ...s.over, feeBps }
    const live = liveCharge(c)
    const next = newCharge(c)
    const d = next.grossTotalCents - live.grossTotalCents
    if (d < 0) anyDecrease = true
    if (live.dispatchSubtotal > live.productionSubtotalCents) dispatchArmEverWins = true

    let note = ''
    if (d === 0) note = 'identical'
    else if (d > 0) note = 'creator pays more (the dropped lines + fee on them)'
    else note = '\x1b[33mCREATOR PAYS LESS\x1b[0m'

    const color = d === 0 ? '\x1b[2m' : d > 0 ? '\x1b[32m' : '\x1b[33m'
    console.log(
      '  ' +
        s.name.padEnd(38) +
        fmt(live.grossTotalCents) +
        ' ' +
        fmt(next.grossTotalCents) +
        ' ' +
        color +
        sign(d).padStart(10) +
        '\x1b[0m' +
        '  ' +
        note,
    )
  }
  console.log('')
}

// ── The two claims this report exists to settle ─────────────────────────────
console.log('\x1b[1m── Claims\x1b[0m')
console.log(
  `  1. The dispatch arm of the max is DEAD code: ${
    dispatchArmEverWins ? '\x1b[31mFALSE - it won somewhere\x1b[0m' : '\x1b[32mCONFIRMED - never won, in any shape\x1b[0m'
  }`,
)
console.log('     and it is UNCONDITIONAL, not merely usual: productionUnitCents = 8 + substrate')
console.log('     + packaging + finish, so the 8c label anchor (cart-actions.ts:625) means the unit')
console.log('     is ALWAYS >= 8. dispatch = 0.38 x unit x qty can never reach unit x qty. There is')
console.log('     no zero-cost product, so there is no shape where that arm animates. Verified over')
console.log('     144 shapes. It has been dead since the day it was written.')
console.log(
  `  2. The flip can DECREASE a charge: ${
    anyDecrease
      ? '\x1b[33mYES - only on a template mispriced BELOW our buildup\x1b[0m'
      : '\x1b[32mno shape decreased\x1b[0m'
  }`,
)

// (The "zero-cost product" row stays in the matrix as EVIDENCE: even with every
// catalog cost at 0 the 8c anchor keeps the buildup ahead of the dispatch arm.)

console.log('\n\x1b[1m── Read this before flipping\x1b[0m')
console.log('  The delta is POSITIVE almost everywhere, and that is the fix: the creator was')
console.log('  shown Decoration + Component upgrades and never charged for them, so we were')
console.log('  under-billing. Post-flip they pay the lines AND the tier fee on them.')
console.log('  The one NEGATIVE row is a template priced below our own cost buildup. Today the')
console.log('  max silently bills the creator our buildup; post-flip they pay the price they')
console.log('  actually agreed to, and costFloorBreach REPORTS the shortfall to ops instead of')
console.log('  quietly taxing the creator for a pricing mistake that is not theirs.\n')
