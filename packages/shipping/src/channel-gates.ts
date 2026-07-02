/**
 * Phase L3 — channel-inbound eligibility gates (docs/LOGISTICS_AND_FULFILLMENT.md §7).
 * PURE. Evaluated at ORDER PLACEMENT (never at the dock) and re-checked server-side
 * before an inbound plan is confirmed. Encodes the hard channel facts:
 *   - No US channel FC accepts 3P refrigerated/frozen inbound (FBA/WFS/FBT).
 *   - WFS accepts NO temperature-sensitive products at all (no meltable window).
 *   - FBA/FBT meltable acceptance window: Oct 16 – Apr 14.
 *   - Shelf-life floor at check-in (Amazon ≈105 days practical; channel × category
 *     parameter — OrderSettings.channelMinShelfLifeDays is the default).
 *   - Aerosols/flammables need the channel's dangerous-goods program.
 */

export type InboundChannel = 'AMAZON_FBA' | 'WALMART_WFS' | 'TIKTOK_FBT'

export interface ChannelGateInput {
  channel: InboundChannel
  storageClass: string // StorageClass value
  hazmatClass: string // HazmatClass value
  meltable: boolean
  /** Product shelf life (days) at production; null = unknown. */
  shelfLifeDays: number | null
  /** Production lead + transit to the channel FC (days). */
  daysUntilCheckIn: number
  /** Channel minimum remaining shelf life at check-in (default 105). */
  channelMinShelfLifeDays: number
  /** Planned FC check-in date (for the meltable window). */
  checkInDate: Date
  /** Creator's DG program enrollment for this channel (Amazon DG etc.). */
  dgProgramApproved: boolean
}

export interface ChannelGateResult {
  eligible: boolean
  /** Human copy, shown verbatim in checkout / admin. */
  reasons: string[]
}

/** FBA/FBT meltable window: accepted Oct 16 (10-16) through Apr 14 (04-14). */
export function inMeltableAcceptanceWindow(date: Date): boolean {
  const m = date.getMonth() + 1
  const d = date.getDate()
  const mmdd = m * 100 + d
  return mmdd >= 1016 || mmdd <= 414
}

export function evaluateChannelInboundGates(input: ChannelGateInput): ChannelGateResult {
  const reasons: string[] = []

  // Temperature — hard, all channels.
  if (input.storageClass === 'CHILLED' || input.storageClass === 'FROZEN') {
    reasons.push(
      'No US sales channel accepts refrigerated or frozen inbound from sellers — use a cold-chain fulfillment center and seller-fulfilled listings instead.',
    )
  }

  // WFS: no temperature-sensitive products at all (stricter than FBA).
  if (input.channel === 'WALMART_WFS' && (input.meltable || input.storageClass === 'PROTECT_HEAT')) {
    reasons.push('Walmart WFS does not accept temperature-sensitive products (no seasonal window).')
  }

  // FBA/FBT meltable window.
  if ((input.channel === 'AMAZON_FBA' || input.channel === 'TIKTOK_FBT') && input.meltable) {
    if (!inMeltableAcceptanceWindow(input.checkInDate)) {
      reasons.push(
        'Meltable products are only accepted at the channel between Oct 16 and Apr 14 — inventory remaining after Apr 15 is destroyed at seller expense. Choose a fulfillment center for this run instead.',
      )
    }
  }

  // Shelf-life floor: expiry − (lead + transit) must leave ≥ channel minimum.
  if (input.shelfLifeDays !== null) {
    const remainingAtCheckIn = input.shelfLifeDays - input.daysUntilCheckIn
    if (remainingAtCheckIn < input.channelMinShelfLifeDays) {
      reasons.push(
        `This lot would arrive with ~${Math.max(0, remainingAtCheckIn)} days of shelf life — the channel requires at least ${input.channelMinShelfLifeDays} days at check-in.`,
      )
    }
  }

  // Dangerous goods.
  if ((input.hazmatClass === 'AEROSOL_2_1' || input.hazmatClass === 'LQ_FLAMMABLE') && !input.dgProgramApproved) {
    reasons.push(
      input.channel === 'AMAZON_FBA'
        ? 'This product is classified as dangerous goods — enroll in the FBA Dangerous Goods program (SDS review) before shipping inbound.'
        : 'This product is classified as dangerous goods and is restricted at this channel.',
    )
  }

  return { eligible: reasons.length === 0, reasons }
}

// ---------------------------------------------------------------------------
// Amazon inbound placement optimizer (§7.2): 1 destination + per-unit fee vs
// 4+ destinations + $0 fee but multiplied freight legs.
// ---------------------------------------------------------------------------

export interface PlacementOptimizerInput {
  units: number
  /** Amazon's minimal-splits placement fee per unit (from placement options). */
  minimalSplitFeePerUnitCents: number
  /** Estimated freight cost for ONE destination leg (the shipment as planned). */
  freightPerDestinationCents: number
  /** Destination count Amazon assigns under optimized splits (typically 4–5). */
  optimizedDestinationCount: number
}

export interface PlacementDecision {
  choice: 'MINIMAL_SPLITS' | 'OPTIMIZED_SPLITS'
  minimalTotalCents: number
  optimizedTotalCents: number
  savingsCents: number
}

export function decidePlacementSplits(input: PlacementOptimizerInput): PlacementDecision {
  // Minimal: one freight leg + per-unit placement fee.
  const minimalTotalCents = input.freightPerDestinationCents + input.units * input.minimalSplitFeePerUnitCents
  // Optimized: N freight legs (each leg carries less but LTL/parcel minimums
  // dominate at CPG launch volumes — V1 approximates each extra leg at 70% of
  // the single-leg cost; refine with real per-leg quotes in V2).
  const optimizedTotalCents = Math.round(
    input.freightPerDestinationCents * (1 + 0.7 * (input.optimizedDestinationCount - 1)),
  )
  const choice = minimalTotalCents <= optimizedTotalCents ? 'MINIMAL_SPLITS' : 'OPTIMIZED_SPLITS'
  return {
    choice,
    minimalTotalCents,
    optimizedTotalCents,
    savingsCents: Math.abs(minimalTotalCents - optimizedTotalCents),
  }
}
