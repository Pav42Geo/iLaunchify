// planShipmentHops — per-hop inter-partner leg planning (PS-7,
// docs/PRINT_PROVIDER_SELECTION.md §8.3 + §8.5 decisions 2026-07-11).
//
// Every inter-partner physical move is an EXPLICIT, separately-attributed hop:
//   LABELS          printer → application point (the honey-problem leg)
//   GOODS_TRANSFER  manufacturer → co-packer (unlabeled goods to the applier)
//   FINISHED_GOODS  last holder → order destination (or a return-to-mfr leg
//                   for HOLD_AT_MANUFACTURER when application happened away)
//
// This module DECIDES the hop list and WHO PAYS each hop; it does not price
// them (callers pass cents from the estimator / rate shop) and it does not
// touch the DB. Code's dispatch-planner consumes the output to set
// OrderDispatch.shipToNodeId and emit PLANNED ShipmentLeg rows; checkout
// consumes it for the single-Shipping-line per-hop breakdown.
//
// Freight bearer (Pavel 2026-07-11): inter-partner hops (LABELS,
// GOODS_TRANSFER) bill to the CREATOR by default — quoted inside the single
// Shipping line. Admin flip `billing:platform_pays_interpartner_freight`
// (LogisticsSetting) moves them to PLATFORM absorption. Because every hop is
// its own ledger item, flipping the bearer is billing attribution only —
// routing never changes. FINISHED_GOODS always bills the creator (that's
// ordinary shipping, not an orchestration artifact).

import type { ApplicationPointResult } from './application-point'

export type HopKind = 'LABELS' | 'GOODS_TRANSFER' | 'FINISHED_GOODS'
export type HopBillTo = 'CREATOR' | 'PLATFORM'

export type HopNodeKind =
  | 'PRINTER'
  | 'MANUFACTURER'
  | 'COPACKER'
  | 'FC'
  | 'CREATOR_ADDRESS'
  | 'CHANNEL'

export interface HopNode {
  kind: HopNodeKind
  /** PartnerService.id for partner nodes; null for CREATOR_ADDRESS / CHANNEL. */
  serviceId: string | null
}

export interface PlannedHop {
  kind: HopKind
  from: HopNode
  to: HopNode
  costCents: number
  billTo: HopBillTo
}

export type HopDestinationKind =
  | 'CREATOR_ADDRESS'
  | 'WAREHOUSE_PARTNER'
  | 'HOLD_AT_MANUFACTURER'
  | 'CHANNEL_INBOUND'

export interface HopPlanInput {
  /** Output of resolveApplicationPoint for the order's decorated component. */
  applicationPoint: ApplicationPointResult
  /** True when a separate print partner produces the decoration. */
  externalPrint: boolean
  printerServiceId: string | null
  manufacturerServiceId: string
  /** Present only when the graph has a co-pack leg. */
  coPackerServiceId?: string | null
  destination: {
    kind: HopDestinationKind
    /** WAREHOUSE PartnerService.id when kind = WAREHOUSE_PARTNER. */
    fcServiceId?: string | null
  }
  /** Pricing from the estimator / rate shop — this module only attributes. */
  costs: {
    labelHopCents: number
    goodsTransferCents: number
    finishedGoodsCents: number
  }
  /** LogisticsSetting `billing:platform_pays_interpartner_freight`.
   *  false (default) = creator pays inter-partner hops. */
  platformPaysInterPartnerFreight: boolean
}

export interface HopPlan {
  hops: PlannedHop[]
  /** The application-point node — Code writes this to OrderDispatch.shipToNodeId
   *  on the LABEL dispatch (labels ALWAYS address the application point, never
   *  the order destination). Null when no application step exists. */
  labelShipToServiceId: string | null
  /** Total billed to the creator's single Shipping line. */
  creatorShippingCents: number
  /** Total absorbed by the platform (0 unless the admin flipped the bearer). */
  platformAbsorbedCents: number
}

function destinationNode(d: HopPlanInput['destination']): HopNode | null {
  switch (d.kind) {
    case 'CREATOR_ADDRESS':
      return { kind: 'CREATOR_ADDRESS', serviceId: null }
    case 'WAREHOUSE_PARTNER':
      return { kind: 'FC', serviceId: d.fcServiceId ?? null }
    case 'CHANNEL_INBOUND':
      return { kind: 'CHANNEL', serviceId: null }
    case 'HOLD_AT_MANUFACTURER':
      return null // goods stay (or return to) the manufacturer — handled below
  }
}

/**
 * Plan the physical hop list for one routed order item. Requires a RESOLVED
 * graph — callers run validateGraphCompleteness first (publish gate + checkout
 * pre-flight); passing an UNRESOLVED result throws, because an order that
 * cannot terminate in a finished product must be unplaceable by construction.
 */
export function planShipmentHops(input: HopPlanInput): HopPlan {
  if (!input.applicationPoint.ok) {
    throw new Error(
      'planShipmentHops: graph is UNRESOLVED — run validateGraphCompleteness before planning hops',
    )
  }

  const interPartnerBillTo: HopBillTo = input.platformPaysInterPartnerFreight
    ? 'PLATFORM'
    : 'CREATOR'
  const hops: PlannedHop[] = []
  const appNode = input.applicationPoint.node

  // ── LABELS: printer → application point (only when a separate print partner
  // exists AND application happens somewhere — self-label and printed-in
  // decoration have no label leg at all).
  if (input.externalPrint && appNode && input.printerServiceId) {
    hops.push({
      kind: 'LABELS',
      from: { kind: 'PRINTER', serviceId: input.printerServiceId },
      to: { kind: appNode.kind, serviceId: appNode.serviceId },
      costCents: input.costs.labelHopCents,
      billTo: interPartnerBillTo,
    })
  }

  // ── Goods path: MANUFACTURER → (application point if elsewhere) → destination.
  // The unlabeled goods PHYSICALLY travel to wherever application happens.
  const dest = destinationNode(input.destination)
  let goodsHolder: HopNode = { kind: 'MANUFACTURER', serviceId: input.manufacturerServiceId }

  if (appNode?.kind === 'COPACKER') {
    // GOODS_TRANSFER: manufacturer → co-packer (inter-partner, bearer-attributed).
    hops.push({
      kind: 'GOODS_TRANSFER',
      from: goodsHolder,
      to: { kind: 'COPACKER', serviceId: appNode.serviceId },
      costCents: input.costs.goodsTransferCents,
      billTo: interPartnerBillTo,
    })
    goodsHolder = { kind: 'COPACKER', serviceId: appNode.serviceId }
  } else if (appNode?.kind === 'FC') {
    // FC-finalize: the mfr → FC move IS the main freight to the destination
    // (resolver step 3 only yields the order's ship-to FC). One hop, creator
    // pays — it's ordinary destination shipping that happens to arrive
    // unlabeled and get finished on the FC floor.
    hops.push({
      kind: 'FINISHED_GOODS',
      from: goodsHolder,
      to: { kind: 'FC', serviceId: appNode.serviceId },
      costCents: input.costs.finishedGoodsCents,
      billTo: 'CREATOR',
    })
    goodsHolder = { kind: 'FC', serviceId: appNode.serviceId }
  }

  // ── FINISHED_GOODS: current holder → destination (when not already there).
  if (dest) {
    const alreadyThere = dest.kind === goodsHolder.kind && dest.serviceId === goodsHolder.serviceId
    if (!alreadyThere) {
      hops.push({
        kind: 'FINISHED_GOODS',
        from: goodsHolder,
        to: dest,
        costCents: input.costs.finishedGoodsCents,
        billTo: 'CREATOR',
      })
    }
  } else if (goodsHolder.kind !== 'MANUFACTURER') {
    // HOLD_AT_MANUFACTURER with application away from the manufacturer:
    // the finished goods ship BACK to the manufacturer for storage (§8.4).
    hops.push({
      kind: 'FINISHED_GOODS',
      from: goodsHolder,
      to: { kind: 'MANUFACTURER', serviceId: input.manufacturerServiceId },
      costCents: input.costs.finishedGoodsCents,
      billTo: 'CREATOR',
    })
  }

  let creatorShippingCents = 0
  let platformAbsorbedCents = 0
  for (const hop of hops) {
    if (hop.billTo === 'CREATOR') creatorShippingCents += hop.costCents
    else platformAbsorbedCents += hop.costCents
  }

  return {
    hops,
    labelShipToServiceId: input.externalPrint && appNode ? appNode.serviceId : null,
    creatorShippingCents,
    platformAbsorbedCents,
  }
}
