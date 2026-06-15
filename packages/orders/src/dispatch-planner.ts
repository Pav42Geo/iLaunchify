// Pure dispatch-planning core (docs/MULTI_COMPONENT_DISPATCH.md).
//
// This module holds the DETERMINISTIC, side-effect-free decision logic that turns
// one routed OrderItem + its packaging components into the set of dispatch rows
// (PRODUCT / LABEL / COPACKING) the order needs. It is intentionally DB-agnostic:
// `createDispatches` (in routing.ts) does the I/O — fetch order, run findRouting,
// query components, open the transaction, notify — and delegates every branching
// decision here so the risky part is unit-testable without a live database.
//
// Nothing in this file imports Prisma or the db client. Callers pass normalized
// plain objects (see ComponentLeg / ItemRouting) and get plain DispatchRow[] back.

/** A partner service in the exact shape the liveness gate needs. */
export interface PlannerLiveService {
  id: string
  type: string
  status: string
  partner: { status: string; userId: string; user: { stripeAccountStatus: string } | null }
}

/** A packaging component reduced to what dispatch planning cares about. */
export interface ComponentLeg {
  role: string
  decorationMethod: string
  /** The partner service of the chosen offering for this component, if any. */
  partnerService: PlannerLiveService | null
}

/** The owner-pinned routing result for a single item (subset of RoutingResult). */
export interface ItemRouting {
  manufacturingServiceId: string
  manufacturingUserId: string
  labelPrintingServiceId: string
  labelPrintingUserId: string
}

/** One row to be inserted into OrderDispatch. */
export interface DispatchRow {
  orderId: string
  orderItemId: string
  type: 'PRODUCT' | 'LABEL' | 'COPACKING'
  partnerServiceId: string
  status: 'PENDING_ACCEPT'
  acceptDeadlineAt: Date
  costCents: number
}

export interface ItemDispatchPlan {
  rows: DispatchRow[]
  manufacturerUserId: string
  /** Deduped within the item. */
  printUserIds: string[]
  /** Deduped within the item; empty when there's no assembly leg. */
  assemblyUserIds: string[]
  /** The first print leg's service — recorded as the order's denormalized printer. */
  primaryPrintServiceId: string
}

/**
 * A partner service is "live" (routable) only when the service is ACTIVE, the
 * partner org is ACTIVE, and the partner's Stripe payout account is ACTIVE — so we
 * never dispatch to someone who can't be paid.
 */
export function isLive(
  svc: { status: string; partner: { status: string; user: { stripeAccountStatus: string } | null } } | null | undefined,
): boolean {
  return (
    !!svc &&
    svc.status === 'ACTIVE' &&
    svc.partner.status === 'ACTIVE' &&
    svc.partner.user?.stripeAccountStatus === 'ACTIVE'
  )
}

/**
 * Estimate dispatch costs from the order economics. V1 uses naive percentages —
 * manufacturer 30%, printer 8%, co-packer 7% (the co-pack slice only lands when
 * there's an assembly leg). V1.5+ pulls real per-component pricing from the partner
 * profile (docs/MULTI_COMPONENT_DISPATCH.md C1).
 */
export function estimateDispatchCosts(params: {
  productId: string
  quantity: number
  unitPriceCents: number
}): { manufacturerCostCents: number; printProviderCostCents: number; coPackerCostCents: number } {
  const total = params.unitPriceCents * params.quantity
  return {
    manufacturerCostCents: Math.floor(total * 0.3),
    printProviderCostCents: Math.floor(total * 0.08),
    coPackerCostCents: Math.floor(total * 0.07),
  }
}

/**
 * Plan every dispatch row for ONE routed OrderItem. Pure: same inputs → same rows.
 *
 * - **PRODUCT** — exactly one, to the owner-pinned manufacturer.
 * - **LABEL** — one per DISTINCT live decorated-component LABEL_PRINTING provider
 *   (components sharing a provider collapse into one leg). When no decorated
 *   component has a live print provider, falls back to the single leg findRouting
 *   resolved (chosen offering or owner self-label) — identical to a simple product.
 * - **COPACKING** — only when a CARTON/SHIPPER component exists (variety / multipack):
 *   one per distinct live assembler, else the manufacturer self-assembles. No
 *   CARTON/SHIPPER component → no co-pack leg at all.
 *
 * Cost is split evenly across the legs of each kind (C1, naive V1).
 */
export function deriveItemDispatch(params: {
  orderId: string
  item: { id: string; productId: string; quantity: number; unitPriceCents: number }
  routing: ItemRouting
  components: ComponentLeg[]
  acceptDeadlineAt: Date
}): ItemDispatchPlan {
  const { orderId, item, routing, components, acceptDeadlineAt } = params

  // Print legs — distinct live decorated-component LABEL_PRINTING providers.
  const printLegMap = new Map<string, { serviceId: string; userId: string }>()
  for (const c of components) {
    const svc = c.partnerService
    if (c.decorationMethod !== 'NONE' && svc && svc.type === 'LABEL_PRINTING' && isLive(svc)) {
      printLegMap.set(svc.id, { serviceId: svc.id, userId: svc.partner.userId })
    }
  }
  const printLegs =
    printLegMap.size > 0
      ? [...printLegMap.values()]
      : [{ serviceId: routing.labelPrintingServiceId, userId: routing.labelPrintingUserId }]

  // Assembly legs — only for CARTON/SHIPPER components; distinct live assemblers,
  // else the manufacturer self-assembles.
  const assemblyComponents = components.filter((c) => c.role === 'CARTON' || c.role === 'SHIPPER')
  const assemblyLegMap = new Map<string, { serviceId: string; userId: string }>()
  if (assemblyComponents.length > 0) {
    for (const c of assemblyComponents) {
      const svc = c.partnerService
      if (isLive(svc) && svc) assemblyLegMap.set(svc.id, { serviceId: svc.id, userId: svc.partner.userId })
    }
    if (assemblyLegMap.size === 0) {
      assemblyLegMap.set(routing.manufacturingServiceId, {
        serviceId: routing.manufacturingServiceId,
        userId: routing.manufacturingUserId,
      })
    }
  }
  const assemblyLegs = [...assemblyLegMap.values()]

  const costs = estimateDispatchCosts({
    productId: item.productId,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
  })
  const perPrintCostCents = Math.floor(costs.printProviderCostCents / printLegs.length)
  const perAssemblyCostCents =
    assemblyLegs.length > 0 ? Math.floor(costs.coPackerCostCents / assemblyLegs.length) : 0

  const rows: DispatchRow[] = [
    {
      orderId,
      orderItemId: item.id,
      type: 'PRODUCT',
      partnerServiceId: routing.manufacturingServiceId,
      status: 'PENDING_ACCEPT',
      acceptDeadlineAt,
      costCents: costs.manufacturerCostCents,
    },
    ...printLegs.map((leg) => ({
      orderId,
      orderItemId: item.id,
      type: 'LABEL' as const,
      partnerServiceId: leg.serviceId,
      status: 'PENDING_ACCEPT' as const,
      acceptDeadlineAt,
      costCents: perPrintCostCents,
    })),
    ...assemblyLegs.map((leg) => ({
      orderId,
      orderItemId: item.id,
      type: 'COPACKING' as const,
      partnerServiceId: leg.serviceId,
      status: 'PENDING_ACCEPT' as const,
      acceptDeadlineAt,
      costCents: perAssemblyCostCents,
    })),
  ]

  return {
    rows,
    manufacturerUserId: routing.manufacturingUserId,
    printUserIds: [...new Set(printLegs.map((l) => l.userId))],
    assemblyUserIds: [...new Set(assemblyLegs.map((l) => l.userId))],
    primaryPrintServiceId: printLegs[0]!.serviceId,
  }
}
