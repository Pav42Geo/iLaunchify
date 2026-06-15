// Order routing — finds matching partner services for a product.
//
// V1 algorithm: first matching ACTIVE service (deterministic, simple, debuggable).
// V1.5+ adds scoring (capacity headroom, partner rating, geographic proximity).
//
// Inputs to a routing decision:
//   - Product.category → must match a MANUFACTURING service's categories[]
//   - Order quantity → must fall within service's [moqMin, moqMax]
//   - Template.dieCutTemplateId → must be in PartnerServiceDieCut for LABEL_PRINTING
//
// Outputs: chosen manufacturing service + chosen label-printing service (or null
// if no match — order is flagged for admin manual routing).

import { prisma } from '@ilaunchify/db'
import { generateOrderManifest } from './manifest'
import { pickBestMatch, rankPartnerMatches, type MatchCandidate, type MatchWeights } from './scoring'

export interface RoutingResult {
  ok: true
  manufacturingServiceId: string
  manufacturingUserId: string
  labelPrintingServiceId: string
  labelPrintingUserId: string
}

export type RoutingFailure =
  | { ok: false; reason: 'NO_MANUFACTURER'; message: string }
  | { ok: false; reason: 'NO_PRINT_PROVIDER'; message: string }

/**
 * Find best-fit manufacturing + label-printing services for a given product order.
 * V1: first-match. V1.5+: scoring.
 */
export async function findRouting(params: {
  productId: string
  quantity: number
  templateId?: string | null
  // B4 — optional matching context. When supplied, proximity + cert dimensions
  // join the manufacturer scoring; absent, scoring uses capacity fit alone.
  destinationCountry?: string | null
  destinationRegionId?: string | null
  targetMarketId?: string | null
  /** Admin-tunable scoring weights (OrderSettings). */
  weights?: MatchWeights
  /** PartnerService ids already tried (declined / timed out) — excluded so a
   *  manual or future auto-reroute never re-picks a partner that already failed. */
  excludeServiceIds?: string[]
}): Promise<RoutingResult | RoutingFailure> {
  const excluded = new Set(params.excludeServiceIds ?? [])
  const product = await prisma.product.findUnique({
    where: { id: params.productId },
    include: {
      template: { include: { dieCutTemplate: true } },
      // The NEW product template carries the owning manufacturer (the partner who
      // built this product). Owner-pinned routing reads it; the legacy `template`
      // above is still used for the print-leg die-cut fallback.
      productTemplate: { select: { manufacturerServiceId: true } },
      // The print/decoration provider the product already SELECTED at config time
      // (PartnerPackagingOffering = packagingType × decorationMethod × dieline —
      // capability-matched then). Routing honors this binding instead of re-deriving
      // it by die-cut. Only decorated components carry an offering.
      packagingComponents: {
        where: { partnerOfferingId: { not: null } },
        select: {
          partnerOffering: {
            select: {
              partnerService: {
                select: {
                  id: true,
                  type: true,
                  status: true,
                  partner: { select: { status: true, userId: true, user: { select: { stripeAccountStatus: true } } } },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!product) {
    return { ok: false, reason: 'NO_MANUFACTURER', message: 'Product not found' }
  }

  // -------- Manufacturer (OWNER-PINNED — docs/ROUTING_BINDING_MODEL.md §2) --------
  // A creator-customized product belongs to the manufacturer who built it (their
  // recipe / formulation / IP). When the template has an owner, the manufacturing
  // leg is PINNED to that owner — never shopped or rerouted; we only health-check
  // it. Legacy/seed products with no owner (manufacturerServiceId null) fall back
  // to the original category-match + scoring (D2 — conservative, nothing breaks).
  const manufServices = await prisma.partnerService.findMany({
    where: {
      type: 'MANUFACTURING',
      status: 'ACTIVE',
      partner: { status: 'ACTIVE' },
    },
    include: { partner: { include: { user: true } } },
  })

  const moqOf = (s: (typeof manufServices)[number]) => {
    const caps = s.capabilities as Record<string, unknown>
    return {
      min: (caps.moqMin as number | undefined) ?? 0,
      max: (caps.moqMax as number | undefined) ?? Number.POSITIVE_INFINITY,
    }
  }

  let manufacturer: (typeof manufServices)[number]
  const ownerServiceId = product.productTemplate?.manufacturerServiceId ?? null

  if (ownerServiceId) {
    // Owner-pinned: health-check the owning manufacturer, never shop alternatives.
    const owner = manufServices.find((s) => s.id === ownerServiceId)
    if (!owner || excluded.has(owner.id)) {
      return { ok: false, reason: 'NO_MANUFACTURER', message: 'The product’s manufacturer is not available for this order.' }
    }
    if (owner.partner.user.stripeAccountStatus !== 'ACTIVE') {
      return { ok: false, reason: 'NO_MANUFACTURER', message: 'The product’s manufacturer has not enabled payouts.' }
    }
    const { min, max } = moqOf(owner)
    if (params.quantity < min || params.quantity > max) {
      return { ok: false, reason: 'NO_MANUFACTURER', message: `The product’s manufacturer can’t run quantity ${params.quantity}.` }
    }
    manufacturer = owner
  } else {
    // Legacy fallback (no owner set): hard gates (category fit, MOQ, payouts) then
    // B4 scoring ranks the survivors so we pick the best fit, not the first.
    const gated = manufServices.filter((s) => {
      if (excluded.has(s.id)) return false
      const caps = s.capabilities as Record<string, unknown>
      const categories = (caps.categories as string[] | undefined) ?? []
      const { min, max } = moqOf(s)
      return (
        categories.includes(product.category) &&
        params.quantity >= min &&
        params.quantity <= max &&
        s.partner.user.stripeAccountStatus === 'ACTIVE'
      )
    })

    if (gated.length === 0) {
      return {
        ok: false,
        reason: 'NO_MANUFACTURER',
        message: `No active manufacturer matches ${product.category} at qty ${params.quantity} with payouts enabled`,
      }
    }

    // Market-cert coverage per candidate partner (active + non-expired).
    const now = new Date()
    const certRows = await prisma.partnerMarketCert.findMany({
      where: {
        partnerId: { in: gated.map((s) => s.partnerId) },
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { partnerId: true, marketId: true },
    })
    const marketsByPartner = new Map<string, string[]>()
    for (const r of certRows) {
      marketsByPartner.set(r.partnerId, [...(marketsByPartner.get(r.partnerId) ?? []), r.marketId])
    }

    const matchCandidates: MatchCandidate[] = gated.map((s) => {
      const { min, max } = moqOf(s)
      return {
        serviceId: s.id,
        moqMin: min,
        moqMax: max,
        partnerCountry: s.partner.country,
        partnerRegionId: s.partner.primaryRegionId ?? null,
        certifiedMarketIds: marketsByPartner.get(s.partnerId) ?? [],
      }
    })

    const best = pickBestMatch(matchCandidates, {
      quantity: params.quantity,
      destinationCountry: params.destinationCountry,
      destinationRegionId: params.destinationRegionId,
      targetMarketId: params.targetMarketId,
      weights: params.weights,
    })
    manufacturer = gated.find((s) => s.id === best?.serviceId) ?? gated[0]!
  }

  // -------- Print / decoration provider --------
  // Honor the offering the product already SELECTED at configuration time
  // (capability-matched against the partner's PartnerPackagingOffering then —
  // packagingType × decorationMethod × dieline). This is the correct binding;
  // re-deriving by die-cut below is only the legacy fallback for products that
  // were never configured through the component flow.
  const chosenPrintSvc = product.packagingComponents
    .map((c) => c.partnerOffering?.partnerService)
    .find(
      (svc): svc is NonNullable<typeof svc> =>
        !!svc &&
        svc.type === 'LABEL_PRINTING' &&
        svc.status === 'ACTIVE' &&
        svc.partner.status === 'ACTIVE' &&
        svc.partner.user?.stripeAccountStatus === 'ACTIVE' &&
        !excluded.has(svc.id),
    )

  if (chosenPrintSvc) {
    return {
      ok: true,
      manufacturingServiceId: manufacturer.id,
      manufacturingUserId: manufacturer.partner.userId,
      labelPrintingServiceId: chosenPrintSvc.id,
      labelPrintingUserId: chosenPrintSvc.partner.userId,
    }
  }

  // ----- Legacy fallback: die-cut match (owner-preferred), else self-label -----
  // No chosen offering on the product. Try to match a separate printer by the
  // legacy die-cut; if there is no die-cut, or no separate printer qualifies, the
  // OWNING MANUFACTURER labels the product in-house. This is the common case for
  // full-service makers — most partner-built supplements / cosmetics / pet / OTC
  // (and new-builder food) are manufactured AND labeled by the same partner, and
  // have no `dieCutTemplateId`. Defaulting the label leg to the owner means an
  // order is NEVER stranded just because no SEPARATE print partner exists. (Future:
  // collapse to a single dispatch when the manufacturer self-labels.)
  let printSvcId = manufacturer.id
  let printUserId = manufacturer.partner.userId

  const dieCutTemplateId = product.template?.dieCutTemplateId
  if (dieCutTemplateId) {
    const printServices = await prisma.partnerService.findMany({
      where: {
        type: 'LABEL_PRINTING',
        status: 'ACTIVE',
        partner: { status: 'ACTIVE' },
        dieCutSupport: { some: { dieCutTemplateId } },
      },
      include: { partner: { include: { user: true } } },
    })

    const eligiblePrinters = printServices.filter((s) => {
      if (excluded.has(s.id)) return false
      const caps = s.capabilities as Record<string, unknown>
      const moqMin = (caps.moqMin as number | undefined) ?? 0
      return params.quantity >= moqMin && s.partner.user.stripeAccountStatus === 'ACTIVE'
    })

    // D3 — prefer the OWNING manufacturer's OWN print service when it qualifies,
    // before shopping other printers (minimizes splitting the order).
    const printProvider =
      eligiblePrinters.find((s) => s.partnerId === manufacturer.partnerId) ?? eligiblePrinters[0]
    if (printProvider) {
      printSvcId = printProvider.id
      printUserId = printProvider.partner.userId
    }
  }

  return {
    ok: true,
    manufacturingServiceId: manufacturer.id,
    manufacturingUserId: manufacturer.partner.userId,
    labelPrintingServiceId: printSvcId,
    labelPrintingUserId: printUserId,
  }
}

/**
 * Estimate dispatch costs from the service's capabilities. V1 uses naive defaults;
 * V1.5+ pulls real cost-per-unit data from the partner profile.
 */
export function estimateDispatchCosts(params: {
  productId: string
  quantity: number
  unitPriceCents: number
}): { manufacturerCostCents: number; printProviderCostCents: number; coPackerCostCents: number } {
  // V1 placeholder economics — manufacturer 30%, printer 8%, co-packer 7% (only
  // applied when there's an assembly leg). Replaced by real per-component pricing
  // in Phase 2 (docs/MULTI_COMPONENT_DISPATCH.md C1).
  const total = params.unitPriceCents * params.quantity
  return {
    manufacturerCostCents: Math.floor(total * 0.3),
    printProviderCostCents: Math.floor(total * 0.08),
    coPackerCostCents: Math.floor(total * 0.07),
  }
}

/**
 * Create the two OrderDispatch rows (PRODUCT + LABEL) for a paid order.
 * Called from the Stripe webhook after payment_intent.succeeded.
 */
export async function createDispatches(params: {
  orderId: string
  acceptWindowHours?: number
  /** Admin-tunable partner-match scoring weights (OrderSettings). */
  weights?: MatchWeights
}): Promise<{ ok: true } | { ok: false; reason: string; message: string }> {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { items: { include: { product: true } } },
  })
  if (!order) return { ok: false, reason: 'NO_ORDER', message: 'Order not found' }
  if (order.status !== 'PAID') {
    return { ok: false, reason: 'WRONG_STATUS', message: `Order is ${order.status}, expected PAID` }
  }

  // V1 assumes one product per order. V1.5+: split orders with multiple products
  // into multiple sets of dispatches.
  const item = order.items[0]
  if (!item) return { ok: false, reason: 'NO_ITEMS', message: 'Order has no items' }

  const routing = await findRouting({
    productId: item.productId,
    quantity: item.quantity,
    weights: params.weights,
  })

  if (!routing.ok) {
    // Park the order on hold for admin manual routing
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'ON_HOLD', internalNotes: `Auto-routing failed: ${routing.message}` },
    })
    return routing
  }

  // Phase 1 multi-component (docs/MULTI_COMPONENT_DISPATCH.md): expand the print
  // leg per DISTINCT decorated-component provider. Each decorated component already
  // carries the provider it chose (partnerOfferingId); components that share a
  // provider collapse into ONE label dispatch. No decorated-component providers →
  // the single leg findRouting resolved (chosen offering or owner self-label),
  // preserving today's behavior for simple products.
  const components = await prisma.packagingComponent.findMany({
    where: { productId: item.productId },
    select: {
      role: true,
      decorationMethod: true,
      partnerOffering: {
        select: {
          partnerService: {
            select: {
              id: true,
              type: true,
              status: true,
              partner: { select: { status: true, userId: true, user: { select: { stripeAccountStatus: true } } } },
            },
          },
        },
      },
    },
  })
  const isLive = (svc: { status: string; partner: { status: string; user: { stripeAccountStatus: string } | null } } | null | undefined) =>
    !!svc && svc.status === 'ACTIVE' && svc.partner.status === 'ACTIVE' && svc.partner.user?.stripeAccountStatus === 'ACTIVE'

  // Print legs — one per distinct decorated-component LABEL_PRINTING provider.
  const printLegMap = new Map<string, { serviceId: string; userId: string }>()
  for (const c of components) {
    const svc = c.partnerOffering?.partnerService
    if (c.decorationMethod !== 'NONE' && svc && svc.type === 'LABEL_PRINTING' && isLive(svc)) {
      printLegMap.set(svc.id, { serviceId: svc.id, userId: svc.partner.userId })
    }
  }
  const printLegs =
    printLegMap.size > 0
      ? [...printLegMap.values()]
      : [{ serviceId: routing.labelPrintingServiceId, userId: routing.labelPrintingUserId }]

  // Phase 2b assembly legs — a CARTON/SHIPPER component implies a fill/assembly
  // leg (variety pack, multipack). Routed to the assembling co-packer (the
  // component's chosen offering), else the manufacturer self-assembles. No
  // CARTON/SHIPPER component → no co-pack dispatch (simple product, back-compat).
  const assemblyComponents = components.filter((c) => c.role === 'CARTON' || c.role === 'SHIPPER')
  const assemblyLegMap = new Map<string, { serviceId: string; userId: string }>()
  if (assemblyComponents.length > 0) {
    for (const c of assemblyComponents) {
      const svc = c.partnerOffering?.partnerService
      if (isLive(svc) && svc) assemblyLegMap.set(svc.id, { serviceId: svc.id, userId: svc.partner.userId })
    }
    if (assemblyLegMap.size === 0) {
      // Self-assembly by the manufacturer.
      assemblyLegMap.set(routing.manufacturingServiceId, { serviceId: routing.manufacturingServiceId, userId: routing.manufacturingUserId })
    }
  }
  const assemblyLegs = [...assemblyLegMap.values()]

  const costs = estimateDispatchCosts({
    productId: item.productId,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
  })
  // C1 (Phase 1): split the naive print cost evenly across the label legs.
  const perPrintCostCents = Math.floor(costs.printProviderCostCents / printLegs.length)
  const perAssemblyCostCents = assemblyLegs.length > 0 ? Math.floor(costs.coPackerCostCents / assemblyLegs.length) : 0

  const acceptDeadlineAt = new Date(
    Date.now() + (params.acceptWindowHours ?? 24) * 60 * 60 * 1000,
  )

  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.createMany({
      data: [
        {
          orderId: order.id,
          type: 'PRODUCT',
          partnerServiceId: routing.manufacturingServiceId,
          status: 'PENDING_ACCEPT',
          acceptDeadlineAt,
          costCents: costs.manufacturerCostCents,
        },
        ...printLegs.map((leg) => ({
          orderId: order.id,
          type: 'LABEL' as const,
          partnerServiceId: leg.serviceId,
          status: 'PENDING_ACCEPT' as const,
          acceptDeadlineAt,
          costCents: perPrintCostCents,
        })),
      ],
    })
    // Assembly legs use the COPACKING dispatch type, which ships with a pending
    // migration — cast-guarded createMany so this compiles before db push.
    if (assemblyLegs.length > 0) {
      await (tx as unknown as { orderDispatch: { createMany: (a: unknown) => Promise<unknown> } }).orderDispatch.createMany({
        data: assemblyLegs.map((leg) => ({
          orderId: order.id,
          type: 'COPACKING',
          partnerServiceId: leg.serviceId,
          status: 'PENDING_ACCEPT',
          acceptDeadlineAt,
          costCents: perAssemblyCostCents,
        })),
      })
    }
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'ROUTING',
        manufacturerServiceId: routing.manufacturingServiceId,
        printProviderServiceId: printLegs[0]!.serviceId,
      },
    })
    // Phase G8 — stamp the production manifest on each dispatch row so
    // the partner sees the spec the moment they open the dispatch. The
    // actual PDF + die-line render is V1.5 worker territory (reads
    // OrderItem.designVersionId and renders the Fabric JSON).
    const dispatches = await tx.orderDispatch.findMany({
      where: { orderId: order.id },
      select: { id: true },
    })
    for (const d of dispatches) {
      try {
        const manifest = await generateOrderManifest(tx, {
          orderId: order.id,
          orderDispatchId: d.id,
        })
        await tx.orderDispatch.update({
          where: { id: d.id },
          data: {
            finishManifestJson: manifest as unknown as object,
            bundleStatus: 'PENDING_GENERATION',
          },
        })
      } catch (err) {
        // Don't fail the whole transaction — the dispatch is still valid,
        // the manifest is just absent. Admin can regenerate.
        await tx.orderDispatch.update({
          where: { id: d.id },
          data: { bundleStatus: 'FAILED' },
        })
        console.warn(
          `[orders/manifest] generateOrderManifest failed for dispatch ${d.id}:`,
          err,
        )
      }
    }
  })

  // Notify both partners that a new dispatch is waiting for them. Imported
  // lazily so the orders package doesn't take a hard dep on notifications
  // for callers that don't need it (cron jobs, tests, etc.).
  const { dispatchNotification } = await import('@ilaunchify/notifications')
  const brand = await prisma.brand.findUnique({
    where: { id: order.brandId },
    select: { name: true },
  })
  // Dedupe by userId so a partner who covers multiple legs isn't pinged twice.
  const printUserIds = [...new Set(printLegs.map((leg) => leg.userId))]
  const assemblyUserIds = [...new Set(assemblyLegs.map((leg) => leg.userId))]
  await Promise.allSettled([
    dispatchNotification({
      userId: routing.manufacturingUserId,
      event: 'DISPATCH_RECEIVED',
      data: { orderId: order.id, brandName: brand?.name, type: 'PRODUCT' },
      audience: 'partner',
    }),
    ...printUserIds.map((userId) =>
      dispatchNotification({
        userId,
        event: 'DISPATCH_RECEIVED',
        data: { orderId: order.id, brandName: brand?.name, type: 'LABEL' },
        audience: 'partner',
      }),
    ),
    ...assemblyUserIds.map((userId) =>
      dispatchNotification({
        userId,
        event: 'DISPATCH_RECEIVED',
        data: { orderId: order.id, brandName: brand?.name, type: 'COPACKING' },
        audience: 'partner',
      }),
    ),
  ])

  return { ok: true }
}

// -----------------------------------------------------------------------------
// B4 — routing preview (admin transparency).
//
// Same gates + scoring as findRouting's manufacturer leg, but returns the FULL
// ranked candidate set with per-dimension score breakdowns + the reason any
// candidate was gated out. Powers the admin /routing-preview tool so ops can
// see (and sanity-check) why the engine picks a given manufacturer.
// -----------------------------------------------------------------------------

export interface RoutingPreviewCandidate {
  serviceId: string
  partnerName: string
  moqMin: number
  /** null = unbounded. */
  moqMax: number | null
  passedGate: boolean
  gateReason: string | null
  /** Score fields are null when the candidate was gated out. */
  total: number | null
  capability: number | null
  proximity: number | null
  cert: number | null
}

export interface RoutingPreviewResult {
  productCategory: string
  winnerServiceId: string | null
  candidates: RoutingPreviewCandidate[]
}

export async function previewManufacturerMatches(params: {
  productId: string
  quantity: number
  destinationCountry?: string | null
  destinationRegionId?: string | null
  targetMarketId?: string | null
}): Promise<RoutingPreviewResult | { error: string }> {
  const product = await prisma.product.findUnique({
    where: { id: params.productId },
    select: { category: true },
  })
  if (!product) return { error: 'Product not found' }

  const services = await prisma.partnerService.findMany({
    where: { type: 'MANUFACTURING', status: 'ACTIVE', partner: { status: 'ACTIVE' } },
    select: {
      id: true,
      capabilities: true,
      partner: {
        select: {
          id: true,
          companyName: true,
          country: true,
          primaryRegionId: true,
          user: { select: { stripeAccountStatus: true } },
        },
      },
    },
  })

  const now = new Date()
  const certRows = await prisma.partnerMarketCert.findMany({
    where: {
      partnerId: { in: services.map((s) => s.partner.id) },
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { partnerId: true, marketId: true },
  })
  const marketsByPartner = new Map<string, string[]>()
  for (const r of certRows) {
    marketsByPartner.set(r.partnerId, [...(marketsByPartner.get(r.partnerId) ?? []), r.marketId])
  }

  const ctx = {
    quantity: params.quantity,
    destinationCountry: params.destinationCountry,
    destinationRegionId: params.destinationRegionId,
    targetMarketId: params.targetMarketId,
  }

  const passers: { candidate: MatchCandidate; name: string; moqMaxFinite: number | null }[] = []
  const failures: RoutingPreviewCandidate[] = []

  for (const s of services) {
    const caps = s.capabilities as Record<string, unknown>
    const categories = (caps.categories as string[] | undefined) ?? []
    const moqMin = (caps.moqMin as number | undefined) ?? 0
    const moqMax = (caps.moqMax as number | undefined) ?? Number.POSITIVE_INFINITY
    const moqMaxFinite = Number.isFinite(moqMax) ? moqMax : null

    let reason: string | null = null
    if (!categories.includes(product.category)) reason = `Doesn't make ${product.category}`
    else if (params.quantity < moqMin) reason = `Below MOQ (${moqMin.toLocaleString()})`
    else if (params.quantity > moqMax) reason = `Above max (${moqMax.toLocaleString()})`
    else if (s.partner.user.stripeAccountStatus !== 'ACTIVE') reason = 'Payouts not enabled'

    if (reason) {
      failures.push({
        serviceId: s.id,
        partnerName: s.partner.companyName,
        moqMin,
        moqMax: moqMaxFinite,
        passedGate: false,
        gateReason: reason,
        total: null,
        capability: null,
        proximity: null,
        cert: null,
      })
      continue
    }

    passers.push({
      candidate: {
        serviceId: s.id,
        moqMin,
        moqMax,
        partnerCountry: s.partner.country,
        partnerRegionId: s.partner.primaryRegionId,
        certifiedMarketIds: marketsByPartner.get(s.partner.id) ?? [],
      },
      name: s.partner.companyName,
      moqMaxFinite,
    })
  }

  const ranked = rankPartnerMatches(
    passers.map((p) => p.candidate),
    ctx,
  )
  const metaById = new Map(passers.map((p) => [p.candidate.serviceId, p]))

  const passCandidates: RoutingPreviewCandidate[] = ranked.map((r) => {
    const meta = metaById.get(r.serviceId)
    return {
      serviceId: r.serviceId,
      partnerName: meta?.name ?? '—',
      moqMin: meta?.candidate.moqMin ?? 0,
      moqMax: meta?.moqMaxFinite ?? null,
      passedGate: true,
      gateReason: null,
      total: r.total,
      capability: r.breakdown.capability,
      proximity: r.breakdown.proximity,
      cert: r.breakdown.cert,
    }
  })

  return {
    productCategory: product.category,
    winnerServiceId: ranked[0]?.serviceId ?? null,
    candidates: [...passCandidates, ...failures],
  }
}
