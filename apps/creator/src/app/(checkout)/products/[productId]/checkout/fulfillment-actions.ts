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

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
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
// ESTIMATE SHIPPING — V1 flat-rate placeholder
// -----------------------------------------------------------------------------

export interface EstimateShippingInput {
  productId: string
  shipToType:
    | 'CLOSEST_WAREHOUSE'
    | 'SPECIFIC_WAREHOUSE'
    | 'SAVED_ADDRESS'
    | 'NEW_ADDRESS'
  warehousePartnerServiceId?: string | null
  savedAddressId?: string | null
  newAddressCountry?: string | null
  quantity: number
}

export async function estimateShipping(
  input: EstimateShippingInput,
): Promise<Result<{ shippingCents: number; leadTimeBusinessDays: number }>> {
  const { error } = await authorize(input.productId)
  if (error) return { ok: false, error }

  // V1 rate-card. Real carrier integration (Shippo / EasyPost) lands V1.5+.
  // Forward marker: a real estimator reads partner-of-origin + ship-to
  // ZIP + per-unit weight to produce a rate. We approximate with a
  // tiered per-unit cost that gets cheaper at higher quantities.
  const qty = Math.max(0, Math.floor(input.quantity || 0))
  if (qty === 0) return { ok: true, data: { shippingCents: 0, leadTimeBusinessDays: 0 } }

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
  // International — flat surcharge until V1.5 carrier integration lands.
  if (input.newAddressCountry && input.newAddressCountry !== 'US') {
    modeMultiplier = 2.1
  }

  const shippingCents = Math.round(perUnitCents * qty * modeMultiplier)
  const leadTimeBusinessDays =
    input.shipToType === 'CLOSEST_WAREHOUSE' || input.shipToType === 'SPECIFIC_WAREHOUSE'
      ? 3
      : 5

  return { ok: true, data: { shippingCents, leadTimeBusinessDays } }
}
