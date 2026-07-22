// =============================================================================
// Configurator data loader (server). Resolves a creator's Product → its
// ProductTemplate into everything the configurator needs: base recipe rows,
// flavor + option axes (with pre-resolved nutrition overlays + §9 deltas),
// per-template fees, pricing tiers, and serving geometry.
// =============================================================================
//
// The configurator models (ProductOptionAxis/Value, ProductTemplateFee) + the
// lead-time scalars landed with the guided builder and may not be on the
// generated Prisma client on every machine until the migration runs — so those
// reads go through a loose delegate + cast and degrade to empty.

import { prisma } from '@ilaunchify/db'
import { getCreatorTier, type TierKey } from '@ilaunchify/auth'
// PP-0b: the fee resolves through the ONE SSOT (resolveCreatorFeeBps), like the
// estimate and the charge. This file previously used `lookupFeeRate` directly and
// kept the rate as an integer PERCENT, which lost two things the charge applies:
// the FeeRule's flat/min/max BOUNDS, and sub-percent precision (12.5% is not
// representable as an integer percent, but is as 1250 bps).
import { resolveCreatorFeeBps, resolveCreatorFeeBounds, type FeeRuleBounds } from '@ilaunchify/plans'
import type { IngredientInput, RecipeRow, OptionOverlay } from '@ilaunchify/nutrition'

export interface ConfiguratorValue {
  id: string
  label: string
  isDefault: boolean
  unitCostDeltaCents: number
  leadTimeDeltaDays: number
  moqOverride: number | null
  priceDeltaCents: number
  /** Pre-resolved nutrition overlay for label-affecting axes (else null). */
  overlay: OptionOverlay | null
}

export interface ConfiguratorAxis {
  id: string
  key: string
  label: string
  editableByCreator: boolean
  affectsLabel: boolean
  required: boolean
  values: ConfiguratorValue[]
}

export interface ConfiguratorFlavor {
  id: string
  name: string
  swatchHex: string | null
  priceDeltaCents: number
  /** Best-effort recipe overlay (customIngredient swaps) for the Facts recompute. */
  overlay: OptionOverlay[]
}

export interface ConfiguratorFee {
  label: string
  basis: 'PER_UNIT' | 'PER_SKU_ONE_TIME' | 'PER_ORDER'
  amountCents: number
  waivedAboveQty: number | null
}

export interface ConfiguratorTier {
  minQty: number
  maxQty: number | null
  perUnitCostCents: number
}

export interface ConfiguratorRule {
  kind: 'EXCLUDE' | 'REQUIRE'
  whenValueId: string
  targetValueId: string
  message: string | null
}

export interface ConfiguratorData {
  product: { id: string; name: string }
  template: { id: string; name: string }
  geometry: { servingSizeG: number; servingsPerContainer: number }
  baseRows: RecipeRow[]
  variantMoqMin: number
  leadTimeFirstRunDays: number | null
  leadTimeRepeatDays: number | null
  fallbackUnitCostCents: number
  pricingTiers: ConfiguratorTier[]
  fees: ConfiguratorFee[]
  flavors: ConfiguratorFlavor[]
  axes: ConfiguratorAxis[]
  rules: ConfiguratorRule[]
  /** Creator's tier (drives the platform fee). */
  creatorTier: TierKey
  /** Display only: the tier rate as a percent, for the "Platform fee · maker · 15%" label. */
  platformFeePercent: number
  /** THE MATH: tier rate in bps, resolved via the fee SSOT (1500/1200/800). */
  platformFeeBps: number
  /** THE MATH: the FeeRule's flat/min/max. Dropping these is why the quote could
      differ from the charge on a cart that hits a floor or a cap. */
  platformFeeBounds: FeeRuleBounds
}

type Nut = IngredientInput['per100g']

function toIngredientInput(
  id: string,
  name: string,
  per100g: unknown,
  quantity: number,
  unit = 'g',
): IngredientInput {
  return { id, name, per100g: (per100g ?? {}) as Nut, quantity, unit }
}

/**
 * Load the configurator payload for a creator's product. Returns null when the
 * product isn't owned by the user or has no bound template.
 */
export async function loadConfiguratorData(
  productId: string,
  userId: string,
): Promise<ConfiguratorData | null> {
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId } } },
    select: { id: true, name: true, productTemplateId: true },
  })
  if (!product?.productTemplateId) return null
  const templateId = product.productTemplateId

  // Typed reads — these relations/scalars exist on every client.
  const template = await prisma.productTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      name: true,
      unitCostCents: true,
      ingredientSlots: {
        orderBy: { displayOrder: 'asc' },
        select: {
          id: true,
          weightG: true,
          baseIngredient: { select: { name: true, nutritionPer100g: true } },
        },
      },
      variants: {
        orderBy: { moqMin: 'asc' },
        take: 1,
        select: { servingSizeG: true, servingsPerContainer: true, moqMin: true },
      },
      flavorPresets: {
        where: { status: 'ACTIVE' },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, swatchHex: true, priceDeltaCents: true, slotResolution: true },
      },
      pricingTiers: {
        // BULK bands only (2026-07-20, ON_DEMAND_FULL_SERVICE_GATE §5.2): the
        // configure surface feeds a bulk production order. Unfiltered, a template
        // with both band sets interleaved them here by minQty (the on-demand set
        // starts at qty 1). Same-commit parity with getPricingTierRows +
        // checkout/tier-pricing.ts.
        where: { fulfillmentMode: 'BULK_PRODUCTION' },
        orderBy: { minQty: 'asc' },
        select: { minQty: true, maxQty: true, perUnitCostCents: true },
      },
    },
  })
  if (!template) return null

  // Loose reads — configurator models + lead-time scalars may be ungenerated.
  const loose = prisma as unknown as {
    productOptionAxis?: { findMany: (a: unknown) => Promise<RawAxis[]> }
    productTemplateFee?: { findMany: (a: unknown) => Promise<RawFee[]> }
    productOptionRule?: { findMany: (a: unknown) => Promise<RawRule[]> }
  }
  const [axesRaw, feesRaw, rulesRaw, scalars] = await Promise.all([
    loose.productOptionAxis
      ?.findMany({
        where: { productTemplateId: templateId, isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: { values: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' } } },
      })
      .catch(() => [] as RawAxis[]) ?? Promise.resolve([] as RawAxis[]),
    loose.productTemplateFee
      ?.findMany({ where: { productTemplateId: templateId }, orderBy: { sortOrder: 'asc' } })
      .catch(() => [] as RawFee[]) ?? Promise.resolve([] as RawFee[]),
    loose.productOptionRule
      ?.findMany({ where: { productTemplateId: templateId } })
      .catch(() => [] as RawRule[]) ?? Promise.resolve([] as RawRule[]),
    (
      prisma as unknown as {
        productTemplate: {
          findUnique: (a: unknown) => Promise<{
            leadTimeFirstRunDays: number | null
            leadTimeRepeatDays: number | null
          } | null>
        }
      }
    ).productTemplate
      .findUnique({
        where: { id: templateId },
        select: { leadTimeFirstRunDays: true, leadTimeRepeatDays: true },
      })
      .catch(() => null),
  ])

  // ---- Resolve every ingredient referenced by an overlay in ONE query ----
  const refIds = new Set<string>()
  for (const ax of axesRaw) {
    for (const v of ax.values) {
      const ov = (v.recipeOverlay ?? null) as Record<string, unknown> | null
      if (!ov) continue
      const id = (ov.toIngredientId ?? ov.addIngredientId) as string | undefined
      if (id) refIds.add(id)
    }
  }
  for (const f of template.flavorPresets) {
    for (const e of asArray(f.slotResolution)) {
      const cust = (e?.customIngredientId ?? (e?.custom as Record<string, unknown> | undefined)?.customIngredientId) as
        | string
        | undefined
      if (cust) refIds.add(cust)
    }
  }
  const refIngredients = refIds.size
    ? await prisma.ingredient.findMany({
        where: { id: { in: Array.from(refIds) } },
        select: { id: true, name: true, nutritionPer100g: true },
      })
    : []
  const ingById = new Map(refIngredients.map((i) => [i.id, i] as const))

  // ---- base recipe rows ----
  const baseRows: RecipeRow[] = template.ingredientSlots.map((s) => ({
    id: s.id,
    name: s.baseIngredient.name,
    per100g: (s.baseIngredient.nutritionPer100g ?? {}) as Nut,
    quantity: Number(s.weightG),
    unit: 'g',
    category: 'base',
  }))

  // ---- axes + value overlays ----
  const axes: ConfiguratorAxis[] = axesRaw.map((ax) => ({
    id: ax.id,
    key: ax.key,
    label: ax.label,
    editableByCreator: ax.editableByCreator,
    affectsLabel: ax.affectsLabel,
    required: ax.required,
    values: ax.values.map((v) => ({
      id: v.id,
      label: v.label,
      isDefault: v.isDefault,
      unitCostDeltaCents: v.unitCostDeltaCents,
      leadTimeDeltaDays: v.leadTimeDeltaDays,
      moqOverride: v.moqOverride,
      priceDeltaCents: v.priceDeltaCents,
      overlay: ax.affectsLabel ? resolveValueOverlay(ax.boundSlotId, v, ingById) : null,
    })),
  }))

  // ---- flavors (best-effort label overlay from custom-ingredient swaps) ----
  const flavors: ConfiguratorFlavor[] = template.flavorPresets.map((f) => {
    const overlay: OptionOverlay[] = []
    for (const e of asArray(f.slotResolution)) {
      const slotId = e?.slotId as string | undefined
      const cust = (e?.customIngredientId ??
        (e?.custom as Record<string, unknown> | undefined)?.customIngredientId) as string | undefined
      const qty = Number((e?.qty ?? (e?.custom as Record<string, unknown> | undefined)?.qty) ?? 0)
      if (slotId && cust && ingById.has(cust)) {
        const ing = ingById.get(cust)!
        overlay.push({
          op: 'SWAP',
          slotId,
          ingredient: toIngredientInput(ing.id, ing.name, ing.nutritionPer100g, qty || 1),
        })
      }
    }
    return {
      id: f.id,
      name: f.name,
      swatchHex: f.swatchHex,
      priceDeltaCents: f.priceDeltaCents,
      overlay,
    }
  })

  const firstVariant = template.variants[0] ?? null

  // PP-0b: tier-aware platform fee through the ONE SSOT, the same call the estimate
  // and the charge make. The old comment here claimed "same source of truth as the
  // marketplace matrix" and was accurate: that WAS the problem, because the
  // marketplace matrix is the wrong SSOT (it uses lookupFeeRate and drops bounds).
  const creatorTier = await getCreatorTier(userId)
  const { feeBps: platformFeeBps } = await resolveCreatorFeeBps(creatorTier)
  const platformFeeBounds = await resolveCreatorFeeBounds(creatorTier)
  const platformFeePercent = platformFeeBps / 100 // display only

  return {
    product: { id: product.id, name: product.name },
    template: { id: template.id, name: template.name },
    geometry: {
      servingSizeG: firstVariant ? Number(firstVariant.servingSizeG) : 100,
      servingsPerContainer: firstVariant?.servingsPerContainer ?? 1,
    },
    baseRows,
    variantMoqMin: firstVariant?.moqMin ?? 500,
    leadTimeFirstRunDays: scalars?.leadTimeFirstRunDays ?? null,
    leadTimeRepeatDays: scalars?.leadTimeRepeatDays ?? null,
    fallbackUnitCostCents: template.unitCostCents,
    pricingTiers: template.pricingTiers.map((t) => ({
      minQty: t.minQty,
      maxQty: t.maxQty,
      perUnitCostCents: t.perUnitCostCents,
    })),
    fees: feesRaw.map((f) => ({
      label: f.label,
      basis: f.basis,
      amountCents: f.amountCents,
      waivedAboveQty: f.waivedAboveQty,
    })),
    flavors,
    axes,
    rules: rulesRaw.map((r) => ({
      kind: r.kind,
      whenValueId: r.whenValueId,
      targetValueId: r.targetValueId,
      message: r.message,
    })),
    creatorTier,
    platformFeePercent,
    platformFeeBps,
    platformFeeBounds,
  }
}

// ---- overlay resolution for one option value ----
function resolveValueOverlay(
  boundSlotId: string | null,
  v: RawValue,
  ingById: Map<string, { id: string; name: string; nutritionPer100g: unknown }>,
): OptionOverlay | null {
  if (v.overlayOp === 'NONE' || !v.overlayOp) return null
  const ov = (v.recipeOverlay ?? null) as Record<string, unknown> | null
  if (v.overlayOp === 'REMOVE') {
    return boundSlotId ? { op: 'REMOVE', slotId: boundSlotId } : null
  }
  if (v.overlayOp === 'SWAP') {
    const id = ov?.toIngredientId as string | undefined
    if (!boundSlotId || !id || !ingById.has(id)) return null
    const ing = ingById.get(id)!
    return {
      op: 'SWAP',
      slotId: boundSlotId,
      ingredient: toIngredientInput(ing.id, ing.name, ing.nutritionPer100g, Number(ov?.qty ?? 0) || 1),
    }
  }
  if (v.overlayOp === 'ADD') {
    const id = ov?.addIngredientId as string | undefined
    if (!id || !ingById.has(id)) return null
    const ing = ingById.get(id)!
    return {
      op: 'ADD',
      ingredient: toIngredientInput(
        ing.id,
        ing.name,
        ing.nutritionPer100g,
        Number(ov?.qty ?? 0) || 1,
        (ov?.unit as string) ?? 'g',
      ),
    }
  }
  return null
}

function asArray(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []
}

// ---- loose-delegate row shapes ----
interface RawValue {
  id: string
  label: string
  isDefault: boolean
  unitCostDeltaCents: number
  leadTimeDeltaDays: number
  moqOverride: number | null
  priceDeltaCents: number
  overlayOp: 'NONE' | 'SWAP' | 'ADD' | 'REMOVE'
  recipeOverlay: unknown
}
interface RawAxis {
  id: string
  key: string
  label: string
  editableByCreator: boolean
  affectsLabel: boolean
  required: boolean
  boundSlotId: string | null
  values: RawValue[]
}
interface RawFee {
  label: string
  basis: 'PER_UNIT' | 'PER_SKU_ONE_TIME' | 'PER_ORDER'
  amountCents: number
  waivedAboveQty: number | null
}
interface RawRule {
  kind: 'EXCLUDE' | 'REQUIRE'
  whenValueId: string
  targetValueId: string
  message: string | null
}
