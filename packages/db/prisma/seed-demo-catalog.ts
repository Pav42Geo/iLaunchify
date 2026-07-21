// Demo catalog — six PUBLISHED products, one per StructuralPackType ("product
// type"), spanning all four label domains, with varied die-lines + flavors so the
// marketplace, PackBuilder (variety), sample, and checkout flows can all be
// crash-tested on real data:
//
//   1. SINGLE_UNIT             · Cosmetic   · bottle  · 1 flavor   (INCI panel)
//   2. MULTI_UNIT_SAME         · Food       · pouch   · 1 flavor   (Nutrition)
//   3. MULTI_FLAVOR_MIXED      · Food       · can     · 3 flavors  (PackBuilder)
//   4. MULTI_FLAVOR_COMPARTMENT· Pet        · pouch   · 2 flavors  (Guaranteed Analysis)
//   5. PER_FLAVOR_IN_OUTER     · Supplement · sachet  · 3 flavors  (Supplement Facts)
//   6. CUSTOMIZABLE_PICK_N     · Food       · box     · 5 flavors  (Nutrition, pick-6)
//
// Owned Products are minted under the demo brand for the domains the owned-side
// ProductCategory enum supports (Food/Beverage/Supplement/Cosmetic/Pet — the
// latter two require `pnpm db:push && db:generate` after the enum change).
//
// Additive + idempotent. Runs AFTER seedDemoCreator (needs the demo brand).

import { PrismaClient } from '@prisma/client'

type Domain = 'FOOD' | 'DIETARY_SUPPLEMENT' | 'COSMETIC' | 'PET_PRODUCT'
type OwnedCat = 'FOOD' | 'BEVERAGE_FUNCTIONAL' | 'SUPPLEMENT' | 'COSMETIC' | 'PET' | null

interface Nutri { [k: string]: number }
interface FoodReplacement { name: string; labelName: string; weightGOverride?: number; allergens?: string[]; n: Nutri }
interface FoodSlot { name: string; labelName: string; weightG: number; allergens?: string[]; n: Nutri; replacements?: FoodReplacement[] }
interface FoodOptional { name: string; labelName: string; weightG: number; allergens?: string[]; callout: string; n: Nutri }

interface ProductSpec {
  slug: string
  name: string
  description: string
  about: string
  subcategorySlug: string
  domain: Domain
  ownedCategory: OwnedCat
  dieCutSlug: string
  packingProfileSlug: string
  packingType: string
  flavorArrangement: 'SINGLE' | 'MIXED' | 'SEPARATED'
  maxFlavorsPerPack?: number
  // Variety-pack model (docs/VARIETY_PACK_MODEL.md §4-6). Optional — only the
  // pick-N demo authors these; cast-written so a stale client still seeds.
  minFlavorsPerPack?: number
  flavorFillRule?: 'CREATOR_CHOOSES' | 'EVEN_AUTO' | 'MANUFACTURER_FIXED'
  pricingBasis?: 'PER_FLAVOR' | 'PER_PACK'
  /** §8 — flavor policy. PARTNER_FIXED = a fixed assortment the creator can't edit. */
  flavorPolicy?: 'CREATOR_PICK' | 'PARTNER_FIXED'
  /** §8 — fixed assortment (base pack), keyed by flavor NAME [{flavor,qty}]. The
   *  seed writes it onto every offered size variant; the engine scales it. */
  assortment?: { flavor: string; qty: number }[]
  /** Offered pack sizes (one ProductTemplateVariant per size). */
  packSizes?: { unitsPerPack: number; moqPacks: number; pricePerPackCents?: number | null }[]
  /** PER_FLAVOR absolute per-unit price (cents) for each flavor, by index. */
  flavorUnitPriceCents?: number[]
  container: string
  servingSizeG: number
  servingsPerContainer: number
  net: { value: number; unit: string; display: string }
  price: { floorCents: number; costCents: number }
  tiers: { minQty: number; maxQty: number | null; perUnitCostCents: number; perUnitFloorCents: number }[]
  flavors?: { name: string; color: string; soi?: string }[]
  packaging: { id: string; name: string; icon: string; leadTimeDays: number; priceDelta: number }[]
  food?: { slots: FoodSlot[]; optionals?: FoodOptional[] }
  formulationData?: object
  niches?: { slug: string; isPrimary: boolean }[]
  lifestyleTags?: string[]
  sample: { perFlavorCents: number; samplerSetCents?: number }
}

// --------------------------------------------------------------------------
// Specs
// --------------------------------------------------------------------------
const SPECS: ProductSpec[] = [
  // 1. SINGLE_UNIT — Cosmetic face serum (bottle).
  {
    slug: 'demo-vitamin-c-serum',
    name: 'Vitamin C Brightening Serum',
    description: 'A single-SKU facial serum — demo of a single-unit cosmetic with an INCI declaration.',
    about: 'A lightweight vitamin-C serum. Demo product for the single-unit cosmetic flow (INCI ingredient declaration, no Nutrition Facts).',
    subcategorySlug: 'serums',
    domain: 'COSMETIC',
    ownedCategory: 'COSMETIC',
    dieCutSlug: 'oval-2.5x6',
    packingProfileSlug: 'single-flavor-single-pack',
    packingType: 'SINGLE_FLAVOR_SINGLE_PACK',
    flavorArrangement: 'SINGLE',
    container: '30 mL bottle',
    servingSizeG: 1,
    servingsPerContainer: 1,
    net: { value: 30, unit: 'mL', display: '1 fl oz (30 mL)' },
    price: { floorCents: 480, costCents: 620 },
    tiers: [
      { minQty: 500, maxQty: 1999, perUnitCostCents: 620, perUnitFloorCents: 520 },
      { minQty: 2000, maxQty: null, perUnitCostCents: 540, perUnitFloorCents: 460 },
    ],
    flavors: [{ name: 'Original', color: '#F4B740' }],
    formulationData: {
      cosmetic: {
        ingredients: [
          { uid: 'aqua', inciName: 'Aqua', pct: 70, isColorAdditive: false, isFragrance: false },
          { uid: 'ascorbic', inciName: 'Ascorbic Acid', pct: 15, isColorAdditive: false, isFragrance: false },
          { uid: 'glycerin', inciName: 'Glycerin', pct: 8, isColorAdditive: false, isFragrance: false },
          { uid: 'ferulic', inciName: 'Ferulic Acid', pct: 0.5, isColorAdditive: false, isFragrance: false },
          { uid: 'tocopherol', inciName: 'Tocopherol', pct: 1, isColorAdditive: false, isFragrance: false },
        ],
        netContentsQty: 30,
        netContentsUnit: 'mL',
        responsiblePerson: 'Demo Brand LLC, San Jose, CA',
        adverseEventContact: 'safety@demobrand.example.com',
      },
    },
    niches: [{ slug: 'beauty', isPrimary: true }],
    lifestyleTags: ['vegan'],
    packaging: [
      { id: 'dropper-30', name: 'Glass dropper bottle (30 mL)', icon: '💧', leadTimeDays: 14, priceDelta: 0 },
      { id: 'airless-30', name: 'Airless pump bottle (30 mL)', icon: '🧴', leadTimeDays: 18, priceDelta: 0.4 },
      { id: 'frosted-30', name: 'Frosted glass bottle (30 mL)', icon: '🫙', leadTimeDays: 16, priceDelta: 0.25 },
    ],
    sample: { perFlavorCents: 1200 },
  },

  // 2. MULTI_UNIT_SAME — Food protein bar, single flavor, 12-pack (pouch).
  {
    slug: 'demo-protein-bar-12pack',
    name: 'Almond Cocoa Protein Bar (12-pack)',
    description: 'Single-flavor protein bar sold as a 12-pack — demo of the same-flavor multipack type.',
    about: 'A baked almond-cocoa protein bar, sold twelve to a box. Demo of the single-flavor multipack product type with a real Nutrition Facts panel.',
    subcategorySlug: 'protein-bars',
    domain: 'FOOD',
    ownedCategory: 'FOOD',
    dieCutSlug: 'pouch-front-5x7',
    packingProfileSlug: 'single-flavor-multipack',
    packingType: 'SINGLE_FLAVOR_MULTIPACK',
    flavorArrangement: 'SINGLE',
    // §8 — single-flavor multipack → PACK_ONE_FLAVOR. Offered sizes drive the pack
    // flow (creator picks ONE flavor + a size); per-pack flat pricing.
    pricingBasis: 'PER_PACK',
    packSizes: [
      { unitsPerPack: 6, moqPacks: 200, pricePerPackCents: 1380 },
      { unitsPerPack: 12, moqPacks: 100, pricePerPackCents: 2520 },
      { unitsPerPack: 24, moqPacks: 60, pricePerPackCents: 4800 },
    ],
    container: '12-bar box',
    servingSizeG: 50,
    servingsPerContainer: 12,
    net: { value: 600, unit: 'g', display: '12 bars · 21.2 oz (600 g)' },
    price: { floorCents: 180, costCents: 230 },
    tiers: [
      { minQty: 500, maxQty: 2499, perUnitCostCents: 230, perUnitFloorCents: 190 },
      { minQty: 2500, maxQty: null, perUnitCostCents: 200, perUnitFloorCents: 165 },
    ],
    flavors: [{ name: 'Almond Cocoa', color: '#6B4423' }],
    food: {
      slots: [
        { name: 'Dates (demo)', labelName: 'Dates', weightG: 20, n: { calories: 282, totalCarbohydrate: 75, totalSugars: 63, dietaryFiber: 8, protein: 2.5 } },
        { name: 'Almonds (demo)', labelName: 'Almonds', weightG: 12, allergens: ['tree_nuts'], n: { calories: 579, totalFat: 50, saturatedFat: 3.8, totalCarbohydrate: 22, dietaryFiber: 12, protein: 21 } },
        { name: 'Whey Protein (demo)', labelName: 'Whey Protein Isolate', weightG: 12, allergens: ['milk'], n: { calories: 360, protein: 85, totalCarbohydrate: 5, sodium: 200 },
          replacements: [{ name: 'Pea Protein (demo)', labelName: 'Pea Protein', weightGOverride: 12, n: { calories: 375, protein: 80, totalCarbohydrate: 7 } }] },
        { name: 'Cocoa (demo)', labelName: 'Cocoa', weightG: 6, n: { calories: 228, totalFat: 14, totalCarbohydrate: 58, dietaryFiber: 33, protein: 20 } },
      ],
      optionals: [
        { name: 'Sea Salt (demo)', labelName: 'Sea Salt', weightG: 0.3, callout: 'Salted-chocolate finish', n: { calories: 0, sodium: 38758 } },
        { name: 'Chia (demo)', labelName: 'Chia Seeds', weightG: 3, callout: 'Adds omega-3 + fiber', n: { calories: 486, totalFat: 31, totalCarbohydrate: 42, dietaryFiber: 34, protein: 17 } },
      ],
    },
    niches: [{ slug: 'energy-performance', isPrimary: true }],
    lifestyleTags: ['gluten-free'],
    packaging: [
      { id: 'flowwrap', name: 'Flow-wrap (per bar)', icon: '🍫', leadTimeDays: 12, priceDelta: 0 },
      { id: 'carton-12', name: '12-bar carton', icon: '📦', leadTimeDays: 14, priceDelta: 0.3 },
      { id: 'kraft-box', name: 'Kraft retail box', icon: '🟫', leadTimeDays: 16, priceDelta: 0.45 },
    ],
    sample: { perFlavorCents: 600 },
  },

  // 3. MULTI_FLAVOR_MIXED — Food sparkling water variety 6-pack (can). PackBuilder.
  {
    slug: 'demo-sparkling-water-variety',
    name: 'Sparkling Water Variety (6-pack)',
    description: 'Mixed-flavor sparkling water 6-pack — demo of the multi-flavor variety type + PackBuilder.',
    about: 'Lightly flavored sparkling water, sold as a mixed 6-pack the creator composes from the flavor pool. Demo of the variety-pack PackBuilder.',
    subcategorySlug: 'sparkling-water',
    domain: 'FOOD',
    ownedCategory: 'FOOD',
    dieCutSlug: 'wrap-4x12',
    packingProfileSlug: 'multi-flavor-mixed',
    packingType: 'MULTI_FLAVOR_MIXED_PACK',
    flavorArrangement: 'MIXED',
    maxFlavorsPerPack: 3,
    // §8 — fixed-assortment variety pack → PACK_FIXED. The manufacturer sets the
    // mix (2 lime / 2 grapefruit / 2 black cherry per 6-pack); it scales to the
    // 12 + 24 sizes. Flat per-pack pricing; creator picks only the size.
    flavorPolicy: 'PARTNER_FIXED',
    pricingBasis: 'PER_PACK',
    assortment: [
      { flavor: 'Lime', qty: 2 },
      { flavor: 'Grapefruit', qty: 2 },
      { flavor: 'Black Cherry', qty: 2 },
    ],
    packSizes: [
      { unitsPerPack: 6, moqPacks: 200, pricePerPackCents: 960 },
      { unitsPerPack: 12, moqPacks: 120, pricePerPackCents: 1860 },
      { unitsPerPack: 24, moqPacks: 60, pricePerPackCents: 3600 },
    ],
    container: '6 × 355 mL can',
    servingSizeG: 355,
    servingsPerContainer: 1,
    net: { value: 355, unit: 'mL', display: '12 fl oz (355 mL) per can' },
    price: { floorCents: 120, costCents: 150 },
    tiers: [
      { minQty: 1000, maxQty: 4999, perUnitCostCents: 150, perUnitFloorCents: 120 },
      { minQty: 5000, maxQty: null, perUnitCostCents: 130, perUnitFloorCents: 105 },
    ],
    flavors: [
      { name: 'Lime', color: '#B5FF3D', soi: 'Lime sparkling water' },
      { name: 'Grapefruit', color: '#FF6F61', soi: 'Grapefruit sparkling water' },
      { name: 'Black Cherry', color: '#7B2D43', soi: 'Black cherry sparkling water' },
    ],
    food: {
      slots: [
        { name: 'Carbonated Water (demo)', labelName: 'Carbonated Water', weightG: 352, n: { calories: 0 } },
        { name: 'Natural Flavor (demo)', labelName: 'Natural Flavor', weightG: 2.5, n: { calories: 0 } },
        { name: 'Citric Acid (demo)', labelName: 'Citric Acid', weightG: 0.5, n: { calories: 0 } },
      ],
    },
    niches: [{ slug: 'healthy-lifestyle', isPrimary: true }],
    lifestyleTags: ['sugar-free', 'vegan'],
    packaging: [
      { id: 'slim-can', name: '355 mL slim can', icon: '🥤', leadTimeDays: 14, priceDelta: 0 },
      { id: 'std-can', name: '355 mL standard can', icon: '🥫', leadTimeDays: 14, priceDelta: 0 },
      { id: 'sleek-can', name: '355 mL sleek can (matte)', icon: '🪙', leadTimeDays: 18, priceDelta: 0.15 },
    ],
    sample: { perFlavorCents: 400, samplerSetCents: 1500 },
  },

  // 4. MULTI_FLAVOR_COMPARTMENT — Pet treats, 2 flavors (pouch). Guaranteed Analysis.
  {
    slug: 'demo-dog-treats-duo',
    name: 'Grain-Free Dog Treats (2-flavor)',
    description: 'Two-flavor dog treats in separate compartments — demo of the multi-flavor compartment type + Guaranteed Analysis.',
    about: 'Grain-free baked dog treats in two flavors kept in separate compartments. Demo of the pet domain (AAFCO Guaranteed Analysis) + compartment pack type.',
    subcategorySlug: 'pet-treats',
    domain: 'PET_PRODUCT',
    ownedCategory: 'PET',
    dieCutSlug: 'pouch-front-5x7',
    packingProfileSlug: 'multi-flavor-compartment',
    packingType: 'MULTI_FLAVOR_COMPARTMENT_PACK',
    flavorArrangement: 'SEPARATED',
    maxFlavorsPerPack: 2,
    // §8 — compartmented fixed assortment → PACK_FIXED. Equal chicken/salmon split
    // per pouch, scaling to the larger sizes. Flat per-pack pricing.
    flavorPolicy: 'PARTNER_FIXED',
    pricingBasis: 'PER_PACK',
    assortment: [
      { flavor: 'Chicken', qty: 1 },
      { flavor: 'Salmon', qty: 1 },
    ],
    packSizes: [
      { unitsPerPack: 2, moqPacks: 250, pricePerPackCents: 600 },
      { unitsPerPack: 4, moqPacks: 150, pricePerPackCents: 1140 },
    ],
    container: '200 g pouch',
    servingSizeG: 10,
    servingsPerContainer: 20,
    net: { value: 200, unit: 'g', display: '7 oz (200 g)' },
    price: { floorCents: 240, costCents: 300 },
    tiers: [
      { minQty: 500, maxQty: 1999, perUnitCostCents: 300, perUnitFloorCents: 250 },
      { minQty: 2000, maxQty: null, perUnitCostCents: 260, perUnitFloorCents: 215 },
    ],
    flavors: [
      { name: 'Chicken', color: '#E2A24A' },
      { name: 'Salmon', color: '#F08060' },
    ],
    formulationData: {
      pet: {
        ingredients: [
          { uid: 'chicken', name: 'Deboned Chicken', weight: 40 },
          { uid: 'sweetpotato', name: 'Sweet Potato', weight: 25 },
          { uid: 'chickpea', name: 'Chickpeas', weight: 20 },
          { uid: 'flax', name: 'Flaxseed', weight: 8 },
          { uid: 'mixedtoco', name: 'Mixed Tocopherols (preservative)', weight: 1 },
        ],
        ga: { crudeProteinMinPct: 28, crudeFatMinPct: 12, crudeFiberMaxPct: 5, moistureMaxPct: 12, others: [{ name: 'Omega-3 Fatty Acids', value: 0.4, bound: 'min', unit: '%' }] },
        species: 'Dog',
        lifeStage: 'maintenance',
        method: 'formulated',
        feedingDirections: 'Feed as a treat. No more than 10% of daily caloric intake. Fresh water always available.',
      },
    },
    niches: [{ slug: 'pet-wellness', isPrimary: true }],
    lifestyleTags: ['grain-free'],
    packaging: [
      { id: 'resealable', name: 'Resealable kraft pouch (200 g)', icon: '🛍️', leadTimeDays: 12, priceDelta: 0 },
      { id: 'compostable', name: 'Compostable pouch (200 g)', icon: '🌱', leadTimeDays: 16, priceDelta: 0.25 },
      { id: 'tub-pet', name: 'Resealable tub (200 g)', icon: '🪣', leadTimeDays: 18, priceDelta: 0.4 },
    ],
    sample: { perFlavorCents: 500, samplerSetCents: 1800 },
  },

  // 5. PER_FLAVOR_IN_OUTER — Supplement greens sachets, 3 flavors (sachet/sticker). Supplement Facts.
  {
    slug: 'demo-greens-sachets',
    name: 'Daily Greens Sachets (3-flavor)',
    description: 'Single-serve greens sachets, each flavor its own pack in an outer box — demo of per-flavor-in-outer + Supplement Facts.',
    about: 'A daily greens blend in single-serve sachets, three flavors, each individually wrapped in an outer box. Demo of the supplement domain (Supplement Facts) + per-flavor-in-outer pack type.',
    subcategorySlug: 'greens-powders',
    domain: 'DIETARY_SUPPLEMENT',
    ownedCategory: 'SUPPLEMENT',
    dieCutSlug: 'sticker-2x3',
    packingProfileSlug: 'multi-flavor-individual-in-outer',
    packingType: 'MULTI_FLAVOR_INDIVIDUAL_IN_OUTER',
    flavorArrangement: 'SEPARATED',
    maxFlavorsPerPack: 3,
    // #34 (2026-07-19): the 20-sachet outer box IS the pack size. Without this the
    // template had no authored unitsPerPack, so getVarietyPackMatrix.enabled was
    // false and checkout fell to the legacy split while the PDP synthesized a
    // fabricated fallback. moqPacks 25 preserves the 500-unit floor (500 / 20).
    packSizes: [{ unitsPerPack: 20, moqPacks: 25 }],
    // #37 (2026-07-19): a PER_FLAVOR pack prices on its flavors' unit prices. Without
    // these the pack priced to $0 and the creator paid nothing for the goods. Per-sachet
    // price = the tier's per-unit cost (260c), so a pack order charges the same goods a
    // non-pack order would at the band. Aligned to the authored band, not invented.
    pricingBasis: 'PER_FLAVOR',
    flavorUnitPriceCents: [260, 260, 260],
    container: '20-sachet box',
    servingSizeG: 8,
    servingsPerContainer: 20,
    net: { value: 160, unit: 'g', display: '20 sachets · 5.6 oz (160 g)' },
    price: { floorCents: 200, costCents: 260 },
    tiers: [
      { minQty: 500, maxQty: 1999, perUnitCostCents: 260, perUnitFloorCents: 220 },
      { minQty: 2000, maxQty: null, perUnitCostCents: 230, perUnitFloorCents: 190 },
    ],
    flavors: [
      { name: 'Original', color: '#3F7D3A' },
      { name: 'Berry', color: '#8E3B6B' },
      { name: 'Citrus', color: '#E5B73B' },
    ],
    formulationData: {
      supplement: {
        dietaryIngredients: [
          { uid: 'spirulina', name: 'Organic Spirulina', amount: 1500, unit: 'mg', percentDV: '', blendId: '', isOther: false },
          { uid: 'chlorella', name: 'Organic Chlorella', amount: 1000, unit: 'mg', percentDV: '', blendId: '', isOther: false },
          { uid: 'vitc', name: 'Vitamin C (as ascorbic acid)', amount: 90, unit: 'mg', percentDV: '100', blendId: '', isOther: false },
          { uid: 'vitb12', name: 'Vitamin B12 (as methylcobalamin)', amount: 2.4, unit: 'mcg', percentDV: '100', blendId: '', isOther: false },
        ],
        blends: [],
        servingForm: '1 sachet (8 g)',
        servingsPerContainer: 20,
      },
    },
    niches: [{ slug: 'wellness', isPrimary: true }],
    lifestyleTags: ['vegan', 'sugar-free'],
    packaging: [
      { id: 'carton-20', name: '20-sachet carton', icon: '📦', leadTimeDays: 14, priceDelta: 0 },
      { id: 'eco-refill', name: 'Eco refill box (40 sachets)', icon: '♻️', leadTimeDays: 18, priceDelta: 0.2 },
      { id: 'travel-tin', name: 'Travel tin (10 sachets)', icon: '🥫', leadTimeDays: 16, priceDelta: 0.35 },
    ],
    sample: { perFlavorCents: 500, samplerSetCents: 1200 },
  },

  // 6. CUSTOMIZABLE_PICK_N — Food protein bars, pick 6 from 5 flavors (box). Nutrition.
  {
    slug: 'demo-build-your-bar-box',
    name: 'Build-Your-Own Bar Box (pick 6)',
    description: 'Pick 6 bars from 5 flavors — demo of the customizable pick-N pack type.',
    ratingAvg: 4.8,
    ratingCount: 36,
    manufacturingProcesses: ['small-batch'],
    about: 'A build-your-own protein-bar box: the creator (and end buyer) pick 6 bars from a pool of 5 flavors. Demo of the customizable pick-N pack type with a real Nutrition Facts panel.',
    subcategorySlug: 'granola-bars',
    domain: 'FOOD',
    ownedCategory: 'FOOD',
    dieCutSlug: 'rect-3x4',
    packingProfileSlug: 'customizable-pick-n',
    packingType: 'CUSTOMIZABLE_PICK_N',
    flavorArrangement: 'MIXED',
    // Variety-pack model: distinct-flavor cap 3, floor 2; creator fills the
    // remaining pack units; per-flavor pricing. Offered pack sizes 6 / 12 / 24
    // (units-per-pack = the size). docs/VARIETY_PACK_MODEL.md §4-6.
    maxFlavorsPerPack: 3,
    minFlavorsPerPack: 2,
    flavorFillRule: 'CREATOR_CHOOSES',
    pricingBasis: 'PER_FLAVOR',
    packSizes: [
      { unitsPerPack: 6, moqPacks: 100 },
      { unitsPerPack: 12, moqPacks: 60 },
      { unitsPerPack: 24, moqPacks: 40 },
    ],
    // PER_FLAVOR absolute per-unit prices (cents), aligned to the flavor list.
    flavorUnitPriceCents: [250, 270, 280, 260, 255],
    container: 'Build-your-own 6-box',
    servingSizeG: 45,
    servingsPerContainer: 6,
    net: { value: 270, unit: 'g', display: '6 bars · 9.5 oz (270 g)' },
    price: { floorCents: 200, costCents: 250 },
    tiers: [
      { minQty: 500, maxQty: 2499, perUnitCostCents: 250, perUnitFloorCents: 210 },
      { minQty: 2500, maxQty: null, perUnitCostCents: 220, perUnitFloorCents: 180 },
    ],
    flavors: [
      { name: 'Peanut Butter', color: '#C68B3C' },
      { name: 'Chocolate Chip', color: '#4A2C2A' },
      { name: 'Blueberry', color: '#4F5BD5' },
      { name: 'Lemon', color: '#E8D03A' },
      { name: 'Apple Cinnamon', color: '#C0492B' },
    ],
    food: {
      slots: [
        { name: 'Rolled Oats (demo)', labelName: 'Rolled Oats', weightG: 22, n: { calories: 379, totalCarbohydrate: 67, dietaryFiber: 10, protein: 13, totalFat: 6.5 } },
        { name: 'Honey (demo)', labelName: 'Honey', weightG: 10, n: { calories: 304, totalCarbohydrate: 82, totalSugars: 82 } },
        { name: 'Peanut Butter (demo)', labelName: 'Peanut Butter', weightG: 10, allergens: ['peanuts'], n: { calories: 588, totalFat: 50, saturatedFat: 10, totalCarbohydrate: 20, dietaryFiber: 6, protein: 25, sodium: 17 },
          replacements: [{ name: 'Sunflower Butter (demo)', labelName: 'Sunflower Seed Butter', weightGOverride: 10, n: { calories: 617, totalFat: 55, totalCarbohydrate: 18, dietaryFiber: 7, protein: 17 } }] },
        { name: 'Brown Rice Crisp (demo)', labelName: 'Brown Rice Crisps', weightG: 3, n: { calories: 387, totalCarbohydrate: 86, protein: 7 } },
      ],
      optionals: [
        { name: 'Dark Chocolate (demo)', labelName: 'Dark Chocolate Chips', weightG: 5, allergens: ['milk'], callout: 'Adds a chocolate drizzle', n: { calories: 480, totalFat: 31, saturatedFat: 18, totalCarbohydrate: 61, totalSugars: 48, protein: 4 } },
      ],
    },
    niches: [{ slug: 'energy-performance', isPrimary: true }],
    lifestyleTags: ['vegetarian'],
    packaging: [
      { id: 'byo-box', name: 'Build-your-own box (6)', icon: '📦', leadTimeDays: 14, priceDelta: 0 },
      { id: 'mailer', name: 'Branded mailer box', icon: '📬', leadTimeDays: 18, priceDelta: 0.5 },
      { id: 'gift-box', name: 'Premium gift box', icon: '🎁', leadTimeDays: 21, priceDelta: 0.9 },
    ],
    sample: { perFlavorCents: 600, samplerSetCents: 2200 },
  },
]

// --------------------------------------------------------------------------
// Generator
// --------------------------------------------------------------------------
async function ensureIngredient(prisma: PrismaClient, name: string, labelName: string, n: Nutri, allergens: string[]) {
  const existing = await prisma.ingredient.findFirst({ where: { name }, select: { id: true } })
  const data = {
    internalName: labelName,
    labelDeclarationName: labelName,
    nutritionPer100g: n as object,
    allergenFlags: allergens,
    allergens,
    source: 'LIBRARY' as never,
    ownerPartnerId: null,
    verificationStatus: 'LIBRARY_PROMOTED' as never,
  }
  if (existing) {
    await prisma.ingredient.update({ where: { id: existing.id }, data })
    return existing.id
  }
  const created = await prisma.ingredient.create({ data: { name, ...data }, select: { id: true } })
  return created.id
}

export async function seedDemoCatalog(prisma: PrismaClient) {
  console.log('Seeding demo catalog (6 product types × domains)...')

  const manuf = await prisma.partnerService.findFirst({ where: { type: 'MANUFACTURING' }, select: { id: true } })

  // Marketplace products are MANUFACTURER-owned templates — public, orderable by
  // any active creator. A creator only owns a Product once they draft (Start
  // Launching) or order. So we do NOT mint creator-owned Products here, and we
  // clean up any that an earlier seed wrongly created for these demo templates
  // (best-effort — skips any with real orders attached via FK).
  const demoSlugs = [...SPECS.map((s) => s.slug), 'demo-adaptogen-sparkling-tonic']
  const demoTemplates = await prisma.productTemplate.findMany({ where: { slug: { in: demoSlugs } }, select: { id: true } })
  for (const t of demoTemplates) {
    await prisma.product.deleteMany({ where: { productTemplateId: t.id } }).catch(() => {})
  }

  let made = 0
  for (const spec of SPECS) {
    const sub =
      (await prisma.subcategory.findFirst({ where: { slug: spec.subcategorySlug }, select: { id: true } })) ??
      (await prisma.subcategory.findFirst({ select: { id: true } }))
    if (!sub) continue
    const profile = await prisma.packingProfile.findUnique({ where: { slug: spec.packingProfileSlug }, select: { id: true } })
    const dieCut = await prisma.dieCutTemplate.findFirst({ where: { slug: spec.dieCutSlug }, select: { id: true } })

    const marketingDetail = {
      format: spec.container,
      netWeight: spec.net.display,
      about: spec.about,
      customizationDescription: 'Customize the recipe and flavors within the manufacturer-vetted options; the label recomputes live.',
      properties: [
        { label: 'Clean label', value: 70 },
        { label: 'Customizability', value: 80 },
      ],
      flavors: (spec.flavors ?? [{ name: 'Original', color: '#E7E2D8' }]).map((f, i) => ({ id: `f${i}`, name: f.name, color: f.color })),
      packaging: spec.packaging,
    }

    // Marketplace rating + launch count (optional per spec; drives the PDP
    // "★★★★★ 4.8 · N launches" row). Cast-read so only the specs that set them
    // need the fields.
    const ratingAvg = (spec as { ratingAvg?: number }).ratingAvg ?? null
    const ratingCount = (spec as { ratingCount?: number }).ratingCount ?? 0
    const manufacturingProcesses = (spec as { manufacturingProcesses?: string[] }).manufacturingProcesses ?? []
    // Variety-pack model columns (additive; cast-written so a stale client still
    // seeds — the marketplace loader reads them cast-guarded too).
    const packModelData = {
      ...(spec.minFlavorsPerPack != null ? { minFlavorsPerPack: spec.minFlavorsPerPack } : {}),
      ...(spec.flavorFillRule ? { flavorFillRule: spec.flavorFillRule } : {}),
      ...(spec.pricingBasis ? { pricingBasis: spec.pricingBasis } : {}),
      ...(spec.flavorPolicy ? { flavorPolicy: spec.flavorPolicy } : {}),
    } as Record<string, unknown>
    const tpl = await prisma.productTemplate.upsert({
      where: { slug: spec.slug },
      update: {
        name: spec.name, subcategoryId: sub.id, manufacturerServiceId: manuf?.id ?? null,
        status: 'PUBLISHED', labelingType: spec.domain, priceFloorCents: spec.price.floorCents, unitCostCents: spec.price.costCents,
        longDescription: spec.about, marketingDetail: marketingDetail as object,
        packingProfileId: profile?.id ?? null, maxFlavorsPerPack: spec.maxFlavorsPerPack ?? null,
        ratingAvg, ratingCount, manufacturingProcesses,
        ...packModelData,
        ...(spec.formulationData ? { formulationData: spec.formulationData as object } : {}),
      } as never,
      create: {
        slug: spec.slug, name: spec.name, description: spec.description, subcategoryId: sub.id,
        manufacturerServiceId: manuf?.id ?? null, status: 'PUBLISHED', labelingType: spec.domain,
        priceFloorCents: spec.price.floorCents, unitCostCents: spec.price.costCents,
        longDescription: spec.about, marketingDetail: marketingDetail as object,
        packingProfileId: profile?.id ?? null, maxFlavorsPerPack: spec.maxFlavorsPerPack ?? null,
        ratingAvg, ratingCount, manufacturingProcesses,
        ...packModelData,
        ...(spec.formulationData ? { formulationData: spec.formulationData as object } : {}),
      } as never,
      select: { id: true },
    })

    // FOOD recipe slots (+ replacements + optionals).
    await prisma.templateOptionalIngredient.deleteMany({ where: { productTemplateId: tpl.id } })
    await prisma.templateIngredientSlot.deleteMany({ where: { productTemplateId: tpl.id } })
    if (spec.food) {
      let order = 0
      for (const slot of spec.food.slots) {
        const baseId = await ensureIngredient(prisma, slot.name, slot.labelName, slot.n, slot.allergens ?? [])
        const reps = []
        for (const r of slot.replacements ?? []) {
          const rid = await ensureIngredient(prisma, r.name, r.labelName, r.n, r.allergens ?? [])
          reps.push({ ingredientId: rid, weightGOverride: r.weightGOverride ?? null, displayOrder: reps.length })
        }
        await prisma.templateIngredientSlot.create({
          data: {
            productTemplateId: tpl.id, baseIngredientId: baseId, weightG: slot.weightG, displayOrder: order++,
            label: slot.labelName, allowReplacement: (slot.replacements?.length ?? 0) > 0,
            ...(reps.length ? { replacements: { create: reps } } : {}),
          },
        })
      }
      if (spec.food.optionals?.length) {
        let oo = 0
        for (const o of spec.food.optionals) {
          const oid = await ensureIngredient(prisma, o.name, o.labelName, o.n, o.allergens ?? [])
          await prisma.templateOptionalIngredient.create({
            data: { productTemplateId: tpl.id, ingredientId: oid, weightG: o.weightG, displayOrder: oo++, calloutText: o.callout },
          })
        }
      }
    }

    // Variant(s). For pack-based products (spec.packSizes) we author ONE
    // ProductTemplateVariant PER OFFERED SIZE (the pack matrix — VARIETY_PACK_MODEL
    // §4.2), each carrying a typed unitsPerPack + pack-MOQ; otherwise a single
    // variant as before. unitsPerPack/pricePerPackCents are cast-written.
    const baseVariantData = {
      flavor: spec.flavorArrangement === 'SINGLE' ? (spec.flavors?.[0]?.name ?? null) : null,
      containerFormat: spec.container, containerSizeG: spec.net.unit === 'g' ? spec.net.value : null,
      servingsPerContainer: spec.servingsPerContainer, servingSizeG: spec.servingSizeG,
      servingSizeDesc: `${spec.servingSizeG} ${spec.net.unit === 'mL' ? 'mL' : 'g'}`,
      netContentValue: spec.net.value, netContentUnit: spec.net.unit, netContentDisplay: spec.net.display,
      packingType: spec.packingType as never, flavorArrangement: spec.flavorArrangement as never,
      moqMax: 20000, leadTimeDays: 28,
      dieCutTemplateId: dieCut?.id ?? null,
    }
    if (spec.packSizes && spec.packSizes.length > 0) {
      // Replace all variants with one per offered pack size (idempotent).
      await prisma.productTemplateVariant.deleteMany({ where: { productTemplateId: tpl.id } }).catch(() => {})
      for (const ps of spec.packSizes) {
        await prisma.productTemplateVariant.create({
          data: {
            productTemplateId: tpl.id,
            ...baseVariantData,
            sku: `DEMO-${spec.slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-${ps.unitsPerPack}PK`,
            moqMin: ps.moqPacks,
            unitsPerPack: ps.unitsPerPack,
            pricePerPackCents: ps.pricePerPackCents ?? null,
            // §8 — fixed assortment (by flavor NAME; loaders resolve to preset ids).
            // Written onto every size; the engine scales it per unitsPerPack.
            ...(spec.assortment && spec.assortment.length > 0 ? { assortmentFlavors: spec.assortment } : {}),
          } as never,
        })
      }
    } else {
      const existingVariant = await prisma.productTemplateVariant.findFirst({ where: { productTemplateId: tpl.id }, select: { id: true } })
      const variantData = {
        ...baseVariantData,
        sku: `DEMO-${spec.slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`,
        moqMin: spec.tiers[0]?.minQty ?? 500,
      }
      if (existingVariant) await prisma.productTemplateVariant.update({ where: { id: existingVariant.id }, data: variantData })
      else await prisma.productTemplateVariant.create({ data: { productTemplateId: tpl.id, ...variantData } })
    }

    // Flavor presets (idempotent, FK-SAFE). PER_FLAVOR products carry a per-unit price
    // on each preset (unitPriceCents — additive, cast-written). A real order
    // (OrderItemFlavor) can reference a preset, which makes a blind deleteMany fail with
    // P2003 (the crash that blocked the whole seed). So delete only the UNREFERENCED
    // presets, then upsert the spec set BY NAME: a referenced preset is updated in place,
    // never orphaned or duplicated (FlavorPreset has no unique key to upsert on directly).
    await prisma.flavorPreset.deleteMany({
      where: { productTemplateId: tpl.id, orderItemFlavors: { none: {} } },
    })
    if (spec.flavors && spec.flavors.length > 0) {
      let fo = 0
      for (const f of spec.flavors) {
        const unitPriceCents = spec.flavorUnitPriceCents?.[fo] ?? null
        const data = {
          name: f.name, swatchHex: f.color, statementOfIdentity: f.soi ?? null,
          slotResolution: {} as object, sortOrder: fo,
          ...(unitPriceCents != null ? { unitPriceCents } : {}),
        }
        const existing = await prisma.flavorPreset.findFirst({
          where: { productTemplateId: tpl.id, name: f.name },
          select: { id: true },
        })
        if (existing) await prisma.flavorPreset.update({ where: { id: existing.id }, data: data as never })
        else await prisma.flavorPreset.create({ data: { productTemplateId: tpl.id, ...data } as never })
        fo++
      }
    }

    // Pricing tiers.
    await prisma.productTemplatePricingTier.deleteMany({ where: { productTemplateId: tpl.id } })
    await prisma.productTemplatePricingTier.createMany({
      data: spec.tiers.map((t, i) => ({ productTemplateId: tpl.id, sortOrder: i, minQty: t.minQty, maxQty: t.maxQty, perUnitCostCents: t.perUnitCostCents, perUnitFloorCents: t.perUnitFloorCents })),
    })

    // Sample options — UNBRANDED + BRANDED (idempotent replace).
    await prisma.productSampleOption.deleteMany({ where: { productTemplateId: tpl.id } })
    await prisma.productSampleOption.createMany({
      data: [
        { productTemplateId: tpl.id, kind: 'UNBRANDED', enabled: true, perFlavorCents: spec.sample.perFlavorCents, samplerSetCents: spec.sample.samplerSetCents ?? null, sampleMoq: 1, maxUnitsPerFlavor: 6, leadTimeDays: 10, creditTowardFirstOrder: true, creditCapCents: 5000, sortOrder: 0 },
        { productTemplateId: tpl.id, kind: 'BRANDED', enabled: true, perFlavorCents: Math.round(spec.sample.perFlavorCents * 1.6), samplerSetCents: spec.sample.samplerSetCents ? Math.round(spec.sample.samplerSetCents * 1.6) : null, sampleMoq: 1, maxUnitsPerFlavor: 4, leadTimeDays: 18, creditTowardFirstOrder: true, creditCapCents: 7500, sortOrder: 1 },
      ],
    })

    // Niche + lifestyle chips.
    for (const ns of spec.niches ?? []) {
      const niche = await prisma.niche.findUnique({ where: { slug: ns.slug }, select: { id: true } })
      if (!niche) continue
      await prisma.productTemplateNiche.upsert({
        where: { productTemplateId_nicheId: { productTemplateId: tpl.id, nicheId: niche.id } },
        update: { isPrimary: ns.isPrimary }, create: { productTemplateId: tpl.id, nicheId: niche.id, isPrimary: ns.isPrimary },
      })
    }
    for (const slug of spec.lifestyleTags ?? []) {
      const tag = await prisma.lifestyleTag.findUnique({ where: { slug }, select: { id: true } })
      if (!tag) continue
      await prisma.productTemplateLifestyleTag.upsert({
        where: { productTemplateId_lifestyleTagId: { productTemplateId: tpl.id, lifestyleTagId: tag.id } },
        update: {}, create: { productTemplateId: tpl.id, lifestyleTagId: tag.id },
      })
    }

    // Hero gallery image.
    const hue = (spec.flavors?.[0]?.color ?? '#F7D154')
    const heroSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#0B0B0C"/><rect x="150" y="90" width="100" height="220" rx="14" fill="${hue}"/><circle cx="200" cy="64" r="10" fill="#B5FF3D"/></svg>`
    const heroUri = `data:image/svg+xml;utf8,${encodeURIComponent(heroSvg)}`
    const heroAsset = await prisma.asset.upsert({
      where: { storageKey: `demo-hero-${spec.slug}` },
      update: { publicUrl: heroUri, ownerType: 'PRODUCT', ownerId: tpl.id, type: 'HERO_IMAGE', isPublic: true },
      create: { ownerType: 'PRODUCT', ownerId: tpl.id, type: 'HERO_IMAGE', storageKey: `demo-hero-${spec.slug}`, publicUrl: heroUri, mimeType: 'image/svg+xml', sizeBytes: heroSvg.length, isPublic: true },
      select: { id: true },
    })
    await prisma.productTemplate.update({ where: { id: tpl.id }, data: { imageAssetId: heroAsset.id } })

    made++
  }

  console.log(`  ✓ demo catalog: ${made} products across Food/Supplement/Cosmetic/Pet + 6 pack types.`)
}
