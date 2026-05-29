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

import type { PrismaClient, Prisma } from '@prisma/client'

export const MANIFEST_VERSION = '1.0.0'

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

  if (!dispatch.order.items[0]) {
    throw new Error(
      `OrderDispatch ${args.orderDispatchId} has no OrderItem — cannot generate manifest.`,
    )
  }

  const item = dispatch.order.items[0]
  const product = item.product
  const variant = product.variant
  const die = variant?.dieCutTemplate ?? null

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
