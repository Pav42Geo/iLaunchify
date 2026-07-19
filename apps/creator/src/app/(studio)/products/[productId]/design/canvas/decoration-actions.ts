'use server'

// #22 split model (2026-07-19, Pavel): the creator picks the CONTAINER on the
// marketplace detail page, and the DECORATION METHOD here in the Studio, next to
// the material picker (F3b) and the die-line they design against.
//
// WHY IT WRITES THE PRIMARY PackagingComponent (not the CheckoutDraft like F3b).
// Decoration is a REAL model field, and it is MONEY: @ilaunchify/plans
// `priceComponents` reads `primaryContainer.partnerOffering.pricingTiers` for the
// per-unit decoration price, which is what checkout charges AND what routing pays
// the printer (dispatch-planner decoration leg). So the pick has to land on the
// component's `partnerOfferingId` (+ decorationMethod + dielineId), the one place
// both the charge and the payout read. The keystone (launch) already materialised
// the undecorated PRIMARY container; this fills in the offering the creator chose.
//
// The offering row IS the (container × decoration method) pair. Because the
// container is fixed per product, choosing a method = choosing that offering, so
// the drawer passes an offeringId and we read its method + dieline from the row.

import { prisma } from '@ilaunchify/db'
import type { DecorationMethod, FulfillmentMode } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAudit } from '@ilaunchify/audit'

// Mirrors apps/marketing decoration-offerings-db + partner offerings/constants.
const DECORATION_LABELS: Record<DecorationMethod, string> = {
  DIRECT_PRINT: 'Direct print',
  PRESSURE_SENSITIVE_LABEL: 'Pressure-sensitive label',
  SHRINK_SLEEVE: 'Shrink sleeve',
  IN_MOLD_LABEL: 'In-mold label',
  HEAT_TRANSFER: 'Heat transfer',
  FOIL_STAMP: 'Foil stamp',
  EMBOSS: 'Emboss',
  DEBOSS: 'Deboss',
  SPOT_UV: 'Spot UV',
  NONE: 'No decoration',
}

export interface DecorationOption {
  /** PartnerPackagingOffering.id — what setDesignDecoration pins onto the component. */
  offeringId: string
  decorationMethod: DecorationMethod
  methodLabel: string
  moq: number
  leadTimeDays: number
  /** Lowest tier price (cents) — the "starting at" anchor. */
  startingPricePerUnitCents: number
  fulfillmentMode: FulfillmentMode
  /** The offering's die-line, if any — pinned onto the component so the canvas designs against it. */
  dielineId: string | null
}

type LoadResult =
  | { ok: true; options: DecorationOption[]; selectedOfferingId: string | null; containerName: string | null }
  | { ok: false; error: string }

type WriteResult = { ok: true } | { ok: false; error: string }

interface PricingTier {
  minQty: number
  pricePerUnitCents: number
}

function lowestTierCents(tiers: unknown): number | null {
  if (!Array.isArray(tiers) || tiers.length === 0) return null
  const sorted = [...(tiers as PricingTier[])]
    .filter((t) => typeof t?.pricePerUnitCents === 'number')
    .sort((a, b) => a.pricePerUnitCents - b.pricePerUnitCents)
  return sorted[0]?.pricePerUnitCents ?? null
}

async function authorizeCreatorProduct(productId: string) {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { user: null, error: 'NOT_A_CREATOR' as const }
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: { id: true },
  })
  if (!product) return { user: null, error: 'NOT_YOUR_PRODUCT' as const }
  return { user, error: null as null }
}

/** The PRIMARY container component this product's decoration lives on. */
async function loadPrimaryContainer(productId: string) {
  return prisma.packagingComponent.findFirst({
    where: { productId, tier: 'PRIMARY', role: 'CONTAINER' },
    select: { id: true, packagingTypeId: true, partnerOfferingId: true },
    orderBy: { displayOrder: 'asc' },
  })
}

/**
 * The decoration methods offered for THIS product's container, plus which one is
 * currently pinned. Resolved from the PRIMARY component's packagingTypeId, so the
 * options always match the physical container the creator is designing for.
 * NO INVENTION: only real ACTIVE offerings appear; a container with none returns [].
 */
export async function getDesignDecoration(productId: string): Promise<LoadResult> {
  const { error } = await authorizeCreatorProduct(productId)
  if (error) return { ok: false, error }

  const container = await loadPrimaryContainer(productId)
  if (!container) {
    // No PRIMARY container yet (pre-keystone product). Nothing to decorate against.
    return { ok: true, options: [], selectedOfferingId: null, containerName: null }
  }

  const [offerings, type] = await Promise.all([
    prisma.partnerPackagingOffering.findMany({
      where: { packagingTypeId: container.packagingTypeId, status: 'ACTIVE' },
      select: {
        id: true,
        decorationMethod: true,
        moq: true,
        leadTimeDays: true,
        pricingTiers: true,
        fulfillmentMode: true,
        dielineId: true,
      },
    }),
    prisma.packagingType.findUnique({
      where: { id: container.packagingTypeId },
      select: { displayName: true },
    }),
  ])

  // One card per decoration method (the container is fixed). If a method somehow
  // appears twice, keep the lowest-MOQ, then lowest starting price.
  const byMethod = new Map<DecorationMethod, DecorationOption>()
  for (const o of offerings) {
    const startingCents = lowestTierCents(o.pricingTiers)
    if (startingCents == null) continue
    const option: DecorationOption = {
      offeringId: o.id,
      decorationMethod: o.decorationMethod,
      methodLabel: DECORATION_LABELS[o.decorationMethod] ?? o.decorationMethod,
      moq: o.moq,
      leadTimeDays: o.leadTimeDays,
      startingPricePerUnitCents: startingCents,
      fulfillmentMode: o.fulfillmentMode,
      dielineId: o.dielineId,
    }
    const existing = byMethod.get(o.decorationMethod)
    if (
      !existing ||
      option.moq < existing.moq ||
      (option.moq === existing.moq && option.startingPricePerUnitCents < existing.startingPricePerUnitCents)
    ) {
      byMethod.set(o.decorationMethod, option)
    }
  }

  const options = [...byMethod.values()].sort(
    (a, b) => a.startingPricePerUnitCents - b.startingPricePerUnitCents,
  )
  return {
    ok: true,
    options,
    selectedOfferingId: container.partnerOfferingId,
    containerName: type?.displayName ?? null,
  }
}

/**
 * Pin (or clear) the chosen decoration offering onto the PRIMARY container. Sets
 * partnerOfferingId + decorationMethod + dielineId — the trio checkout charges and
 * routing pays. Passing `offeringId: null` clears back to undecorated (NONE), a
 * legitimate state the creator can choose (checkout then blocks, pointing back here).
 * We validate the offering is ACTIVE and belongs to THIS container, so a stale
 * client can't pin a retired or mismatched offering.
 */
export async function setDesignDecoration(input: {
  productId: string
  offeringId: string | null
}): Promise<WriteResult> {
  const { user, error } = await authorizeCreatorProduct(input.productId)
  if (error || !user) return { ok: false, error: error ?? 'NOT_A_CREATOR' }

  const container = await loadPrimaryContainer(input.productId)
  if (!container) return { ok: false, error: 'NO_PRIMARY_CONTAINER' }

  // Clear → undecorated.
  if (!input.offeringId) {
    await prisma.packagingComponent.update({
      where: { id: container.id },
      data: { partnerOfferingId: null, decorationMethod: 'NONE', dielineId: null },
    })
    await logAudit({
      entityType: 'Product',
      entityId: input.productId,
      action: 'PRODUCT_DECORATION_SET',
      actorId: user.id,
      actorRole: 'CREATOR',
      payload: { componentId: container.id, offeringId: null, decorationMethod: 'NONE' },
    })
    return { ok: true }
  }

  // Validate the offering is ACTIVE and for THIS container.
  const offering = await prisma.partnerPackagingOffering.findFirst({
    where: {
      id: input.offeringId,
      status: 'ACTIVE',
      packagingTypeId: container.packagingTypeId,
    },
    select: { id: true, decorationMethod: true, dielineId: true },
  })
  if (!offering) return { ok: false, error: 'OFFERING_NOT_AVAILABLE' }

  await prisma.packagingComponent.update({
    where: { id: container.id },
    data: {
      partnerOfferingId: offering.id,
      decorationMethod: offering.decorationMethod,
      dielineId: offering.dielineId,
    },
  })
  await logAudit({
    entityType: 'Product',
    entityId: input.productId,
    action: 'PRODUCT_DECORATION_SET',
    actorId: user.id,
    actorRole: 'CREATOR',
    payload: {
      componentId: container.id,
      offeringId: offering.id,
      decorationMethod: offering.decorationMethod,
    },
  })
  return { ok: true }
}
