// Phase L1 — destination-card eligibility for checkout Step 4
// (docs/LOGISTICS_AND_FULFILLMENT.md §2, §9). PURE: callers fetch the inputs
// (product flags, manufacturer storage capabilities, logistics gates, channel
// connections) and this module decides which of the 4 destination types are
// offered and why not — so the UI never shows a card the server would reject,
// and the server action re-runs the same check (server-enforced, like domains).

export type DestinationType =
  | 'CREATOR_ADDRESS'
  | 'WAREHOUSE_PARTNER'
  | 'HOLD_AT_MANUFACTURER'
  | 'CHANNEL_INBOUND'

export interface DestinationProductInput {
  storageClass: string // StorageClass value
  hazmatClass: string // HazmatClass value
  domain: string // labeling-type vocabulary (FOOD / DIETARY_SUPPLEMENT / …)
}

export interface ManufacturerStorageInput {
  offersStorage: boolean
  onDemandEnabled: boolean
  canShipParcel: boolean
  storageClasses: string[]
  maxDwellDays: number | null
  /** Product shelf life (days) if known — HOLD requires shelf life ≥ dwell policy. */
  productShelfLifeDays?: number | null
}

export interface DestinationContext {
  product: DestinationProductInput
  manufacturer: ManufacturerStorageInput | null
  /** LogisticsSetting gate map (getLogisticsSettings()). */
  gates: Record<string, boolean>
  /** Count of eligible ACTIVE WAREHOUSE services (post Phase-1 filter). */
  eligibleWarehouseCount: number
  /** Creator has ≥1 CONNECTED channel connection. */
  hasConnectedChannel: boolean
}

export interface DestinationOption {
  type: DestinationType
  enabled: boolean
  /** Human copy for a disabled card — shown verbatim in checkout. */
  disabledReason: string | null
}

export function resolveDestinationOptions(ctx: DestinationContext): DestinationOption[] {
  const options: DestinationOption[] = []

  // 1. Creator address — always offered (cold-chain parcel viability is a
  //    carrier-selection concern once cold classes are gated on).
  options.push({ type: 'CREATOR_ADDRESS', enabled: true, disabledReason: null })

  // 2. Fulfillment center — needs ≥1 eligible node for this storage class.
  if (ctx.eligibleWarehouseCount > 0) {
    options.push({ type: 'WAREHOUSE_PARTNER', enabled: true, disabledReason: null })
  } else {
    options.push({
      type: 'WAREHOUSE_PARTNER',
      enabled: false,
      disabledReason:
        ctx.product.storageClass === 'CHILLED' || ctx.product.storageClass === 'FROZEN'
          ? 'No cold-storage fulfillment center is available yet for this product.'
          : 'No fulfillment center can receive this product yet.',
    })
  }

  // 3. Hold at manufacturer — gate + partner capability + storage-class match.
  const holdGate = ctx.gates['destination:HOLD_AT_MANUFACTURER'] === true
  const m = ctx.manufacturer
  let holdReason: string | null = null
  if (!holdGate) holdReason = 'Storage at the manufacturer is not available yet.'
  else if (!m || !m.offersStorage) holdReason = 'This manufacturer does not offer storage.'
  else if (!m.storageClasses.includes(ctx.product.storageClass))
    holdReason = 'This manufacturer cannot store this product’s temperature class.'
  else if (
    m.maxDwellDays !== null &&
    m.productShelfLifeDays != null &&
    m.productShelfLifeDays < m.maxDwellDays
  )
    holdReason = 'This product’s shelf life is too short for the manufacturer’s storage program.'
  options.push({ type: 'HOLD_AT_MANUFACTURER', enabled: holdReason === null, disabledReason: holdReason })

  // 4. Channel inbound — gate + connected channel (adapters land Phase L3).
  const channelGate = ctx.gates['destination:CHANNEL_INBOUND'] === true
  let channelReason: string | null = null
  if (!channelGate) channelReason = 'Shipping directly into a sales channel is coming soon.'
  else if (!ctx.hasConnectedChannel)
    channelReason = 'Connect a sales channel in Settings → Channels first.'
  else if (ctx.product.storageClass === 'CHILLED' || ctx.product.storageClass === 'FROZEN')
    channelReason =
      'No US sales channel accepts refrigerated or frozen inbound from sellers — use a cold-chain fulfillment center instead.'
  options.push({ type: 'CHANNEL_INBOUND', enabled: channelReason === null, disabledReason: channelReason })

  return options
}

// ---------------------------------------------------------------------------
// AFE Level 1 — destination-TYPE recommendation (docs/FC_SELECTION_STRATEGY_BRIEF).
// Picks the smart DEFAULT among the enabled types, order-type-gated. On-demand +
// sample orders never stage to an FC (Level-0 gate) — they return no destination.
// The FC NODE pick (which center) is a separate step: the fc-scorer.
// ---------------------------------------------------------------------------

export type FulfillmentOrderType = 'BULK' | 'SAMPLE' | 'ON_DEMAND'

export interface DestinationRecommendation {
  /** The recommended default type, or null when fulfillment doesn't apply. */
  type: DestinationType | null
  /** One-line "why" for the UI. */
  reason: string
}

// Default priority for a BULK order that wants to sell online without shipping to
// self: platform FC first (channel-agnostic, hides orchestration) → channel-inbound
// (locks to one channel's network) → hold (delays stock reaching demand) → self
// (always available fallback).
const DESTINATION_DEFAULT_PRIORITY: DestinationType[] = [
  'WAREHOUSE_PARTNER',
  'CHANNEL_INBOUND',
  'HOLD_AT_MANUFACTURER',
  'CREATOR_ADDRESS',
]

const DESTINATION_REASON: Record<DestinationType, string> = {
  WAREHOUSE_PARTNER:
    "We'll auto-pick the best-matched fulfillment center so you can sell on your channels without shipping to yourself.",
  CHANNEL_INBOUND: 'Send the run straight into your connected sales channel’s fulfillment network.',
  HOLD_AT_MANUFACTURER: 'Keep the run stored at your manufacturer and release stock as you need it.',
  CREATOR_ADDRESS: 'Ship the full run to your own address.',
}

export function recommendDestination(
  options: DestinationOption[],
  opts: { orderType?: FulfillmentOrderType } = {},
): DestinationRecommendation {
  // Level-0 gate: FC/storage fulfillment applies ONLY to bulk. Sample + on-demand
  // never stage to a fulfillment center (samples ship to the creator; on-demand is
  // produced + shipped per buyer order at the producer).
  if (opts.orderType && opts.orderType !== 'BULK') {
    return {
      type: null,
      reason:
        opts.orderType === 'SAMPLE'
          ? 'Samples ship to you for review — no fulfillment center.'
          : 'On-demand orders are produced and shipped per buyer order — no fulfillment-center staging.',
    }
  }
  const enabled = new Set(options.filter((o) => o.enabled).map((o) => o.type))
  const pick = DESTINATION_DEFAULT_PRIORITY.find((t) => enabled.has(t)) ?? 'CREATOR_ADDRESS'
  return { type: pick, reason: DESTINATION_REASON[pick] }
}
