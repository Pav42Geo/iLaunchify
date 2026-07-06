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
import { scopeManifestForDispatchType } from './partner-packet'
import { pickBestMatch, rankPartnerMatches, type MatchCandidate, type MatchWeights } from './scoring'
import { deriveItemDispatch, estimateDispatchCosts, type DispatchRow } from './dispatch-planner'

// Re-exported for back-compat: estimateDispatchCosts now lives in the pure planner.
export { estimateDispatchCosts } from './dispatch-planner'

export interface RoutingResult {
  ok: true
  manufacturingServiceId: string
  manufacturingUserId: string
  labelPrintingServiceId: string
  labelPrintingUserId: string
  /**
   * PS-3 (PRINT_PROVIDER_SELECTION §4): true when the creator's pinned print
   * provider was requested but failed validation and routing fell through to
   * normal resolution. Checkout MUST surface this before payment ("your
   * printer is unavailable — pick another or let us route it") — a silent
   * substitution is the §4 anti-pattern.
   */
  pinnedPrintUnavailable?: boolean
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
  /** PS-3 step 0 (PRINT_PROVIDER_SELECTION §4): the creator's manual pick
   *  (ProductPrintSelection). Callers resolve it per (creator, template) and
   *  pass it in; findRouting validates it against the SAME hard filters as
   *  every other path — a pin is a preference, never a bypass. */
  pinnedPrintServiceId?: string | null
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
  // PS-3 STEP 0 (PRINT_PROVIDER_SELECTION §4): the creator's pinned provider,
  // validated against the SAME hard filters as every other path (active svc +
  // partner + Stripe, not excluded, no live blackout, ≥1 ACTIVE offering).
  // Valid → bind exactly that provider. Invalid → fall through and FLAG the
  // result (pinnedPrintUnavailable) so checkout surfaces it before payment —
  // never a silent substitution.
  let pinnedPrintUnavailable = false
  if (params.pinnedPrintServiceId) {
    const now = new Date()
    const pinned = excluded.has(params.pinnedPrintServiceId)
      ? null
      : await prisma.partnerService.findFirst({
          where: {
            id: params.pinnedPrintServiceId,
            type: 'LABEL_PRINTING',
            status: 'ACTIVE',
            partner: { status: 'ACTIVE', user: { stripeAccountStatus: 'ACTIVE' } },
            packagingOfferings: { some: { status: 'ACTIVE' } },
            blackoutDates: { none: { startsOn: { lte: now }, endsOn: { gte: now } } },
          },
          include: { partner: { select: { userId: true } } },
        })
    if (pinned) {
      return {
        ok: true,
        manufacturingServiceId: manufacturer.id,
        manufacturingUserId: manufacturer.partner.userId,
        labelPrintingServiceId: pinned.id,
        labelPrintingUserId: pinned.partner.userId,
      }
    }
    pinnedPrintUnavailable = true
  }

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
      ...(pinnedPrintUnavailable ? { pinnedPrintUnavailable: true } : {}),
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
    const now = new Date()
    const printServices = await prisma.partnerService.findMany({
      where: {
        type: 'LABEL_PRINTING',
        status: 'ACTIVE',
        partner: { status: 'ACTIVE' },
        dieCutSupport: { some: { dieCutTemplateId } },
      },
      include: {
        partner: { include: { user: true } },
        // Capacity pause (PARTNER_ROLE_ACCOUNTS §3.3.D) — an active blackout window
        // hard-excludes the printer from the commodity shop below.
        blackoutDates: { where: { startsOn: { lte: now }, endsOn: { gte: now } }, take: 1 },
      },
    })

    const eligiblePrinters = printServices.filter((s) => {
      if (excluded.has(s.id)) return false
      // Blacked-out printers never win the commodity shop (vacation pause /
      // maintenance). The chosen-offering binding + owner self-label paths are
      // deliberate bindings, not shopping — they stay untouched (D1 philosophy:
      // pinned partners aren't silently rerouted).
      if (s.blackoutDates.length > 0) return false
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
    ...(pinnedPrintUnavailable ? { pinnedPrintUnavailable: true } : {}),
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

  if (order.items.length === 0) return { ok: false, reason: 'NO_ITEMS', message: 'Order has no items' }

  // Multi-SKU (Phase 3, docs/MULTI_COMPONENT_DISPATCH.md): build the FULL dispatch
  // graph PER OrderItem and stamp each dispatch with its orderItemId. A single-item
  // order behaves exactly as before — the loop just runs once. If ANY item can't be
  // routed, the WHOLE order goes ON_HOLD for admin: we never half-fulfill a basket.
  const acceptDeadlineAt = new Date(
    Date.now() + (params.acceptWindowHours ?? 24) * 60 * 60 * 1000,
  )

  const dispatchRows: DispatchRow[] = []
  const failures: string[] = []
  let primaryManufacturerId: string | null = null
  let primaryPrintId: string | null = null

  for (const item of order.items) {
    const routing = await findRouting({
      productId: item.productId,
      quantity: item.quantity,
      weights: params.weights,
    })
    if (!routing.ok) {
      failures.push(`${item.product.name} (${item.productId}): ${routing.message}`)
      continue
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

    // All the per-item dispatch decisions (print-leg collapse, assembly legs,
    // cost split, row construction) live in the pure planner so they're unit-
    // testable without a DB. We just normalize the prisma rows to ComponentLeg.
    const plan = deriveItemDispatch({
      orderId: order.id,
      item: {
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
      },
      routing,
      components: components.map((c) => ({
        role: c.role as string,
        decorationMethod: c.decorationMethod as string,
        partnerService: c.partnerOffering?.partnerService ?? null,
      })),
      acceptDeadlineAt,
    })

    dispatchRows.push(...plan.rows)
    if (!primaryManufacturerId) {
      primaryManufacturerId = routing.manufacturingServiceId
      primaryPrintId = plan.primaryPrintServiceId
    }
  }

  // Any unroutable item parks the whole order for admin — no half-fulfillment.
  if (failures.length > 0) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'ON_HOLD', internalNotes: `Auto-routing failed: ${failures.join(' | ')}` },
    })
    return { ok: false, reason: 'ROUTING_FAILED', message: failures.join(' | ') }
  }
  if (!primaryManufacturerId || !primaryPrintId) {
    return { ok: false, reason: 'NO_DISPATCHES', message: 'No dispatches were produced' }
  }

  await prisma.$transaction(async (tx) => {
    // orderItemId (Phase 3) + the COPACKING type (Phase 2b) are both pending the
    // Mac migration, so the generated client doesn't type them yet — cast-guarded
    // createMany so this compiles before `prisma db push`. One createMany for every
    // leg of every item.
    await (tx as unknown as { orderDispatch: { createMany: (a: unknown) => Promise<unknown> } }).orderDispatch.createMany({
      data: dispatchRows,
    })
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'ROUTING',
        manufacturerServiceId: primaryManufacturerId,
        printProviderServiceId: primaryPrintId,
      },
    })
    // Phase G8 — stamp the production manifest on each dispatch row so
    // the partner sees the spec the moment they open the dispatch. The
    // actual PDF + die-line render is V1.5 worker territory (reads
    // OrderItem.designVersionId and renders the Fabric JSON).
    const dispatches = await tx.orderDispatch.findMany({
      where: { orderId: order.id },
      select: { id: true, type: true },
    })
    // Final shipper = the hop that physically ships finished goods to the order's
    // ship-to: the co-packer when assembly exists, else the manufacturer. Printers
    // ship labels UPSTREAM (never final); warehouses always get the full address
    // (the engine forces that regardless of the flag). (docs/PARTNER_ORDER_PACKETS.md)
    const hasCopacking = dispatches.some((d) => d.type === 'COPACKING')
    for (const d of dispatches) {
      try {
        const manifest = await generateOrderManifest(tx, {
          orderId: order.id,
          orderDispatchId: d.id,
        })
        // Persist the ROLE-SCOPED need-to-know packet (not the full manifest) so the
        // partner/admin view + raw-JSON download expose only this role's slice.
        const isFinalShipper = d.type === 'COPACKING' || (d.type === 'PRODUCT' && !hasCopacking)
        const packet = scopeManifestForDispatchType(manifest, manifest.dispatchType, { isFinalShipper })
        await tx.orderDispatch.update({
          where: { id: d.id },
          data: {
            finishManifestJson: packet as unknown as object,
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

  // Notify every partner SERVICE that a new dispatch is waiting — role-routed
  // fan-out (org admins + service-scoped members, not just the founder pointer;
  // PARTNER_ROLE_ACCOUNTS P3 slice 13). Imported lazily so the orders package
  // doesn't take a hard dep on notifications for callers that don't need it
  // (cron jobs, tests, etc.). Deduped per (service, type) so a partner covering
  // multiple items isn't pinged repeatedly.
  const { dispatchToPartnerService } = await import('@ilaunchify/notifications')
  const brand = await prisma.brand.findUnique({
    where: { id: order.brandId },
    select: { name: true },
  })
  const notifyTargets = new Map<string, { partnerServiceId: string; type: DispatchRow['type'] }>()
  for (const row of dispatchRows) {
    notifyTargets.set(`${row.partnerServiceId}:${row.type}`, {
      partnerServiceId: row.partnerServiceId,
      type: row.type,
    })
  }
  await Promise.allSettled(
    [...notifyTargets.values()].map((t) =>
      dispatchToPartnerService(t.partnerServiceId, {
        event: 'DISPATCH_RECEIVED',
        data: { orderId: order.id, brandName: brand?.name, type: t.type },
        audience: 'partner',
      }),
    ),
  )

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
