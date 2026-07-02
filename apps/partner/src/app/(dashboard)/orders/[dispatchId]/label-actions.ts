'use server'

// Phase L2a — "Buy label with iLaunchify shipping" (docs/LOGISTICS_AND_FULFILLMENT.md §6).
//
// Platform-account EasyPost parcel flow, partner-facing:
//   getLabelQuotes → classify (Stage 1) → eligibility matrix (Stage 2, DB
//   CarrierServiceRule rows) → live rate-shop (Stage 3) → partner picks a rate
//   buyLabel       → purchase → persist a BOOKED ShipmentLeg + audit
//
// NO margin is applied here: this is the partner-facing LEG COST (L5 margin is
// a creator-checkout concern, applied via applyFirstLegMargin at quote time in
// the checkout rail — never on the partner's label purchase).
//
// Gates (all re-checked server-side on every call — the client boolean is UX):
//   1. LogisticsSetting 'carrier:easypost' enabled (admin-gated backbone)
//   2. EASYPOST_API_KEY present in env (key NEVER leaves the server)
//   3. Dispatch doc-gate passes (same rule that gates shipDispatch)
//   4. Dispatch is READY + owned by the calling partner

import { prisma, isLogisticsEnabled } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import {
  EasyPostParcelGateway,
  createFetchEasyPostHttp,
  classifyShipment,
  eligibleCarrierServices,
  shopRates,
  quoteMatchesRule,
  SHIP_DOC_LABELS,
  type CarrierServiceRuleRow,
  type RateQuote,
  type ShipAddress,
  type ShipmentClassification,
} from '@ilaunchify/shipping'
import { revalidatePath } from 'next/cache'
import { getDispatchShippingContext } from './ship-requirements'

// -----------------------------------------------------------------------------
// Types (all JSON-serializable — these cross the server-action boundary)
// -----------------------------------------------------------------------------

export interface ParcelInput {
  lengthIn: number
  widthIn: number
  heightIn: number
  weightLb: number
}

export interface LabelQuoteView {
  externalShipmentId: string
  externalRateId: string
  carrier: string
  service: string
  rateCents: number
  transitDays: number | null
  /** True on the rate-shop winner (cheapest eligible meeting SLA). */
  recommended: boolean
}

export type LabelQuotesResult =
  | { ok: true; quotes: LabelQuoteView[] }
  | { ok: false; error: string }

export interface PurchasedLabelView {
  trackingNumber: string
  carrier: string
  service: string
  costCents: number
  labelUrl: string
  publicTrackingUrl: string | null
}

export type BuyLabelResult =
  | { ok: true; label: PurchasedLabelView }
  | { ok: false; error: string }

// -----------------------------------------------------------------------------
// Shared guards + helpers
// -----------------------------------------------------------------------------

/** Same tenant guard as actions.ts loadOwnedDispatch (kept local — actions.ts
    exports only server actions, so the helper can't be re-exported from there). */
async function loadOwnedDispatch(userId: string, dispatchId: string) {
  return prisma.orderDispatch.findFirst({
    where: { id: dispatchId, partnerService: { partner: { userId } } },
    include: { order: true, partnerService: { include: { partner: true } } },
  })
}

type OwnedDispatch = NonNullable<Awaited<ReturnType<typeof loadOwnedDispatch>>>

/** Runs the full precondition stack shared by quote + buy. Returns the error
    message when any gate fails, or the loaded dispatch when all pass. */
async function guardLabelPurchase(
  userId: string,
  dispatchId: string,
): Promise<{ ok: true; dispatch: OwnedDispatch } | { ok: false; error: string }> {
  const dispatch = await loadOwnedDispatch(userId, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'READY') {
    return { ok: false, error: `Labels can only be bought while the dispatch is READY (currently ${dispatch.status}).` }
  }
  if (!(await isLogisticsEnabled('carrier:easypost'))) {
    return { ok: false, error: 'iLaunchify shipping is not enabled yet.' }
  }
  if (!process.env.EASYPOST_API_KEY) {
    return { ok: false, error: 'iLaunchify shipping is not configured on this environment.' }
  }
  // Same doc gate that blocks shipDispatch — no label before required docs.
  const ctx = await getDispatchShippingContext(dispatch.id)
  if (!ctx.gate.canShip) {
    const missing = ctx.gate.missing.map((d) => SHIP_DOC_LABELS[d]).join(', ')
    return {
      ok: false,
      error: `Required shipping documents are missing: ${missing}. Upload them in the Shipping requirements card first.`,
    }
  }
  return { ok: true, dispatch }
}

function validateParcel(parcel: ParcelInput): string | null {
  const dims: Array<[string, number]> = [
    ['length', parcel.lengthIn],
    ['width', parcel.widthIn],
    ['height', parcel.heightIn],
    ['weight', parcel.weightLb],
  ]
  for (const [label, v] of dims) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      return `Parcel ${label} must be a positive number.`
    }
  }
  if (parcel.weightLb > 150) return 'Parcel weight exceeds the 150 lb parcel limit — this needs freight (coming with the LTL rail).'
  return null
}

/** From-address = the partner's facility address on their Partner record. */
function buildFromAddress(partner: OwnedDispatch['partnerService']['partner']): ShipAddress | string {
  if (!partner.addressLine1 || !partner.city || !partner.postalCode) {
    return 'Your facility address is incomplete — add street, city, and postal code in partner onboarding before buying labels.'
  }
  return {
    name: partner.companyName,
    company: partner.companyName,
    phone: partner.contactPhone,
    street1: partner.addressLine1,
    street2: partner.addressLine2,
    city: partner.city,
    state: partner.state,
    zip: partner.postalCode,
    country: partner.country,
  }
}

/** To-address = the order's snapshotted shipTo* columns. */
function buildToAddress(order: OwnedDispatch['order']): ShipAddress {
  return {
    name: order.shipToContactName,
    phone: order.shipToContactPhone,
    street1: order.shipToAddressLine1,
    street2: order.shipToAddressLine2,
    city: order.shipToCity,
    state: order.shipToState,
    zip: order.shipToPostalCode,
    country: order.shipToCountry,
  }
}

/** Stage-1 classification for the partner-entered parcel. LABEL dispatches ship
    printed stock ambient (mirrors the page.tsx convention). */
async function classifyForDispatch(
  dispatch: OwnedDispatch,
  parcel: ParcelInput,
): Promise<{ classification: ShipmentClassification; meltable: boolean }> {
  const ctx = await getDispatchShippingContext(dispatch.id)
  const cold = ctx.docGateApplies
  const meltable = cold ? ctx.meltable : false
  const classification = classifyShipment({
    domain: ctx.domain,
    storageClass: cold ? ctx.storageClass : 'AMBIENT',
    hazmatClass: cold ? ctx.hazmatClass : 'NONE',
    meltable,
    cartons: [parcel],
    plannedShipDate: new Date(),
  })
  return { classification, meltable }
}

async function loadActiveRuleRows(): Promise<CarrierServiceRuleRow[]> {
  const rows = await prisma.carrierServiceRule.findMany({ where: { active: true } })
  return rows.map((r) => ({
    id: r.id,
    carrier: r.carrier,
    serviceLevel: r.serviceLevel,
    modes: r.modes,
    storageClasses: r.storageClasses,
    hazmatAllowed: r.hazmatAllowed,
    maxWeightLb: r.maxWeightLb,
    maxTransitDays: r.maxTransitDays,
    groundOnly: r.groundOnly,
    seasonalWindowJson: r.seasonalWindowJson,
    priority: r.priority,
    active: r.active,
  }))
}

/** BYO carrier-account ids (EasyPost `ca_…`) scope the rate call to the
    partner's negotiated rates; platform default when the partner has none. */
async function byoCarrierAccountIds(partnerId: string): Promise<string[]> {
  const accounts = await prisma.carrierAccount.findMany({
    where: { partnerId, provider: 'easypost', type: 'BYO_PARCEL', active: true },
    select: { externalRef: true },
  })
  return accounts.map((a) => a.externalRef)
}

function meetsSla(quote: RateQuote, classification: ShipmentClassification): boolean {
  if (classification.maxTransitDays === null) return true
  return quote.transitDays !== null && quote.transitDays <= classification.maxTransitDays
}

// -----------------------------------------------------------------------------
// getLabelQuotes
// -----------------------------------------------------------------------------

export async function getLabelQuotes({
  dispatchId,
  parcel,
}: {
  dispatchId: string
  parcel: ParcelInput
}): Promise<LabelQuotesResult> {
  const user = await requireUser()
  const guard = await guardLabelPurchase(user.id, dispatchId)
  if (!guard.ok) return guard
  const { dispatch } = guard

  const parcelError = validateParcel(parcel)
  if (parcelError) return { ok: false, error: parcelError }

  const from = buildFromAddress(dispatch.partnerService.partner)
  if (typeof from === 'string') return { ok: false, error: from }
  const to = buildToAddress(dispatch.order)

  const { classification, meltable } = await classifyForDispatch(dispatch, parcel)
  if (classification.mode !== 'PARCEL') {
    return { ok: false, error: 'This shipment classifies as freight, not parcel — the freight rail is not live yet.' }
  }

  const rules = await loadActiveRuleRows()
  const eligible = eligibleCarrierServices(rules, classification, {
    meltable,
    plannedShipDate: new Date(),
  })
  if (eligible.length === 0) {
    return { ok: false, error: 'No carrier service is eligible for this shipment (temp class / hazmat / weight). Contact support.' }
  }

  const apiKey = process.env.EASYPOST_API_KEY as string
  const gateway = new EasyPostParcelGateway(createFetchEasyPostHttp(), apiKey)

  let rated: { externalShipmentId: string; quotes: RateQuote[] }
  try {
    rated = await gateway.rate({
      from,
      to,
      parcels: [parcel],
      carrierAccountIds: await byoCarrierAccountIds(dispatch.partnerService.partner.id).then(
        (ids) => (ids.length > 0 ? ids : undefined),
      ),
    })
  } catch (err) {
    return { ok: false, error: `Could not fetch rates: ${(err as Error).message}` }
  }

  const { chosen } = shopRates(rated.quotes, eligible, classification)
  if (!chosen) {
    return { ok: false, error: 'No returned rate matched an eligible carrier service within the transit SLA. Try adjusting the parcel or contact support.' }
  }

  // Top 3 by price among quotes matching SOME eligible rule + SLA (the winner
  // is always included; NO margin — partner-facing leg cost).
  const matched = rated.quotes
    .filter((q) => eligible.some((r) => quoteMatchesRule(q, r)) && meetsSla(q, classification))
    .sort((a, b) => a.rateCents - b.rateCents)
    .slice(0, 3)

  const quotes: LabelQuoteView[] = matched.map((q) => ({
    externalShipmentId: q.externalShipmentId,
    externalRateId: q.externalRateId,
    carrier: q.carrier,
    service: q.service,
    rateCents: q.rateCents,
    transitDays: q.transitDays,
    recommended: q.externalRateId === chosen.externalRateId,
  }))

  return { ok: true, quotes }
}

// -----------------------------------------------------------------------------
// buyLabel
// -----------------------------------------------------------------------------

export async function buyLabel({
  dispatchId,
  externalShipmentId,
  externalRateId,
}: {
  dispatchId: string
  externalShipmentId: string
  externalRateId: string
}): Promise<BuyLabelResult> {
  const user = await requireUser()
  const guard = await guardLabelPurchase(user.id, dispatchId)
  if (!guard.ok) return guard
  const { dispatch } = guard

  if (!externalShipmentId.trim() || !externalRateId.trim()) {
    return { ok: false, error: 'Missing shipment / rate reference — fetch rates again.' }
  }

  const from = buildFromAddress(dispatch.partnerService.partner)
  if (typeof from === 'string') return { ok: false, error: from }
  const to = buildToAddress(dispatch.order)

  const apiKey = process.env.EASYPOST_API_KEY as string
  const gateway = new EasyPostParcelGateway(createFetchEasyPostHttp(), apiKey)

  let purchase
  try {
    purchase = await gateway.buy({ externalShipmentId, externalRateId })
  } catch (err) {
    return { ok: false, error: `Label purchase failed: ${(err as Error).message}` }
  }

  // Soft-FK the CarrierAccount that scoped the purchase — BYO wins over the
  // platform child for attribution (BYO ids were passed to the rate call).
  const partnerId = dispatch.partnerService.partner.id
  const account =
    (await prisma.carrierAccount.findFirst({
      where: { partnerId, provider: 'easypost', type: 'BYO_PARCEL', active: true },
      select: { id: true, type: true },
    })) ??
    (await prisma.carrierAccount.findFirst({
      where: { partnerId, provider: 'easypost', active: true },
      select: { id: true, type: true },
    }))

  const leg = await prisma.shipmentLeg.create({
    data: {
      orderDispatchId: dispatch.id,
      mode: 'PARCEL',
      status: 'BOOKED',
      carrierAccountId: account?.id ?? null,
      carrierName: purchase.carrier,
      serviceLevel: purchase.service,
      trackingNumber: purchase.trackingNumber,
      trackingStatus: 'pre_transit',
      ratedCostCents: purchase.costCents,
      // V1: no platform asset mirror yet — labelAssetId carries the EasyPost
      // label URL with a 'url:' prefix so readers can distinguish it from a
      // PartnerFile/Asset id. Asset mirroring replaces this in a later phase.
      labelAssetId: `url:${purchase.labelUrl}`,
      shipFromJson: from as unknown as object,
      shipToJson: to as unknown as object,
    },
  })

  await logAuditAs(user, {
    entityType: 'ShipmentLeg',
    entityId: leg.id,
    action: 'SHIPMENT_LEG_BOOKED',
    toValue: 'BOOKED',
    payload: {
      orderId: dispatch.orderId,
      dispatchId: dispatch.id,
      provider: 'easypost',
      externalShipmentId,
      carrier: purchase.carrier,
      service: purchase.service,
      trackingNumber: purchase.trackingNumber,
      ratedCostCents: purchase.costCents,
      carrierAccountId: account?.id ?? null,
      carrierAccountType: account?.type ?? 'PLATFORM_DEFAULT',
    },
  })

  revalidatePath(`/orders/${dispatchId}`)

  return {
    ok: true,
    label: {
      trackingNumber: purchase.trackingNumber,
      carrier: purchase.carrier,
      service: purchase.service,
      costCents: purchase.costCents,
      labelUrl: purchase.labelUrl,
      publicTrackingUrl: purchase.publicTrackingUrl,
    },
  }
}
