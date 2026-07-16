// Phase L1 — destination-card eligibility for checkout Step 4
// (docs/LOGISTICS_AND_FULFILLMENT.md §2, §9). PURE: callers fetch the inputs
// (product flags, manufacturer storage capabilities, logistics gates, channel
// connections) and this module decides which of the 4 destination types are
// offered and why not — so the UI never shows a card the server would reject,
// and the server action re-runs the same check (server-enforced, like domains).
//
// ─── "ON-DEMAND" MEANS THREE DIFFERENT THINGS HERE. READ THIS FIRST. ─────────
// They are three distinct businesses that happen to share one English phrase.
// Do NOT merge them, and do NOT assume a value from one is comparable to another:
//
//   1. MAKE-TO-ORDER, as a MANUFACTURING CAPABILITY.
//      `FulfillmentMode.ON_DEMAND` (schema.prisma:6785). "We produce small / no-MOQ
//      batches." A PRICING dimension: it selects a different band set
//      (ProductTemplatePricingTier.fulfillmentMode, inside a @@unique) and a
//      different MOQ. Backed by a real Postgres enum (migration 20260605160000).
//
//   2. MAKE-TO-ORDER, as a CHANNEL LISTING MODE.
//      `ChannelListingMode.ON_DEMAND` (schema.prisma:5736) + `OnDemandEnablement`.
//      "A consumer order on Shopify triggers a production order to the pinned
//      manufacturer." A per-listing GATE. Docs: CHANNEL_MANAGEMENT_SPEC §15-17.
//      NOTE 1 and 2 are BOTH "make-to-order" in prose but are different AXES:
//      nothing checks the capability (1) when granting the listing gate (2).
//
//   3. SHIP-FROM-STOCK, the opposite business.
//      `StorageMode.ON_DEMAND` (schema.prisma:9256) + `PartnerService.onDemandEnabled`.
//      "The partner picks/packs a parcel out of stock ALREADY MADE and sitting at
//      their facility." Nothing is produced. The money is pickFeeCents +
//      packFeeCents, not a production subtotal. Docs: LOGISTICS_AND_FULFILLMENT §4.
//
// This file deals in (1)/(3)-adjacent territory, so `FulfillmentOrderType` below
// spells its make-to-order member MADE_TO_ORDER rather than ON_DEMAND. See
// docs/ON_DEMAND_DISAMBIGUATION_2026-07-16.md for the full map + rename plan.

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
  storageClasses: string[]
  maxDwellDays: number | null
  /** Product shelf life (days) if known — HOLD requires shelf life ≥ dwell policy. */
  productShelfLifeDays?: number | null
  // REMOVED 2026-07-16: `onDemandEnabled` + `canShipParcel`. They were DECLARED
  // here and read NOWHERE (the HOLD gate below reads only offersStorage,
  // storageClasses, maxDwellDays, productShelfLifeDays), while two callers loaded
  // them from the DB and dutifully passed them in.
  //
  // Deleting them is the point, not tidiness. "on-demand" means THREE different
  // things in this codebase (see the header block above), and this file contained
  // TWO of them 84 lines apart: `onDemandEnabled` (SHIP-from-stock) up here, and
  // `FulfillmentOrderType`'s make-to-order member down there. A dead field that
  // READS like HOLD eligibility depends on ship-on-demand capability is exactly
  // what the next person "wires up" - with a coin-flip chance of wiring the wrong
  // meaning into a money gate. The real ship-on-demand read lives where it belongs,
  // in cart-actions.ts (`svc.onDemandEnabled && svc.canShipParcel` gating
  // StorageAgreement.mode) and in shipping/storage-offering-rules.ts (guard 4).
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

/**
 * What KIND of order is asking for a destination.
 *
 * `MADE_TO_ORDER` was `ON_DEMAND` until 2026-07-16. Renamed because this file also
 * carried `onDemandEnabled` (SHIP-from-stock, the opposite business) 84 lines above
 * it, and "on-demand" already names three distinct things in this codebase (header).
 * TS-only, never persisted, so the rename is free: take the free ones.
 */
export type FulfillmentOrderType = 'BULK' | 'SAMPLE' | 'MADE_TO_ORDER'

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
