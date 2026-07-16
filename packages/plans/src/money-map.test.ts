// THE MONEY MAP: the whole creator-side money model, as one executable spec.
//
// Read this file to understand how iLaunchify charges. It is deliberately the
// only place where the rules are stated as rules rather than demonstrated on a
// worked example, and it is a test so it cannot rot into a nice-sounding doc.
//
// It exists because the money model was, until 2026-07, spread across six pricing
// surfaces and three fee tables, and every one of them was individually
// defensible. Nobody chose that. It accumulated, because there was no single place
// that said what was true. This is that place.
//
// ─── THE ONE RULE (LOCKED, Pavel 2026-07-15) ─────────────────────────────────
//
//   A component belongs in the creator fee base IF AND ONLY IF a partner/creator
//   both SETS its price AND KEEPS the proceeds.
//
// Everything below is that sentence, applied. If you are adding a money line and
// this file will not compile until you classify it, that is the design working.

import { computeOrderPricing, type PriceLine, type PricingInput } from './order-pricing'
import { composeProductionLines, resolveGoods } from './goods-basis'
import { creatorFeeCents } from './creator-fee-math'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// THE MAP ITSELF.
//
// A Record over the FULL kind union, so this is a COMPILE-TIME guard, not just a
// runtime one: add a member to PriceLine['kind'] and TypeScript refuses to build
// this file until you declare whether the new line is in the fee base. You cannot
// add a money line to this platform without answering the only question that
// matters about it.
//
// That is the guard the fee-base rule exists for: `order-pricing.ts` warns that
// any NEW partner-priced, creator-paid line added OUTSIDE productionSubtotal is a
// fee-arbitrage vector (quote a low unit price + a fat setup fee, and the take
// rate silently shrinks). A comment cannot enforce that. This can.
// ─────────────────────────────────────────────────────────────────────────────
const FEE_BASE_MEMBERSHIP: Record<PriceLine['kind'], { inBase: boolean; why: string }> = {
  // ── IN: partner SETS the price, partner KEEPS the proceeds ──
  PRODUCT: { inBase: true, why: 'the manufacturer sets it and is paid it' },
  DECORATION: { inBase: true, why: 'the decorator sets it (PartnerPackagingOffering tiers) and is paid it' },
  COMPONENTS: { inBase: true, why: 'component-upgrade surcharges: partner-set, partner-kept' },
  PACKAGING: { inBase: true, why: 'partner-set packaging material' },
  PRINTING: { inBase: true, why: 'the printer sets it and is paid it' },
  FINISHES: { inBase: true, why: 'foil / spot UV / emboss: partner-set, incl. their setup' },
  SETUP: {
    inBase: true,
    why:
      'tooling, plates, prepress, rush. THE ARBITRAGE VECTOR: partner-set and creator-paid, ' +
      'so if this ever left the base a partner could quote a low unit price + a fat setup fee ' +
      'and shrink our take rate to nothing. It is in the base precisely because it is tempting.',
  },
  FC_LABELING: {
    inBase: true,
    why:
      'the FC applies labels: a production SERVICE, partner-set (FcValueAddedService.feeCentsPerUnit) ' +
      'and partner-kept. LOCKED. It is also the ONLY FC line that reaches Stripe, because it is a ' +
      'per-unit fee on a KNOWN quantity at checkout, which makes it structurally a production line.',
  },

  // ── OUT: fails at least one limb of the rule ──
  SHIPPING: {
    inBase: false,
    why:
      'fails BOTH limbs. WE quote it from the carrier (EasyPost) and WE keep the margin ' +
      '(firstLegMarginBps), so a partner cannot shift production price into freight to dodge the ' +
      'fee. Charging the fee on it would tax our own markup. NOT a permanent exemption: if a ' +
      'partner ever gains the ability to set a creator-facing shipping price, it moves INTO the base.',
  },
  TAX: { inBase: false, why: 'nobody sets it, nobody keeps it. Never in the base, in any jurisdiction.' },
  PLATFORM_FEE: { inBase: false, why: 'a fee is never in its own base' },
}

/** A cart containing EVERY in-base kind at a distinct value, so a dropped line is visible. */
const EVERY_LINE: PricingInput['production'] = [
  { kind: 'PRODUCT', label: 'Production', cents: 100_00 },
  { kind: 'DECORATION', label: 'Decoration', cents: 20_00 },
  { kind: 'COMPONENTS', label: 'Component upgrades', cents: 10_00 },
  { kind: 'PACKAGING', label: 'Packaging', cents: 15_00 },
  { kind: 'PRINTING', label: 'Label printing', cents: 5_00 },
  { kind: 'FINISHES', label: 'Finishes', cents: 7_00 },
  { kind: 'SETUP', label: 'Plates + tooling', cents: 30_00 },
]
const PRODUCTION_SUM = 187_00
const FC_LABELING = 10_00
const SHIPPING = 40_00
const TAX = 7_00

// ── RULE 1: the map is the truth. Every line lands where it says it lands. ──
{
  const p = computeOrderPricing({
    production: EVERY_LINE,
    fcLabelingCents: FC_LABELING,
    shippingCents: SHIPPING,
    taxCents: TAX,
    feeBps: 1500,
  })
  for (const line of p.lineItems) {
    const expected = FEE_BASE_MEMBERSHIP[line.kind]
    assert(
      line.inFeeBase === expected.inBase,
      `${line.kind} must be ${expected.inBase ? 'IN' : 'OUT of'} the fee base: ${expected.why}`,
    )
  }
}

// ── RULE 2: the base IS the in-base lines. No hidden arithmetic. ────────────
{
  const p = computeOrderPricing({
    production: EVERY_LINE,
    fcLabelingCents: FC_LABELING,
    shippingCents: SHIPPING,
    taxCents: TAX,
    feeBps: 1500,
  })
  const summed = p.lineItems.filter((l) => l.inFeeBase).reduce((s, l) => s + l.cents, 0)
  assert(summed === p.feeBaseCents, 'the fee base is exactly the sum of the lines marked inFeeBase')
  assert(p.feeBaseCents === PRODUCTION_SUM + FC_LABELING, 'production subtotal + FC labeling, nothing else')
  assert(p.productionSubtotalCents === PRODUCTION_SUM, 'every production line counted once')
}

// ── RULE 3: THE CANONICAL FORMULA (Pavel 2026-07-15) ────────────────────────
//   productionSubtotal = goods + decoration + components + packaging + printing
//                      + finishes + setup/tooling/rush/prepress
//   feeBase            = productionSubtotal + FCLabeling
//   platformFee        = clamp(feeBase x tierRate)        // 15 / 12 / 8
//   total              = productionSubtotal + FCLabeling + platformFee + Shipping + Tax
//   (storage is NOT here at all: it accrues over time and bills as its own event)
{
  const p = computeOrderPricing({
    production: EVERY_LINE,
    fcLabelingCents: FC_LABELING,
    shippingCents: SHIPPING,
    taxCents: TAX,
    feeBps: 1500,
  })
  const fee = Math.round((PRODUCTION_SUM + FC_LABELING) * 0.15)
  assert(p.platformFeeCents === fee, 'the fee is the tier rate on the base')
  assert(
    p.totalCents === PRODUCTION_SUM + FC_LABELING + fee + SHIPPING + TAX,
    'the total is the formula, to the cent',
  )
}

// ── RULE 4: shipping and tax cannot touch the fee, ever ────────────────────
{
  const base = { production: EVERY_LINE, fcLabelingCents: FC_LABELING, feeBps: 1500 } as const
  const bare = computeOrderPricing(base)
  const shipped = computeOrderPricing({ ...base, shippingCents: 999_00 })
  const taxed = computeOrderPricing({ ...base, taxCents: 999_00 })
  assert(shipped.platformFeeCents === bare.platformFeeCents, 'a $999 shipment does not move the fee by a cent')
  assert(taxed.platformFeeCents === bare.platformFeeCents, 'nor does $999 of tax')
  assert(shipped.feeBaseCents === bare.feeBaseCents && taxed.feeBaseCents === bare.feeBaseCents, 'nor the base')
  assert(shipped.totalCents - bare.totalCents === 999_00, 'shipping passes through at exactly cost + our margin')
}

// ── RULE 5: the tier moves the RATE, never the BASE ────────────────────────
{
  const of = (feeBps: number) => computeOrderPricing({ production: EVERY_LINE, fcLabelingCents: FC_LABELING, feeBps })
  const maker = of(1500), builder = of(1200), agency = of(800)
  assert(
    maker.feeBaseCents === builder.feeBaseCents && builder.feeBaseCents === agency.feeBaseCents,
    'all three tiers price the same goods',
  )
  assert(maker.platformFeeCents > builder.platformFeeCents && builder.platformFeeCents > agency.platformFeeCents, '15 > 12 > 8')
}

// ── RULE 6: THE ARBITRAGE GUARD. Margin cannot hide from the fee. ──────────
// The scenario the rule exists to catch: a partner quotes a low unit price and
// moves the margin into a setup fee. Because SETUP is in the base, the take rate
// is identical. If this pin ever fails, someone moved a partner-set line out.
{
  const honest = computeOrderPricing({ production: EVERY_LINE, feeBps: 1500 })
  const shifted = computeOrderPricing({
    production: EVERY_LINE.map((l) =>
      l.kind === 'PRODUCT' ? { ...l, cents: 60_00 } : l.kind === 'SETUP' ? { ...l, cents: 70_00 } : l,
    ),
    feeBps: 1500,
  })
  assert(shifted.feeBaseCents === honest.feeBaseCents, 'moving $40 from unit price into setup changes the base by nothing')
  assert(shifted.platformFeeCents === honest.platformFeeCents, 'so the take rate is untouched: the vector is closed')
}

// ── RULE 7: ONE rounding function, everywhere ──────────────────────────────
// The audit found floor-vs-round drift between checkout and channel reorders, and
// the sample path floored until 2026-07-16. Pick a base where they differ.
{
  assert(creatorFeeCents(3_33, 1500) === 50, 'creatorFeeCents ROUNDS: 49.95 -> 50')
  assert(Math.floor((3_33 * 1500) / 10000) === 49, 'a floor would have said 49')
  const p = computeOrderPricing({ production: [{ kind: 'PRODUCT', label: 'x', cents: 3_33 }], feeBps: 1500 })
  assert(p.platformFeeCents === 50, 'and the pricer uses that one function, not its own arithmetic')
}

// ── RULE 8: the basis is DECLARED, and add-ons are basis-independent ───────
// A pack order prices on the price the creator agreed to; a legacy non-pack order
// prices on the catalog buildup. Replaced Math.max(costBuildup, dispatch, packPrice),
// which maxed two COSTS against one PRICE and so had no stable meaning.
{
  const addOns = { finishesCents: 5_00, decorationCents: 20_00, componentsCents: 10_00 }
  const pack = computeOrderPricing({
    production: composeProductionLines({
      goods: resolveGoods({ isPackOrder: true, packPricedSubtotalCents: 100_00, costBuildupGoodsCents: 60_00 }),
      ...addOns,
    }),
    feeBps: 1500,
  })
  const nonPack = computeOrderPricing({
    production: composeProductionLines({
      goods: resolveGoods({ isPackOrder: false, packPricedSubtotalCents: 0, costBuildupGoodsCents: 60_00 }),
      ...addOns,
    }),
    feeBps: 1500,
  })
  assert(pack.productionSubtotalCents === 135_00, 'PACK: 100 agreed + 35 of add-ons')
  assert(nonPack.productionSubtotalCents === 95_00, 'NON-PACK: 60 buildup + the SAME 35 of add-ons')
  assert(
    pack.productionSubtotalCents - nonPack.productionSubtotalCents === 40_00,
    'the bases differ by the GOODS alone: an add-on costs the same either way',
  )
}

// ── WHAT IS DELIBERATELY NOT HERE (so absence reads as a decision) ─────────
// STORAGE. It is not an order line and never will be: it accrues over time from a
//   StorageAgreement.feeSnapshotJson frozen at agreement time, and bills as its own
//   monthly event. The platform's take on it is warehouseReferralFeeBps, not the
//   tier fee. See docs/FC_MONETIZATION_GAP_2026-07-15.md.
// MERIT. It is a payout WITHHOLD off the manufacturer, not a creator charge, so it
//   touches no number in this file. It applies to the PRODUCT leg ONLY, by decision
//   (Pavel 2026-07-16), because the instrument must match the selection model and
//   the manufacturer is the only leg a creator chooses and pins. Pinned separately
//   in packages/orders (routing-merit-snapshot.test.ts + merit-decision.test.ts),
//   because merit lives there and this package cannot import it.
// CO-PACKING. A known HOLE, not an exemption: co-packing has no price at all today
//   (dispatch-planner.ts pays a flat 7% of the creator's unit price). When CP-3
//   lands, COPACKING joins PriceLine['kind'] and THIS FILE WILL NOT COMPILE until
//   its fee-base membership is declared above. It is partner-set and creator-paid,
//   so the answer will be `inBase: true`. See docs/COPACK_SERVICE_SPEC_2026-07-15.md.

// eslint-disable-next-line no-console
console.log('money-map: all pins passed')
