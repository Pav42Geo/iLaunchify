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
  /**
   * PS-7 (§8.2.5) — the NEXT physical node this leg ships to (OrderDispatch.shipToNodeId).
   * Stamped in createDispatches from the resolved application point: the LABEL leg
   * ships to the applier (manufacturer / co-packer / FC), the PRODUCT leg to the
   * co-packer on a GOODS_TRANSFER hop. Null = legacy addressing (order.shipTo*).
   */
  shipToNodeId?: string | null
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
 * PLACEHOLDER estimate for a DISTINCT printer / co-packer's carve-out only.
 *
 * NARROWED 2026-07-18 (Pavel "fix the split"). This used to decide the
 * MANUFACTURER's payout at 30% of the creator's price - which underpaid partners
 * and handed the platform a 62% production spread nobody authored. It no longer
 * touches the manufacturer: deriveItemDispatch gives the manufacturer the
 * REMAINDER (production minus distinct-partner carve-outs), so the legs sum to
 * production and the platform keeps only its fee + merit.
 *
 * ONLY `coPackerCostCents` (7%) is still consumed, as the documented interim for a
 * SEPARATE co-packer until co-pack authors a real price (CP-1..CP-3, parked;
 * COPACK_SERVICE_SPEC has no price model yet). The PRINT leg no longer uses this:
 * as of 2026-07-18 it is paid the AUTHORED decoration price (decorationPayoutCents,
 * from priceComponents - the same number the creator was charged). `manufacturer-`
 * `CostCents` + `printProviderCostCents` are retained for back-compat callers but
 * are no longer used by deriveItemDispatch. Under N=1 none of this is consumed:
 * every leg is the manufacturer, so the whole band flows to PRODUCT.
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
  /**
   * The AUTHORED decoration payout for a distinct print provider (Pavel 2026-07-18,
   * "fix the print payout first"). This is `priceComponents(...).decorationUnitCents
   * * qty` - the EXACT number the creator was charged for decoration, computed by
   * createDispatches with the SAME @ilaunchify/plans function the checkout used, so
   * charge and payout cannot diverge (the PP-0 lesson).
   *
   * It replaces the fabricated 8%-of-band estimate for the print leg. When the
   * printer is the manufacturer (N=1 self-label) there is no distinct print leg, so
   * this stays with the manufacturer (whole band). NOTE the base label-printing
   * portion baked into the band is a SEPARATE, still-unsolved N>1 unbundling problem
   * (the manufacturer would have to break out the label share of their band price);
   * only the authored DECORATION premium is routed here. Defaults 0.
   */
  decorationPayoutCents?: number
  /**
   * CP-6 (docs/COPACK_CP3_SHADOW_AND_CP6_PLAN §2) — the REAL co-pack quote
   * (loadCopackQuoteCents, the SAME number CP-3 charged), replacing the 7% interim.
   * Provided by createDispatches ONLY when the co-pack flag is on; absent ⇒ today's
   * 7%-estimate behavior. It is CARVED from productionCents (which already includes
   * the co-pack line), so the sum invariant holds and the manufacturer gets the
   * remainder.
   */
  coPackingPayoutCents?: number
  /**
   * CP-6 — the pinned co-packer (CP-5 `coPackerServiceId` + its payout userId) to
   * route the assembly leg to, so the payee is EXACTLY the service CP-3 priced.
   * Provided with `coPackingPayoutCents`; absent ⇒ derive the assembler from the
   * CARTON/SHIPPER components as today.
   */
  coPacker?: { serviceId: string; userId: string }
}): ItemDispatchPlan {
  const { orderId, item, routing, components, acceptDeadlineAt } = params
  const decorationPayoutCents = Math.max(0, Math.round(params.decorationPayoutCents ?? 0))

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

  // Assembly legs. CP-6: a pinned co-packer (params.coPacker, passed by
  // createDispatches ONLY when the co-pack flag is on) is AUTHORITATIVE — it routes
  // the assembly leg to exactly the service CP-3 priced, so charge === payout.
  // Absent ⇒ today's derivation: CARTON/SHIPPER components' live assemblers, else
  // the manufacturer self-assembles.
  const assemblyLegMap = new Map<string, { serviceId: string; userId: string }>()
  if (params.coPacker) {
    assemblyLegMap.set(params.coPacker.serviceId, params.coPacker)
  } else {
    const assemblyComponents = components.filter((c) => c.role === 'CARTON' || c.role === 'SHIPPER')
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
  }
  const assemblyLegs = [...assemblyLegMap.values()]

  // ── PAYOUT ALLOCATION (Pavel 2026-07-18: "fix the split") ────────────────────
  //
  // The manufacturer receives their AUTHORED band price (the whole production),
  // NOT a fabricated 30%. The platform's revenue is the creator fee + merit
  // withholding ONLY - there is NO hidden production spread. So the dispatch legs
  // MUST sum to the production the creator paid.
  //
  // A live order (ILF-260718-AYCS9) exposed the old model: Acme priced at $4,600,
  // did all the work, and would have been paid $1,748 (38%) while the platform
  // pocketed $2,852 (62%) from a 30/8/7 ratio nobody authored - the payout-side
  // twin of the Blocker-2 buildup, underpaying partners instead of undercharging
  // creators.
  //
  // Allocation:
  //   - A print/copack leg that is a DISTINCT partner (serviceId != the
  //     manufacturer's) is carved out and the manufacturer's leg reduces by that
  //     much, so the sum is preserved. Its AUTHORED price is N>1 work (CP-1..CP-3,
  //     parked, no authored data yet), so it is still ESTIMATED here and FLAGGED -
  //     but the manufacturer now gets the REMAINDER, never 30%.
  //   - A print/copack leg that resolves to the MANUFACTURER itself (N=1 self-
  //     fulfilment, the current model) is INCLUDED in the band: its leg cost is 0
  //     and the whole production flows to the PRODUCT leg.
  //
  // INVARIANT (pinned in dispatch-planner.test.ts): sum(leg.costCents) ===
  // productionCents. The manufacturer absorbs no rounding drift because each
  // carve-out is subtracted at exactly the per-leg amount it pays out.
  const productionCents = Math.max(0, Math.round(item.unitPriceCents) * Math.max(0, Math.floor(item.quantity)))

  // DISTINCT = a leg paid out to a DIFFERENT partner org than the manufacturer,
  // keyed on userId (the Transfer payee), NOT serviceId. A manufacturer that
  // self-labels through its own LABEL_PRINTING service is the SAME payee, so its
  // work is already inside the band it authored: carve nothing. Only a leg that
  // routes money to another company reduces the manufacturer's payout. The real
  // N=1 order (both legs -> Acme's userId) carves nothing and Acme gets it all.
  const mfrUserId = routing.manufacturingUserId
  const isDistinct = (userId: string) => userId !== mfrUserId

  const distinctPrintLegs = printLegs.filter((l) => isDistinct(l.userId))
  const distinctAssemblyLegs = assemblyLegs.filter((l) => isDistinct(l.userId))

  // PRINT payout = the AUTHORED decoration price the creator paid (decorationPayoutCents),
  // split across the distinct print legs. NOT a fabricated ratio - this reconciles
  // with the charge because both call priceComponents. When no printer is distinct
  // (self-label) the decoration stays inside the manufacturer's band.
  const perDistinctPrintCents = distinctPrintLegs.length
    ? Math.floor(decorationPayoutCents / distinctPrintLegs.length)
    : 0

  // CO-PACK payout — CP-6: the REAL authored quote (params.coPackingPayoutCents =
  // loadCopackQuoteCents, the SAME number CP-3 charged) when the flag is on, else
  // the 7% interim estimate (flag off / pre-CP-3). Either way it is CARVED from
  // productionCents (which already includes the co-pack line), so sum(legs) ===
  // productionCents and the manufacturer gets the remainder. estimateDispatchCosts
  // survives ONLY for the interim path.
  const est = estimateDispatchCosts({
    productId: item.productId,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
  })
  const coPackPayoutTotal =
    params.coPackingPayoutCents != null
      ? Math.max(0, Math.round(params.coPackingPayoutCents))
      : est.coPackerCostCents
  const perDistinctAssemblyCents = distinctAssemblyLegs.length
    ? Math.floor(coPackPayoutTotal / distinctAssemblyLegs.length)
    : 0
  const printCarveoutCents = perDistinctPrintCents * distinctPrintLegs.length
  const assemblyCarveoutCents = perDistinctAssemblyCents * distinctAssemblyLegs.length

  const manufacturerCostCents = Math.max(0, productionCents - printCarveoutCents - assemblyCarveoutCents)
  const printLegCost = (userId: string) => (isDistinct(userId) ? perDistinctPrintCents : 0)
  const assemblyLegCost = (userId: string) => (isDistinct(userId) ? perDistinctAssemblyCents : 0)

  const rows: DispatchRow[] = [
    {
      orderId,
      orderItemId: item.id,
      type: 'PRODUCT',
      partnerServiceId: routing.manufacturingServiceId,
      status: 'PENDING_ACCEPT',
      acceptDeadlineAt,
      costCents: manufacturerCostCents,
    },
    ...printLegs.map((leg) => ({
      orderId,
      orderItemId: item.id,
      type: 'LABEL' as const,
      partnerServiceId: leg.serviceId,
      status: 'PENDING_ACCEPT' as const,
      acceptDeadlineAt,
      costCents: printLegCost(leg.userId),
    })),
    ...assemblyLegs.map((leg) => ({
      orderId,
      orderItemId: item.id,
      type: 'COPACKING' as const,
      partnerServiceId: leg.serviceId,
      status: 'PENDING_ACCEPT' as const,
      acceptDeadlineAt,
      costCents: assemblyLegCost(leg.userId),
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
