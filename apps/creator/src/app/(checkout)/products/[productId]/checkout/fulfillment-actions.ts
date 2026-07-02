'use server'

// Phase G4 — fulfillment server actions for the checkout wizard's Step 4.
//
// listFulfillmentOptions(productId)
//   Returns the creator's SavedAddress[] + eligible WAREHOUSE
//   PartnerService rows. V1 surfaces every ACTIVE WAREHOUSE service; V1.5
//   filters by region (proximity to creator) + capability (can they hold
//   this product category / packaging type / temperature requirements).
//
// saveCreatorAddress(input, makeDefault?)
//   Upserts a CreatorSavedAddress row. When makeDefault=true the previous
//   default is demoted in the same txn so there's always exactly one.
//
// estimateShipping({...})
//   Returns shippingCents. V1 is a tiered flat-rate placeholder keyed off
//   ship-to type + quantity band. Real carrier integration (USPS / UPS /
//   FedEx) lands later — leaving forward-marker hooks for the rate lookup.
//
// listDestinationOptions(productId) — Phase L1b
//   The four-destination-card payload (docs/LOGISTICS_AND_FULFILLMENT.md §2/§9):
//   which destination types are offered (and the disabled copy when not), the
//   platform-suggested fulfillment center (V1 nearest-eligible to the pinned
//   manufacturer), and the hold-at-manufacturer storage fee card. The Pay
//   action re-runs the same eligibility server-side — this is display data,
//   never the enforcement point.

import { prisma, getLogisticsSettings, isLogisticsEnabled, isStorageClassEnabled } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  resolveDestinationOptions,
  selectNearestEligibleFc,
  type DestinationOption,
  type FcCandidate,
} from '@ilaunchify/orders'
import {
  EasyPostParcelGateway,
  createFetchEasyPostHttp,
  classifyShipment,
  eligibleCarrierServices,
  shopRates,
  applyFirstLegMargin,
  type CarrierServiceRuleRow,
  type ShippingDomain,
} from '@ilaunchify/shipping'
import { revalidatePath } from 'next/cache'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

// -----------------------------------------------------------------------------
// SHAPES
// -----------------------------------------------------------------------------

export interface WarehouseOption {
  id: string                       // PartnerService.id
  partnerName: string              // Partner.companyName
  companyName: string              // Partner.companyName (same; keeps DTO stable)
  city: string | null
  state: string | null
  country: string
  // Free-form capability hints from PartnerService.capabilities — exposed
  // so the picker can show chips. V1.5 standardises these via typed
  // WarehouseCapability rows (analogous to Substrate).
  capabilityHints: string[]
}

export interface SavedAddressOption {
  id: string
  label: string
  contactName: string
  contactPhone: string | null
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string | null
  postalCode: string
  country: string
  isDefault: boolean
}

export interface FulfillmentOptions {
  warehouses: WarehouseOption[]
  savedAddresses: SavedAddressOption[]
}

export interface NewAddressInput {
  label?: string
  contactName: string
  contactPhone?: string
  addressLine1: string
  addressLine2?: string
  city: string
  state?: string
  postalCode: string
  country?: string
}

// Phase L1b — four-destination payload shapes. DestinationOption itself comes
// from @ilaunchify/orders (the same pure resolver the Pay action re-runs).
export type { DestinationOption } from '@ilaunchify/orders'

export interface SuggestedFcOption {
  partnerServiceId: string // PartnerService.id (type=WAREHOUSE)
  partnerName: string
  city: string | null
  state: string | null
  distanceMiles: number | null // null when either side lacks coordinates
  /** One-line "why this node" copy, shown verbatim next to the suggestion. */
  rationale: string
}

export interface HoldStorageOffer {
  billingUnit: 'PALLET_MONTH' | 'CUFT_MONTH' | null
  rateCents: number | null // per billing unit per month
  freeGraceDays: number | null // business days free after production delivery
  pickFeeCents: number | null // per-order pick fee (ON_DEMAND)
  packFeeCents: number | null
  /** ON_DEMAND needs onDemandEnabled + canShipParcel on the partner service. */
  onDemandAvailable: boolean
  /** STOCK_RELEASE only needs storage — freight-capable partners qualify. */
  stockReleaseAvailable: boolean
}

export interface DestinationOptionsPayload {
  options: DestinationOption[]
  /** V1 nearest-eligible FC pick; null when no node qualifies. */
  suggestedFc: SuggestedFcOption | null
  /** Fee card for the Keep-at-manufacturer card; null unless HOLD is enabled. */
  holdOffer: HoldStorageOffer | null
}

// -----------------------------------------------------------------------------
// AUTH GUARD
// -----------------------------------------------------------------------------

async function authorize(productId: string) {
  const user = await requireUser()
  if (user.role !== 'CREATOR') {
    return { user: null, error: 'NOT_A_CREATOR' as const }
  }
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      brand: { creatorProfile: { userId: user.id } },
    },
    select: { id: true },
  })
  if (!product) return { user, error: 'NOT_YOUR_PRODUCT' as const }
  return { user, productId: product.id, error: null as null }
}

// -----------------------------------------------------------------------------
// LIST OPTIONS
// -----------------------------------------------------------------------------

export async function listFulfillmentOptions(
  productId: string,
): Promise<Result<FulfillmentOptions>> {
  const { user, error } = await authorize(productId)
  if (error) return { ok: false, error }

  const [warehouses, savedAddresses] = await Promise.all([
    prisma.partnerService.findMany({
      where: { type: 'WAREHOUSE', status: 'ACTIVE' },
      select: {
        id: true,
        capabilities: true,
        partner: {
          select: { companyName: true, city: true, state: true, country: true },
        },
      },
    }),
    prisma.creatorSavedAddress.findMany({
      where: { creatorUserId: user.id },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    }),
  ])

  return {
    ok: true,
    data: {
      warehouses: warehouses.map((w) => ({
        id: w.id,
        partnerName: w.partner.companyName,
        companyName: w.partner.companyName,
        city: w.partner.city,
        state: w.partner.state,
        country: w.partner.country,
        capabilityHints: extractCapabilityHints(w.capabilities),
      })),
      savedAddresses: savedAddresses.map((a) => ({
        id: a.id,
        label: a.label,
        contactName: a.contactName,
        contactPhone: a.contactPhone,
        addressLine1: a.addressLine1,
        addressLine2: a.addressLine2,
        city: a.city,
        state: a.state,
        postalCode: a.postalCode,
        country: a.country,
        isDefault: a.isDefault,
      })),
    },
  }
}

// -----------------------------------------------------------------------------
// LIST DESTINATION OPTIONS — Phase L1b four-destination cards
// -----------------------------------------------------------------------------

export async function listDestinationOptions(
  productId: string,
): Promise<Result<DestinationOptionsPayload>> {
  const { user, error } = await authorize(productId)
  if (error) return { ok: false, error }

  // Product flags + the pinned manufacturer's storage capability (routing is
  // owner-pinned — the producing service is fixed on the ProductTemplate).
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      productTemplate: {
        select: {
          storageClass: true,
          hazmatClass: true,
          labelingType: true,
          variants: { select: { shelfLifeDays: true } },
          manufacturerService: {
            select: {
              id: true,
              status: true,
              offersStorage: true,
              onDemandEnabled: true,
              canShipParcel: true,
              storageClasses: true,
              maxDwellDays: true,
              storageBillingUnit: true,
              storageRateCents: true,
              storageFreeGraceDays: true,
              pickFeeCents: true,
              packFeeCents: true,
              facilityLat: true,
              facilityLng: true,
              partner: { select: { state: true } },
            },
          },
        },
      },
    },
  })
  const template = product?.productTemplate ?? null
  const storageClass: string = template?.storageClass ?? 'AMBIENT'
  const hazmatClass: string = template?.hazmatClass ?? 'NONE'
  const domain: string = template?.labelingType ?? 'FOOD'
  const shelfLifeDays = minShelfLifeDays(template?.variants ?? [])

  // Cold classes are admin-gated (L1 lock) — a gated-off class means no FC can
  // receive it and the manufacturer can't hold it, whatever their capabilities.
  const [gates, classEnabled, connectedChannels, warehouses] = await Promise.all([
    getLogisticsSettings(),
    isStorageClassEnabled(storageClass),
    prisma.channelConnection.count({
      where: { creatorUserId: user.id, status: 'CONNECTED' },
    }),
    prisma.partnerService.findMany({
      where: { type: 'WAREHOUSE', status: 'ACTIVE' },
      select: {
        id: true,
        storageClasses: true,
        hazmatAccepted: true,
        fcCertifications: true,
        weeklyPalletCapacity: true,
        facilityLat: true,
        facilityLng: true,
        partner: { select: { companyName: true, city: true, state: true } },
      },
    }),
  ])

  // V1 FC pick — Phase-1 hard eligibility + nearest to the manufacturer
  // (docs/LOGISTICS_AND_FULFILLMENT.md §5; scorer/rotation arrive V1.5).
  const candidates: FcCandidate[] = warehouses.map((w) => ({
    partnerServiceId: w.id,
    partnerName: w.partner.companyName,
    city: w.partner.city,
    state: w.partner.state,
    storageClasses: w.storageClasses,
    hazmatAccepted: w.hazmatAccepted,
    fcCertifications: w.fcCertifications,
    weeklyPalletCapacity: w.weeklyPalletCapacity,
    facilityLat: w.facilityLat,
    facilityLng: w.facilityLng,
  }))
  const m = template?.manufacturerService ?? null
  const selection = classEnabled
    ? selectNearestEligibleFc(candidates, {
        storageClass,
        hazmatClass,
        domain,
        pallets: 0, // unknown at this point — skip the capacity filter
        originLat: m?.facilityLat ?? null,
        originLng: m?.facilityLng ?? null,
        originState: m?.partner.state ?? null,
      })
    : { winner: null, ranked: [] }
  const eligibleWarehouseCount = selection.ranked.filter((r) => r.eligible).length

  const options = resolveDestinationOptions({
    product: { storageClass, hazmatClass, domain },
    manufacturer: m
      ? {
          offersStorage: m.offersStorage,
          onDemandEnabled: m.onDemandEnabled,
          canShipParcel: m.canShipParcel,
          // A gated-off cold class reads as "cannot store this temperature
          // class" — same server-enforced outcome the Pay action reproduces.
          storageClasses: classEnabled
            ? m.storageClasses
            : m.storageClasses.filter((c) => c !== storageClass),
          maxDwellDays: m.maxDwellDays,
          productShelfLifeDays: shelfLifeDays,
        }
      : null,
    gates,
    eligibleWarehouseCount,
    hasConnectedChannel: connectedChannels > 0,
  })

  const winner = selection.winner
  const suggestedFc: SuggestedFcOption | null = winner
    ? {
        partnerServiceId: winner.candidate.partnerServiceId,
        partnerName: winner.candidate.partnerName,
        city: winner.candidate.city,
        state: winner.candidate.state,
        distanceMiles: winner.distanceMiles,
        rationale: fcRationale(domain, winner.distanceMiles),
      }
    : null

  const holdEnabled =
    options.find((o) => o.type === 'HOLD_AT_MANUFACTURER')?.enabled === true
  const holdOffer: HoldStorageOffer | null =
    holdEnabled && m
      ? {
          billingUnit: m.storageBillingUnit,
          rateCents: m.storageRateCents,
          freeGraceDays: m.storageFreeGraceDays,
          pickFeeCents: m.pickFeeCents,
          packFeeCents: m.packFeeCents,
          onDemandAvailable: m.onDemandEnabled && m.canShipParcel,
          stockReleaseAvailable: true,
        }
      : null

  return { ok: true, data: { options, suggestedFc, holdOffer } }
}

/** Shortest declared shelf life across the template's variants; null = unknown. */
function minShelfLifeDays(variants: Array<{ shelfLifeDays: number | null }>): number | null {
  let min: number | null = null
  for (const v of variants) {
    if (v.shelfLifeDays != null && (min === null || v.shelfLifeDays < min)) min = v.shelfLifeDays
  }
  return min
}

const FC_FOOD_DOMAINS = ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT']

function fcRationale(domain: string, distanceMiles: number | null): string {
  const grade = FC_FOOD_DOMAINS.includes(domain) ? 'food-grade ' : ''
  return distanceMiles !== null
    ? `Closest ${grade}fulfillment center to your manufacturer`
    : `Nearest eligible ${grade}fulfillment center to your manufacturer (matched by state)`
}

// PartnerService.capabilities is freeform JSON pre-G3-style. We surface
// the values cautiously — only top-level string entries become chips.
// G3-style typed warehouse capabilities land later (see memory
// [[ilaunchify-g3-standardize-capabilities]] — same pattern, different
// domain).
function extractCapabilityHints(caps: unknown): string[] {
  if (!caps || typeof caps !== 'object') return []
  const hints: string[] = []
  for (const [key, value] of Object.entries(caps as Record<string, unknown>)) {
    if (value === true) hints.push(humanCapability(key))
    else if (Array.isArray(value)) {
      for (const v of value) if (typeof v === 'string' && hints.length < 4) hints.push(v)
    }
  }
  return hints.slice(0, 4)
}

function humanCapability(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

// -----------------------------------------------------------------------------
// SAVE ADDRESS
// -----------------------------------------------------------------------------

export async function saveCreatorAddress(input: {
  productId: string                                 // used only for revalidatePath
  address: NewAddressInput
  makeDefault?: boolean
}): Promise<Result<{ savedAddressId: string }>> {
  const { user, error } = await authorize(input.productId)
  if (error) return { ok: false, error }

  if (!input.address.addressLine1.trim()) {
    return { ok: false, error: 'Street address is required.' }
  }
  if (!input.address.contactName.trim()) {
    return { ok: false, error: 'Recipient name is required.' }
  }
  if (!input.address.city.trim() || !input.address.postalCode.trim()) {
    return { ok: false, error: 'City + postal code are required.' }
  }

  // If first saved address OR makeDefault was true, promote it.
  const existingCount = await prisma.creatorSavedAddress.count({
    where: { creatorUserId: user.id },
  })
  const makeDefault = input.makeDefault || existingCount === 0

  const saved = await prisma.$transaction(async (tx) => {
    if (makeDefault) {
      await tx.creatorSavedAddress.updateMany({
        where: { creatorUserId: user.id, isDefault: true },
        data: { isDefault: false },
      })
    }
    return tx.creatorSavedAddress.create({
      data: {
        creatorUserId: user.id,
        label: input.address.label?.trim() || 'Saved address',
        contactName: input.address.contactName.trim(),
        contactPhone: input.address.contactPhone?.trim() || null,
        addressLine1: input.address.addressLine1.trim(),
        addressLine2: input.address.addressLine2?.trim() || null,
        city: input.address.city.trim(),
        state: input.address.state?.trim() || null,
        postalCode: input.address.postalCode.trim(),
        country: input.address.country?.trim() || 'US',
        isDefault: makeDefault,
      },
    })
  })

  revalidatePath(`/products/${input.productId}/checkout`)
  return { ok: true, data: { savedAddressId: saved.id } }
}

// -----------------------------------------------------------------------------
// ESTIMATE SHIPPING — Phase L2 live carrier quote (L5) with flat-rate fallback
// -----------------------------------------------------------------------------
//
// L5 (docs/LOGISTICS_AND_FULFILLMENT.md §10): the creator pays first-leg
// freight at checkout as a quoted line item — carrier rate + admin-tunable
// margin (OrderSettings.firstLegMarginBps). The live path runs only when the
// EasyPost rail is admin-enabled (LogisticsSetting `carrier:easypost`), the
// EASYPOST_API_KEY env is present, AND the destination resolves to a concrete
// US address (saved address / warehouse partner address). ANY failure — gate
// off, no key, unresolvable address, gateway error/timeout, no eligible rate —
// falls back silently to the V1 flat logic. `quoteSource` tells the UI which
// path produced the number.

export interface EstimateShippingInput {
  productId: string
  shipToType:
    | 'CLOSEST_WAREHOUSE'
    | 'SPECIFIC_WAREHOUSE'
    | 'SAVED_ADDRESS'
    | 'NEW_ADDRESS'
    | 'HOLD_AT_MANUFACTURER'
  warehousePartnerServiceId?: string | null
  savedAddressId?: string | null
  newAddressCountry?: string | null
  quantity: number
}

export interface EstimateShippingResult {
  shippingCents: number
  leadTimeBusinessDays: number
  /** 'carrier' = live EasyPost rate + margin (L5) · 'flat' = V1 rate-card. */
  quoteSource: 'carrier' | 'flat'
}

export async function estimateShipping(
  input: EstimateShippingInput,
): Promise<Result<EstimateShippingResult>> {
  const { user, error } = await authorize(input.productId)
  if (error) return { ok: false, error }

  const qty = Math.max(0, Math.floor(input.quantity || 0))
  if (qty === 0) {
    return { ok: true, data: { shippingCents: 0, leadTimeBusinessDays: 0, quoteSource: 'flat' } }
  }

  // HOLD_AT_MANUFACTURER — goods never leave the producer's dock at order
  // time; storage bills monthly via the StorageAgreement, not as shipping.
  if (input.shipToType === 'HOLD_AT_MANUFACTURER') {
    return { ok: true, data: { shippingCents: 0, leadTimeBusinessDays: 0, quoteSource: 'flat' } }
  }

  // ---- Live carrier quote (Phase L2 / L5) -----------------------------------
  const destination = await resolveQuoteDestination(user.id, input)
  if (destination) {
    const quote = await quoteCarrierShipping({
      productId: input.productId,
      quantity: qty,
      destination,
    })
    if (quote) {
      const fallbackLead =
        input.shipToType === 'CLOSEST_WAREHOUSE' || input.shipToType === 'SPECIFIC_WAREHOUSE' ? 3 : 5
      return {
        ok: true,
        data: {
          shippingCents: quote.shippingCents,
          leadTimeBusinessDays: quote.transitDays ?? fallbackLead,
          quoteSource: 'carrier',
        },
      }
    }
  }

  // ---- Flat fallback — V1 rate-card (unchanged) ------------------------------
  // Tier per-unit rate (cents).
  let perUnitCents: number
  if (qty < 100) perUnitCents = 95
  else if (qty < 500) perUnitCents = 72
  else if (qty < 2500) perUnitCents = 58
  else perUnitCents = 44

  // Mode adjustment — warehouse ship-to is cheaper than residential
  // because partners have loading docks + freight discounts.
  let modeMultiplier = 1.0
  if (input.shipToType === 'CLOSEST_WAREHOUSE' || input.shipToType === 'SPECIFIC_WAREHOUSE') {
    modeMultiplier = 0.78
  }
  // International — flat surcharge until the carrier rail covers non-US lanes.
  if (input.newAddressCountry && input.newAddressCountry !== 'US') {
    modeMultiplier = 2.1
  }

  const shippingCents = Math.round(perUnitCents * qty * modeMultiplier)
  const leadTimeBusinessDays =
    input.shipToType === 'CLOSEST_WAREHOUSE' || input.shipToType === 'SPECIFIC_WAREHOUSE'
      ? 3
      : 5

  return { ok: true, data: { shippingCents, leadTimeBusinessDays, quoteSource: 'flat' } }
}

// -----------------------------------------------------------------------------
// CARRIER QUOTE HELPER — shared with cart-actions.ts (order placement uses the
// same quote path so the number the creator saw is the number that books).
// -----------------------------------------------------------------------------

export interface CarrierQuoteDestination {
  name: string
  street1: string
  street2?: string | null
  city: string
  state?: string | null
  zip: string
  country: string
}

export interface CarrierQuoteResult {
  /** Carrier rate + OrderSettings.firstLegMarginBps margin (L5), integer cents. */
  shippingCents: number
  carrier: string
  service: string
  transitDays: number | null
}

/** Keep checkout snappy — the gateway call is raced against this timeout. */
const CARRIER_QUOTE_TIMEOUT_MS = 5_000

const US_ZIP_RE = /^\d{5}(-\d{4})?$/

/**
 * Attempt a live EasyPost parcel quote for one order (Phase L2, decision L5).
 * Returns null on ANY failure or ineligibility — callers fall back to the flat
 * rate silently. Exported from a 'use server' file (= an invokable endpoint),
 * so it runs the same creator-ownership fence as every action in this file.
 */
export async function quoteCarrierShipping(input: {
  productId: string
  quantity: number
  destination: CarrierQuoteDestination
}): Promise<CarrierQuoteResult | null> {
  try {
    const { error } = await authorize(input.productId)
    if (error) return null

    // Gates: env key first (cheap), then the admin LogisticsSetting toggle.
    // Key comes from env only — integrations-registry rule, never the DB.
    const apiKey = process.env.EASYPOST_API_KEY
    if (!apiKey) return null
    if (!(await isLogisticsEnabled('carrier:easypost'))) return null

    // US-only + sanity — placeholder partner addresses ('Address on file' /
    // '00000') must never reach the carrier API.
    const dest = input.destination
    if (dest.country !== 'US') return null
    if (!US_ZIP_RE.test(dest.zip) || dest.zip.startsWith('00000')) return null
    if (!dest.street1.trim() || dest.street1 === 'Address on file' || !dest.city.trim()) return null

    // Origin = the pinned manufacturer's address (routing is owner-pinned —
    // the producing service is fixed on the ProductTemplate).
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: {
        productTemplate: {
          select: {
            storageClass: true,
            hazmatClass: true,
            meltable: true,
            labelingType: true,
            manufacturerService: {
              select: {
                partner: {
                  select: {
                    companyName: true,
                    contactPhone: true,
                    addressLine1: true,
                    addressLine2: true,
                    city: true,
                    state: true,
                    postalCode: true,
                    country: true,
                  },
                },
              },
            },
          },
        },
      },
    })
    const template = product?.productTemplate ?? null
    const origin = template?.manufacturerService?.partner ?? null
    if (!template || !origin?.addressLine1 || !origin.city || !origin.postalCode) return null
    if (origin.country !== 'US' || !US_ZIP_RE.test(origin.postalCode)) return null

    // V1 representative parcel — PLACEHOLDER until case-pack dims exist on the
    // template/packaging: 12"×12"×12", weight scales with quantity clamped to
    // 5–50 lb. ONE parcel only — this is a checkout ESTIMATE, not the booked
    // manifest, so we deliberately do NOT multiply the rate by carton count.
    const qty = Math.max(1, Math.floor(input.quantity))
    const parcel = {
      lengthIn: 12,
      widthIn: 12,
      heightIn: 12,
      weightLb: Math.min(50, Math.max(5, qty * 0.5)),
    }

    // Stage 1 — classify (prisma enum values mirror the shipping unions 1:1).
    const shipment = classifyShipment({
      domain: toShippingDomain(template.labelingType),
      storageClass: template.storageClass,
      hazmatClass: template.hazmatClass,
      meltable: template.meltable,
      cartons: [parcel],
    })
    // One representative carton always classifies PARCEL, but keep the guard —
    // the EasyPost rail is parcel-only (LTL = ShipEngine, behind its own flag).
    if (shipment.mode !== 'PARCEL') return null

    // Stage 2 — eligibility matrix over ACTIVE CarrierServiceRule rows.
    const ruleRows = await prisma.carrierServiceRule.findMany({ where: { active: true } })
    const rules: CarrierServiceRuleRow[] = ruleRows.map((r) => ({
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
    const eligible = eligibleCarrierServices(rules, shipment, {
      meltable: template.meltable,
      plannedShipDate: new Date(),
    })
    if (eligible.length === 0) return null

    // Stage 3 — live rate-shop, raced against a 5s timeout so checkout never
    // hangs on the carrier API. The gateway promise carries its own .catch so
    // a late rejection after the timeout can't surface as unhandled.
    const gateway = new EasyPostParcelGateway(createFetchEasyPostHttp(), apiKey)
    const ratePromise = gateway
      .rate({
        from: {
          name: origin.companyName,
          phone: origin.contactPhone,
          street1: origin.addressLine1,
          street2: origin.addressLine2,
          city: origin.city,
          state: origin.state,
          zip: origin.postalCode,
          country: origin.country,
        },
        to: {
          name: dest.name,
          street1: dest.street1,
          street2: dest.street2 ?? null,
          city: dest.city,
          state: dest.state ?? null,
          zip: dest.zip,
          country: dest.country,
        },
        parcels: [parcel],
      })
      .catch(() => null)
    const rated = await Promise.race([
      ratePromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), CARRIER_QUOTE_TIMEOUT_MS)),
    ])
    if (!rated) return null

    const shopped = shopRates(rated.quotes, eligible, shipment)
    if (!shopped.chosen) return null

    // L5 — creator pays rate + admin-tunable margin. firstLegMarginBps lives
    // on the OrderSettings singleton (not surfaced by getOrderSettings() yet).
    const settings = await prisma.orderSettings
      .findUnique({ where: { id: 'default' }, select: { firstLegMarginBps: true } })
      .catch(() => null)
    const marginBps = settings?.firstLegMarginBps ?? 0

    return {
      shippingCents: applyFirstLegMargin(shopped.chosen.rateCents, marginBps),
      carrier: shopped.chosen.carrier,
      service: shopped.chosen.service,
      transitDays: shopped.chosen.transitDays,
    }
  } catch {
    // ANY failure ⇒ null ⇒ the caller books the flat rate, silently.
    return null
  }
}

/** LabelingType → ShippingDomain (same vocabulary; OTC has no shipping domain,
 *  and the classifier doesn't branch on domain today — default to FOOD). */
function toShippingDomain(labelingType: string): ShippingDomain {
  const known: readonly string[] = [
    'FOOD',
    'BEVERAGE',
    'DIETARY_SUPPLEMENT',
    'PET_PRODUCT',
    'BABY_NUTRITION',
    'COSMETIC',
  ]
  return known.includes(labelingType) ? (labelingType as ShippingDomain) : 'FOOD'
}

/**
 * Resolve the estimate input to a concrete quoteable address. Only saved
 * addresses and a PICKED warehouse resolve — NEW_ADDRESS carries just a
 * country in this input (unchanged for backward compatibility), and
 * CLOSEST_WAREHOUSE without a pick has no node yet. Both fall back to flat.
 */
async function resolveQuoteDestination(
  userId: string,
  input: EstimateShippingInput,
): Promise<CarrierQuoteDestination | null> {
  if (input.shipToType === 'SAVED_ADDRESS' && input.savedAddressId) {
    const a = await prisma.creatorSavedAddress.findFirst({
      where: { id: input.savedAddressId, creatorUserId: userId },
    })
    if (!a) return null
    return {
      name: a.contactName,
      street1: a.addressLine1,
      street2: a.addressLine2,
      city: a.city,
      state: a.state,
      zip: a.postalCode,
      country: a.country,
    }
  }
  if (
    (input.shipToType === 'SPECIFIC_WAREHOUSE' || input.shipToType === 'CLOSEST_WAREHOUSE') &&
    input.warehousePartnerServiceId
  ) {
    const w = await prisma.partnerService.findFirst({
      where: { id: input.warehousePartnerServiceId, type: 'WAREHOUSE', status: 'ACTIVE' },
      select: {
        partner: {
          select: {
            companyName: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            postalCode: true,
            country: true,
          },
        },
      },
    })
    const p = w?.partner
    if (!p?.addressLine1 || !p.city || !p.postalCode) return null
    return {
      name: p.companyName,
      street1: p.addressLine1,
      street2: p.addressLine2,
      city: p.city,
      state: p.state,
      zip: p.postalCode,
      country: p.country,
    }
  }
  return null
}
