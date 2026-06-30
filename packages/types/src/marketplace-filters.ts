// Marketplace filter option constants (docs/MARKETPLACE_DESIGN.md §7).
//
// SINGLE SOURCE OF TRUTH for the slugs/values used by BOTH:
//   - the marketing marketplace filter sidebar (what a buyer filters on), and
//   - the admin product editor (what an admin SETS on a template).
// Keeping these in one shared module guarantees the two never drift — a slug
// typed one place but filtered another would silently break the filter.
//
// Pure data, no deps — safe to import in client components and server code.

export interface FilterOption {
  value: string
  label: string
  /** Optional display grouping (e.g. domain for Format). */
  group?: string
  /** Product domains (LabelingType keys: FOOD · DIETARY_SUPPLEMENT · PET_PRODUCT ·
   *  OTC · COSMETIC) this option applies to. Used to scope the Format picker to the
   *  selected domain. Omitted = applies to every domain. */
  domains?: string[]
}

/** Format = ManufacturingFormat enum values (single-select). `domains` scopes each
 *  form to the product domains where it's plausible, so the builder's Format picker
 *  only shows formats relevant to the chosen domain (see formatOptionsForDomain). */
export const FORMAT_OPTIONS: FilterOption[] = [
  { value: 'POWDER', label: 'Powder', domains: ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'COSMETIC'] },
  { value: 'CAPSULE', label: 'Capsule', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'TABLET', label: 'Tablet', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'SOFTGEL', label: 'Softgel', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'GUMMY', label: 'Gummy', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT'] },
  { value: 'SOFT_CHEW', label: 'Soft chew', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'PET_PRODUCT'] },
  { value: 'READY_TO_DRINK', label: 'Ready-to-drink', group: 'Beverage', domains: ['FOOD'] },
  { value: 'CONCENTRATE', label: 'Concentrate', group: 'Beverage', domains: ['FOOD'] },
  { value: 'EFFERVESCENT', label: 'Effervescent', group: 'Beverage', domains: ['FOOD', 'DIETARY_SUPPLEMENT'] },
  { value: 'LIQUID', label: 'Liquid', domains: ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'COSMETIC', 'OTC'] },
  { value: 'BAR', label: 'Bar', group: 'Food', domains: ['FOOD', 'PET_PRODUCT'] },
  { value: 'CREAM', label: 'Cream', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'LOTION', label: 'Lotion', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'SERUM', label: 'Serum', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'OIL', label: 'Oil', group: 'Cosmetic', domains: ['COSMETIC', 'FOOD'] },
  { value: 'BALM', label: 'Balm', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'SPRAY', label: 'Spray', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
]

/** Format options available for a product domain (LabelingType key). An unknown or
 *  empty domain returns every format (no scoping). Options without `domains` always
 *  pass. */
export function formatOptionsForDomain(domain: string | null | undefined): FilterOption[] {
  if (!domain) return FORMAT_OPTIONS
  return FORMAT_OPTIONS.filter((o) => !o.domains || o.domains.includes(domain))
}

/** Manufacturing process tags. Slugs match ProductTemplate.manufacturingProcesses. */
export const MANUFACTURING_PROCESS_OPTIONS: FilterOption[] = [
  { value: 'cold-pressed', label: 'Cold-pressed' },
  { value: 'freeze-dried', label: 'Freeze-dried' },
  { value: 'spray-dried', label: 'Spray-dried' },
  { value: 'fermented', label: 'Fermented' },
  { value: 'encapsulated', label: 'Encapsulated' },
  { value: 'cold-brew', label: 'Cold-brew' },
  { value: 'high-pressure', label: 'HPP (high-pressure)' },
  { value: 'small-batch', label: 'Small-batch' },
]

/** Allergen-free claims. Slugs match ProductTemplate.allergenFreeClaims. */
export const ALLERGEN_FREE_OPTIONS: FilterOption[] = [
  { value: 'dairy-free', label: 'Dairy-free' },
  { value: 'gluten-free', label: 'Gluten-free' },
  { value: 'nut-free', label: 'Nut-free' },
  { value: 'soy-free', label: 'Soy-free' },
  { value: 'egg-free', label: 'Egg-free' },
  { value: 'shellfish-free', label: 'Shellfish-free' },
  { value: 'sesame-free', label: 'Sesame-free' },
]

/** Market options for the admin editor (multi-select; ProductTemplate.marketCodes). */
export const MARKET_FILTER_OPTIONS: FilterOption[] = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'EU', label: 'European Union' },
]

/** Lead-time buckets (single-select). Consumed by leadRange() in the query layer. */
export const LEAD_BUCKET_OPTIONS: FilterOption[] = [
  { value: 'lt2w', label: '< 2 weeks' },
  { value: '2-4w', label: '2–4 weeks' },
  { value: '4-8w', label: '4–8 weeks' },
  { value: '8w+', label: '8+ weeks' },
]

/** MOQ presets (single-select max). */
export const MOQ_PRESET_OPTIONS: FilterOption[] = [
  { value: '100', label: '≤ 100' },
  { value: '500', label: '≤ 500' },
  { value: '2000', label: '≤ 2,000' },
  { value: '5000', label: '≤ 5,000' },
]

/** ContainerCategory enum → display label (packaging parent groups). */
export const CONTAINER_CATEGORY_LABELS: Record<string, string> = {
  POUCH: 'Pouches',
  BOTTLE: 'Bottles',
  CAN: 'Cans',
  JAR: 'Jars',
  TUBE: 'Tubes',
  SACHET: 'Sachets',
  STICK_PACK: 'Sticks',
  BOX: 'Boxes',
  CARTON: 'Cartons',
  CASE: 'Cases',
  OTHER: 'Other',
}

/** Human label for a Format enum value (active-filter chips). */
export function formatLabel(value: string): string {
  return FORMAT_OPTIONS.find((o) => o.value === value)?.label ?? value
}

/** Human label for a lead bucket value. */
export function leadLabel(value: string): string {
  return LEAD_BUCKET_OPTIONS.find((o) => o.value === value)?.label ?? value
}

/** Human label for a manufacturing-process slug. */
export function processLabel(value: string): string {
  return MANUFACTURING_PROCESS_OPTIONS.find((o) => o.value === value)?.label ?? value
}
