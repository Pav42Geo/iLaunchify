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
}

/** Format = ManufacturingFormat enum values (single-select). */
export const FORMAT_OPTIONS: FilterOption[] = [
  { value: 'POWDER', label: 'Powder' },
  { value: 'CAPSULE', label: 'Capsule', group: 'Supplement' },
  { value: 'TABLET', label: 'Tablet', group: 'Supplement' },
  { value: 'SOFTGEL', label: 'Softgel', group: 'Supplement' },
  { value: 'GUMMY', label: 'Gummy', group: 'Supplement' },
  { value: 'SOFT_CHEW', label: 'Soft chew', group: 'Supplement' },
  { value: 'READY_TO_DRINK', label: 'Ready-to-drink', group: 'Beverage' },
  { value: 'CONCENTRATE', label: 'Concentrate', group: 'Beverage' },
  { value: 'EFFERVESCENT', label: 'Effervescent', group: 'Beverage' },
  { value: 'LIQUID', label: 'Liquid' },
  { value: 'BAR', label: 'Bar', group: 'Food' },
  { value: 'CREAM', label: 'Cream', group: 'Cosmetic' },
  { value: 'LOTION', label: 'Lotion', group: 'Cosmetic' },
  { value: 'SERUM', label: 'Serum', group: 'Cosmetic' },
  { value: 'OIL', label: 'Oil', group: 'Cosmetic' },
  { value: 'BALM', label: 'Balm', group: 'Cosmetic' },
  { value: 'SPRAY', label: 'Spray', group: 'Cosmetic' },
]

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
