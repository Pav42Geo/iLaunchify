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
// listDestinationOptions(productId) — Phase L1b (+L4a scored suggestion)
//   The four-destination-card payload (docs/LOGISTICS_AND_FULFILLMENT.md §2/§9):
//   which destination types are offered (and the disabled copy when not), the
//   platform-suggested fulfillment center (L4a weighted-band scorer; falls
//   back to V1 nearest-eligible below 3 eligible nodes), and the
//   hold-at-manufacturer storage fee card. The Pay action re-runs the same
//   eligibility server-side — this is display data, never the enforcement point.

import { prisma, getLogisticsSettings, isLogisticsEnabled, isStorageClassEnabled } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  resolveDestinationOptions,
  scoreAndSelectFc,
  type DestinationOption,
  type FcCandidate,
  type FcScoreResult,
  type FcScoringWeights,
  type FcAwardHistoryEntry,
} from '@ilaunchify/orders'
import {
  EasyPostParcelGateway,
  createFetchEasyPostHttp,
  classifyShipment,
  eligibleCarrierServices,
  shopRates,
  applyFirstLegMargin,
  evaluateChannelInboundGates,
  type CarrierServiceRuleRow,
  type ShippingDomain,
  type InboundChannel,
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

// Phase L3a — per-connection channel-inbound evaluation for the fourth card.
// One entry per CONNECTED ChannelConnection on an inbound-capable channel
// (amazon → AMAZON_FBA first; walmart/tiktok gate keys exist but their
// adapters land Phase L4). Display data — the Pay action re-runs every gate.
export interface ChannelInboundOption {
  channelConnectionId: string
  channelCode: string // Channel.code ('amazon' | 'walmart' | 'tiktok' | …)
  channelName: string // Channel.displayName
  externalAccountId: string | null
  eligible: boolean
  /** Gate-failure copy, shown VERBATIM in checkout (channel-gates.ts + FNSKU). */
  reasons: string[]
}

export interface DestinationOptionsPayload {
  options: DestinationOption[]
  /** V1 nearest-eligible FC pick; null when no node qualifies. */
  suggestedFc: SuggestedFcOption | null
  /** Fee card for the Keep-at-manufacturer card; null unless HOLD is enabled. */
  holdOffer: HoldStorageOffer | null
  /** L3a — per-channel inbound evaluation (empty until a channel is CONNECTED). */
  channels: ChannelInboundOption[]
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
          meltable: true,
          labelingType: true,
          leadTimeFirstRunDays: true,
          leadTimeRepeatDays: true,
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
  // L3a: the CONNECTED connections are fetched in full (not counted) so each
  // one can be gate-evaluated per channel below.
  const [gates, classEnabled, connectedChannels, warehouses] = await Promise.all([
    getLogisticsSettings(),
    isStorageClassEnabled(storageClass),
    prisma.channelConnection.findMany({
      where: { creatorUserId: user.id, status: 'CONNECTED', channel: { enabled: true } },
      select: {
        id: true,
        externalAccountId: true,
        channel: { select: { code: true, displayName: true } },
        productLinks: { where: { productId }, select: { fnsku: true } },
      },
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
        // P1 blackout enforcement — active window today = hard-excluded (fc-selector)
        blackoutDates: {
          where: { startsOn: { lte: new Date() }, endsOn: { gte: new Date() } },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ])

  // L4a FC pick — Phase-2 weighted scoring + Phase-3 rotation band
  // (docs/LOGISTICS_AND_FULFILLMENT.md §5). The scorer internally falls back
  // to V1 nearest-eligible below 3 eligible nodes; `algorithm` on the result
  // tells the rationale line which path ran. Display data — the Pay action
  // (cart-actions.resolveShipTo) re-runs the same selection server-side.
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
    blackedOut: w.blackoutDates.length > 0,
  }))
  const m = template?.manufacturerService ?? null
  let selection: FcScoreResult = {
    winner: null,
    scored: [],
    rotationApplied: false,
    algorithm: 'V1_NEAREST_ELIGIBLE',
  }
  if (classEnabled) {
    const [weights, awardHistory] = await Promise.all([
      readFcScoringWeights(),
      readFcAwardHistory(candidates.map((c) => c.partnerServiceId)),
    ])
    selection = scoreAndSelectFc(
      candidates,
      {
        storageClass,
        hazmatClass,
        domain,
        pallets: 0, // unknown at this point — skip the capacity filter
        originLat: m?.facilityLat ?? null,
        originLng: m?.facilityLng ?? null,
        originState: m?.partner.state ?? null,
      },
      {
        weights,
        history: awardHistory.history,
        totalRecentAwards: awardHistory.totalRecentAwards,
      },
    )
  }
  const eligibleWarehouseCount = selection.scored.filter((s) => s.ranked.eligible).length

  // L3a — per-channel gate evaluation (LOGISTICS §7). One option per CONNECTED
  // connection on an inbound-capable channel: LogisticsSetting per-channel gate
  // + pure channel gates (temp / meltable window / shelf-life / DG) + FNSKU
  // presence. Display data — cart-actions.resolveShipTo re-runs everything.
  const channelMinShelfLifeDays = await readChannelMinShelfLifeDays()
  const channelOptions: ChannelInboundOption[] = connectedChannels.flatMap((conn) => {
    const inbound = inboundChannelForCode(conn.channel.code)
    if (!inbound) return [] // shopify/etsy/… have no factory→FC inbound program
    const reasons: string[] = []
    if (gates[`channel_inbound:${inbound}`] !== true) {
      reasons.push(`Inbound shipping into ${conn.channel.displayName} isn't enabled yet.`)
    }
    const gate = evaluateChannelInboundGates({
      channel: inbound,
      storageClass,
      hazmatClass,
      meltable: template?.meltable ?? false,
      shelfLifeDays,
      daysUntilCheckIn: daysUntilChannelCheckIn(template),
      channelMinShelfLifeDays,
      checkInDate: new Date(Date.now() + daysUntilChannelCheckIn(template) * DAY_MS),
      // V1: no DG-program enrollment capture exists yet — hazmat SKUs stay
      // gated off until the readiness checklist (readinessJson) lands.
      dgProgramApproved: false,
    })
    reasons.push(...gate.reasons)
    if (!conn.productLinks[0]?.fnsku) {
      reasons.push('Add the FNSKU for this product in Settings → Channels first.')
    }
    return [
      {
        channelConnectionId: conn.id,
        channelCode: conn.channel.code,
        channelName: conn.channel.displayName,
        externalAccountId: conn.externalAccountId,
        eligible: reasons.length === 0,
        reasons,
      },
    ]
  })

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
    hasConnectedChannel: connectedChannels.length > 0,
  })

  // Merge the per-channel verdicts into the CHANNEL_INBOUND card: the resolver
  // covers the destination gate / connection presence / cold-class facts; the
  // per-channel evaluation adds meltable-window, shelf-life, DG and FNSKU. If
  // the card survived the resolver but no connection is eligible, disable it
  // and surface the gate failures VERBATIM as the reason.
  const channelIdx = options.findIndex((o) => o.type === 'CHANNEL_INBOUND')
  const channelOpt = channelIdx >= 0 ? options[channelIdx] : undefined
  if (channelOpt?.enabled && !channelOptions.some((c) => c.eligible)) {
    const mergedReasons = [...new Set(channelOptions.flatMap((c) => c.reasons))]
    options[channelIdx] = {
      type: 'CHANNEL_INBOUND',
      enabled: false,
      disabledReason:
        mergedReasons.join(' ') ||
        'None of your connected channels can receive this product right now.',
    }
  }

  const winner = selection.winner
  const suggestedFc: SuggestedFcOption | null = winner
    ? {
        partnerServiceId: winner.ranked.candidate.partnerServiceId,
        partnerName: winner.ranked.candidate.partnerName,
        city: winner.ranked.candidate.city,
        state: winner.ranked.candidate.state,
        distanceMiles: winner.ranked.distanceMiles,
        rationale: fcRationale(
          domain,
          winner.ranked.distanceMiles,
          selection.algorithm,
          eligibleWarehouseCount,
        ),
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

  return { ok: true, data: { options, suggestedFc, holdOffer, channels: channelOptions } }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Channel.code → the shipping package's InboundChannel vocabulary. Null for
 *  channels with no factory→FC inbound program (Shopify = the §3 FC network). */
function inboundChannelForCode(code: string): InboundChannel | null {
  if (code === 'amazon') return 'AMAZON_FBA'
  if (code === 'walmart') return 'WALMART_WFS'
  if (code === 'tiktok') return 'TIKTOK_FBT'
  return null
}

/** Days until the run could check in at a channel FC: production lead (first-run
 *  figure when set, else repeat, else the 28-day platform default) + 7 transit
 *  fallback. Refined with real transit quotes when the SP-API flow lands. */
function daysUntilChannelCheckIn(
  template: { leadTimeFirstRunDays: number | null; leadTimeRepeatDays: number | null } | null,
): number {
  const lead = template?.leadTimeFirstRunDays ?? template?.leadTimeRepeatDays ?? 28
  return lead + 7
}

/** OrderSettings.channelMinShelfLifeDays isn't surfaced by getOrderSettings()
 *  yet — read it straight off the singleton (firstLegMarginBps pattern). */
async function readChannelMinShelfLifeDays(): Promise<number> {
  const row = await prisma.orderSettings
    .findUnique({ where: { id: 'default' }, select: { channelMinShelfLifeDays: true } })
    .catch(() => null)
  return row?.channelMinShelfLifeDays ?? 105
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

/** One-line "why this node" copy. V1 nearest-eligible → "closest eligible";
 *  the L4a weighted band → the scored-selection explanation. */
function fcRationale(
  domain: string,
  distanceMiles: number | null,
  algorithm: FcScoreResult['algorithm'],
  eligibleCount: number,
): string {
  const grade = FC_FOOD_DOMAINS.includes(domain) ? 'food-grade ' : ''
  if (algorithm === 'V15_WEIGHTED_BAND') {
    return `Best score across ${eligibleCount} eligible ${grade}centers (cost, distance, capacity, rotation)`
  }
  return distanceMiles !== null
    ? `Closest eligible ${grade}fulfillment center to your manufacturer`
    : `Closest eligible ${grade}fulfillment center to your manufacturer (matched by state)`
}

// -----------------------------------------------------------------------------
// L4a — FC scoring inputs (weights + award history). Duplicated in
// cart-actions.ts ('use server' files can only export async actions, and these
// must never be client-invokable endpoints).
// -----------------------------------------------------------------------------

/** Spec §5 starting weights — used when the singleton row / fields are missing. */
const FC_WEIGHT_DEFAULTS: FcScoringWeights = {
  costWeightPct: 35,
  distanceWeightPct: 15,
  slaWeightPct: 15,
  capacityWeightPct: 15,
  rotationWeightPct: 10,
  storageMatchWeightPct: 10,
  rotationBandPct: 5,
}

/** OrderSettings.fc*WeightPct aren't surfaced by getOrderSettings() yet — read
 *  them straight off the singleton (channelMinShelfLifeDays pattern). */
async function readFcScoringWeights(): Promise<FcScoringWeights> {
  const row = await prisma.orderSettings
    .findUnique({
      where: { id: 'default' },
      select: {
        fcCostWeightPct: true,
        fcDistanceWeightPct: true,
        fcSlaWeightPct: true,
        fcCapacityWeightPct: true,
        fcRotationWeightPct: true,
        fcStorageMatchWeightPct: true,
        fcRotationBandPct: true,
      },
    })
    .catch(() => null)
  return {
    costWeightPct: row?.fcCostWeightPct ?? FC_WEIGHT_DEFAULTS.costWeightPct,
    distanceWeightPct: row?.fcDistanceWeightPct ?? FC_WEIGHT_DEFAULTS.distanceWeightPct,
    slaWeightPct: row?.fcSlaWeightPct ?? FC_WEIGHT_DEFAULTS.slaWeightPct,
    capacityWeightPct: row?.fcCapacityWeightPct ?? FC_WEIGHT_DEFAULTS.capacityWeightPct,
    rotationWeightPct: row?.fcRotationWeightPct ?? FC_WEIGHT_DEFAULTS.rotationWeightPct,
    storageMatchWeightPct:
      row?.fcStorageMatchWeightPct ?? FC_WEIGHT_DEFAULTS.storageMatchWeightPct,
    rotationBandPct: row?.fcRotationBandPct ?? FC_WEIGHT_DEFAULTS.rotationBandPct,
  }
}

const FC_AWARD_HISTORY_DAYS = 90

/** FcAwardLog rows for the candidate nodes over the last 90 days, grouped into
 *  the scorer's {awardCount, lastAwardedAt} shape. Best-effort: an empty
 *  history just means the rotation dimension renormalizes away. */
async function readFcAwardHistory(
  partnerServiceIds: string[],
): Promise<{ history: Record<string, FcAwardHistoryEntry>; totalRecentAwards: number }> {
  if (partnerServiceIds.length === 0) return { history: {}, totalRecentAwards: 0 }
  const since = new Date(Date.now() - FC_AWARD_HISTORY_DAYS * 24 * 60 * 60 * 1000)
  const rows = await prisma.fcAwardLog
    .groupBy({
      by: ['partnerServiceId'],
      where: { partnerServiceId: { in: partnerServiceIds }, awardedAt: { gte: since } },
      _count: { _all: true },
      _max: { awardedAt: true },
    })
    .catch(
      () =>
        [] as Array<{
          partnerServiceId: string
          _count: { _all: number }
          _max: { awardedAt: Date | null }
        }>,
    )
  const history: Record<string, FcAwardHistoryEntry> = {}
  let totalRecentAwards = 0
  for (const r of rows) {
    history[r.partnerServiceId] = {
      awardCount: r._count._all,
      lastAwardedAt: r._max.awardedAt ?? null,
    }
    totalRecentAwards += r._count._all
  }
  return { history, totalRecentAwards }
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
    | 'CHANNEL_INBOUND'
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
  // because partners have loading docks + freight discounts. Channel FCs are
  // commercial docks too (the concrete FC address is only assigned by the
  // channel at plan confirmation, so CHANNEL_INBOUND always quotes flat here).
  let modeMultiplier = 1.0
  if (
    input.shipToType === 'CLOSEST_WAREHOUSE' ||
    input.shipToType === 'SPECIFIC_WAREHOUSE' ||
    input.shipToType === 'CHANNEL_INBOUND'
  ) {
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
