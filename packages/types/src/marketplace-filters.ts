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
  // Cross-domain
  { value: 'POWDER', label: 'Powder', domains: ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'COSMETIC'] },
  { value: 'LIQUID', label: 'Liquid', domains: ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'COSMETIC', 'OTC'] },
  // Supplement / nutraceutical dosage forms
  { value: 'CAPSULE', label: 'Capsule', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'TABLET', label: 'Tablet', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'CHEWABLE_TABLET', label: 'Chewable tablet', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'SOFTGEL', label: 'Softgel', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'GUMMY', label: 'Gummy', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'FOOD', 'PET_PRODUCT'] },
  { value: 'SOFT_CHEW', label: 'Soft chew', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'PET_PRODUCT'] },
  { value: 'LOZENGE', label: 'Lozenge', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'ORAL_STRIP', label: 'Dissolvable strip', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'SUBLINGUAL', label: 'Sublingual', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'TINCTURE', label: 'Tincture / dropper', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT'] },
  { value: 'STICK_PACK', label: 'Stick pack', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'FOOD'] },
  { value: 'SACHET', label: 'Sachet', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'FOOD', 'COSMETIC'] },
  { value: 'JELLY_STICK', label: 'Jelly stick', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'FOOD'] },
  { value: 'EFFERVESCENT', label: 'Effervescent', group: 'Supplement', domains: ['DIETARY_SUPPLEMENT', 'FOOD'] },
  // Beverage
  { value: 'READY_TO_DRINK', label: 'Ready-to-drink', group: 'Beverage', domains: ['FOOD'] },
  { value: 'CONCENTRATE', label: 'Concentrate', group: 'Beverage', domains: ['FOOD'] },
  { value: 'LIQUID_SHOT', label: 'Liquid shot', group: 'Beverage', domains: ['FOOD', 'DIETARY_SUPPLEMENT'] },
  { value: 'SYRUP', label: 'Syrup', group: 'Beverage', domains: ['FOOD', 'OTC'] },
  { value: 'JUICE', label: 'Juice', group: 'Beverage', domains: ['FOOD'] },
  { value: 'SMOOTHIE', label: 'Smoothie', group: 'Beverage', domains: ['FOOD'] },
  { value: 'KOMBUCHA', label: 'Kombucha', group: 'Beverage', domains: ['FOOD'] },
  { value: 'SPARKLING_WATER', label: 'Sparkling water', group: 'Beverage', domains: ['FOOD'] },
  { value: 'TEA', label: 'Tea', group: 'Beverage', domains: ['FOOD'] },
  { value: 'COFFEE', label: 'Coffee', group: 'Beverage', domains: ['FOOD'] },
  // Food
  { value: 'BAR', label: 'Bar', group: 'Food', domains: ['FOOD', 'PET_PRODUCT'] },
  { value: 'HARD_CANDY', label: 'Hard candy', group: 'Food', domains: ['FOOD'] },
  { value: 'CHOCOLATE', label: 'Chocolate', group: 'Food', domains: ['FOOD'] },
  { value: 'BAKED_GOOD', label: 'Baked good', group: 'Food', domains: ['FOOD'] },
  { value: 'COOKIE', label: 'Cookie', group: 'Food', domains: ['FOOD'] },
  { value: 'CRACKERS', label: 'Crackers', group: 'Food', domains: ['FOOD'] },
  { value: 'SNACK', label: 'Snack', group: 'Food', domains: ['FOOD'] },
  { value: 'CHIPS', label: 'Chips / crisps', group: 'Food', domains: ['FOOD'] },
  { value: 'POPCORN', label: 'Popcorn', group: 'Food', domains: ['FOOD'] },
  { value: 'GRANOLA', label: 'Granola', group: 'Food', domains: ['FOOD'] },
  { value: 'CEREAL', label: 'Cereal', group: 'Food', domains: ['FOOD'] },
  { value: 'OATMEAL', label: 'Oatmeal / hot cereal', group: 'Food', domains: ['FOOD'] },
  { value: 'PASTA', label: 'Pasta / noodles', group: 'Food', domains: ['FOOD'] },
  { value: 'INSTANT_MIX', label: 'Instant mix', group: 'Food', domains: ['FOOD', 'DIETARY_SUPPLEMENT'] },
  { value: 'PUDDING', label: 'Pudding', group: 'Food', domains: ['FOOD'] },
  { value: 'YOGURT', label: 'Yogurt', group: 'Food', domains: ['FOOD'] },
  { value: 'JAM', label: 'Jam / preserves', group: 'Food', domains: ['FOOD'] },
  { value: 'HONEY', label: 'Honey', group: 'Food', domains: ['FOOD'] },
  { value: 'SAUCE', label: 'Sauce / condiment', group: 'Food', domains: ['FOOD'] },
  { value: 'DRESSING', label: 'Dressing', group: 'Food', domains: ['FOOD'] },
  { value: 'DIP', label: 'Dip', group: 'Food', domains: ['FOOD'] },
  { value: 'SPREAD', label: 'Spread / nut butter', group: 'Food', domains: ['FOOD'] },
  { value: 'SEASONING', label: 'Seasoning / spice', group: 'Food', domains: ['FOOD'] },
  { value: 'DRIED_FRUIT', label: 'Dried fruit', group: 'Food', domains: ['FOOD'] },
  { value: 'NUTS_SEEDS', label: 'Nuts / seeds', group: 'Food', domains: ['FOOD'] },
  { value: 'JERKY', label: 'Jerky', group: 'Food', domains: ['FOOD', 'PET_PRODUCT'] },
  { value: 'BROTH', label: 'Broth', group: 'Food', domains: ['FOOD', 'PET_PRODUCT'] },
  { value: 'SOUP', label: 'Soup', group: 'Food', domains: ['FOOD'] },
  { value: 'FROZEN', label: 'Frozen', group: 'Food', domains: ['FOOD'] },
  { value: 'OIL', label: 'Oil', group: 'Food', domains: ['FOOD', 'COSMETIC'] },
  // Cosmetic / personal care
  { value: 'CREAM', label: 'Cream', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'LOTION', label: 'Lotion', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'SERUM', label: 'Serum', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'GEL', label: 'Gel', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'BALM', label: 'Balm', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'BUTTER', label: 'Body butter', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'MIST', label: 'Mist', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'SPRAY', label: 'Spray', group: 'Cosmetic', domains: ['COSMETIC', 'DIETARY_SUPPLEMENT', 'OTC'] },
  { value: 'MASK', label: 'Mask', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'SHEET_MASK', label: 'Sheet mask', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'SCRUB', label: 'Scrub / exfoliant', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'PEEL', label: 'Peel', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'CLEANSER', label: 'Cleanser / face wash', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'TONER', label: 'Toner', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'ESSENCE', label: 'Essence', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'AMPOULE', label: 'Ampoule', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'STICK', label: 'Stick (solid)', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'ROLLERBALL', label: 'Roll-on', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'SOAP_BAR', label: 'Bar soap', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'BODY_WASH', label: 'Body wash', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'BUBBLE_BATH', label: 'Bubble bath', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'BATH_BOMB', label: 'Bath bomb', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'BATH_SALT', label: 'Bath salt', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'SHAMPOO', label: 'Shampoo', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'DRY_SHAMPOO', label: 'Dry shampoo', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'CONDITIONER', label: 'Conditioner', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'POMADE', label: 'Pomade / styling', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'HAIR_SPRAY', label: 'Hair spray', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'HAIR_WAX', label: 'Hair wax', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'HAIR_DYE', label: 'Hair dye / color', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'DEODORANT', label: 'Deodorant', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'TOOTHPASTE', label: 'Toothpaste', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'MOUTHWASH', label: 'Mouthwash', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'SUNSCREEN', label: 'Sunscreen', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'HAND_SANITIZER', label: 'Hand sanitizer', group: 'Cosmetic', domains: ['COSMETIC', 'OTC'] },
  { value: 'PERFUME', label: 'Perfume / fragrance', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'FOUNDATION', label: 'Foundation', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'CONCEALER', label: 'Concealer', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'MASCARA', label: 'Mascara', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'EYELINER', label: 'Eyeliner', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'EYESHADOW', label: 'Eyeshadow', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'LIPSTICK', label: 'Lipstick', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'LIP_GLOSS', label: 'Lip gloss', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'BLUSH', label: 'Blush', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'BRONZER', label: 'Bronzer', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'NAIL_POLISH', label: 'Nail polish', group: 'Cosmetic', domains: ['COSMETIC'] },
  { value: 'WIPES', label: 'Wipes', group: 'Cosmetic', domains: ['COSMETIC', 'OTC', 'PET_PRODUCT'] },
  // Pet
  { value: 'KIBBLE', label: 'Kibble (dry food)', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'WET_FOOD', label: 'Wet / canned food', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'FRESH_FOOD', label: 'Fresh food', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'FREEZE_DRIED', label: 'Freeze-dried', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'AIR_DRIED', label: 'Air-dried', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'RAW', label: 'Raw', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'TREAT', label: 'Treat', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'BISCUIT', label: 'Biscuit', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'DENTAL_CHEW', label: 'Dental chew', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'GRAVY', label: 'Gravy', group: 'Pet', domains: ['PET_PRODUCT', 'FOOD'] },
  { value: 'LICKABLE', label: 'Lickable / purée', group: 'Pet', domains: ['PET_PRODUCT'] },
  { value: 'PASTE', label: 'Paste', group: 'Pet', domains: ['PET_PRODUCT', 'DIETARY_SUPPLEMENT'] },
  { value: 'FOOD_TOPPER', label: 'Food topper', group: 'Pet', domains: ['PET_PRODUCT'] },
  // OTC drug forms
  { value: 'OINTMENT', label: 'Ointment', group: 'OTC', domains: ['OTC'] },
  { value: 'DROPS', label: 'Drops (eye / ear)', group: 'OTC', domains: ['OTC'] },
  { value: 'NASAL_SPRAY', label: 'Nasal spray', group: 'OTC', domains: ['OTC'] },
  { value: 'INHALER', label: 'Inhaler', group: 'OTC', domains: ['OTC'] },
  { value: 'SUSPENSION', label: 'Oral suspension', group: 'OTC', domains: ['OTC'] },
  { value: 'PATCH', label: 'Patch', group: 'OTC', domains: ['OTC'] },
  { value: 'SUPPOSITORY', label: 'Suppository', group: 'OTC', domains: ['OTC'] },
  { value: 'MEDICATED_PAD', label: 'Medicated pad', group: 'OTC', domains: ['OTC'] },
  { value: 'MEDICATED_SHAMPOO', label: 'Medicated shampoo', group: 'OTC', domains: ['OTC'] },
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
