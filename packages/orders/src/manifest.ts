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
import { getOrderSettings } from '@ilaunchify/db'
import { effectiveFlavorLeadDays, resolveOrderLeadDays } from './multi-flavor-lead'
import { isCurrentConfiguration, configurationManifestRecipe } from './creator-configuration'

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

// -----------------------------------------------------------------------------
// PURE variety-pack helpers (docs/VARIETY_PACK_MODEL.md, step 4). Kept
// side-effect-free so the persistence + manifest math is unit-testable without a
// DB. These are the single source of truth the cart-action + manifest build use.
// -----------------------------------------------------------------------------

/** One pack's flavor slot — flavor id + units of that flavor in ONE pack. */
export interface PackSlotInput {
  flavorPresetId: string
  units: number
}

/**
 * Per-flavor ORDER aggregate quantities = packCount × that flavor's per-pack slot
 * units. This is exactly what OrderItemFlavor.qty stores for a pack order. Pure.
 */
export function aggregateFlavorQuantities(
  packCount: number,
  slots: PackSlotInput[],
): Array<{ flavorPresetId: string; qty: number }> {
  const n = Math.max(0, Math.floor(packCount))
  return slots.map((s) => ({
    flavorPresetId: s.flavorPresetId,
    qty: n * Math.max(0, Math.floor(s.units)),
  }))
}

/**
 * The basis-aware order total (cents) for a pack order (spec §5):
 *  - PER_PACK   → flat pricePerPackCents × packCount.
 *  - PER_FLAVOR → Σ(slot.units × flavor unitPrice) × packCount.
 * Pure; integer-cent. `unitPriceByFlavor` is consulted only for PER_FLAVOR.
 */
export function packOrderTotalCents(
  basis: 'PER_FLAVOR' | 'PER_PACK',
  packCount: number,
  args: {
    pricePerPackCents?: number | null
    slots?: PackSlotInput[]
    unitPriceByFlavor?: Record<string, number>
  },
): number {
  const count = Math.max(0, Math.floor(packCount))
  if (basis === 'PER_PACK') {
    return Math.max(0, Math.round(args.pricePerPackCents ?? 0)) * count
  }
  const prices = args.unitPriceByFlavor ?? {}
  const perPack = (args.slots ?? []).reduce(
    (t, s) => t + Math.max(0, Math.floor(s.units)) * Math.max(0, Math.round(prices[s.flavorPresetId] ?? 0)),
    0,
  )
  return perPack * count
}

/**
 * The manifest pack-structure block for a pack order — N packs of size X, each
 * holding `unitsPerPack` units, plus the derived total. Null for non-pack items.
 * Pure mirror of what generateOrderManifest emits from the snapshot columns.
 */
export function buildManifestPackStructure(input: {
  packVariantId: string | null
  packCount: number | null
  unitsPerPack: number | null
  pricingBasis: 'PER_FLAVOR' | 'PER_PACK' | null
  pricePerPackCents: number | null
}): {
  packVariantId: string
  packCount: number
  unitsPerPack: number
  totalUnits: number
  pricingBasis: 'PER_FLAVOR' | 'PER_PACK' | null
  pricePerPackCents: number | null
} | null {
  if (!input.packVariantId || (input.packCount ?? 0) <= 0) return null
  const packCount = Math.max(0, Math.floor(input.packCount ?? 0))
  const unitsPerPack = Math.max(0, Math.floor(input.unitsPerPack ?? 0))
  return {
    packVariantId: input.packVariantId,
    packCount,
    unitsPerPack,
    totalUnits: packCount * unitsPerPack,
    pricingBasis: input.pricingBasis ?? null,
    pricePerPackCents: input.pricePerPackCents ?? null,
  }
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
  // ---- Variety-pack structure (docs/VARIETY_PACK_MODEL.md §6-7, step 4) ------
  // For a pack-based variety order: N packs of the chosen size, each holding
  // `unitsPerPack` units. Null for single-flavor / non-pack items. The pricing
  // snapshot is reproduced from order time for the partner record. The aggregate
  // per-flavor totals below still apply (and equal packCount × per-pack slot units).
  pack: {
    packVariantId: string
    packCount: number
    unitsPerPack: number
    totalUnits: number // packCount × unitsPerPack
    pricingBasis: 'PER_FLAVOR' | 'PER_PACK' | null
    pricePerPackCents: number | null
  } | null
  // ---- Variety-pack per-flavor splits (OrderItemFlavor) ---------------------
  // The distinct flavors + per-flavor unit quantities the creator composed. The
  // manufacturer produces these splits. Empty for single-flavor items. Each carries
  // the flavor's Statement of Identity snapshot for the per-flavor label column.
  // For a pack order, qty is the ORDER aggregate (packCount × per-pack slot units).
  // `leadTimeDays` is the flavor's EFFECTIVE lead (global floor governs; a flavor
  // override only extends it). null = no per-flavor recipe lead → the standard.
  flavors: Array<{ flavorName: string; qty: number; statementOfIdentity: string | null; leadTimeDays: number | null }>
  // ---- Recipe (from the CreatorConfiguration snapshot) ---------------------
  // The exact filtered recipe the partner produces — final ingredients after
  // replaceable swaps + optional activations, read from the order-time snapshot.
  // null for non-recipe products, legacy orders without a snapshot, or pre-db:push.
  // Closes the recipe-in-manifest gap (docs/CREATOR_PRODUCT_CONFIGURATION.md).
  recipe: {
    servingSizeG: number | null
    servingsPerContainer: number | null
    ingredients: Array<{
      ingredientId: string
      labelDeclarationName: string | null
      weightG: number
      position: number
      source: string | null
      filledSlotId: string | null
      allergenFlags: string[]
      bioengineeredStatus: string | null
    }>
  } | null
  // ---- Per-flavor recipes (from the snapshot's selected flavors) -----------
  // Each variety-pack flavor's FINAL recipe (base + that flavor's extras). Empty
  // for single-recipe items or legacy/pre-snapshot orders.
  perFlavorRecipes: Array<{
    flavorPresetId: string
    ingredients: Array<{
      ingredientId: string
      labelDeclarationName: string | null
      weightG: number
      position: number
      source: string | null
      filledSlotId: string | null
      allergenFlags: string[]
      bioengineeredStatus: string | null
    }>
  }>
  // ---- Production lead (LOCKED 2026-06-30 — global floor + changeover) -------
  // The quoted production lead for THIS order. `leadTimeDays` is what the partner
  // commits to: max(standard, max effective-flavor-lead) + (N-1)*changeover. For a
  // single-recipe / non-pack item it equals the standard floor. basis names which
  // path produced it so partner ingest can branch.
  production: {
    leadTimeDays: number
    standardLeadDays: number
    changeoverDays: number
    flavorCount: number
    basis: 'STANDARD' | 'MULTI_FLAVOR'
  }
  // ---- Ship-to summary -----------------------------------------------------
  shipTo: {
    // Widened Phase L1 (docs/LOGISTICS_AND_FULFILLMENT.md §2): HOLD keeps goods
    // at the producing partner; CHANNEL_INBOUND ships into a channel FC.
    type: 'CREATOR_ADDRESS' | 'WAREHOUSE_PARTNER' | 'HOLD_AT_MANUFACTURER' | 'CHANNEL_INBOUND'
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

  // Recipe from the immutable CreatorConfiguration snapshot (closes the recipe-in-
  // manifest gap). Json column → narrow to the version-tagged shape; unknown/legacy
  // snapshots degrade to null via isCurrentConfiguration.
  const configSnapshot = item.configurationSnapshot as { version?: unknown } | null
  const config = isCurrentConfiguration(configSnapshot) ? configSnapshot : null
  const configRecipe = config ? configurationManifestRecipe(config) : null
  // Per-flavor final recipes (base + that flavor's extras) — the manufacturer produces
  // a distinct recipe per flavor in a variety pack. Empty when the snapshot has none.
  const perFlavorRecipes = config
    ? config.flavors
        .filter((f) => f.recipe)
        .map((f) => ({ flavorPresetId: f.flavorPresetId, ingredients: f.recipe!.ingredients }))
    : []

  // Variety-pack per-flavor splits for THIS item (Slice 1). Cast-guarded — the
  // OrderItemFlavor model post-dates the generated client until the migration.
  const itemFlavors = await (tx as unknown as {
    orderItemFlavor: {
      findMany: (a: unknown) => Promise<
        Array<{
          flavorName: string
          qty: number
          soiSnapshot: string | null
          flavorPreset: { leadTimeDays: number | null } | null
        }>
      >
    }
  }).orderItemFlavor
    .findMany({
      where: { orderItemId: item.id },
      // flavorPreset.leadTimeDays post-dates the generated client until the
      // migration; the whole call is cast-guarded + .catch so a stale client
      // simply yields [] and the manifest falls back to the standard lead.
      select: {
        flavorName: true,
        qty: true,
        soiSnapshot: true,
        flavorPreset: { select: { leadTimeDays: true } },
      },
      orderBy: { qty: 'desc' },
    })
    .catch(
      () =>
        [] as Array<{
          flavorName: string
          qty: number
          soiSnapshot: string | null
          flavorPreset: { leadTimeDays: number | null } | null
        }>,
    )

  // Variety-pack STRUCTURE for THIS item (step 4). Cast-guarded — the pack columns
  // on OrderItem post-date the generated client until the migration. Null when the
  // item carries no packVariantId (single-flavor / non-pack / legacy).
  const packCols = item as unknown as {
    packVariantId: string | null
    packCount: number | null
    packUnitsPerPack: number | null
    pricingBasisSnapshot: 'PER_FLAVOR' | 'PER_PACK' | null
    pricePerPackCentsSnapshot: number | null
  }
  const packStructure = buildManifestPackStructure({
    packVariantId: packCols.packVariantId,
    packCount: packCols.packCount,
    unitsPerPack: packCols.packUnitsPerPack,
    pricingBasis: packCols.pricingBasisSnapshot,
    pricePerPackCents: packCols.pricePerPackCentsSnapshot,
  })

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

  // Substrate / packaging / finishes — typed transport (packets G4). Prefer the
  // order-time CreatorConfiguration snapshot's options (typed + versioned, written
  // by cart-actions); fall back to the legacy internalNotes regex-parse for orders
  // placed before the snapshot shipped. The manifest shape stays identical.
  const notesLookups = parseInternalNotesLookups(dispatch.order.internalNotes)
  const lookups = {
    substrateSlug: config?.options.substrateSlug ?? notesLookups.substrateSlug,
    packagingSlug: config?.options.packagingMaterialSlug ?? notesLookups.packagingSlug,
    finishPartnerIds: config?.options.finishPartnerFinishIds?.length
      ? config.options.finishPartnerFinishIds
      : notesLookups.finishPartnerIds,
  }

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

  // Production lead (LOCKED 2026-06-30). The standard repeat lead is the floor;
  // each ordered flavor's per-flavor recipe lead can only EXTEND it; the order
  // lead = max(floor, max effective flavor lead) + (N-1)*changeover. Read at
  // placement time (this runs in the order-creation transaction) so it snapshots
  // the order-time truth. All three reads are cast-guarded — a stale client or
  // un-migrated column falls back to the standard floor (or 0).
  const templateLead = await (tx as unknown as {
    productTemplate: {
      findUnique: (a: unknown) => Promise<{ leadTimeRepeatDays: number | null } | null>
    }
  }).productTemplate
    .findUnique({
      where: { id: product.productTemplateId ?? '__none__' },
      select: { leadTimeRepeatDays: true },
    })
    .catch(() => null)
  const standardLeadDays = Math.max(0, Math.floor(templateLead?.leadTimeRepeatDays ?? 0))
  const changeoverDays = await getOrderSettings()
    .then((s) => s.changeoverDays)
    .catch(() => 1)
  const flavorLeadOverrides = itemFlavors.map((f) => f.flavorPreset?.leadTimeDays ?? null)
  const productionLeadDays = resolveOrderLeadDays({
    standardLeadDays,
    flavorLeadDays: flavorLeadOverrides,
    changeoverDays,
  })

  // PS-7 §8.2.5 — a LABEL leg addresses the APPLIER (OrderDispatch.shipToNodeId),
  // never the order's final destination: the printer ships labels to whoever applies
  // them (manufacturer / co-packer / FC), not to the creator/warehouse. Resolve the
  // applier's facility/partner address; fall back to legacy order.shipTo* when
  // shipToNodeId is null (or resolution fails), which preserves today's behavior.
  const shipToNodeId = (dispatch as unknown as { shipToNodeId: string | null }).shipToNodeId
  const legacyShipTo = {
    type: dispatch.order.shipToType,
    contactName: dispatch.order.shipToContactName,
    addressLine1: dispatch.order.shipToAddressLine1,
    addressLine2: dispatch.order.shipToAddressLine2,
    city: dispatch.order.shipToCity,
    state: dispatch.order.shipToState,
    postalCode: dispatch.order.shipToPostalCode,
    country: dispatch.order.shipToCountry,
    warehousePartnerServiceId: dispatch.order.shipToPartnerServiceId,
  }
  let resolvedShipTo = legacyShipTo
  if (dispatch.type === 'LABEL' && shipToNodeId) {
    const applier = await tx.partnerService.findUnique({
      where: { id: shipToNodeId },
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
    if (applier?.partner) {
      // Spread legacy (keeps the OrderShipToType) and swap in the applier's address;
      // warehousePartnerServiceId points at the applier node. Nullable partner fields
      // coalesce to '' (an incomplete partner address is still the correct node).
      resolvedShipTo = {
        ...legacyShipTo,
        contactName: applier.partner.companyName,
        addressLine1: applier.partner.addressLine1 ?? '',
        addressLine2: applier.partner.addressLine2,
        city: applier.partner.city ?? '',
        state: applier.partner.state ?? '',
        postalCode: applier.partner.postalCode ?? '',
        country: applier.partner.country,
        warehousePartnerServiceId: shipToNodeId,
      }
    }
  }

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
    recipe: configRecipe,
    perFlavorRecipes,
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
    pack: packStructure,
    flavors: itemFlavors.map((f) => ({
      flavorName: f.flavorName,
      qty: f.qty,
      statementOfIdentity: f.soiSnapshot,
      leadTimeDays:
        f.flavorPreset?.leadTimeDays != null
          ? effectiveFlavorLeadDays(f.flavorPreset.leadTimeDays, standardLeadDays)
          : null,
    })),
    production: {
      leadTimeDays: productionLeadDays,
      standardLeadDays,
      changeoverDays,
      flavorCount: itemFlavors.length,
      basis: itemFlavors.length > 0 ? 'MULTI_FLAVOR' : 'STANDARD',
    },
    shipTo: resolvedShipTo,
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
