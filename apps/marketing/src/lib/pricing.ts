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

  /* ── §8 per-bucket rollout ────────────────────────────────────────────────
     The product's structural bucket + promoted flavor policy + (for fixed
     assortments) the manufacturer's [{flavor,qty}] list. Drive resolvePackMode
     on the PDP so MULTI_UNIT_SAME (pick-1) and MIXED/COMPARTMENT (fixed) use the
     same pack machinery as pick-N. All cast-guarded; null pre-migration. */
  structuralType: import('@ilaunchify/ui').StructuralPackType | null
  flavorPolicy: 'CREATOR_PICK' | 'PARTNER_FIXED' | null
  assortment: import('@ilaunchify/ui').AssortmentEntry[]
  /** MANUFACTURER_FIXED fill-rule weights (spec §4.3) — { [flavorCount]: number[] }.
   *  null when unauthored / the rule isn't MANUFACTURER_FIXED. */
  fixedDistribution: import('@ilaunchify/ui').FixedDistribution | null
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
      structuralType: null,
      flavorPolicy: null,
      assortment: [],
      fixedDistribution: null,
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

  // Per-flavor images (task #203) — resolve each flavor's thumbnail + hero Asset
  // publicUrl. Cast-guarded (swatchImageFileId/heroImageFileId additive). Keyed by
  // flavor id; null for flavors with no image (chip falls back to the swatch).
  const flavorImages = await readFlavorImages(template.flavorPresets.map((f) => f.id))

  // The stored fixed assortment keys flavors by NAME (the builder authors names,
  // not ids); the VarietyPackBuilder matches against flavorPresetId. Resolve
  // name → id here where the pool (id + name) is in hand. Entries that already
  // match an id, or that don't resolve, are passed through unchanged.
  const idByName = new Map(template.flavorPresets.map((f) => [f.name, f.id]))
  const idSet = new Set(template.flavorPresets.map((f) => f.id))
  const assortment = pack.assortment.map((a) =>
    idSet.has(a.flavor) ? a : { flavor: idByName.get(a.flavor) ?? a.flavor, qty: a.qty },
  )

  return {
    flavorMode: template.packingProfile?.flavorMode === 'MULTI' ? 'MULTI' : 'SINGLE',
    maxFlavorsPerPack: template.maxFlavorsPerPack,
    pool: template.flavorPresets.map((f) => ({
      id: f.id,
      name: f.name,
      swatchHex: f.swatchHex,
      statementOfIdentity: f.statementOfIdentity,
      thumbnailUrl: flavorImages.get(f.id)?.thumbnailUrl ?? null,
      heroUrl: flavorImages.get(f.id)?.heroUrl ?? null,
    })),
    changeoverDays: settings.changeoverDays,
    flavorPricing,
    ...pack,
    assortment,
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
  structuralType: PackBuilderData['structuralType']
  flavorPolicy: PackBuilderData['flavorPolicy']
  assortment: PackBuilderData['assortment']
  fixedDistribution: PackBuilderData['fixedDistribution']
}> {
  const empty = {
    packSizes: [] as PackSizeOption[],
    minFlavors: null,
    fillRule: null as PackBuilderData['fillRule'],
    pricingBasis: null as PackBuilderData['pricingBasis'],
    flavorUnitPriceCents: {} as Record<string, number | null>,
    structuralType: null as PackBuilderData['structuralType'],
    flavorPolicy: null as PackBuilderData['flavorPolicy'],
    assortment: [] as PackBuilderData['assortment'],
    fixedDistribution: null as PackBuilderData['fixedDistribution'],
  }
  try {
    const t = await (prisma as unknown as {
      productTemplate: {
        findUnique: (a: unknown) => Promise<{
          minFlavorsPerPack: number | null
          flavorFillRule: PackBuilderData['fillRule']
          pricingBasis: PackBuilderData['pricingBasis']
          flavorPolicy: PackBuilderData['flavorPolicy']
          fixedDistribution: unknown
          packingProfile: { structuralType: string | null } | null
          variants: Array<{
            id: string
            isActive: boolean
            unitsPerPack: number | null
            pricePerPackCents: number | null
            moqMin: number | null
            containerFormat: string | null
            netContentDisplay: string | null
            assortmentFlavors: unknown
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
        flavorPolicy: true,
        fixedDistribution: true,
        packingProfile: { select: { structuralType: true } },
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
            assortmentFlavors: true,
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
    const sizeVariants = (t.variants ?? []).filter(
      (v) => typeof v.unitsPerPack === 'number' && (v.unitsPerPack ?? 0) > 0,
    )
    const packSizes: PackSizeOption[] = sizeVariants
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
      structuralType: (t.packingProfile?.structuralType ?? null) as PackBuilderData['structuralType'],
      flavorPolicy: t.flavorPolicy ?? null,
      // Fixed assortment — the first offered size carrying an assortmentFlavors
      // list (it scales to other sizes in the engine). Coerce to [{flavor,qty}].
      assortment: coerceAssortment(
        sizeVariants.find((v) => Array.isArray(v.assortmentFlavors) && (v.assortmentFlavors as unknown[]).length > 0)?.assortmentFlavors,
      ),
      // MANUFACTURER_FIXED weights (spec §4.3) — only meaningful for that fill rule.
      fixedDistribution: t.flavorFillRule === 'MANUFACTURER_FIXED' ? coerceFixedDistribution(t.fixedDistribution) : null,
    }
  } catch {
    return empty
  }
}

/** Coerce a stored fixedDistribution JSON into { [flavorCount]: number[] } (spec
 *  §4.3). Integer keys >= 1; each vector of non-negative integers must match its
 *  key length. Drops malformed rows; returns null when nothing valid remains. */
function coerceFixedDistribution(raw: unknown): PackBuilderData['fixedDistribution'] {
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

/** Coerce a variant's `assortmentFlavors` JSON into typed [{flavor,qty}] entries.
 *  Drops malformed rows; returns [] for anything non-array. */
function coerceAssortment(raw: unknown): PackBuilderData['assortment'] {
  if (!Array.isArray(raw)) return []
  const out: PackBuilderData['assortment'] = []
  for (const r of raw) {
    const flavor = (r as { flavor?: unknown })?.flavor
    const qty = Number((r as { qty?: unknown })?.qty)
    if (typeof flavor === 'string' && flavor && Number.isFinite(qty) && qty > 0) {
      out.push({ flavor, qty: Math.floor(qty) })
    }
  }
  return out
}

/**
 * Per-flavor images (task #203) — resolve each flavor's thumbnail + hero Asset
 * publicUrl, keyed by flavor preset id. Cast-guarded: `swatchImageFileId` (thumb)
 * and `heroImageFileId` (hero) are additive FlavorPreset columns; a P2022 pre-push
 * must not crash the PDP. Returns an empty map on any failure (chips fall back to
 * the swatch circle, gallery keeps the product hero).
 */
async function readFlavorImages(
  flavorIds: string[],
): Promise<Map<string, { thumbnailUrl: string | null; heroUrl: string | null }>> {
  const out = new Map<string, { thumbnailUrl: string | null; heroUrl: string | null }>()
  if (flavorIds.length === 0) return out
  try {
    const fp = await (prisma as unknown as {
      flavorPreset: {
        findMany: (a: unknown) => Promise<Array<{ id: string; swatchImageFileId: string | null; heroImageFileId: string | null }>>
      }
    }).flavorPreset.findMany({
      where: { id: { in: flavorIds } },
      select: { id: true, swatchImageFileId: true, heroImageFileId: true },
    })
    // Batch-resolve every referenced Asset id → publicUrl in one query.
    const assetIds = [
      ...new Set(
        fp.flatMap((f) => [f.swatchImageFileId, f.heroImageFileId]).filter((v): v is string => Boolean(v)),
      ),
    ]
    const urlByAssetId = new Map<string, string>()
    if (assetIds.length > 0) {
      const assets = await prisma.asset
        .findMany({ where: { id: { in: assetIds }, publicUrl: { not: null } }, select: { id: true, publicUrl: true } })
        .catch(() => [] as Array<{ id: string; publicUrl: string | null }>)
      for (const a of assets) if (a.publicUrl) urlByAssetId.set(a.id, a.publicUrl)
    }
    for (const f of fp) {
      out.set(f.id, {
        thumbnailUrl: f.swatchImageFileId ? urlByAssetId.get(f.swatchImageFileId) ?? null : null,
        heroUrl: f.heroImageFileId ? urlByAssetId.get(f.heroImageFileId) ?? null : null,
      })
    }
  } catch {
    return new Map()
  }
  return out
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
