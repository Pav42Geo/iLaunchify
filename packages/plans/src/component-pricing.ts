// PP-0 (docs/PRINT_PRICING_SPEC_2026-07-15.md §2): the ONE derivation of
// decoration + component-upgrade money from a product's PackagingComponent rows.
//
// WHY THIS FILE EXISTS: this math lived inline inside estimateProductionCost
// (a 'use server' action, so nothing else could import it). The real charge in
// cart-actions.ts therefore could not reuse it, and did not reimplement it: it
// simply omitted both lines. The creator saw Decoration + Component upgrades in
// the Order Summary and was never charged for them. Copying the math into the
// charge path would have made a FOURTH pricer. Extracting it makes one.
//
// PURE. Callers pass the rows they already loaded; this decides the cents.
// Not a 'use server' file on purpose: server actions can only export async
// functions, which is exactly what blocked reuse in the first place.

/** The PackagingComponent shape both callers already select. */
export interface ComponentRow {
  id: string
  tier: string
  role: string
  unitsPerParent: number
  partnerOfferingId: string | null
  decorationMethod: string | null
  selectedVariant: { baseSurchargePerUnit: unknown } | null
  partnerOffering: { pricingTiers: unknown } | null
}

export interface ComponentPricing {
  /** Per-unit decoration on the priced primary container (C8.2 tiered offering). */
  decorationUnitCents: number
  /** The method backing that price, for the summary label. Null = none linked. */
  decorationMethod: string | null
  /** Per-unit surcharge from every OTHER component's selected variant. */
  componentsUnitCents: number
}

/** The prisma `select` both callers must use. Exported so they cannot drift. */
export const COMPONENT_PRICING_SELECT = {
  id: true,
  tier: true,
  role: true,
  unitsPerParent: true,
  partnerOfferingId: true,
  decorationMethod: true,
  selectedVariant: { select: { baseSurchargePerUnit: true } },
  partnerOffering: { select: { pricingTiers: true } },
} as const

/**
 * Price the decoration + component upgrades for a quantity.
 *
 * C8.2: the PRIMARY/CONTAINER component may carry a partnerOfferingId from the
 * marketplace decoration picker. When it does, that container's decoration is
 * priced from the offering's tiered pricing (NOT its variant surcharge), so the
 * priced primary is excluded from the surcharge sum to avoid double counting.
 *
 * Both outputs are partner-set and creator-paid, so per the LOCKED fee-base rule
 * (CLAUDE.md, Pavel 2026-07-15) both belong in the production subtotal and thus
 * in the platform-fee base.
 */
export function priceComponents(rows: ComponentRow[], quantity: number): ComponentPricing {
  const primaryContainer = rows.find(
    (c) =>
      c.tier === 'PRIMARY' &&
      c.role === 'CONTAINER' &&
      c.partnerOfferingId != null &&
      c.partnerOffering != null,
  )

  let decorationMethod: string | null = null
  let decorationUnitCents = 0
  if (primaryContainer?.partnerOffering) {
    decorationMethod = primaryContainer.decorationMethod ?? null
    decorationUnitCents = pickTierPriceCents(primaryContainer.partnerOffering.pricingTiers, quantity)
  }

  let componentsUnitCents = 0
  for (const c of rows) {
    if (primaryContainer && c.id === primaryContainer.id) continue
    if (!c.selectedVariant) continue
    const surchargeCents = Math.round(Number(c.selectedVariant.baseSurchargePerUnit) * 100)
    componentsUnitCents += surchargeCents * (c.unitsPerParent || 1)
  }

  return { decorationUnitCents, decorationMethod, componentsUnitCents }
}

// -----------------------------------------------------------------------------
// pickTierPriceCents: C8.2 tiered decoration pricing.
//
// pricingTiers is a Json column shaped [{minQty, pricePerUnitCents}]. Pick the
// tier whose minQty is the largest value <= quantity (volume break). Falls back
// to the lowest tier when the quantity is below every breakpoint. Returns 0
// when the tiers array is empty / malformed.
//
// Moved here VERBATIM from production-actions.ts (PP-0). The field is
// `pricePerUnitCents`: do not "modernise" the key. It is the partner-authored
// JSON contract, and a renamed key silently prices every decoration at 0.
// -----------------------------------------------------------------------------

interface PricingTier {
  minQty: number
  pricePerUnitCents: number
}

export function pickTierPriceCents(raw: unknown, quantity: number): number {
  if (!Array.isArray(raw) || raw.length === 0) return 0
  const tiers = (raw as PricingTier[])
    .filter((t) => typeof t?.minQty === 'number' && typeof t?.pricePerUnitCents === 'number')
    .sort((a, b) => a.minQty - b.minQty)
  if (tiers.length === 0) return 0
  let chosen = tiers[0]!
  for (const t of tiers) {
    if (t.minQty <= quantity) chosen = t
    else break
  }
  return chosen.pricePerUnitCents
}
