import { prisma, getOrderSettings } from '@ilaunchify/db'
import { buildSamplePricingRows, applyFlavorChangeover, type PricingTierRow, type PackBuilderFlavor } from '@ilaunchify/ui'
import { creatorTierToPlanCode, lookupFeeRate, FEE_EVENTS } from '@ilaunchify/plans'
import type { TierKey } from '@ilaunchify/auth'

// D5 multi-flavor lead-time model now lives in @ilaunchify/ui (shared with the
// creator checkout pack-builder). Re-exported here for existing callers.
export { applyFlavorChangeover } from '@ilaunchify/ui'

/**
 * Variety-pack builder data for a ProductTemplate. The configurator renders the
 * PackBuilder only when `flavorMode === 'MULTI'`; otherwise it keeps the single
 * FlavorSwatch. `changeoverDays` (OrderSettings) drives the live D5 lead-time.
 */
/** One offered pack size for the PDP variety flow (maps to a
 *  ProductTemplateVariant). Drives the VarietyPackBuilder size chooser. */
export interface PackSizeOption {
  variantId: string
  unitsPerPack: number
  label: string
  /** Flat price per pack (cents) — only meaningful when basis = PER_PACK. */
  pricePerPackCents: number | null
  /** MOQ in PACKS for this size (variant.moqMin reinterpreted for pack-based). */
  moqPacks: number | null
}

export interface PackBuilderData {
  flavorMode: 'SINGLE' | 'MULTI'
  maxFlavorsPerPack: number | null
  pool: PackBuilderFlavor[]
  changeoverDays: number
  /** PDP flavor cards — per-flavor price deltas (cents) so each flavor shows its
   *  own resulting unit price. `saleDeltaCents` (when present, a non-zero
   *  REDUCTION) drives the strike-through "was" price. Keyed by flavor id. */
  flavorPricing: Record<
    string,
    { priceDeltaCents: number; saleDeltaCents: number | null }
  >

  /* ── Variety-pack model (docs/VARIETY_PACK_MODEL.md §4-6) ─────────────────
     Cast-guarded reads of the additive pack columns. Empty / null when the
     migration hasn't run or the manufacturer didn't author a pack matrix —
     the PDP synthesizes a single fallback size in that case. */
  /** Offered pack sizes (variants that carry a typed `unitsPerPack`). */
  packSizes: PackSizeOption[]
  /** Distinct-flavor floor. null → default 1 (or 2 once authored). */
  minFlavors: number | null
  /** Remainder distribution rule. null → CREATOR_CHOOSES default. */
  fillRule: 'CREATOR_CHOOSES' | 'EVEN_AUTO' | 'MANUFACTURER_FIXED' | null
  /** Pricing basis. null → PER_FLAVOR default. */
  pricingBasis: 'PER_FLAVOR' | 'PER_PACK' | null
  /** Per-flavor absolute unit price (cents), keyed by flavor id. PER_FLAVOR. */
  flavorUnitPriceCents: Record<string, number | null>
}

export async function getPackBuilderData(slug: string): Promise<PackBuilderData> {
  const [template, settings] = await Promise.all([
    prisma.productTemplate.findUnique({
      where: { slug },
      select: {
        maxFlavorsPerPack: true,
        packingProfile: { select: { flavorMode: true } },
        flavorPresets: {
          where: { status: 'ACTIVE' },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true, swatchHex: true, statementOfIdentity: true, priceDeltaCents: true },
        },
      },
    }),
    getOrderSettings(),
  ])
  if (!template) {
    return {
      flavorMode: 'SINGLE',
      maxFlavorsPerPack: null,
      pool: [],
      changeoverDays: settings.changeoverDays,
      flavorPricing: {},
      packSizes: [],
      minFlavors: null,
      fillRule: null,
      pricingBasis: null,
      flavorUnitPriceCents: {},
    }
  }
  // Per-flavor price deltas for the PDP flavor cards. saleDeltaCents stays null
  // until FlavorPreset gains a sale/compare-at column — the card then renders a
  // strike-through "was" price. No schema invented here.
  const flavorPricing: PackBuilderData['flavorPricing'] = {}
  for (const f of template.flavorPresets) {
    flavorPricing[f.id] = { priceDeltaCents: f.priceDeltaCents, saleDeltaCents: null }
  }

  // Variety-pack model — read the additive columns through a cast guard so this
  // compiles against the (possibly stale) generated client that doesn't type
  // them yet (mirrors getTemplateDetailOverrides in lib/templates.ts). Reads are
  // wrapped in try/catch: a P2022 "column does not exist" pre-push must not crash
  // the PDP — the configurator's pre-migration fallback covers an empty result.
  const pack = await readPackModel(slug)

  return {
    flavorMode: template.packingProfile?.flavorMode === 'MULTI' ? 'MULTI' : 'SINGLE',
    maxFlavorsPerPack: template.maxFlavorsPerPack,
    pool: template.flavorPresets.map((f) => ({
      id: f.id,
      name: f.name,
      swatchHex: f.swatchHex,
      statementOfIdentity: f.statementOfIdentity,
    })),
    changeoverDays: settings.changeoverDays,
    flavorPricing,
    ...pack,
  }
}

/**
 * Cast-guarded read of the additive variety-pack columns
 * (`ProductTemplate.minFlavorsPerPack/flavorFillRule/pricingBasis`,
 * `ProductTemplateVariant.unitsPerPack/pricePerPackCents`,
 * `FlavorPreset.unitPriceCents`). Returns empty defaults on any failure so the
 * PDP renders the new flow via its synthesized-fallback path pre-migration.
 */
async function readPackModel(slug: string): Promise<{
  packSizes: PackSizeOption[]
  minFlavors: number | null
  fillRule: PackBuilderData['fillRule']
  pricingBasis: PackBuilderData['pricingBasis']
  flavorUnitPriceCents: Record<string, number | null>
}> {
  const empty = {
    packSizes: [] as PackSizeOption[],
    minFlavors: null,
    fillRule: null as PackBuilderData['fillRule'],
    pricingBasis: null as PackBuilderData['pricingBasis'],
    flavorUnitPriceCents: {} as Record<string, number | null>,
  }
  try {
    const t = await (prisma as unknown as {
      productTemplate: {
        findUnique: (a: unknown) => Promise<{
          minFlavorsPerPack: number | null
          flavorFillRule: PackBuilderData['fillRule']
          pricingBasis: PackBuilderData['pricingBasis']
          variants: Array<{
            id: string
            isActive: boolean
            unitsPerPack: number | null
            pricePerPackCents: number | null
            moqMin: number | null
            containerFormat: string | null
            netContentDisplay: string | null
          }>
          flavorPresets: Array<{ id: string; unitPriceCents: number | null }>
        } | null>
      }
    }).productTemplate.findUnique({
      where: { slug },
      select: {
        minFlavorsPerPack: true,
        flavorFillRule: true,
        pricingBasis: true,
        variants: {
          where: { isActive: true },
          select: {
            id: true,
            isActive: true,
            unitsPerPack: true,
            pricePerPackCents: true,
            moqMin: true,
            containerFormat: true,
            netContentDisplay: true,
          },
        },
        flavorPresets: {
          where: { status: 'ACTIVE' },
          select: { id: true, unitPriceCents: true },
        },
      },
    })
    if (!t) return empty

    // Offered pack sizes = variants that carry a typed unitsPerPack (the pack
    // matrix the builder authors). Variants without one aren't pack sizes.
    const packSizes: PackSizeOption[] = (t.variants ?? [])
      .filter((v) => typeof v.unitsPerPack === 'number' && (v.unitsPerPack ?? 0) > 0)
      .map((v) => ({
        variantId: v.id,
        unitsPerPack: v.unitsPerPack as number,
        label: `${v.unitsPerPack}-pack`,
        pricePerPackCents: v.pricePerPackCents ?? null,
        moqPacks: v.moqMin ?? null,
      }))
      .sort((a, b) => a.unitsPerPack - b.unitsPerPack)

    const flavorUnitPriceCents: Record<string, number | null> = {}
    for (const f of t.flavorPresets ?? []) flavorUnitPriceCents[f.id] = f.unitPriceCents ?? null

    return {
      packSizes,
      minFlavors: t.minFlavorsPerPack ?? null,
      fillRule: t.flavorFillRule ?? null,
      pricingBasis: t.pricingBasis ?? null,
      flavorUnitPriceCents,
    }
  } catch {
    return empty
  }
}

/**
 * Server helper — real per-unit pricing for a ProductTemplate, by quantity band.
 *
 * Reads ProductTemplatePricingTier (the partner/admin-curated volume bands) and
 * maps them to the display shape. Per MARKETPLACE_MANAGEMENT_PLAN §4 step 1,
 * falls through to the synthetic buildSamplePricingRows() ONLY when the template
 * has no real tiers — which today also covers fixture-only demo templates that
 * aren't in the DB yet (the marketplace detail page is still fixture-driven).
 *
 * One price per band per the LOCKED model (§6): the band sets the unit price;
 * a creator's Builder/Agency tier discounts the platform fee, not this cost.
 */
export async function getPricingTierRows(
  slug: string,
  fallbackBasePrice: number,
  /**
   * D5 — the number of DISTINCT flavors in the configured pack. Default 1 (a
   * single-flavor order), which is a no-op for the changeover increment. The
   * variety-pack builder passes the live distinct-flavor count so each band's
   * lead time reflects the changeovers. `changeoverDays` is read from
   * OrderSettings unless supplied (e.g. when the caller already loaded it).
   */
  opts?: { flavorCount?: number; changeoverDays?: number },
): Promise<PricingTierRow[]> {
  const template = await prisma.productTemplate.findUnique({
    where: { slug },
    select: {
      pricingTiers: {
        orderBy: { sortOrder: 'asc' },
        select: {
          minQty: true,
          maxQty: true,
          perUnitCostCents: true,
          perUnitFloorCents: true,
          leadTimeDays: true,
        },
      },
    },
  })

  const tiers = template?.pricingTiers ?? []
  if (tiers.length === 0) return buildSamplePricingRows(fallbackBasePrice)

  const flavorCount = opts?.flavorCount ?? 1
  // Only pay for the settings read when the changeover increment can actually
  // apply (multi-flavor) and the caller didn't already supply the knob.
  const changeoverDays =
    opts?.changeoverDays ?? (flavorCount > 1 ? (await getOrderSettings()).changeoverDays : 0)

  return tiers.map((t) => ({
    band: formatBand(t.minQty, t.maxQty),
    bandMin: t.minQty,
    perUnitCents: t.perUnitCostCents,
    perUnitFloorCents: t.perUnitFloorCents,
    leadTimeDays: applyFlavorChangeover(t.leadTimeDays, flavorCount, changeoverDays),
  }))
}

function formatBand(minQty: number, maxQty: number | null): string {
  if (maxQty === null) return `${minQty.toLocaleString()}+`
  return `${minQty.toLocaleString()} – ${maxQty.toLocaleString()}`
}

// -----------------------------------------------------------------------------
// P3 — real creator price matrix.
//
// creator per-unit price = manufacturer unit cost (band) + tier-discounted
// platform fee. The fee % comes from lookupFeeRate (the seeded PlanFeature /
// FeeRule table — the source of truth), NOT a hardcoded number. Production
// shipping is excluded here: it's destination/qty-dependent and estimated at
// checkout under the partner-managed-carrier model (V1). docs/builds/
// _platform-v1-finish-line.md P3.
// -----------------------------------------------------------------------------

export interface CreatorPricingMatrix {
  rows: PricingTierRow[]
  /** Platform-fee percent applied at the viewer's tier (from lookupFeeRate). */
  feePercent: number
  /** Tier the price was computed at (signed-out → 'maker'). */
  viewerTier: TierKey
}

// Fallback if the production-order fee rule isn't seeded for the plan — use the
// Maker headline rate so we never under-quote the platform fee.
const FALLBACK_FEE_PERCENT = 15

export async function getCreatorPricingMatrix(
  slug: string,
  viewerTier: TierKey,
  fallbackBasePrice: number,
): Promise<CreatorPricingMatrix> {
  // Base = manufacturer unit cost per band (real DB tiers, or synthetic fallback).
  const baseRows = await getPricingTierRows(slug, fallbackBasePrice)

  const feeRule = await lookupFeeRate(
    creatorTierToPlanCode(viewerTier),
    FEE_EVENTS.PRODUCTION_ORDER_SUBTOTAL,
  )
  const feePercent = feeRule?.ratePercent ?? FALLBACK_FEE_PERCENT

  const rows: PricingTierRow[] = baseRows.map((r) => {
    const manufacturerCents = r.perUnitCents
    const platformFeeCents = Math.round((manufacturerCents * feePercent) / 100)
    return {
      ...r,
      manufacturerCents,
      platformFeeCents,
      feePercent,
      // All-in creator unit price (shipping excluded — estimated at checkout).
      perUnitCents: manufacturerCents + platformFeeCents,
    }
  })

  return { rows, feePercent, viewerTier }
}

/**
 * Platform-fee % for all three creator tiers — drives the per-tier columns in
 * the marketplace PricingTierModal. Same lookup source as the matrix above.
 */
export async function getCreatorFeePcts(): Promise<{ maker: number; builder: number; agency: number }> {
  const out = { maker: FALLBACK_FEE_PERCENT, builder: FALLBACK_FEE_PERCENT, agency: FALLBACK_FEE_PERCENT }
  await Promise.all(
    (['maker', 'builder', 'agency'] as const).map(async (t) => {
      const r = await lookupFeeRate(creatorTierToPlanCode(t), FEE_EVENTS.PRODUCTION_ORDER_SUBTOTAL)
      if (r?.ratePercent != null) out[t] = r.ratePercent
    }),
  )
  return out
}
