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
 *  form to the product domains (LabelingType: FOOD · DIETARY_SUPPLEMENT ·
 *  PET_PRODUCT · OTC · COSMETIC) where it's plausible, so the builder's Format
 *  picker only shows formats relevant to the chosen domain (formatOptionsForDomain).
 *  `value` must match the Prisma ManufacturingFormat enum. */
export const FORMAT_OPTIONS: FilterOption[] = [
  // Cross-domain (shown first, ungrouped)
  { value: 'POWDER', label: 'Powder', domains: ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'COSMETIC'] },
  { value: 'LIQUID', label: 'Liquid', domains: ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'COSMETIC', 'OTC'] },
  // Supplement / nutraceutical dosage forms
  { value: 'CAPSULE', label: 'Capsule', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'TABLET', label: 'Tablet', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'CHEWABLE_TABLET', label: 'Chewable tablet', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT'] },
  { value: 'SOFTGEL', label: 'Softgel', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'GUMMY', label: 'Gummy', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'FOOD'] },
  { value: 'SOFT_CHEW', label: 'Soft chew', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'PET_PRODUCT'] },
  { value: 'LOZENGE', label: 'Lozenge', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'ORAL_STRIP', label: 'Dissolvable strip', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'TINCTURE', label: 'Tincture / dropper', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT'] },
  { value: 'STICK_PACK', label: 'Stick pack', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'FOOD'] },
  { value: 'EFFERVESCENT', label: 'Effervescent', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'FOOD'] },
  // Beverage
  { value: 'READY_TO_DRINK', label: 'Ready-to-drink', group: 'Beverage', domains: ['FOOD'] },
  { value: 'CONCENTRATE', label: 'Concentrate', group: 'Beverage', domains: ['FOOD'] },
  { value: 'LIQUID_SHOT', label: 'Liquid shot', group: 'Beverage', domains: ['FOOD', 'DIETARY_SUPPLEMENT'] },
  { value: 'SYRUP', label: 'Syrup', group: 'Beverage', domains: ['FOOD', 'OTC'] },
  // Food
  { value: 'BAR', label: 'Bar', group: 'Food', domains: ['FOOD', 'PET_PRODUCT'] },
  { value: 'HARD_CANDY', label: 'Hard candy', group: 'Food', domains: ['FOOD'] },
  { value: 'CHOCOLATE', label: 'Chocolate', group: 'Food', domains: ['FOOD'] },
  { value: 'BAKED_GOOD', label: 'Baked good', group: 'Food', domains: ['FOOD'] },
  { value: 'SNACK', label: 'Snack', group: 'Food', domains: ['FOOD'] },
  { value: 'SAUCE', label: 'Sauce / condiment', group: 'Food', domains: ['FOOD'] },
  { value: 'SPREAD', label: 'Spread / nut butter', group: 'Food', domains: ['FOOD'] },
  { value: 'FROZEN', label: 'Frozen', group: 'Food', domains: ['FOOD'] },
  // Cosmetic / personal care
  { value: 'CREAM', label: 'Cream', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'LOTION', label: 'Lotion', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'SERUM', label: 'Serum', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'GEL', label: 'Gel', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'OIL', label: 'Oil', group: 'Cosmetic', domains: ['COSMETIC', 'FOOD'] },
  { value: 'BALM', label: 'Balm', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'BUTTER', label: 'Body butter', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'MIST', label: 'Mist', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'SPRAY', label: 'Spray', group: 'Cosmetic', domains: ['COSMETIC', 'DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'MASK', label: 'Mask', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'SCRUB', label: 'Scrub / exfoliant', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'CLEANSER', label: 'Cleanser / wash', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'STICK', label: 'Stick (lip / solid)', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'ROLLERBALL', label: 'Roll-on', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'SOAP_BAR', label: 'Bar soap', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'SHAMPOO', label: 'Shampoo', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'CONDITIONER', label: 'Conditioner', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'POMADE', label: 'Pomade / styling', group: 'Cosmetic', domains: ['COSMETIC'] },
  // Pet
  { value: 'KIBBLE', label: 'Kibble (dry food)', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'WET_FOOD', label: 'Wet / canned food', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'FRESH_FOOD', label: 'Fresh food', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'FREEZE_DRIED', label: 'Freeze-dried', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'TREAT', label: 'Treat', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'DENTAL_CHEW', label: 'Dental chew', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'FOOD_TOPPER', label: 'Food topper', group: 'Pet', domains: ['PET_PRODUCT'] },
  // OTC drug forms
  { value: 'OINTMENT', label: 'Ointment', group: 'OTC', domains: ['OTC'] },
  { value: 'DROPS', label: 'Drops', group: 'OTC', domains: ['OTC'] },
  { value: 'PATCH', label: 'Patch', group: 'OTC', domains: ['OTC'] },
  { value: 'SUPPOSITORY', label: 'Suppository', group: 'OTC', domains: ['OTC'] },
  { value: 'MEDICATED_PAD', label: 'Medicated pad', group: 'OTC', domains: ['OTC'] },
]

/** Format options available for a product domain (LabelingType key). An unknown or
 *  empty domain returns every format (no scoping). Options without `domains` always
 *  pass. */
export function formatOptionsForDomain(domain: string | null | undefined): FilterOption[] {
  if (!domain) return FORMAT_OPTIONS
  return FORMAT_OPTIONS.filter((o) => !o.domains || o.domains.includes(domain))
}

/** Manufacturing process tags. Slugs match ProductTemplate.manufacturingProcesses
 *  (free-form String[], no enum). `domains` scopes each process to where it's used.
 *  Original 8 slugs preserved for back-compat; the rest added 2026-06-30. */
export const MANUFACTURING_PROCESS_OPTIONS: FilterOption[] = [
  // — original slugs (unchanged) —
  { value: 'cold-pressed', label: 'Cold-pressed', domains: ['FOOD', 'COSMETIC'] },
  { value: 'freeze-dried', label: 'Freeze-dried (lyophilized)', domains: ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT'] },
  { value: 'spray-dried', label: 'Spray-dried', domains: ['FOOD', 'DIETARY_SUPPLEMENT'] },
  { value: 'fermented', label: 'Fermented', domains: ['FOOD', 'DIETARY_SUPPLEMENT'] },
  { value: 'encapsulated', label: 'Encapsulated', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'cold-brew', label: 'Cold-brew', domains: ['FOOD'] },
  { value: 'high-pressure', label: 'HPP (high-pressure)', domains: ['FOOD', 'PET_PRODUCT'] },
  { value: 'small-batch', label: 'Small-batch', domains: ['FOOD', 'DIETARY_SUPPLEMENT', 'COSMETIC', 'PET_PRODUCT', 'OTC'] },
  // — supplement / nutraceutical forming —
  { value: 'tableting', label: 'Tableting (compression)', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'softgel-encapsulation', label: 'Softgel encapsulation', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'gummy-depositing', label: 'Gummy depositing', domains: ['DIETARY_SUPPLEMENT', 'FOOD'] },
  { value: 'enteric-coating', label: 'Enteric / functional coating', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'microencapsulation', label: 'Microencapsulation', domains: ['DIETARY_SUPPLEMENT', 'FOOD'] },
  { value: 'wet-granulation', label: 'Wet granulation', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'dry-blending', label: 'Dry blending', domains: ['DIETARY_SUPPLEMENT', 'FOOD', 'PET_PRODUCT'] },
  { value: 'effervescent-granulation', label: 'Effervescent granulation', domains: ['DIETARY_SUPPLEMENT', 'FOOD'] },
  // — food & beverage processing —
  { value: 'dehydrated', label: 'Dehydrated', domains: ['FOOD', 'PET_PRODUCT'] },
  { value: 'pasteurized', label: 'Pasteurized', domains: ['FOOD'] },
  { value: 'uht-aseptic', label: 'UHT / aseptic', domains: ['FOOD'] },
  { value: 'retort-canned', label: 'Retort / canned', domains: ['FOOD', 'PET_PRODUCT'] },
  { value: 'hot-fill', label: 'Hot-fill', domains: ['FOOD'] },
  { value: 'carbonated', label: 'Carbonated', domains: ['FOOD'] },
  { value: 'extrusion', label: 'Extruded', domains: ['FOOD', 'PET_PRODUCT'] },
  { value: 'baked', label: 'Baked', domains: ['FOOD'] },
  { value: 'roasted', label: 'Roasted', domains: ['FOOD'] },
  { value: 'enrobed', label: 'Enrobed / molded', domains: ['FOOD'] },
  // — cosmetic / personal care —
  { value: 'emulsified', label: 'Emulsified', domains: ['COSMETIC', 'OTC'] },
  { value: 'high-shear-mixed', label: 'High-shear mixed', domains: ['COSMETIC', 'OTC'] },
  { value: 'cold-process-saponified', label: 'Cold-process (saponified)', domains: ['COSMETIC'] },
  { value: 'anhydrous-blend', label: 'Anhydrous blend', domains: ['COSMETIC'] },
  { value: 'milled-pressed', label: 'Milled / pressed (powder)', domains: ['COSMETIC'] },
  // — cross-domain claim —
  { value: 'organic-process', label: 'Organic-certified process', domains: ['FOOD', 'DIETARY_SUPPLEMENT', 'COSMETIC', 'PET_PRODUCT'] },
]

/** Process options available for a product domain (LabelingType key). Unknown or
 *  empty domain returns all. Options without `domains` always pass. */
export function processOptionsForDomain(domain: string | null | undefined): FilterOption[] {
  if (!domain) return MANUFACTURING_PROCESS_OPTIONS
  return MANUFACTURING_PROCESS_OPTIONS.filter((o) => !o.domains || o.domains.includes(domain))
}

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
