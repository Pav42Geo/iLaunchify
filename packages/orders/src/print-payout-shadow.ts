// Print-payout SHADOW (groundwork for PP-1 payout wiring). A printer can now author
// real per-press price bands in the PP-7 builder (PartnerPrintPriceBand). This module
// computes what those bands WOULD pay a distinct print leg for the job quantity — via
// the same evaluator the builder's live check runs (selectPrintProcess) — and LOGS it
// next to what the leg is paid today (the authored decoration payout). It changes NO
// payout. Flag-gated OFF by default, fully guarded, so we can watch band-vs-current on
// real orders before ever flipping the payout onto the bands.
//
// WHY shadow-first: the "real" print payout is the N>1 print-unbundling problem
// (dispatch-planner.ts:143-146) — parked precisely because it needs real band data and
// a live money path is unforgiving. This gathers that data without touching a cent.
// Mirrors isCopackRealPriceEnabled (CP-3) + logOverrunShadow (MB) shape.

import { prisma, getLogisticsSettings } from '@ilaunchify/db'
import { selectPrintProcess, type PriceCurveSegment } from './print-price'

const PRINT_PAYOUT_SHADOW_FLAG = 'pricing:print_payout_shadow'

/** OFF by default (getLogisticsSettings fails closed to {}). Admin flips it to observe. */
export async function isPrintPayoutShadowEnabled(): Promise<boolean> {
  const gates = await getLogisticsSettings().catch(() => ({}) as Record<string, unknown>)
  return gates[PRINT_PAYOUT_SHADOW_FLAG] === true
}

/**
 * A print service's ACTIVE price bands as evaluator segments (one per band, tagged by
 * its press's process). Empty when the printer has authored none — which is most of
 * them today, so the shadow is naturally rare and safe. Gated on the PP-7 db:push.
 */
export async function loadPrintServiceSegments(partnerServiceId: string): Promise<PriceCurveSegment[]> {
  const presses = await prisma.partnerPrintPress.findMany({
    where: { partnerServiceId, status: 'ACTIVE' },
    select: {
      process: true,
      priceBands: {
        where: { status: 'ACTIVE' },
        select: { baseQty: true, basePriceCents: true, incrementQty: true, incrementPriceCents: true, maxQty: true, quoteRequired: true },
      },
    },
  })
  return presses.flatMap((p) =>
    p.priceBands.map((b) => ({
      printProcess: p.process,
      baseQty: b.baseQty,
      basePriceCents: b.basePriceCents,
      incrementQty: b.incrementQty,
      incrementPriceCents: b.incrementPriceCents,
      maxQty: b.maxQty ?? Number.MAX_SAFE_INTEGER,
      quoteRequired: b.quoteRequired,
    })),
  )
}

/**
 * Log the band-derived print price for one distinct print leg vs its current payout.
 * NEVER changes the payout; NEVER throws to the caller (all guarded). No-op when the
 * flag is off, the qty is non-positive, or the printer authored no bands.
 */
export async function logPrintPayoutShadow(args: {
  printServiceId: string
  qtyUnits: number
  currentPayoutCents: number
  orderId: string
  orderItemId: string
}): Promise<void> {
  try {
    if (!(await isPrintPayoutShadowEnabled())) return
    if (!(args.qtyUnits > 0)) return
    const segments = await loadPrintServiceSegments(args.printServiceId)
    if (segments.length === 0) return
    const winner = selectPrintProcess(segments, args.qtyUnits)
    const bandCents = winner?.cents ?? null
    const delta = bandCents != null ? `delta=${bandCents - args.currentPayoutCents}c ` : ''
    const via = winner ? `via ${winner.segment.printProcess}${winner.segment.quoteRequired ? ' (quote-only)' : ''}. ` : ''
    console.log(
      `[print payout shadow] order=${args.orderId} item=${args.orderItemId} printService=${args.printServiceId} ` +
        `qty=${args.qtyUnits} bandDerived=${bandCents == null ? 'none/off-lattice' : bandCents + 'c'} ` +
        `current=${args.currentPayoutCents}c ${delta}${via}Payout unchanged.`,
    )
  } catch (err) {
    console.error('[print payout shadow] failed:', (err as Error).message)
  }
}
