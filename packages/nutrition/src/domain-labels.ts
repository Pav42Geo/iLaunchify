// Shared, framework-free assembly for the non-food regulated labels (cosmetic
// INCI · pet AAFCO Guaranteed Analysis). Single source of truth so the partner
// builder preview AND the creator label download compute identical output — the
// labels are legal artifacts (see docs/LABEL_RENDERING_STANDARD.md), so the
// ordering/format logic must live in exactly one place. Supplement Facts assembly
// lives in ./supplement-facts (toSupplementPanelData), already shared.

// =============================================================================
// Cosmetic — INCI ingredient declaration (21 CFR 701.3)
// =============================================================================
//
// Required order: (1) ingredients > 1% in descending predominance, (2) ingredients
// ≤ 1% in any order, (3) color additives last. Fragrance/flavor may be declared
// simply as "Fragrance" / "Flavor".

export interface CosmeticIngredient {
  id: string
  /** INCI name, e.g. "Aqua (Water)", "Glycerin", "Sodium Hyaluronate". */
  inciName: string
  /** Concentration % w/w. Drives the >1% vs ≤1% ordering bands. */
  pct: number
  isColorAdditive?: boolean
  isFragrance?: boolean
  isFlavor?: boolean
}

export interface InciDeclaration {
  ordered: { id: string; name: string }[]
  /** Full label line, e.g. "Ingredients: Aqua, Glycerin, …, CI 77891 (+/-)." */
  text: string
}

function cosmeticDisplayName(i: CosmeticIngredient): string {
  if (i.isFragrance) return 'Fragrance'
  if (i.isFlavor) return 'Flavor'
  return i.inciName.trim()
}

/** Build the ordered INCI declaration per 21 CFR 701.3. Stable within each band. */
export function toInciDeclaration(items: CosmeticIngredient[]): InciDeclaration {
  const named = items.filter((i) => i.inciName.trim() || i.isFragrance || i.isFlavor)
  const colors = named.filter((i) => i.isColorAdditive)
  const nonColor = named.filter((i) => !i.isColorAdditive)

  const above = nonColor
    .filter((i) => i.pct > 1)
    .map((i, idx) => ({ i, idx }))
    .sort((a, b) => b.i.pct - a.i.pct || a.idx - b.idx)
    .map((x) => x.i)
  const below = nonColor.filter((i) => i.pct <= 1)

  const ordered = [...above, ...below, ...colors].map((i) => ({ id: i.id, name: cosmeticDisplayName(i) }))
  const names = ordered.map((o) => o.name).filter(Boolean)
  return { ordered, text: names.length ? `Ingredients: ${names.join(', ')}.` : '' }
}

// =============================================================================
// Pet — AAFCO ingredient list + Guaranteed Analysis + adequacy statement
// =============================================================================

export interface PetIngredient {
  id: string
  name: string
  /** Relative weight / predominance (descending order on the label). */
  weight: number
}

export interface GuaranteedAnalysis {
  crudeProteinMinPct: number
  crudeFatMinPct: number
  crudeFiberMaxPct: number
  moistureMaxPct: number
  /** Voluntary extra guarantees (e.g. Omega-3 min, Calcium min). */
  others?: { name: string; value: number; bound: 'min' | 'max'; unit: string }[]
}

export type PetSpecies = 'Dog' | 'Cat'
export type AdequacyMethod = 'formulated' | 'feeding_test' | 'intermittent'
export type LifeStage = 'growth' | 'maintenance' | 'all' | 'gestation'

const LIFE_STAGE_LABEL: Record<LifeStage, string> = {
  growth: 'growth',
  maintenance: 'adult maintenance',
  all: 'all life stages',
  gestation: 'gestation and lactation',
}

/** Ingredient names in descending order of predominance. Stable for ties. */
export function petIngredientOrder(items: PetIngredient[]): string[] {
  return items
    .filter((i) => i.name.trim())
    .map((i, idx) => ({ i, idx }))
    .sort((a, b) => b.i.weight - a.i.weight || a.idx - b.idx)
    .map((x) => x.i.name.trim())
}

/** Guaranteed Analysis rows in AAFCO order. */
export function formatGuaranteedAnalysis(ga: GuaranteedAnalysis): { label: string; value: string }[] {
  const rows = [
    { label: 'Crude Protein (min)', value: `${ga.crudeProteinMinPct}%` },
    { label: 'Crude Fat (min)', value: `${ga.crudeFatMinPct}%` },
    { label: 'Crude Fiber (max)', value: `${ga.crudeFiberMaxPct}%` },
    { label: 'Moisture (max)', value: `${ga.moistureMaxPct}%` },
  ]
  for (const o of ga.others ?? []) {
    if (!o.name.trim()) continue
    rows.push({ label: `${o.name.trim()} (${o.bound})`, value: `${o.value}${o.unit || '%'}` })
  }
  return rows
}

/** The standard AAFCO nutritional-adequacy statement. */
export function adequacyStatement(
  productName: string,
  species: PetSpecies,
  lifeStage: LifeStage,
  method: AdequacyMethod,
): string {
  const p = productName.trim() || 'This product'
  const stage = LIFE_STAGE_LABEL[lifeStage]
  switch (method) {
    case 'formulated':
      return `${p} is formulated to meet the nutritional levels established by the AAFCO ${species} Food Nutrient Profiles for ${stage}.`
    case 'feeding_test':
      return `Animal feeding tests using AAFCO procedures substantiate that ${p} provides complete and balanced nutrition for ${stage}.`
    case 'intermittent':
      return `${p} is intended for intermittent or supplemental feeding only.`
  }
}
