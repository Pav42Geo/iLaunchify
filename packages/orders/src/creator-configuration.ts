// Creator Product Configuration — "the order of the creator" (docs/CREATOR_PRODUCT_CONFIGURATION.md).
//
// The immutable, filtered snapshot of everything the creator chose for their product, assembled ONCE
// at checkout and stored on the OrderItem. Downstream stages — partner manifest + channel listing —
// read from THIS snapshot instead of re-deriving from the template pool, so the creator's choice is
// the single source of truth end-to-end (matching how designVersionId is already version-locked).
//
// PURE (no Prisma / no I/O): the caller resolves the pieces (recipe, flavors, options, pricing,
// phrases) and passes plain data; this normalizes + freezes them into the snapshot, and the selectors
// scope downstream reads. Unit-testable.

export const CREATOR_CONFIG_VERSION = 1 as const

export interface ConfigIngredient {
  ingredientId: string
  /** FDA label declaration name (falls back to internal name upstream). */
  labelDeclarationName: string | null
  weightG: number
  position: number
  /** ProductIngredientSource: TEMPLATE_BASE | TEMPLATE_REPLACEMENT | TEMPLATE_OPTIONAL (or null). */
  source: string | null
  /** Which template slot this filled (replaceable/optional), or null for base. */
  filledSlotId: string | null
  allergenFlags: string[]
  bioengineeredStatus: string | null
}

export interface ConfigFlavor {
  flavorPresetId: string
  name: string
  statementOfIdentity: string | null
  swatchHex: string | null
  /** Units of this flavor in the order. */
  qty: number
  /** Per-flavor list price (cents), or null when the pack is priced as a whole. */
  unitPriceCents: number | null
  /** The version-locked design (label) for this flavor, or null. */
  lockedDesignVersionId: string | null
}

export interface CreatorConfiguration {
  version: typeof CREATOR_CONFIG_VERSION
  /** The flavors the creator selected (subset of the template pool). */
  selectedFlavorPresetIds: string[]
  flavors: ConfigFlavor[]
  /** The FINAL recipe (after replaceable swaps + optional activations), or null for non-recipe products. */
  recipe: {
    servingSizeG: number | null
    servingsPerContainer: number | null
    ingredients: ConfigIngredient[]
  } | null
  variant: {
    id: string | null
    containerFormat: string | null
    /** Formatted FDA net quantity, e.g. "NET WT 12 OZ (340g)". */
    netQuantity: string | null
  }
  options: {
    substrateSlug: string | null
    packagingMaterialSlug: string | null
    finishPartnerFinishIds: string[]
    dieCutTemplateId: string | null
  }
  pricing: {
    basis: string | null
    pricePerPackCents: number | null
    /** flavorPresetId → per-unit price cents (only for entries that carry one). */
    perFlavorUnitPriceCents: Record<string, number>
  }
  phrases: {
    /** The mandatory/eligible locked phrase ids resolved for THIS product's recipe/domain. */
    lockedPhraseIds: string[]
  }
}

export interface BuildConfigurationInput {
  flavors?: Array<{
    flavorPresetId: string
    name: string
    statementOfIdentity?: string | null
    swatchHex?: string | null
    qty?: number
    unitPriceCents?: number | null
    lockedDesignVersionId?: string | null
  }>
  recipe?: {
    servingSizeG?: number | null
    servingsPerContainer?: number | null
    ingredients?: Array<Partial<ConfigIngredient> & { ingredientId: string; weightG: number; position: number }>
  } | null
  variant?: { id?: string | null; containerFormat?: string | null; netQuantity?: string | null }
  options?: {
    substrateSlug?: string | null
    packagingMaterialSlug?: string | null
    finishPartnerFinishIds?: string[]
    dieCutTemplateId?: string | null
  }
  pricing?: { basis?: string | null; pricePerPackCents?: number | null }
  lockedPhraseIds?: string[]
}

/** Assemble the immutable snapshot from the resolved order-time pieces. Pure + deterministic. */
export function buildCreatorConfiguration(input: BuildConfigurationInput): CreatorConfiguration {
  const flavors: ConfigFlavor[] = (input.flavors ?? []).map((f) => ({
    flavorPresetId: f.flavorPresetId,
    name: f.name,
    statementOfIdentity: f.statementOfIdentity ?? null,
    swatchHex: f.swatchHex ?? null,
    qty: Math.max(0, Math.floor(f.qty ?? 0)),
    unitPriceCents: f.unitPriceCents ?? null,
    lockedDesignVersionId: f.lockedDesignVersionId ?? null,
  }))

  // Distinct, order-preserving selected ids.
  const selectedFlavorPresetIds = [...new Set(flavors.map((f) => f.flavorPresetId))]

  const perFlavorUnitPriceCents: Record<string, number> = {}
  for (const f of flavors) {
    if (typeof f.unitPriceCents === 'number') perFlavorUnitPriceCents[f.flavorPresetId] = f.unitPriceCents
  }

  const recipe = input.recipe
    ? {
        servingSizeG: input.recipe.servingSizeG ?? null,
        servingsPerContainer: input.recipe.servingsPerContainer ?? null,
        ingredients: (input.recipe.ingredients ?? [])
          .map((i) => ({
            ingredientId: i.ingredientId,
            labelDeclarationName: i.labelDeclarationName ?? null,
            weightG: i.weightG,
            position: i.position,
            source: i.source ?? null,
            filledSlotId: i.filledSlotId ?? null,
            allergenFlags: i.allergenFlags ?? [],
            bioengineeredStatus: i.bioengineeredStatus ?? null,
          }))
          .sort((a, b) => a.position - b.position),
      }
    : null

  return {
    version: CREATOR_CONFIG_VERSION,
    selectedFlavorPresetIds,
    flavors,
    recipe,
    variant: {
      id: input.variant?.id ?? null,
      containerFormat: input.variant?.containerFormat ?? null,
      netQuantity: input.variant?.netQuantity ?? null,
    },
    options: {
      substrateSlug: input.options?.substrateSlug ?? null,
      packagingMaterialSlug: input.options?.packagingMaterialSlug ?? null,
      finishPartnerFinishIds: input.options?.finishPartnerFinishIds ?? [],
      dieCutTemplateId: input.options?.dieCutTemplateId ?? null,
    },
    pricing: {
      basis: input.pricing?.basis ?? null,
      pricePerPackCents: input.pricing?.pricePerPackCents ?? null,
      perFlavorUnitPriceCents,
    },
    phrases: { lockedPhraseIds: [...new Set(input.lockedPhraseIds ?? [])] },
  }
}

// ---- Downstream selectors (partner manifest + channel listing read THESE, not the template) -------

/** Channel listing variants — ONLY the selected flavors, each with its per-flavor price when set. */
export function configurationChannelVariants(
  cfg: CreatorConfiguration,
): Array<{ flavorPresetId: string; name: string; unitPriceCents: number | null }> {
  return cfg.flavors.map((f) => ({
    flavorPresetId: f.flavorPresetId,
    name: f.name,
    unitPriceCents: f.unitPriceCents ?? cfg.pricing.perFlavorUnitPriceCents[f.flavorPresetId] ?? null,
  }))
}

/** The exact filtered recipe the partner produces — for the manifest (closes the recipe-in-manifest gap). */
export function configurationManifestRecipe(cfg: CreatorConfiguration): CreatorConfiguration['recipe'] {
  return cfg.recipe
}

/** True when the snapshot is a recognised, current version this reader understands. */
export function isCurrentConfiguration(cfg: { version?: unknown } | null | undefined): cfg is CreatorConfiguration {
  return !!cfg && (cfg as { version?: unknown }).version === CREATOR_CONFIG_VERSION
}

// ---- Input mappers (Code feeds raw Prisma rows in; these normalise → builder inputs) --------------

/** Raw `RecipeIngredient` row shape (structural — no Prisma dependency). */
export interface RawRecipeIngredientRow {
  weightG: number | string
  position: number
  source?: string | null
  filledSlotId?: string | null
  ingredient: {
    id: string
    name: string
    labelDeclarationName?: string | null
    allergenFlags?: string[]
    /** Legacy fallback when allergenFlags is empty. */
    allergens?: string[]
    bioengineeredStatus?: string | null
  }
}

/**
 * Map the creator's FINAL recipe rows (after replaceable swaps + optional activations) into snapshot
 * ingredients. Mirrors deriveProductCtx: allergenFlags falls back to legacy `allergens`;
 * labelDeclarationName falls back to the internal name; Decimal weight coerced to number.
 */
export function mapRecipeIngredients(rows: readonly RawRecipeIngredientRow[]): ConfigIngredient[] {
  return rows.map((r) => {
    const flags = (r.ingredient.allergenFlags?.length ? r.ingredient.allergenFlags : r.ingredient.allergens) ?? []
    return {
      ingredientId: r.ingredient.id,
      labelDeclarationName: r.ingredient.labelDeclarationName ?? r.ingredient.name ?? null,
      weightG: typeof r.weightG === 'number' ? r.weightG : Number(String(r.weightG)) || 0,
      position: r.position,
      source: r.source ?? null,
      filledSlotId: r.filledSlotId ?? null,
      allergenFlags: flags.map((a) => a.toLowerCase()),
      bioengineeredStatus: r.ingredient.bioengineeredStatus ?? null,
    }
  })
}

export interface FlavorPriceInput {
  flavorPresetId: string
  /** Absolute per-flavor price (used when basis is PER_FLAVOR). */
  unitPriceCents?: number | null
  /** Upcharge added on top of the base unit price (non-PER_FLAVOR bases). */
  priceDeltaCents?: number | null
}

/**
 * Compose each selected flavor's final per-unit price (cents). PER_FLAVOR basis → the flavor's own
 * absolute `unitPriceCents`; otherwise `baseUnitCents + priceDeltaCents`; falls back to `unitPriceCents`
 * when no base is known. Never negative. Pure — so PDP, order, and manifest can share one number.
 */
export function composeFlavorUnitPrices(
  basis: string | null,
  baseUnitCents: number | null,
  flavors: readonly FlavorPriceInput[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of flavors) {
    let cents: number | null = null
    if (basis === 'PER_FLAVOR' && typeof f.unitPriceCents === 'number') {
      cents = f.unitPriceCents
    } else if (typeof baseUnitCents === 'number') {
      cents = baseUnitCents + (f.priceDeltaCents ?? 0)
    } else if (typeof f.unitPriceCents === 'number') {
      cents = f.unitPriceCents
    }
    if (cents != null) out[f.flavorPresetId] = Math.max(0, Math.round(cents))
  }
  return out
}
