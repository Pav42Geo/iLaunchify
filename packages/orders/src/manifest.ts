// Phase G8 — production manifest generator.
//
// generateOrderManifest(orderId, prisma) produces a deterministic JSON
// document describing exactly what the partner needs to print + fulfill.
// The manifest is generated SYNCHRONOUSLY at order placement because no
// canvas is required — it's pure metadata.
//
// The actual print-ready PDF + die-line SVG render is V1.5 worker
// territory (headless browser reads OrderItem.designVersionId and
// renders the saved Fabric JSON). bundleStatus tracks that future flow.
//
// Manifest shape is versioned so V2 can extend without breaking partner
// ingest pipelines.

import type { PrismaClient, Prisma } from '@ilaunchify/db'

export const MANIFEST_VERSION = '1.0.0'

/** A packaging component reduced to what manifest scoping needs. */
export interface ManifestComponent {
  id: string
  tier: string
  role: string
  decorationMethod: string
  dielineId: string | null
  packagingTypeId: string
  packagingTypeName: string | null
  /** partnerService of the component's chosen offering, if any. */
  partnerServiceId: string | null
}

/**
 * PURE — which packaging components a dispatch is responsible for (multi-component
 * Phase 2). Kept side-effect-free so the per-partner scoping (each printer/assembler
 * sees exactly their components, with the self-do fallback) is unit-testable.
 *
 *  - LABEL dispatch → the DECORATED components whose chosen offering belongs to this
 *    partnerService; if none match (the owner self-labels), it covers EVERY decorated
 *    component.
 *  - COPACKING dispatch → the CARTON/SHIPPER components this assembler packs; if none
 *    match (manufacturer self-assembles), it covers every assembly component.
 *  - PRODUCT (and anything else) → empty: production, not decoration.
 */
export function scopeDispatchComponents(params: {
  dispatchType: string
  partnerServiceId: string
  components: ManifestComponent[]
}): ManifestComponent[] {
  const { dispatchType, partnerServiceId, components } = params
  if (dispatchType === 'LABEL') {
    const decorated = components.filter((c) => c.decorationMethod !== 'NONE')
    const mine = decorated.filter((c) => c.partnerServiceId === partnerServiceId)
    return mine.length > 0 ? mine : decorated
  }
  if (dispatchType === 'COPACKING') {
    const assembly = components.filter((c) => c.role === 'CARTON' || c.role === 'SHIPPER')
    const mine = assembly.filter((c) => c.partnerServiceId === partnerServiceId)
    return mine.length > 0 ? mine : assembly
  }
  return []
}

export interface ProductionManifest {
  manifestVersion: typeof MANIFEST_VERSION
  generatedAt: string                      // ISO
  // ---- Order-level context -------------------------------------------------
  orderId: string
  orderDispatchId: string
  dispatchType: 'PRODUCT' | 'LABEL' | string
  quantity: number
  brandName: string
  productName: string
  // ---- Design lock ---------------------------------------------------------
  designVersionId: string | null           // null for legacy orders
  designVersion: number | null
  // ---- Substrate / Packaging (typed from G3 catalogs) ----------------------
  substrate: {
    slug: string
    name: string
    category: string
    sustainabilityTier: string
  } | null
  packaging: {
    slug: string
    name: string
    topology: string
    sustainabilityTier: string
    foodSafe: boolean
  } | null
  // ---- Finishes (from F1 PartnerFinish picks) ------------------------------
  finishes: Array<{
    partnerFinishId: string
    finishSlug: string
    finishName: string
    category: string
    pricingMode: string
    basePriceCents: number
    perUnitPriceCents: number
  }>
  // ---- Die-cut spec --------------------------------------------------------
  dieCut: {
    slug: string
    name: string
    category: string
    widthMm: number
    heightMm: number
    bleedMm: number
    safeAreaMm: number
  } | null
  // ---- Per-component scope (multi-component dispatch Phase 2) ---------------
  // For a LABEL dispatch, the decorated component(s) THIS partner prints — the
  // ones whose chosen offering belongs to this dispatch's partnerService. When a
  // dispatch self-labels (no offering matches), it covers all decorated
  // components. PRODUCT dispatches leave this empty (production, not decoration).
  components: Array<{
    componentId: string
    tier: string
    role: string
    packagingTypeId: string
    packagingTypeName: string | null
    decorationMethod: string
    dielineId: string | null
  }>
  // ---- Ship-to summary -----------------------------------------------------
  shipTo: {
    type: 'CREATOR_ADDRESS' | 'WAREHOUSE_PARTNER'
    contactName: string
    addressLine1: string
    addressLine2: string | null
    city: string
    state: string | null
    postalCode: string
    country: string
    warehousePartnerServiceId: string | null
  }
  // ---- Provenance ----------------------------------------------------------
  // Comma-separated list of partner-side fields that need clarification —
  // e.g. an unbound substrate or a finish on a substrate where the partner
  // hasn't declared compatibility. V1 always empty; V1.5 marketplace
  // matching populates this with real gaps.
  partnerActionItems: string[]
}

/**
 * Build the manifest for a single OrderDispatch row.
 *
 * This must be called inside the same transaction as the Order creation
 * so the data it reads is consistent with what was just written.
 */
export async function generateOrderManifest(
  tx: Prisma.TransactionClient | PrismaClient,
  args: { orderId: string; orderDispatchId: string },
): Promise<ProductionManifest> {
  const dispatch = await tx.orderDispatch.findUniqueOrThrow({
    where: { id: args.orderDispatchId },
    include: {
      order: {
        include: {
          brand: { select: { name: true } },
          items: {
            include: {
              product: {
                include: {
                  variant: {
                    select: {
                      flavor: true,
                      containerFormat: true,
                      dieCutTemplate: {
                        select: {
                          slug: true,
                          name: true,
                          category: true,
                          widthMm: true,
                          heightMm: true,
                          bleedMm: true,
                          safeAreaMm: true,
                        },
                      },
                    },
                  },
                },
              },
              designVersion: { select: { id: true, version: true } },
            },
          },
        },
      },
    },
  })

  // Multi-SKU (Phase 3) — scope the manifest to THIS dispatch's OrderItem. The
  // dispatch carries orderItemId (pending the Mac migration → cast); pre-Phase-3 /
  // single-item dispatches leave it null and fall back to the first item.
  const orderItemId = (dispatch as unknown as { orderItemId: string | null }).orderItemId
  const item =
    (orderItemId ? dispatch.order.items.find((i) => i.id === orderItemId) : null) ??
    dispatch.order.items[0]
  if (!item) {
    throw new Error(
      `OrderDispatch ${args.orderDispatchId} has no OrderItem — cannot generate manifest.`,
    )
  }
  const product = item.product
  const variant = product.variant
  const die = variant?.dieCutTemplate ?? null

  // Phase 2 — scope the decorated components THIS dispatch covers. A LABEL
  // dispatch prints the components whose chosen offering belongs to its
  // partnerService; if none match (self-label / owner does it), it covers every
  // decorated component. PRODUCT dispatches are production-focused → empty.
  const allComponents = await tx.packagingComponent.findMany({
    where: { productId: product.id },
    select: {
      id: true,
      tier: true,
      role: true,
      decorationMethod: true,
      dielineId: true,
      packagingTypeId: true,
      packagingType: { select: { displayName: true } },
      partnerOffering: { select: { partnerServiceId: true } },
    },
  })
  const normalizedComponents: ManifestComponent[] = allComponents.map((c) => ({
    id: c.id,
    tier: String(c.tier),
    role: String(c.role),
    decorationMethod: String(c.decorationMethod),
    dielineId: c.dielineId,
    packagingTypeId: c.packagingTypeId,
    packagingTypeName: c.packagingType?.displayName ?? null,
    partnerServiceId: c.partnerOffering?.partnerServiceId ?? null,
  }))
  const scopedComponents = scopeDispatchComponents({
    dispatchType: dispatch.type as string,
    partnerServiceId: dispatch.partnerServiceId,
    components: normalizedComponents,
  })

  // Pull substrate / packaging from the Order's internalNotes (set by
  // placeOrderFromCheckoutDraft as a structured block). When V1.5 wires
  // typed Order.substrateSlug / Order.packagingMaterialSlug + Order
  // finishApplications relations we'll switch to those — the manifest
  // shape stays identical.
  const lookups = parseInternalNotesLookups(dispatch.order.internalNotes)

  const [substrate, packaging, finishes] = await Promise.all([
    lookups.substrateSlug
      ? tx.substrate.findUnique({ where: { slug: lookups.substrateSlug } })
      : Promise.resolve(null),
    lookups.packagingSlug
      ? tx.packagingMaterial.findUnique({ where: { slug: lookups.packagingSlug } })
      : Promise.resolve(null),
    lookups.finishPartnerIds.length
      ? tx.partnerFinish.findMany({
          where: { id: { in: lookups.finishPartnerIds } },
          include: { finishType: true },
        })
      : Promise.resolve([] as Array<{
          id: string
          basePriceCents: number
          perUnitPriceCents: number
          pricingMode: string
          finishType: { slug: string; name: string; category: string }
        }>),
  ])

  return {
    manifestVersion: MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    orderId: dispatch.orderId,
    orderDispatchId: dispatch.id,
    dispatchType: dispatch.type,
    quantity: item.quantity,
    brandName: dispatch.order.brand.name,
    productName: product.name,
    designVersionId: item.designVersionId,
    designVersion: item.designVersion?.version ?? null,
    substrate: substrate
      ? {
          slug: substrate.slug,
          name: substrate.name,
          category: substrate.category,
          sustainabilityTier: substrate.sustainabilityTier,
        }
      : null,
    packaging: packaging
      ? {
          slug: packaging.slug,
          name: packaging.name,
          topology: packaging.topology,
          sustainabilityTier: packaging.sustainabilityTier,
          foodSafe: packaging.foodSafe,
        }
      : null,
    finishes: finishes.map((f) => ({
      partnerFinishId: f.id,
      finishSlug: f.finishType.slug,
      finishName: f.finishType.name,
      category: f.finishType.category,
      pricingMode: f.pricingMode,
      basePriceCents: f.basePriceCents,
      perUnitPriceCents: f.perUnitPriceCents,
    })),
    dieCut: die
      ? {
          slug: die.slug,
          name: die.name,
          category: die.category,
          widthMm: die.widthMm,
          heightMm: die.heightMm,
          bleedMm: die.bleedMm,
          safeAreaMm: die.safeAreaMm,
        }
      : null,
    components: scopedComponents.map((c) => ({
      componentId: c.id,
      tier: c.tier,
      role: c.role,
      packagingTypeId: c.packagingTypeId,
      packagingTypeName: c.packagingTypeName,
      decorationMethod: c.decorationMethod,
      dielineId: c.dielineId,
    })),
    shipTo: {
      type: dispatch.order.shipToType,
      contactName: dispatch.order.shipToContactName,
      addressLine1: dispatch.order.shipToAddressLine1,
      addressLine2: dispatch.order.shipToAddressLine2,
      city: dispatch.order.shipToCity,
      state: dispatch.order.shipToState,
      postalCode: dispatch.order.shipToPostalCode,
      country: dispatch.order.shipToCountry,
      warehousePartnerServiceId: dispatch.order.shipToPartnerServiceId,
    },
    partnerActionItems: [],
  }
}

// -----------------------------------------------------------------------------
// internalNotes lookup parsing — V1 transport for substrate / packaging /
// finishes. V1.5 promotes these to first-class columns on Order.
// -----------------------------------------------------------------------------

interface InternalNotesLookups {
  substrateSlug: string | null
  packagingSlug: string | null
  finishPartnerIds: string[]
}

export function parseInternalNotesLookups(
  notes: string | null,
): InternalNotesLookups {
  if (!notes) {
    return { substrateSlug: null, packagingSlug: null, finishPartnerIds: [] }
  }
  const substrateMatch = notes.match(/Substrate:\s*([\w-]+)/)
  const packagingMatch = notes.match(/Packaging:\s*([\w-]+)/)
  const finishesMatch = notes.match(/Finishes:\s*([^\n]+)\s*\(PartnerFinish IDs\)/)
  const finishIds = finishesMatch?.[1]
    ? finishesMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
    : []
  return {
    substrateSlug: substrateMatch?.[1] ?? null,
    packagingSlug: packagingMatch?.[1] ?? null,
    finishPartnerIds: finishIds,
  }
}
