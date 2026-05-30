'use server'

// Phase G3 — production-options server actions for the checkout wizard's
// Step 2 (Production).
//
// getProductionOptions(productId)
//   Returns the substrate + packaging-material catalogs filtered by what
//   the product's bound LABEL_PRINTING + MANUFACTURING partner services
//   declare via PartnerServiceSubstrate + PartnerServicePackagingMaterial.
//   When no partner is bound (V1 default), the full ACTIVE catalogs are
//   returned so the wizard isn't gated on partner-side editor work.
//
// estimateProductionCost({...})
//   Returns a cent-precise cost breakdown for the picked combination so
//   OrderSummary can render real numbers. The estimator uses partner
//   overrides when available, falls back to substrate/packaging baselines
//   otherwise. Shipping + tax remain placeholders (G4 + G5 calculate them
//   from the chosen ship-to address).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function authorize(productId: string) {
  const user = await requireUser()
  if (user.role !== 'CREATOR') {
    return { user: null, product: null, error: 'NOT_A_CREATOR' as const }
  }
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      brand: { creatorProfile: { userId: user.id } },
    },
    select: {
      id: true,
      category: true,
      variant: { select: { packingType: true } },
    },
  })
  if (!product) return { user, product: null, error: 'NOT_YOUR_PRODUCT' as const }
  return { user, product, error: null as null }
}

// -----------------------------------------------------------------------------
// SHAPES
// -----------------------------------------------------------------------------

export interface SubstrateOption {
  slug: string
  name: string
  category: string
  description: string
  sustainabilityTier: string
  baseUnitCostCents: number
  // Effective per-unit cost (partner override if any, else base). Surfaces
  // in the picker as "$0.06 / unit" microcopy.
  effectiveUnitCostCents: number
  // Lead-time delta when this substrate is picked (partner-specific).
  extraLeadTimeDays: number
}

export interface PackagingMaterialOption {
  slug: string
  name: string
  topology: string
  description: string
  sustainabilityTier: string
  foodSafe: boolean
  baseUnitCostCents: number
  effectiveUnitCostCents: number
  extraLeadTimeDays: number
}

export interface ProductionOptionsResult {
  substrates: SubstrateOption[]
  packagingMaterials: PackagingMaterialOption[]
  // Hint for the UI — when this is non-null it means a partner has been
  // bound and the lists are partner-filtered.
  boundPartnerNames: { labelPrinter: string | null; manufacturer: string | null }
}

// -----------------------------------------------------------------------------
// getProductionOptions — returns substrate + packaging-material catalogs
// -----------------------------------------------------------------------------

export async function getProductionOptions(
  productId: string,
): Promise<Result<ProductionOptionsResult>> {
  const { product, error } = await authorize(productId)
  if (error) return { ok: false, error }

  // V1: no partner is bound to a product until the order actually places
  // and routing fires. So the wizard's picker shows the full ACTIVE
  // catalog. When V1.5 introduces pre-bound partner selection (per
  // PRODUCTION_ORCHESTRATION.md Mode 1), this branch picks up the
  // PartnerServiceSubstrate junctions instead.
  //
  // Forward-pointer: when product.preferredLabelPrinterServiceId lands,
  // load the junctions and override the cost / lead-time fields.

  const [substrates, packagingMaterials] = await Promise.all([
    prisma.substrate.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ category: 'asc' }, { baseUnitCostCents: 'asc' }],
    }),
    prisma.packagingMaterial.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ topology: 'asc' }, { baseUnitCostCents: 'asc' }],
    }),
  ])

  return {
    ok: true,
    data: {
      substrates: substrates.map((s) => ({
        slug: s.slug,
        name: s.name,
        category: s.category,
        description: s.description,
        sustainabilityTier: s.sustainabilityTier,
        baseUnitCostCents: s.baseUnitCostCents,
        effectiveUnitCostCents: s.baseUnitCostCents,
        extraLeadTimeDays: 0,
      })),
      packagingMaterials: packagingMaterials.map((p) => ({
        slug: p.slug,
        name: p.name,
        topology: p.topology,
        description: p.description,
        sustainabilityTier: p.sustainabilityTier,
        foodSafe: p.foodSafe,
        baseUnitCostCents: p.baseUnitCostCents,
        effectiveUnitCostCents: p.baseUnitCostCents,
        extraLeadTimeDays: 0,
      })),
      boundPartnerNames: { labelPrinter: null, manufacturer: null },
    },
  }
}

// -----------------------------------------------------------------------------
// estimateProductionCost — cent-precise breakdown for OrderSummary
// -----------------------------------------------------------------------------

export interface EstimateInput {
  productId: string
  quantity: number
  substrateSlug: string | null
  packagingMaterialSlug: string | null
  finishPartnerFinishIds: string[]
}

export interface CostBreakdown {
  quantity: number
  // Per-unit components (cents). All non-negative.
  labelUnitCents: number
  packagingUnitCents: number
  finishUnitCents: number
  // Setup fees that don't scale with quantity (cents).
  setupCents: number
  // Order-level totals (cents).
  subtotalCents: number
  // Platform fee derived from PlatformFeeConfig at the current effective
  // window. baseRateBp + floorCents.
  platformFeeCents: number
  // Grand total before shipping + tax (those land in G4/G5).
  totalBeforeShippingAndTaxCents: number
}

export async function estimateProductionCost(
  input: EstimateInput,
): Promise<Result<CostBreakdown>> {
  // _product loaded by the auth guard; reserved for V1.5 per-category
  // cost overrides (e.g. food-safe packaging surcharge for FOOD products).
  const { product: _product, error } = await authorize(input.productId)
  if (error) return { ok: false, error }

  const qty = Math.max(0, Math.floor(input.quantity || 0))

  // Look up substrate + packaging unit costs (effective = base in V1 since
  // no partner is pre-bound). When G4 introduces ship-to → partner routing
  // the effective values come from junction rows instead.
  const [substrate, packaging, finishApplications] = await Promise.all([
    input.substrateSlug
      ? prisma.substrate.findUnique({ where: { slug: input.substrateSlug } })
      : Promise.resolve(null),
    input.packagingMaterialSlug
      ? prisma.packagingMaterial.findUnique({
          where: { slug: input.packagingMaterialSlug },
        })
      : Promise.resolve(null),
    input.finishPartnerFinishIds.length
      ? prisma.partnerFinish.findMany({
          where: { id: { in: input.finishPartnerFinishIds } },
          select: {
            basePriceCents: true,
            perUnitPriceCents: true,
            pricingMode: true,
          },
        })
      : Promise.resolve([] as Array<{
          basePriceCents: number
          perUnitPriceCents: number
          pricingMode: string
        }>),
  ])

  // Anchor label-printing cost — V1 baseline that scales with the chosen
  // substrate. Real partner pricing replaces this in G4+.
  // Default label per-unit is 8 cents (4-color CMYK label, small run).
  const labelUnitCents = 8 + (substrate?.baseUnitCostCents ?? 0)
  const packagingUnitCents = packaging?.baseUnitCostCents ?? 0

  // Finish costs — sum per-unit deltas + collect setup fees.
  let finishUnitCents = 0
  let setupCents = 0
  for (const f of finishApplications) {
    setupCents += f.basePriceCents ?? 0
    finishUnitCents += f.perUnitPriceCents ?? 0
  }

  const perUnitCents = labelUnitCents + packagingUnitCents + finishUnitCents
  const subtotalCents = perUnitCents * qty + setupCents

  // Platform fee — use the current effective PlatformFeeConfig row.
  const feeConfig = await prisma.platformFeeConfig.findFirst({
    where: { effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: 'desc' },
    select: { baseRateBp: true, floorCents: true },
  })
  const baseRateBp = feeConfig?.baseRateBp ?? 1500
  const floorCents = feeConfig?.floorCents ?? 100
  const calcFee = Math.round((subtotalCents * baseRateBp) / 10000)
  const platformFeeCents = Math.max(calcFee, qty > 0 ? floorCents : 0)

  return {
    ok: true,
    data: {
      quantity: qty,
      labelUnitCents,
      packagingUnitCents,
      finishUnitCents,
      setupCents,
      subtotalCents,
      platformFeeCents,
      totalBeforeShippingAndTaxCents: subtotalCents + platformFeeCents,
    },
  }
}

