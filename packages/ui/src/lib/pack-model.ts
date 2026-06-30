// Pack-aware variety-pack engine v2 (docs/VARIETY_PACK_MODEL.md).
//
// Pure — no React, no I/O. Models the NEW pack-based variety flow:
//   "pick a pack SIZE → pick WHICH flavors (min–max) → fill the pack's units →
//    set how many PACKS → price by basis."
//
// This lives ALONGSIDE the legacy `pack-composition.ts` (capacity = whole order)
// until the PDP + checkout are migrated over (spec §10 steps 3-4), so the live
// flow keeps working. Everything here is integer-cent / integer-unit math.

// ── Manufacturer-defined shape ────────────────────────────────────────────────

export type FlavorFillRule = 'CREATOR_CHOOSES' | 'EVEN_AUTO' | 'MANUFACTURER_FIXED'
export type PricingBasis = 'PER_FLAVOR' | 'PER_PACK'

// ── Configure mode (spec §8 per-bucket rollout) ───────────────────────────────
//
// The 6 StructuralPackType buckets all reuse the SAME pack machinery (offered
// sizes + pack count + basis pricing); they differ ONLY in how flavors are
// selected. `resolvePackMode` collapses (structuralType × flavorPolicy) into the
// one knob the PDP + checkout both read, so the two surfaces can't disagree:
//
//   SINGLE_UNIT      → 'SINGLE_UNIT'    — units, per-unit price (no pack flow)
//   MULTI_UNIT_SAME  → 'PACK_ONE_FLAVOR'— pack size + exactly ONE flavor
//   MIXED/COMPARTMENT→ 'PACK_FIXED'     — manufacturer-fixed assortment, no pick
//   PER_FLAVOR/PICK_N→ 'PACK_PICK'      — creator picks min..max flavors
//
// PARTNER_FIXED flavorPolicy forces 'PACK_FIXED' for any multi-flavor bucket
// (the explicit promotion the spec §8 calls for). The mapping is exhaustive and
// total — an unknown / null structuralType falls back to legacy behaviour: a
// real authored pack matrix (offeredSizes>0) means PACK_PICK, else SINGLE_UNIT.

/** The structural buckets (mirrors the Prisma `StructuralPackType` enum). */
export type StructuralPackType =
  | 'SINGLE_UNIT'
  | 'MULTI_UNIT_SAME'
  | 'MULTI_FLAVOR_MIXED'
  | 'MULTI_FLAVOR_COMPARTMENT'
  | 'PER_FLAVOR_IN_OUTER'
  | 'CUSTOMIZABLE_PICK_N'

/** Promoted FlavorPolicy field (spec §8) — who picks the flavors. */
export type FlavorPolicy = 'CREATOR_PICK' | 'PARTNER_FIXED'

/** The four configure modes the PDP + checkout drive `VarietyPackBuilder` with. */
export type PackMode = 'SINGLE_UNIT' | 'PACK_PICK' | 'PACK_ONE_FLAVOR' | 'PACK_FIXED'

export interface ResolvePackModeInput {
  /** The product's structural bucket. */
  structuralType?: StructuralPackType | null
  /** Promoted policy field; PARTNER_FIXED forces a fixed assortment. */
  flavorPolicy?: FlavorPolicy | null
  /** Legacy flavor mode (SINGLE/MULTI) — used only when structuralType is absent. */
  flavorMode?: 'SINGLE' | 'MULTI' | null
  /** Count of offered pack sizes the manufacturer authored. */
  offeredSizes?: number
}

/**
 * Resolve the single configure mode both surfaces share (spec §8). Pure +
 * deterministic. A PARTNER_FIXED policy wins for every multi-flavor bucket; a
 * single-flavor multipack (MULTI_UNIT_SAME) is always pick-1; SINGLE_UNIT never
 * uses the pack flow. Falls back to the legacy flavorMode + offeredSizes signal
 * when structuralType is missing (pre-migration / un-seeded rows).
 */
export function resolvePackMode(input: ResolvePackModeInput): PackMode {
  const { structuralType, flavorPolicy, flavorMode, offeredSizes = 0 } = input
  const fixed = flavorPolicy === 'PARTNER_FIXED'

  switch (structuralType) {
    case 'SINGLE_UNIT':
      return 'SINGLE_UNIT'
    case 'MULTI_UNIT_SAME':
      return 'PACK_ONE_FLAVOR'
    case 'MULTI_FLAVOR_MIXED':
    case 'MULTI_FLAVOR_COMPARTMENT':
      return 'PACK_FIXED'
    case 'PER_FLAVOR_IN_OUTER':
    case 'CUSTOMIZABLE_PICK_N':
      // A pick bucket still defers to an explicit PARTNER_FIXED override.
      return fixed ? 'PACK_FIXED' : 'PACK_PICK'
    default:
      break
  }

  // No structuralType — derive from the legacy signal. A PARTNER_FIXED policy is
  // still honoured; a MULTI product with an authored pack matrix is PACK_PICK.
  if (fixed && flavorMode === 'MULTI') return 'PACK_FIXED'
  if (flavorMode === 'MULTI' && offeredSizes > 0) return 'PACK_PICK'
  if (flavorMode === 'MULTI') return 'PACK_PICK'
  return 'SINGLE_UNIT'
}

/** True when the resolved mode renders the pack composer (any non-single mode). */
export function isPackMode(mode: PackMode): boolean {
  return mode !== 'SINGLE_UNIT'
}

/** One offered pack size — a ProductTemplateVariant row (spec §4.2). */
export interface PackSize {
  /** Variant id. */
  id: string
  /** Units one pack of this size holds (e.g. 24). */
  unitsPerPack: number
  /** Display label, e.g. "24-pack". */
  label?: string
  /** Flat price per pack (cents) — used when basis = PER_PACK. */
  pricePerPackCents?: number | null
  /** Minimum order, in PACKS. */
  moqPacks?: number | null
}

/** A flavor in the manufacturer's pool. */
export interface PoolFlavor {
  flavorPresetId: string
  name?: string
  /** Absolute per-unit price (cents) — used when basis = PER_FLAVOR. */
  unitPriceCents?: number | null
}

/** The manufacturer's flavor rules for the product (spec §4.2-4.3). */
export interface FlavorRules {
  /** Distinct-flavor floor (>= 1). */
  minFlavorsPerPack: number
  /** Distinct-flavor cap. null = bounded only by unitsPerPack. */
  maxFlavorsPerPack: number | null
  fillRule: FlavorFillRule
}

// ── Creator selection ─────────────────────────────────────────────────────────

/**
 * A flavor the creator chose for one pack. `units` is only meaningful for the
 * CREATOR_CHOOSES / MANUFACTURER_FIXED rules (the per-flavor count inside the
 * pack); for EVEN_AUTO it is derived and ignored.
 */
export interface FlavorChoice {
  flavorPresetId: string
  units?: number
}

// ── Results ───────────────────────────────────────────────────────────────────

/** A composed pack slot — a flavor and how many of its units sit in one pack. */
export interface PackSlot {
  flavorPresetId: string
  units: number
}

export type PackErrorCode =
  | 'EMPTY'
  | 'DUPLICATE'
  | 'TOO_FEW_FLAVORS'
  | 'TOO_MANY_FLAVORS'
  | 'TOO_MANY_FOR_PACK' // distinct flavors > unitsPerPack
  | 'UNITS_MISMATCH' // CREATOR_CHOOSES counts don't sum to unitsPerPack
  | 'NON_POSITIVE'

export interface PackError {
  code: PackErrorCode
  message: string
  flavorPresetId?: string
}

export interface ComposedPack {
  ok: boolean
  errors: PackError[]
  slots: PackSlot[]
  distinctCount: number
  totalUnits: number
}

// ── Even split ────────────────────────────────────────────────────────────────

/**
 * Distribute `units` across `n` flavors as evenly as possible, remainder
 * front-loaded: evenFill(24,3)=[8,8,8], evenFill(10,3)=[4,3,3]. [] for n<=0.
 */
export function evenFill(units: number, n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor(units / n)
  const remainder = units - base * n
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0))
}

// ── Fixed assortment (PACK_FIXED — spec §8) ───────────────────────────────────

/**
 * One entry in a manufacturer's fixed assortment. `qty` is the per-pack unit
 * count of that flavor for the BASE pack; `scalePerUnit` (default true) lets the
 * assortment scale to other offered sizes proportionally. Stored on the variant
 * as `assortmentFlavors` JSON: [{ flavor, qty }].
 */
export interface AssortmentEntry {
  /** FlavorPreset id. */
  flavor: string
  /** Per-pack unit count for this flavor in the base assortment. */
  qty: number
}

/**
 * Resolve a manufacturer's fixed assortment into per-pack FlavorChoice counts
 * for a pack of `unitsPerPack` units. The assortment is authored once (summing
 * to a base total) and scaled proportionally to each offered size:
 *   - assortment sums to `base`; we scale every qty by unitsPerPack/base, then
 *     distribute any rounding remainder by `evenFill` order so the slots always
 *     sum to exactly unitsPerPack.
 * When the assortment already sums to unitsPerPack it passes through unchanged.
 * Returns [] for an empty assortment. Pure + deterministic.
 */
export function resolveFixedChoices(
  assortment: AssortmentEntry[],
  unitsPerPack: number,
): FlavorChoice[] {
  const units = Math.max(0, Math.floor(unitsPerPack))
  const entries = assortment.filter((a) => a.flavor && (a.qty ?? 0) > 0)
  if (entries.length === 0 || units === 0) return []
  const base = entries.reduce((t, a) => t + Math.max(0, Math.floor(a.qty)), 0)
  if (base === 0) return []
  if (base === units) {
    return entries.map((a) => ({ flavorPresetId: a.flavor, units: Math.floor(a.qty) }))
  }
  // Scale proportionally (floor), then hand out the remainder front-loaded so the
  // total lands exactly on `units` — matching evenFill's deterministic ordering.
  const scaled = entries.map((a) => {
    const exact = (Math.max(0, Math.floor(a.qty)) * units) / base
    return { flavor: a.flavor, floor: Math.floor(exact), frac: exact - Math.floor(exact) }
  })
  let assigned = scaled.reduce((t, s) => t + s.floor, 0)
  let remainder = units - assigned
  // Give the remaining units to the entries with the largest fractional part
  // first; ties break by original order (stable).
  const order = scaled
    .map((s, i) => ({ i, frac: s.frac }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (remainder <= 0) break
    scaled[i]!.floor += 1
    remainder -= 1
  }
  // Guarantee at least 1 unit for every listed flavor when the pack can hold them
  // (a fixed assortment shouldn't silently drop a flavor); steal from the largest.
  for (let i = 0; i < scaled.length; i += 1) {
    if (scaled[i]!.floor === 0) {
      const donor = scaled.reduce((mi, s, j) => (s.floor > scaled[mi]!.floor ? j : mi), 0)
      if (scaled[donor]!.floor > 1) {
        scaled[donor]!.floor -= 1
        scaled[i]!.floor += 1
      }
    }
  }
  return scaled.map((s) => ({ flavorPresetId: s.flavor, units: s.floor }))
}

// ── Compose ───────────────────────────────────────────────────────────────────

/**
 * Compose ONE pack of `size` from the creator's flavor choices under the
 * manufacturer's rules. Returns the per-flavor slot counts plus every violation
 * (so the UI can show them at once). Pure; deterministic.
 *
 * - EVEN_AUTO: units are evenFill-distributed across the picked flavors (choice
 *   order); any `choice.units` is ignored.
 * - CREATOR_CHOOSES / MANUFACTURER_FIXED: each `choice.units` is used verbatim
 *   and must be >= 1 and sum to `unitsPerPack`.
 */
export function composePack(
  size: Pick<PackSize, 'unitsPerPack'>,
  choices: FlavorChoice[],
  rules: FlavorRules,
): ComposedPack {
  const errors: PackError[] = []
  const unitsPerPack = Math.max(0, Math.floor(size.unitsPerPack))
  const minFlavors = Math.max(1, Math.floor(rules.minFlavorsPerPack))
  // Effective cap is also bounded by how many units the pack can hold.
  const maxFlavors =
    rules.maxFlavorsPerPack != null
      ? Math.min(Math.floor(rules.maxFlavorsPerPack), unitsPerPack)
      : unitsPerPack

  // Distinct, well-formed picks.
  const chosen = choices.filter((c) => c.flavorPresetId)
  const ids = chosen.map((c) => c.flavorPresetId)
  const distinct = new Set(ids)

  if (chosen.length === 0) {
    errors.push({ code: 'EMPTY', message: 'Pick at least one flavor.' })
  }
  if (distinct.size !== chosen.length) {
    errors.push({ code: 'DUPLICATE', message: 'Each flavor can only be added once.' })
  }
  if (chosen.length > 0 && distinct.size < minFlavors) {
    errors.push({
      code: 'TOO_FEW_FLAVORS',
      message: `Pick at least ${minFlavors} flavor${minFlavors === 1 ? '' : 's'}.`,
    })
  }
  if (distinct.size > maxFlavors) {
    errors.push({
      code: 'TOO_MANY_FLAVORS',
      message: `This pack allows up to ${maxFlavors} flavor${maxFlavors === 1 ? '' : 's'}.`,
    })
  }
  if (distinct.size > unitsPerPack) {
    errors.push({
      code: 'TOO_MANY_FOR_PACK',
      message: `A ${unitsPerPack}-unit pack can't hold ${distinct.size} different flavors.`,
    })
  }

  // Build slots.
  let slots: PackSlot[] = []
  if (rules.fillRule === 'EVEN_AUTO') {
    const fill = evenFill(unitsPerPack, chosen.length)
    slots = chosen.map((c, i) => ({ flavorPresetId: c.flavorPresetId, units: fill[i] ?? 0 }))
  } else {
    // CREATOR_CHOOSES / MANUFACTURER_FIXED — counts come from the choices.
    slots = chosen.map((c) => ({ flavorPresetId: c.flavorPresetId, units: Math.floor(c.units ?? 0) }))
    for (const s of slots) {
      if (s.units < 1) {
        errors.push({
          code: 'NON_POSITIVE',
          flavorPresetId: s.flavorPresetId,
          message: 'Each picked flavor needs at least 1 unit.',
        })
      }
    }
    const sum = slots.reduce((t, s) => t + (s.units > 0 ? s.units : 0), 0)
    if (chosen.length > 0 && sum !== unitsPerPack) {
      errors.push({
        code: 'UNITS_MISMATCH',
        message: `This pack holds exactly ${unitsPerPack} units — you've placed ${sum}.`,
      })
    }
  }

  const totalUnits = slots.reduce((t, s) => t + (s.units > 0 ? s.units : 0), 0)
  return { ok: errors.length === 0, errors, slots, distinctCount: distinct.size, totalUnits }
}

// ── Pricing ───────────────────────────────────────────────────────────────────

/**
 * Price of ONE composed pack, in cents (spec §5).
 * - PER_PACK  → the size's flat `pricePerPackCents`.
 * - PER_FLAVOR → sum over slots of (slot.units × that flavor's unitPriceCents).
 * Unknown/absent flavor prices count as 0 (caller should validate completeness).
 */
export function packPriceCents(
  basis: PricingBasis,
  size: Pick<PackSize, 'pricePerPackCents'>,
  slots: PackSlot[],
  pool: PoolFlavor[],
): number {
  if (basis === 'PER_PACK') return Math.max(0, Math.round(size.pricePerPackCents ?? 0))
  const priceById = new Map(pool.map((f) => [f.flavorPresetId, f.unitPriceCents ?? 0]))
  return slots.reduce((t, s) => t + Math.max(0, s.units) * (priceById.get(s.flavorPresetId) ?? 0), 0)
}

/** Order total in cents = pack price × number of packs. */
export function orderTotalCents(packPriceCents: number, packCount: number): number {
  return Math.max(0, Math.round(packPriceCents)) * Math.max(0, Math.floor(packCount))
}

/** Total physical units in the order = unitsPerPack × packs. */
export function orderTotalUnits(unitsPerPack: number, packCount: number): number {
  return Math.max(0, Math.floor(unitsPerPack)) * Math.max(0, Math.floor(packCount))
}

/**
 * One-line summary, e.g. "3 flavors in a 24-pack · 10 packs = 240 units"
 * (spec §6). `sizeLabel` falls back to "{unitsPerPack}-pack".
 */
export function packSummary(
  distinctCount: number,
  unitsPerPack: number,
  packCount: number,
  sizeLabel?: string,
): string {
  const label = sizeLabel || `${unitsPerPack}-pack`
  const flavors = `${distinctCount} flavor${distinctCount === 1 ? '' : 's'}`
  const packs = `${packCount} pack${packCount === 1 ? '' : 's'}`
  return `${flavors} in a ${label} · ${packs} = ${orderTotalUnits(unitsPerPack, packCount).toLocaleString()} units`
}
