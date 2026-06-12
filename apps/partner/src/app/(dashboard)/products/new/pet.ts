// Pet product labeling (AAFCO Model Regulations) — Phase 3.
//
// Pet food/treats don't use a Nutrition/Supplement Facts box. The required pieces:
//   1. Ingredient list — descending order of predominance by weight.
//   2. Guaranteed Analysis — min % crude protein, min % crude fat, max % crude
//      fiber, max % moisture (other nutrients voluntary).
//   3. Nutritional-adequacy statement — "complete and balanced" for a life stage
//      (formulated-to-meet OR feeding-test), or "intermittent/supplemental only".
//   4. Feeding directions (required for complete & balanced products).
// Pure + framework-free so it's unit-testable. docs/PRODUCT_DOMAINS_ARCHITECTURE.md.

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
