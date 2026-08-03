import { prisma, getOrderSettings } from '@ilaunchify/db'
import { applyFlavorChangeover, type PricingTierRow, type PackBuilderFlavor } from '@ilaunchify/ui'
// PP-0c: the fee SSOT. This file used lookupFeeRate directly, which was the last
// pricing path still reading the raw FeeRule table instead of resolving through
// @ilaunchify/plans. See docs/FEE_MODEL_RECONCILIATION_SPEC §6.
import {
  resolveCreatorFeeBps,
  resolveCreatorFeeBounds,
  creatorFeeCents,
  type FeeRuleBounds,
} from '@ilaunchify/plans'
import type { TierKey } from '@ilaunchify/auth'
// Template-level full-service gate for the PDP's on-demand display
// (docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md).
import { loadTemplateOnDemandEligibility } from '@ilaunchify/orders'

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
  /** Product STANDARD (global) lead in days — the FLOOR for every flavor
   *  (docs/PER_FLAVOR_RECIPES.md §4). `ProductTemplate.leadTimeRepeatDays`. null
   *  when unset (non-migrated products) — the PDP falls back to its card lead. */
  standardLead: number | null
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
        id: true,
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
      standardLead: null,
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
  // I3 (MANUFACTURER_INVENTORY_2026-07-27.md section 4): drop OUT-OF-STOCK
  // flavors from the PDP pool. A flavor binds only when a tracked
  // TemplateFlavorInventory row says 0 units remain; untracked flavors (or a
  // pre-push client / any read failure) never filter: fail-open, Unlimited is
  // the default. The checkout guard + conditional decrement stay the authority.
  let outOfStockFlavorIds = new Set<string>()
  try {
    const stockRows = await (prisma as unknown as {
      templateFlavorInventory: {
        findMany: (a: unknown) => Promise<Array<{ flavorPresetId: string; quantityAvailable: number }>>
      }
    }).templateFlavorInventory.findMany({
      where: { productTemplateId: template.id, tracked: true, quantityAvailable: { lte: 0 } },
      select: { flavorPresetId: true, quantityAvailable: true },
    })
    outOfStockFlavorIds = new Set(stockRows.map((r) => r.flavorPresetId))
  } catch {
    outOfStockFlavorIds = new Set()
  }
  const inStockPresets = template.flavorPresets.filter((f) => !outOfStockFlavorIds.has(f.id))

  // Per-flavor price deltas for the PDP flavor cards. saleDeltaCents stays null
  // until FlavorPreset gains a sale/compare-at column — the card then renders a
  // strike-through "was" price. No schema invented here.
  const flavorPricing: PackBuilderData['flavorPricing'] = {}
  for (const f of inStockPresets) {
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
  const flavorImages = await readFlavorImages(inStockPresets.map((f) => f.id))

  // The stored fixed assortment keys flavors by NAME (the builder authors names,
  // not ids); the VarietyPackBuilder matches against flavorPresetId. Resolve
  // name → id here where the pool (id + name) is in hand. Entries that already
  // match an id, or that don't resolve, are passed through unchanged.
  const idByName = new Map(inStockPresets.map((f) => [f.name, f.id]))
  const idSet = new Set(inStockPresets.map((f) => f.id))
  const assortment = pack.assortment.map((a) =>
    idSet.has(a.flavor) ? a : { flavor: idByName.get(a.flavor) ?? a.flavor, qty: a.qty },
  )

  // flavorLeadTimeDays is an internal map (keyed by flavor id) — fold it onto the
  // pool below, then drop it from the spread (not part of PackBuilderData).
  const { flavorLeadTimeDays, ...packRest } = pack

  return {
    flavorMode: template.packingProfile?.flavorMode === 'MULTI' ? 'MULTI' : 'SINGLE',
    maxFlavorsPerPack: template.maxFlavorsPerPack,
    pool: inStockPresets.map((f) => ({
      id: f.id,
      name: f.name,
      swatchHex: f.swatchHex,
      statementOfIdentity: f.statementOfIdentity,
      thumbnailUrl: flavorImages.get(f.id)?.thumbnailUrl ?? null,
      heroUrl: flavorImages.get(f.id)?.heroUrl ?? null,
      // Per-flavor lead override (days) — GLOBAL FLOOR (docs/PER_FLAVOR_RECIPES.md §4).
      leadTimeDays: flavorLeadTimeDays[f.id] ?? null,
    })),
    changeoverDays: settings.changeoverDays,
    flavorPricing,
    ...packRest,
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
  /** Product standard (global) lead — the floor (docs/PER_FLAVOR_RECIPES.md §4). */
  standardLead: number | null
  /** Per-flavor lead override (days), keyed by flavor id. null → use the standard. */
  flavorLeadTimeDays: Record<string, number | null>
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
    standardLead: null as number | null,
    flavorLeadTimeDays: {} as Record<string, number | null>,
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
          leadTimeRepeatDays: number | null
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
          flavorPresets: Array<{ id: string; unitPriceCents: number | null; leadTimeDays: number | null }>
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
        leadTimeRepeatDays: true,
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
          select: { id: true, unitPriceCents: true, leadTimeDays: true },
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
    const flavorLeadTimeDays: Record<string, number | null> = {}
    for (const f of t.flavorPresets ?? []) {
      flavorUnitPriceCents[f.id] = f.unitPriceCents ?? null
      flavorLeadTimeDays[f.id] = f.leadTimeDays ?? null
    }

    return {
      packSizes,
      minFlavors: t.minFlavorsPerPack ?? null,
      fillRule: t.flavorFillRule ?? null,
      pricingBasis: t.pricingBasis ?? null,
      flavorUnitPriceCents,
      standardLead: t.leadTimeRepeatDays ?? null,
      flavorLeadTimeDays,
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
 * Reads ProductTemplatePricingTier (the partner-authored volume bands) and maps
 * them to the display shape.
 *
 * RETURNS [] WHEN THE TEMPLATE HAS NO TIERS. It used to return
 * buildSamplePricingRows(fallbackBasePrice), which INVENTED the entire volume curve
 * from multipliers we chose (base x 2.5/1.85/1.65/1.5/1.35/1.2/1.05). Deleted
 * 2026-07-16 under the LOCKED rule (Pavel): a price is authored by a partner
 * through the platform, never by us. That fallback quoted `priceFloor x 1.35 x qty`
 * on the PDP while placeOrder billed a ~54c/unit catalog buildup: the same 86-90%
 * hole Blocker 2 closed, one level up, and no publish gate stops a template from
 * getting there.
 *
 * An empty return means "no partner has priced this", and every caller must render
 * that as ABSENCE, never as $0 and never as a guess. `placeOrder` and the checkout
 * estimate refuse on exactly the same condition (`resolveGoods` -> null).
 *
 * One price per band per the LOCKED model (§6): the band sets the unit price;
 * a creator's Builder/Agency tier discounts the platform fee, not this cost.
 */
export async function getPricingTierRows(
  slug: string,
  /**
   * D5 — the number of DISTINCT flavors in the configured pack. Default 1 (a
   * single-flavor order), which is a no-op for the changeover increment. The
   * variety-pack builder passes the live distinct-flavor count so each band's
   * lead time reflects the changeovers. `changeoverDays` is read from
   * OrderSettings unless supplied (e.g. when the caller already loaded it).
   */
  opts?: {
    flavorCount?: number
    changeoverDays?: number
    /** Which band set to read (A1, ON_DEMAND_FULL_SERVICE_GATE §5.2). Default
     *  BULK_PRODUCTION: the PDP's ladder, configure and checkout are bulk
     *  surfaces. 'ON_DEMAND' feeds the display-only on-demand toggle. */
    mode?: 'BULK_PRODUCTION' | 'ON_DEMAND'
  },
): Promise<PricingTierRow[]> {
  const template = await prisma.productTemplate.findUnique({
    where: { slug },
    select: {
      pricingTiers: {
        // BULK bands only (2026-07-20, ON_DEMAND_FULL_SERVICE_GATE §5.2). The PDP
        // is a bulk-order surface: direct creator orders are bulk production, and
        // on-demand production is priced by the channel router on the ON_DEMAND
        // band set. Without this filter a template carrying both sets interleaved
        // them by sortOrder (indexed per mode: two rows per index). Changed in the
        // SAME commit as `checkout/tier-pricing.ts` and `configure-data.ts`, per
        // the parity rule in that file's header (quote === charge).
        where: { fulfillmentMode: opts?.mode ?? 'BULK_PRODUCTION' },
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
  // No partner-authored bands = no price. See the header: we do not invent one.
  if (tiers.length === 0) return []

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
  /** Display only: the viewer's tier rate as a percent, for the band table. */
  feePercent: number
  /**
   * PP-0c: THE MATH. The viewer's tier rate in bps (1500/1200/800), resolved via
   * the ONE fee SSOT. The PDP prices with this, never with feePercent: an integer
   * percent cannot express 12.5%, and it invites `x * pct / 100` inline.
   */
  feeBps: number
  /** PP-0c: THE MATH. The FeeRule's flat/min/max, which the charge applies and
      this page used to silently drop. */
  feeBounds: FeeRuleBounds
  /** Tier the price was computed at (signed-out -> 'maker'). */
  viewerTier: TierKey
}

export async function getCreatorPricingMatrix(
  slug: string,
  viewerTier: TierKey,
): Promise<CreatorPricingMatrix> {
  // PP-0c: the fee resolves through the ONE SSOT (resolveCreatorFeeBps), the same
  // call the estimate, the charge, the configurator and samples all make. This was
  // the LAST lookupFeeRate pricing path, i.e. the last surviving piece of the
  // "three paths, two tables" fee violation the audit found.
  //
  // Base = manufacturer unit cost per band. REAL DB tiers or nothing: the
  // `fallbackBasePrice` param is gone with the synthetic curve it fed (2026-07-16).
  // An empty `rows` means no partner has priced this template, and the caller must
  // render that as absence.
  const baseRows = await getPricingTierRows(slug)

  const { feeBps } = await resolveCreatorFeeBps(viewerTier)
  const feeBounds = await resolveCreatorFeeBounds(viewerTier)
  const feePercent = feeBps / 100 // display only

  const rows: PricingTierRow[] = baseRows.map((r) => {
    const manufacturerCents = r.perUnitCents
    // Per-unit fee for the BAND TABLE display. Note the band table shows a
    // per-unit fee, so bounds (which are per-ORDER) deliberately do not apply
    // here: the real, bounded fee is computed once on the whole order by
    // computeOrderPricing. That is exactly why the PDP must not multiply this
    // number by quantity to get a total (it used to).
    const platformFeeCents = creatorFeeCents(manufacturerCents, feeBps)
    return {
      ...r,
      manufacturerCents,
      platformFeeCents,
      feePercent,
      // All-in creator unit price for DISPLAY (shipping excluded, estimated at
      // checkout). `manufacturerCents` is the pre-fee number, and it is the one
      // the PDP prices from: feeding THIS field into computeOrderPricing would
      // charge the platform fee twice.
      perUnitCents: manufacturerCents + platformFeeCents,
    }
  })

  return { rows, feePercent, feeBps, feeBounds, viewerTier }
}

/**
 * On-demand band rows for the PDP's DISPLAY-ONLY toggle (2026-07-20, wakes the
 * configurator's long-dormant `onDemandRows` scaffolding — disambiguation §4.2).
 *
 * Returns [] (toggle hidden) unless BOTH hold:
 *   1. the manufacturer authored ON_DEMAND bands for this template, AND
 *   2. the template passes the full-service gate at template level
 *      (`loadTemplateOnDemandEligibility`): pinned manufacturer who prints
 *      in-house and ships parcels, no nomination, no co-packer. The PDP must
 *      never advertise a mode the manufacturer cannot execute.
 *
 * Rows carry the SAME all-in fee math as the bulk matrix (manufacturer band
 * price + the viewer's tier fee via the ONE fee SSOT). Display only: nothing
 * here feeds checkout — a direct order is always bulk, and on-demand selling is
 * configured per channel on the publish page after launch.
 */
export async function getOnDemandPricingRows(slug: string, viewerTier: TierKey): Promise<PricingTierRow[]> {
  const base = await getPricingTierRows(slug, { mode: 'ON_DEMAND' })
  if (base.length === 0) return []

  const tpl = await prisma.productTemplate.findUnique({ where: { slug }, select: { id: true } })
  if (!tpl) return []
  const eligibility = await loadTemplateOnDemandEligibility(tpl.id).catch(() => null)
  if (!eligibility?.eligible) return []

  const { feeBps } = await resolveCreatorFeeBps(viewerTier)
  // FEE BOUNDS (e2e finding 2026-07-22): the C2.2 charge applies the FeeRule's
  // flat/min/max via creatorFeeCents bounds, and at qty-1 the MIN fee dominates
  // (a $3.72 unit carries a $1.00 minimum fee, not $0.56). Quoting without the
  // bounds under-quoted every small on-demand order: quote must equal charge.
  const feeBounds = await resolveCreatorFeeBounds(viewerTier)
  const feePercent = feeBps / 100
  return base.map((r) => {
    const manufacturerCents = r.perUnitCents
    const platformFeeCents = creatorFeeCents(manufacturerCents, feeBps, feeBounds)
    return { ...r, manufacturerCents, platformFeeCents, feePercent, perUnitCents: manufacturerCents + platformFeeCents }
  })
}

/**
 * Platform-fee % for all three creator tiers: drives the per-tier columns in the
 * marketplace PricingTierModal. DISPLAY ONLY.
 *
 * PP-0c: now resolves through the same SSOT as the matrix above. It previously
 * ran its own lookupFeeRate loop with its own fallback constant, so the band
 * table could quote one rate while the same page's headline quoted another.
 * (Two more verbatim copies of this loop exist: partner build-actions.ts:27 and
 * the now-fixed configure-data.ts. build-actions is a partner-side PREVIEW of
 * creator prices, not a charge, so it is a display drift risk rather than a money
 * bug: worth folding in, not urgent.)
 */
export async function getCreatorFeePcts(): Promise<{ maker: number; builder: number; agency: number }> {
  const out = { maker: 15, builder: 15, agency: 15 }
  await Promise.all(
    (['maker', 'builder', 'agency'] as const).map(async (t) => {
      const { feeBps } = await resolveCreatorFeeBps(t)
      out[t] = feeBps / 100
    }),
  )
  return out
}
