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

import { prisma, getOrderSettings } from '@ilaunchify/db'
import { requireUser, getCreatorTier } from '@ilaunchify/auth'
// PP-0: the ONE platform-fee SSOT (CLAUDE.md fee model). The estimate MUST resolve
// the fee through the same path the charge does, or the two diverge by tier.
import { resolvePackSubtotal, type PackSelectionInput } from './pack-pricing'
import { resolveTierGoodsCents } from './tier-pricing'
import {
  resolveCreatorFeeBps,
  resolveCreatorFeeBounds,
  computeOrderPricing,
  composeProductionLines,
  resolveGoods,
  type PriceLine,
  priceComponents,
  COMPONENT_PRICING_SELECT,
} from '@ilaunchify/plans'
import { resolveOrderCopackCents } from '@ilaunchify/orders'

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
      // Needed by estimateProductionCost to resolve the PACK basis through the same
      // call placeOrder makes (2026-07-16). Without it the estimate priced every
      // order on the catalog buildup while the charge priced packs on PACK_PRICE.
      productTemplateId: true,
      productTemplate: { select: { maxFlavorsPerPack: true } },
    },
  })
  if (!product) return { user, product: null, error: 'NOT_YOUR_PRODUCT' as const }
  return { user, product, error: null as null }
}

// Creator's selected flavor subset (docs/SELECTION_THREADING_AUDIT.md) — the checkout pack pool is
// CONSTRAINED to it so the order can't drift from what the creator chose on the detail page.
// Empty = legacy → full pool. (De-cast 2026-07-05 after the migration ran.)
async function selectedFlavorIdsFor(productId: string): Promise<string[]> {
  const row = await prisma.product
    .findUnique({ where: { id: productId }, select: { selectedFlavorPresetIds: true } })
    .catch(() => null)
  return row?.selectedFlavorPresetIds ?? []
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
  // Admin-tunable global minimum order quantity (OrderSettings.defaultMoq) — the
  // UI floor when the product carries no per-tier MOQ of its own.
  defaultMoq: number
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

  const [substrates, packagingMaterials, orderSettings] = await Promise.all([
    prisma.substrate.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ category: 'asc' }, { baseUnitCostCents: 'asc' }],
    }),
    prisma.packagingMaterial.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ topology: 'asc' }, { baseUnitCostCents: 'asc' }],
    }),
    getOrderSettings(),
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
      defaultMoq: orderSettings.defaultMoq,
    },
  }
}

// -----------------------------------------------------------------------------
// getPackBuilderConfig — variety-pack flavor rules + pool for Step 2 (Slice 1)
// -----------------------------------------------------------------------------

export interface PackBuilderConfig {
  flavorMode: 'SINGLE' | 'MULTI'
  maxFlavorsPerPack: number | null
  pool: Array<{ id: string; name: string; swatchHex: string | null; statementOfIdentity: string | null }>
}

export async function getPackBuilderConfig(
  productId: string,
): Promise<Result<PackBuilderConfig>> {
  const { user, error } = await authorize(productId)
  if (error || !user) return { ok: false, error: error ?? 'NOT_A_CREATOR' }

  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: {
      productTemplate: {
        select: {
          maxFlavorsPerPack: true,
          packingProfile: { select: { flavorMode: true } },
          flavorPresets: {
            where: { status: 'ACTIVE' },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, name: true, swatchHex: true, statementOfIdentity: true },
          },
        },
      },
    },
  })
  const t = product?.productTemplate
  const selected = await selectedFlavorIdsFor(productId)
  const allPresets = t?.flavorPresets ?? []
  const scopedPresets = selected.length ? allPresets.filter((f) => selected.includes(f.id)) : allPresets
  return {
    ok: true,
    data: {
      flavorMode: t?.packingProfile?.flavorMode === 'MULTI' ? 'MULTI' : 'SINGLE',
      maxFlavorsPerPack: t?.maxFlavorsPerPack ?? null,
      pool: scopedPresets.map((f) => ({
        id: f.id,
        name: f.name,
        swatchHex: f.swatchHex,
        statementOfIdentity: f.statementOfIdentity,
      })),
    },
  }
}

// -----------------------------------------------------------------------------
// getVarietyPackMatrix — the NEW pack-based variety model for Step 2
// (docs/VARIETY_PACK_MODEL.md §4-6, step 4). Cast-guarded reads of the additive
// pack columns so this compiles against a possibly-stale generated client. When
// the migration hasn't run / the manufacturer authored no pack matrix, the
// caller falls back to the legacy PackBuilder (capacity = order quantity).
// -----------------------------------------------------------------------------

export interface VarietyPackSizeOption {
  /** ProductTemplateVariant id. */
  variantId: string
  unitsPerPack: number
  label: string
  /** Flat per-pack price (cents) — meaningful when basis = PER_PACK. */
  pricePerPackCents: number | null
  /** MOQ in PACKS for this size. */
  moqPacks: number | null
}

export interface VarietyPackMatrix {
  /** True when ≥1 variant carries a typed unitsPerPack (a real authored pack
   *  matrix), regardless of flavorMode — so single-flavor multipacks
   *  (MULTI_UNIT_SAME → pick-1) and fixed assortments enable too. When false the
   *  caller uses the legacy PackBuilder. */
  enabled: boolean
  minFlavors: number
  maxFlavors: number | null
  fillRule: 'CREATOR_CHOOSES' | 'EVEN_AUTO' | 'MANUFACTURER_FIXED'
  pricingBasis: 'PER_FLAVOR' | 'PER_PACK'
  /* ── §8 per-bucket rollout — the configure-mode inputs both surfaces share. */
  structuralType:
    | 'SINGLE_UNIT' | 'MULTI_UNIT_SAME' | 'MULTI_FLAVOR_MIXED'
    | 'MULTI_FLAVOR_COMPARTMENT' | 'PER_FLAVOR_IN_OUTER' | 'CUSTOMIZABLE_PICK_N'
    | null
  flavorPolicy: 'CREATOR_PICK' | 'PARTNER_FIXED' | null
  /** Manufacturer's fixed assortment [{flavor,qty}] (PACK_FIXED). */
  assortment: Array<{ flavor: string; qty: number }>
  /** MANUFACTURER_FIXED fill-rule weights (spec §4.3) — { [flavorCount]: number[] }.
   *  null when unauthored / the rule isn't MANUFACTURER_FIXED. */
  fixedDistribution: Record<string, number[]> | null
  packSizes: VarietyPackSizeOption[]
  pool: Array<{
    flavorPresetId: string
    name: string
    swatchHex: string | null
    unitPriceCents: number | null
  }>
}

export async function getVarietyPackMatrix(
  productId: string,
): Promise<Result<VarietyPackMatrix>> {
  const { user, error } = await authorize(productId)
  if (error || !user) return { ok: false, error: error ?? 'NOT_A_CREATOR' }

  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: {
      productTemplateId: true,
      productTemplate: {
        select: {
          maxFlavorsPerPack: true,
          flavorPresets: {
            where: { status: 'ACTIVE' },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, name: true, swatchHex: true },
          },
        },
      },
    },
  })

  // Constrain the pack pool to the creator's selected subset (empty = legacy → full pool).
  const selected = await selectedFlavorIdsFor(productId)
  const allMatrixPresets = product?.productTemplate?.flavorPresets ?? []
  const scopedMatrixPresets = selected.length
    ? allMatrixPresets.filter((f) => selected.includes(f.id))
    : allMatrixPresets

  const empty: VarietyPackMatrix = {
    enabled: false,
    minFlavors: 1,
    maxFlavors: product?.productTemplate?.maxFlavorsPerPack ?? null,
    fillRule: 'CREATOR_CHOOSES',
    pricingBasis: 'PER_FLAVOR',
    structuralType: null,
    flavorPolicy: null,
    assortment: [],
    fixedDistribution: null,
    packSizes: [],
    pool: scopedMatrixPresets.map((f) => ({
      flavorPresetId: f.id,
      name: f.name,
      swatchHex: f.swatchHex,
      unitPriceCents: null,
    })),
  }

  if (!product?.productTemplateId) return { ok: true, data: empty }

  // Cast-guarded read of the additive pack columns (mirrors readPackModel in
  // apps/marketing/src/lib/pricing.ts). try/catch so a P2022 "column does not
  // exist" pre-push returns the legacy-fallback empty matrix, never crashes. The
  // pack flow is enabled by the presence of typed pack sizes, NOT flavorMode —
  // so MULTI_UNIT_SAME (pick-1) + fixed assortments enable too (spec §8).
  try {
    const t = await (prisma as unknown as {
      productTemplate: {
        findUnique: (a: unknown) => Promise<{
          minFlavorsPerPack: number | null
          flavorFillRule: VarietyPackMatrix['fillRule'] | null
          pricingBasis: VarietyPackMatrix['pricingBasis'] | null
          flavorPolicy: VarietyPackMatrix['flavorPolicy']
          fixedDistribution: unknown
          packingProfile: { structuralType: string | null } | null
          variants: Array<{
            id: string
            isActive: boolean
            unitsPerPack: number | null
            pricePerPackCents: number | null
            moqMin: number | null
            assortmentFlavors: unknown
          }>
          flavorPresets: Array<{ id: string; unitPriceCents: number | null }>
        } | null>
      }
    }).productTemplate.findUnique({
      where: { id: product.productTemplateId },
      select: {
        minFlavorsPerPack: true,
        flavorFillRule: true,
        pricingBasis: true,
        flavorPolicy: true,
        fixedDistribution: true,
        packingProfile: { select: { structuralType: true } },
        variants: {
          where: { isActive: true },
          select: { id: true, isActive: true, unitsPerPack: true, pricePerPackCents: true, moqMin: true, assortmentFlavors: true },
        },
        flavorPresets: { where: { status: 'ACTIVE' }, select: { id: true, unitPriceCents: true } },
      },
    })
    if (!t) return { ok: true, data: empty }

    const sizeVariants = (t.variants ?? []).filter(
      (v) => typeof v.unitsPerPack === 'number' && (v.unitsPerPack ?? 0) > 0,
    )
    const packSizes: VarietyPackSizeOption[] = sizeVariants
      .map((v) => ({
        variantId: v.id,
        unitsPerPack: v.unitsPerPack as number,
        label: `${v.unitsPerPack}-pack`,
        pricePerPackCents: v.pricePerPackCents ?? null,
        moqPacks: v.moqMin ?? null,
      }))
      .sort((a, b) => a.unitsPerPack - b.unitsPerPack)

    if (packSizes.length === 0) return { ok: true, data: empty }

    const priceById = new Map((t.flavorPresets ?? []).map((f) => [f.id, f.unitPriceCents ?? null]))

    // Fixed assortment — first size carrying an assortmentFlavors list (scaled by
    // the engine). Coerce to typed [{flavor,qty}].
    const rawAssort = sizeVariants.find(
      (v) => Array.isArray(v.assortmentFlavors) && (v.assortmentFlavors as unknown[]).length > 0,
    )?.assortmentFlavors
    // The builder authors the assortment keyed by flavor NAME; the engine matches
    // flavorPresetId. Resolve name → id (pass through anything already an id).
    const idByName = new Map(empty.pool.map((f) => [f.name, f.flavorPresetId]))
    const idSet = new Set(empty.pool.map((f) => f.flavorPresetId))
    const assortment: Array<{ flavor: string; qty: number }> = Array.isArray(rawAssort)
      ? (rawAssort as Array<{ flavor?: unknown; qty?: unknown }>)
          .map((r) => ({ flavor: String(r?.flavor ?? ''), qty: Number(r?.qty) }))
          .filter((r) => r.flavor && Number.isFinite(r.qty) && r.qty > 0)
          .map((r) => ({ flavor: idSet.has(r.flavor) ? r.flavor : (idByName.get(r.flavor) ?? r.flavor), qty: Math.floor(r.qty) }))
      : []

    return {
      ok: true,
      data: {
        enabled: true,
        minFlavors: Math.max(1, t.minFlavorsPerPack ?? 1),
        maxFlavors: product.productTemplate?.maxFlavorsPerPack ?? null,
        fillRule: t.flavorFillRule ?? 'CREATOR_CHOOSES',
        pricingBasis: t.pricingBasis ?? 'PER_FLAVOR',
        structuralType: (t.packingProfile?.structuralType ?? null) as VarietyPackMatrix['structuralType'],
        flavorPolicy: t.flavorPolicy ?? null,
        assortment,
        fixedDistribution: t.flavorFillRule === 'MANUFACTURER_FIXED' ? coerceFixedDistribution(t.fixedDistribution) : null,
        packSizes,
        pool: empty.pool.map((f) => ({
          ...f,
          unitPriceCents: priceById.get(f.flavorPresetId) ?? null,
        })),
      },
    }
  } catch {
    return { ok: true, data: empty }
  }
}

/** Coerce a stored fixedDistribution JSON into { [flavorCount]: number[] } (spec
 *  §4.3). Integer keys >= 1; each vector of non-negative integers must match its
 *  key length. Drops malformed rows; returns null when nothing valid remains. */
function coerceFixedDistribution(raw: unknown): Record<string, number[]> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Record<string, number[]> = {}
  for (const [k, vec] of Object.entries(raw as Record<string, unknown>)) {
    const count = Math.floor(Number(k))
    if (!Number.isFinite(count) || count < 1) continue
    if (!Array.isArray(vec) || vec.length !== count) continue
    out[String(count)] = vec.map((x) => Math.max(0, Math.floor(Number(x) || 0)))
  }
  return Object.keys(out).length > 0 ? out : null
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
  /**
   * The creator's variety-pack selection, when there is one. THE FIX (2026-07-16):
   * without this the estimate priced every order on the COST_BUILDUP basis while
   * placeOrder priced a pack order on PACK_PRICE, so a pack creator was quoted our
   * catalog buildup and charged the manufacturer's pack price. Both now resolve the
   * basis from the same input, through the same function.
   *
   * Null / omitted = a legacy non-pack order, which genuinely prices on the buildup.
   */
  pack?: PackSelectionInput | null
}

export interface CostBreakdown {
  quantity: number
  // Per-unit components (cents). All non-negative.
  labelUnitCents: number
  packagingUnitCents: number
  finishUnitCents: number
  // C7.h — per-unit surcharge from selected packaging-component variants
  // (custom cap, branded seal, …). 0 when every slot uses its default.
  componentsUnitCents: number
  // C8.2 — decoration method on the primary container (from the marketplace
  // picker), null when the product has no offering-linked primary component.
  decorationMethod: string | null
  // C8.2 — per-unit decoration cost from the partner offering's tiered pricing,
  // selected for the current quantity. 0 when no offering is linked.
  decorationUnitCents: number
  // Setup fees that don't scale with quantity (cents).
  setupCents: number
  // Order-level totals (cents).
  /**
   * THE PRICED LINES, straight from computeOrderPricing. Sum(cents) === subtotal.
   *
   * ADDED 2026-07-16, found by Pavel on a live Step 2. The summary was rendering
   * `labelUnitCents * qty` ($80 = the retired 8c anchor x 1000) beside a total of
   * $5,290 built from the manufacturer's band. $80 + $690 fee = $770, and $4,520
   * of a real order was simply unexplained on screen. The total was RIGHT; the
   * explanation of it was the ghost of the bug we deleted.
   *
   * The fields below (labelUnitCents / packagingUnitCents / finishUnitCents) are
   * the old catalog buildup. They are NOT the price any more and must never be
   * summed into one: they survive only as material/spec detail. Anything claiming
   * to break down the money renders THESE lines, so the breakdown is a projection
   * of the one pricer instead of a second opinion about it.
   */
  productionLines: PriceLine[]
  subtotalCents: number
  // Platform fee resolved through the ONE SSOT (@ilaunchify/plans
  // resolveCreatorFeeBps) at the creator's SUBSCRIPTION TIER (Maker 15 / Builder 12
  // / Agency 8), identical to the real charge. PP-0.
  platformFeeCents: number
  // Grand total before shipping + tax (those land in G4/G5).
  totalBeforeShippingAndTaxCents: number
}

export async function estimateProductionCost(
  input: EstimateInput,
): Promise<Result<CostBreakdown>> {
  // _product loaded by the auth guard; reserved for V1.5 per-category
  // cost overrides (e.g. food-safe packaging surcharge for FOOD products).
  // `user` is needed for the tier-resolved platform fee (PP-0, fee SSOT).
  const { user, product, error } = await authorize(input.productId)
  if (error || !user) return { ok: false, error: error ?? 'NOT_A_CREATOR' }

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

  // C7.h — walk the product's packaging components. Each slot with a selected
  // (non-default) variant adds its per-unit surcharge, scaled by unitsPerParent
  // (variety multipacks hold N of a flavor). Default-included variants add $0,
  // so this is 0 until partners list upgrade variants.
  //
  // C8.2 — the PRIMARY/CONTAINER component may carry a partnerOfferingId from
  // the marketplace decoration picker. When it does, we price that container's
  // decoration from the offering's tiered pricing (NOT the variant surcharge),
  // so the priced primary is excluded from the component-surcharge sum below to
  // avoid double counting.
  const components = await prisma.packagingComponent.findMany({
    where: { productId: input.productId },
    select: COMPONENT_PRICING_SELECT,
  })

  // PP-0: the decoration + component-surcharge math moved to ./component-pricing
  // so the REAL charge in cart-actions.ts can run the identical derivation. It
  // previously lived inline here, in a 'use server' file nothing could import,
  // which is why the charge path silently omitted both lines.
  const { decorationMethod, decorationUnitCents, componentsUnitCents } = priceComponents(
    components,
    qty,
  )

  // PP-0a (docs/PRINT_PRICING_SPEC_2026-07-15.md §2): the estimate now prices
  // through the SAME function as the charge, instead of running its own
  // `perUnitCents * qty + setupCents`. Sharing the fee resolver and
  // priceComponents (PP-0) made the two agree on their INPUTS; this makes them
  // agree on the ARITHMETIC, which is the only thing that makes divergence
  // structurally impossible rather than merely unlikely.
  //
  // NUMBER-IDENTICAL by construction, so this reprices nothing:
  //   goods + finishes + decoration + components
  //     = (label+packaging)*qty + (finish*qty + setup) + dec*qty + comp*qty
  //     = (label+packaging+finish+dec+comp)*qty + setup
  //     = perUnitCents*qty + setupCents        <- the old expression
  // Pinned in packages/plans/src/estimate-charge-parity.test.ts.
  //
  // THE PACK BASIS (fixed 2026-07-16): this used to have no pack input, so it always
  // priced COST_BUILDUP while the charge priced a pack order on PACK_PRICE. The
  // creator was quoted our catalog buildup and billed the manufacturer's pack price.
  // Both now call resolvePackSubtotal + resolveGoods with the same selection.
  const creatorTier = await getCreatorTier(user.id)
  const { feeBps } = await resolveCreatorFeeBps(creatorTier)
  const feeBounds = await resolveCreatorFeeBounds(creatorTier)

  // Resolve the pack basis through the SAME call placeOrder makes, so the quote and
  // the charge cannot disagree about which number the goods line is.
  // `validateComposition: false` is the one deliberate difference: the estimate is a
  // live readout as the creator builds their pack, so a half-built pack must show a
  // price rather than an error. The CHARGE validates (cart-actions passes true), and
  // that is the right place for a gate.
  const packQuote = await resolvePackSubtotal({
    productTemplateId: product?.productTemplateId ?? null,
    pack: input.pack,
    maxFlavorsPerPack: product?.productTemplate?.maxFlavorsPerPack ?? null,
    validateComposition: false,
  })
  const isPackOrder = packQuote.ok && packQuote.isPack
  const packPricedSubtotalCents = packQuote.ok && packQuote.isPack ? packQuote.packPricedSubtotalCents : 0

  // THE TIER BASIS (Blocker 2, 2026-07-16): same read, same picker, same number as
  // the PDP and the charge. Threaded here in the SAME change as cart-actions on
  // purpose: moving one without the other is how the pack basis diverged above.
  // Bands count UNITS; on a pack order `qty` counts PACKS. Same conversion the PDP
  // and placeOrder make (Blocker 5) - if these three ever disagree about the scale,
  // the quote and the charge disagree about the price, which is the whole bug class.
  const bandUnits = qty * Math.max(1, input.pack?.unitsPerPack ?? 1)
  const tierGoods = await resolveTierGoodsCents(product?.productTemplateId ?? null, bandUnits)

  // Refuse on the SAME condition the charge refuses on. If the estimate invented a
  // number here, the creator would configure a whole order against a price that
  // placeOrder then rejects: the quote-vs-charge gap, wearing an error message.
  const goods = resolveGoods({ isPackOrder, packPricedSubtotalCents, tierGoodsCents: tierGoods })
  if (!goods) {
    return {
      ok: false,
      error: 'This product has no published price from its manufacturer yet.',
    }
  }

  // CP-3.2 (SHADOW, flag OFF): same co-pack seam the CHARGE calls, so the estimate
  // the creator sees equals what placeOrder rings up. 0 until the flag flips.
  const coPackingCents = await resolveOrderCopackCents({
    productTemplateId: product?.productTemplateId ?? null,
    isAssembly: isPackOrder,
    qty: bandUnits,
    unitsPerPack: input.pack?.unitsPerPack,
  })
  const priced = computeOrderPricing({
    production: composeProductionLines({
      goods,
      finishesCents: finishUnitCents * qty + setupCents,
      decorationCents: decorationUnitCents * qty,
      componentsCents: componentsUnitCents * qty,
      coPackingCents,
    }),
    // Shipping + tax land at Checkout (G4/G5), and neither is ever in the fee base.
    feeBps,
    feeBounds,
  })
  const subtotalCents = priced.productionSubtotalCents
  const platformFeeCents = qty > 0 ? priced.platformFeeCents : 0

  return {
    ok: true,
    data: {
      quantity: qty,
      labelUnitCents,
      packagingUnitCents,
      finishUnitCents,
      componentsUnitCents,
      decorationMethod,
      decorationUnitCents,
      setupCents,
      productionLines: priced.lineItems.filter((l) => l.kind !== 'PLATFORM_FEE' && l.kind !== 'SHIPPING' && l.kind !== 'TAX'),
      subtotalCents,
      platformFeeCents,
      totalBeforeShippingAndTaxCents: subtotalCents + platformFeeCents,
    },
  }
}

// PP-0: pickTierPriceCents + the decoration/component-surcharge math moved to
// ./component-pricing (see priceComponents), which this file and cart-actions.ts
// both import, so the estimate and the real charge share ONE copy. It cannot be
// re-exported from here: 'use server' files may only export async functions,
// which is precisely what kept the charge path from reusing it before.

