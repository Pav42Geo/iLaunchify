// PP-0 (docs/PRINT_PRICING_SPEC_2026-07-15.md §2): the ONE order-pricing function.
//
// WHY THIS EXISTS: the bug was never "a number is wrong". FOUR surfaces priced an
// order independently (marketplace PDP, configurator, checkout estimate, and the
// real charge in placeOrder), so they could not agree, and they didn't: the summary
// showed the creator Decoration + Component-upgrade lines that placeOrder never
// charged. Fix the SHAPE and the divergence cannot recur: every surface calls this,
// `placeOrder` charges `total.totalCents`, `OrderSummary` renders `lineItems`.
//
// PURE. No prisma, no I/O, no clock. Callers load the numbers; this decides.
//
// ─── THE FEE-BASE RULE (LOCKED 2026-07-15, Pavel: see CLAUDE.md) ──────────────
//   A component belongs in the creator fee base IF AND ONLY IF a partner/creator
//   both SETS its price AND KEEPS the proceeds.
//
// That single rule predicts every real marketplace: Etsy/eBay/Amazon put shipping in
// the base because SELLERS set and pocket it; Faire (the closest B2B analogue)
// commissions order-subtotal ONLY and reimburses shipping at cost; POD suppliers take
// 0% and go cost-plus. Applied here:
//
//   IN  the base: the whole production subtotal (manufacturing, print, packaging,
//                 decoration, component upgrades, finishes, and as they land:
//                 tooling/plates, rush, prepress/Pantone/proofs, extra versions)
//                 + FC labeling. All partner-set, all creator-paid.
//   OUT of base : SHIPPING. It fails BOTH limbs: WE quote it from the carrier and WE
//                 keep the margin (firstLegMarginBps), so a partner cannot shift
//                 production price into it to dodge the fee. Charging the fee on it
//                 would tax our own markup. TAX: never (nobody sets it, nobody keeps
//                 it).
//
// THE LIVE RISK this shape exists to catch: any NEW partner-priced, creator-paid line
// added OUTSIDE productionSubtotal is a fee-arbitrage vector (quote a low unit price
// + a fat setup fee and the take rate silently shrinks). Add such fees to
// `PricingInput.production`, never as a sibling of it.

import { creatorFeeCents, type FeeRuleBounds } from './creator-fee'

/** A single creator-facing money line. `inFeeBase` is the rule, made visible. */
export interface PriceLine {
  kind:
    | 'PRODUCT' // manufacturer's production price (post-discount)
    | 'DECORATION' // printer's decoration price for the primary component
    | 'COMPONENTS' // component-upgrade surcharges
    | 'PACKAGING' // packaging material
    | 'PRINTING' // label/print leg
    | 'FINISHES' // foil / spot UV / emboss (incl. their setup)
    | 'SETUP' // tooling, plates, prepress, rush (PP-6/PP-7; partner-set)
    | 'FC_LABELING' // FC applies labels: a production service, so IN the base
    | 'PLATFORM_FEE' // our tier take (15/12/8)
    | 'SHIPPING' // carrier-quoted by US, our margin: OUT of the base
    | 'TAX' // destination-computed by a tax engine: NEVER in the base
  label: string
  cents: number
  /** True = counted in the platform-fee base (the rule above). */
  inFeeBase: boolean
}

export interface PricingInput {
  /**
   * Everything a partner SETS and KEEPS. Every one of these is in the fee base.
   * `cents` are already quantity-extended (the caller does qty math).
   */
  production: Array<{ kind: PriceLine['kind']; label: string; cents: number }>
  /** FC labeling: a production service, so it joins the fee base (LOCKED). */
  fcLabelingCents?: number
  /** Carrier-quoted. OUT of the fee base. */
  shippingCents?: number
  /** Engine-computed at the destination. NEVER in the fee base. */
  taxCents?: number
  /** The creator's tier rate in bps (15/12/8), resolved via resolveCreatorFeeBps. */
  feeBps: number
  /** Admin FeeRule bounds (flat/min/max) applied by creatorFeeCents. */
  feeBounds?: FeeRuleBounds
}

export interface PricedOrder {
  lineItems: PriceLine[]
  /** Sum of everything a partner sets+keeps, pre-fee. */
  productionSubtotalCents: number
  /** productionSubtotal + fcLabeling. The ONLY thing the tier rate multiplies. */
  feeBaseCents: number
  platformFeeCents: number
  shippingCents: number
  taxCents: number
  /** What the creator actually pays. placeOrder charges exactly this. */
  totalCents: number
}

/**
 * The canonical order price (Pavel 2026-07-15):
 *
 *   productionSubtotal = (Products - Discounts) + Decoration + ComponentUpgrades
 *                      + Packaging + Printing + Finishes + Setup/tooling/rush/prepress
 *   feeBase            = productionSubtotal + FCLabeling
 *   platformFee        = clamp(feeBase * tierRate)          // 15 / 12 / 8
 *   total              = productionSubtotal + FCLabeling + platformFee + Shipping + Tax
 *
 * Fee rides ON TOP (it is the Stripe application fee), shipping + tax sit OUTSIDE the
 * base, and storage is NOT here at all: it accrues over time and bills as its own
 * event, not at checkout.
 */
export function computeOrderPricing(input: PricingInput): PricedOrder {
  const production = input.production.map<PriceLine>((l) => ({
    kind: l.kind,
    label: l.label,
    cents: Math.round(l.cents),
    inFeeBase: true, // by construction: `production` is the sets-price-AND-keeps set
  }))
  const productionSubtotalCents = production.reduce((s, l) => s + l.cents, 0)

  const fcLabelingCents = Math.round(input.fcLabelingCents ?? 0)
  const shippingCents = Math.round(input.shippingCents ?? 0)
  const taxCents = Math.round(input.taxCents ?? 0)

  // LOCKED: FC labeling is a production service, so it is in the base.
  const feeBaseCents = productionSubtotalCents + fcLabelingCents
  const platformFeeCents = creatorFeeCents(feeBaseCents, input.feeBps, input.feeBounds)

  const lineItems: PriceLine[] = [...production]
  if (fcLabelingCents > 0) {
    lineItems.push({ kind: 'FC_LABELING', label: 'FC labeling', cents: fcLabelingCents, inFeeBase: true })
  }
  lineItems.push({ kind: 'PLATFORM_FEE', label: 'Platform fee', cents: platformFeeCents, inFeeBase: false })
  if (shippingCents > 0) {
    lineItems.push({ kind: 'SHIPPING', label: 'Shipping', cents: shippingCents, inFeeBase: false })
  }
  if (taxCents > 0) {
    lineItems.push({ kind: 'TAX', label: 'Tax', cents: taxCents, inFeeBase: false })
  }

  return {
    lineItems,
    productionSubtotalCents,
    feeBaseCents,
    platformFeeCents,
    shippingCents,
    taxCents,
    totalCents: feeBaseCents + platformFeeCents + shippingCents + taxCents,
  }
}

/**
 * PP-0 shadow helper: compare the unified price against what the live path charges,
 * so the delta can be logged BEFORE the charge ever changes. Positive delta = the
 * creator is currently UNDER-charged (the live path is dropping fee-base lines).
 */
export function pricingDelta(unified: PricedOrder, liveTotalCents: number): {
  deltaCents: number
  deltaPct: number
  underCharging: boolean
} {
  const deltaCents = unified.totalCents - Math.round(liveTotalCents)
  return {
    deltaCents,
    deltaPct: liveTotalCents > 0 ? Math.round((deltaCents / liveTotalCents) * 10000) / 100 : 0,
    underCharging: deltaCents > 0,
  }
}
