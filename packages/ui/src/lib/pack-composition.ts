// Pure pack-composition engine for the variety-pack builder.
//
// Shared by the marketing product-detail preview AND the creator checkout
// pack-builder so both validate a flavor selection identically. No React, no
// I/O — just the rules the partner defined (max distinct flavors, min per
// flavor, optional fixed pack capacity) applied to a creator's picks.

/** One flavor the creator picked, with the per-flavor unit count. */
export interface FlavorPick {
  flavorPresetId: string
  qty: number
}

/** The constraints the partner defined for this product's pack. */
export interface PackRules {
  /** Max DISTINCT flavors allowed (ProductTemplate.maxFlavorsPerPack). null = no cap. */
  maxFlavors: number | null
  /** Minimum units per chosen flavor. Defaults to 1. */
  minPerFlavor: number
  /** Fixed total units the pack must hold. null = creator sets a free total. */
  capacity: number | null
}

export type PackValidationCode =
  | 'EMPTY'
  | 'DUPLICATE'
  | 'TOO_MANY_FLAVORS'
  | 'BELOW_MIN'
  | 'CAPACITY_MISMATCH'
  | 'NON_POSITIVE'

export interface PackValidationError {
  code: PackValidationCode
  message: string
  /** Set for per-flavor errors (BELOW_MIN / NON_POSITIVE). */
  flavorPresetId?: string
}

export interface PackValidationResult {
  ok: boolean
  errors: PackValidationError[]
  distinctCount: number
  totalUnits: number
}

/** Sum of all pick quantities (ignores non-positive). */
export function totalPackUnits(picks: FlavorPick[]): number {
  return picks.reduce((sum, p) => sum + (p.qty > 0 ? p.qty : 0), 0)
}

/** Distinct flavors with a positive quantity. */
export function distinctFlavorCount(picks: FlavorPick[]): number {
  return new Set(picks.filter((p) => p.qty > 0).map((p) => p.flavorPresetId)).size
}

/**
 * Distribute `capacity` units across `n` flavors as evenly as possible, with the
 * remainder front-loaded (so 18 over 4 → [5, 5, 4, 4]). Powers the "even split"
 * helper button. Returns [] for n <= 0.
 */
export function evenSplit(capacity: number, n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor(capacity / n)
  const remainder = capacity - base * n
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0))
}

/**
 * Validate a creator's pack selection against the partner's rules. Pure — returns
 * every violation (so the UI can show them all at once) plus the derived distinct
 * count + total, which callers also use for the D5 lead-time + pricing.
 */
export function validatePackSelection(
  picks: FlavorPick[],
  rules: PackRules,
): PackValidationResult {
  const errors: PackValidationError[] = []
  const minPerFlavor = Math.max(1, rules.minPerFlavor)

  // A pick is "chosen" if it has any positive quantity. Negative/zero qty on a
  // listed flavor isn't an error by itself (it just means "not in the pack"),
  // but a negative qty is nonsense.
  for (const p of picks) {
    if (p.qty < 0) {
      errors.push({ code: 'NON_POSITIVE', flavorPresetId: p.flavorPresetId, message: 'Quantity cannot be negative.' })
    }
  }

  const chosen = picks.filter((p) => p.qty > 0)
  const distinct = new Set(chosen.map((p) => p.flavorPresetId))
  const totalUnits = totalPackUnits(picks)

  if (chosen.length === 0) {
    errors.push({ code: 'EMPTY', message: 'Pick at least one flavor.' })
  }
  if (distinct.size !== chosen.length) {
    errors.push({ code: 'DUPLICATE', message: 'Each flavor can only be added once.' })
  }
  if (rules.maxFlavors != null && distinct.size > rules.maxFlavors) {
    errors.push({
      code: 'TOO_MANY_FLAVORS',
      message: `This pack allows up to ${rules.maxFlavors} flavor${rules.maxFlavors === 1 ? '' : 's'}.`,
    })
  }
  for (const p of chosen) {
    if (p.qty < minPerFlavor) {
      errors.push({
        code: 'BELOW_MIN',
        flavorPresetId: p.flavorPresetId,
        message: `Each flavor needs at least ${minPerFlavor} unit${minPerFlavor === 1 ? '' : 's'}.`,
      })
    }
  }
  if (rules.capacity != null && totalUnits !== rules.capacity) {
    errors.push({
      code: 'CAPACITY_MISMATCH',
      message: `This pack holds exactly ${rules.capacity} units — you've placed ${totalUnits}.`,
    })
  }

  return { ok: errors.length === 0, errors, distinctCount: distinct.size, totalUnits }
}

/**
 * D5 — multi-flavor lead-time model. A variety/multipack made in N distinct
 * flavors needs a line changeover between flavor runs, so the quoted production
 * lead is `baseLeadDays + (N-1) * changeoverDays`. Pure + null-safe: N<=1 (or a
 * null base) returns the base unchanged, so a single-flavor order is never
 * penalised. Canonical home (marketing re-exports it).
 */
export function applyFlavorChangeover(
  baseLeadDays: number | null | undefined,
  flavorCount: number,
  changeoverDays: number,
): number | null {
  if (baseLeadDays == null) return null
  const extraFlavors = Math.max(0, Math.floor(flavorCount) - 1)
  return baseLeadDays + extraFlavors * Math.max(0, changeoverDays)
}
