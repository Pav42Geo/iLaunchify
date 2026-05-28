/**
 * Rich detail data for ProductTemplates — used on the detail page.
 *
 * Kept separate from sample-templates.ts (which only carries the card-size
 * fields) so the detail page can pull deep data without bloating the
 * marketplace card-grid payload.
 *
 * Replaced with Prisma queries once ProductTemplate schema gets the
 * detail-page fields (format, productionMethod, netWeight, etc.).
 */

import type {
  FlavorOption,
  PackagingOption,
  IngredientRow,
  IngredientAddOn,
} from '@ilaunchify/ui'
import type { PanelData } from '@ilaunchify/types'

export interface TemplateDetail {
  format: string
  productionMethod: string
  netWeight: string
  customizationDescription: string
  performanceBullets: string[]
  flavors: FlavorOption[]
  packaging: PackagingOption[]
  /** Properties shown as bars under Material. 0-100. */
  properties: { label: string; value: number }[]
  ingredients: IngredientRow[]
  ingredientAddOns: IngredientAddOn[]
  /** Nutrition or Supplement Facts panel. */
  nutrition?: PanelData
  /** Markdown-ish long-form description. */
  about: string
  designReminder: string
  pictureRequest: string
  sizeChart: { size: string; servings: string; bottle: string; capsules: string }[]
  packingSpecs: {
    size: string
    box: string
    boxIn: string
    volumeCm3: string
    volumeIn3: string
    weightG: string
    weightLb: string
  }[]
}

/**
 * The flagship showcase: Adaptogen Powder Blend. All fields populated.
 */
const ADAPTOGEN: TemplateDetail = {
  format: 'Powder · 30 servings',
  productionMethod: 'Spray-dried',
  netWeight: '240 g',
  customizationDescription:
    "Custom label printing on a stand-up pouch. Front-label print covers the full pouch face with bleed. Recipe ingredients are admin-curated; the creator can swap select slots and add bonus actives.",
  performanceBullets: [
    'Adaptogenic Daily Use: Designed for daily morning rituals — ashwagandha, lion\'s mane, and rhodiola in clinically-aligned doses.',
    'Mix-Friendly: Spray-dried for fast cold-water solubility. No clumping.',
    'Clean-Label: 14 ingredients, no fillers, no artificial sweeteners.',
    'Compliance-Ready: FDA 21 CFR 101.36 supplement-facts label rendering included.',
    'Subscription-Friendly: 30-serving format aligned with monthly DTC subscription cycles.',
  ],
  flavors: [
    { id: 'unflavored', name: 'Unflavored', color: '#F3EFE8' },
    { id: 'cacao', name: 'Cacao', color: '#5A3825' },
    { id: 'berry', name: 'Berry', color: '#A82455' },
    { id: 'matcha', name: 'Matcha', color: '#7BA05B' },
  ],
  packaging: [
    {
      id: 'pouch-standup',
      name: 'Stand-up pouch (matte)',
      icon: '🛍️',
      leadTimeDays: 12,
      priceDelta: 0,
    },
    {
      id: 'pouch-resealable',
      name: 'Resealable pouch (gloss)',
      icon: '👜',
      leadTimeDays: 12,
      priceDelta: 0.4,
    },
    {
      id: 'jar-glass',
      name: 'Glass jar 250 mL',
      icon: '🫙',
      leadTimeDays: 18,
      priceDelta: 1.2,
    },
    {
      id: 'jar-pet',
      name: 'PET jar 8 oz',
      icon: '🥫',
      leadTimeDays: 14,
      priceDelta: 0.6,
    },
    {
      id: 'sachet',
      name: 'Single-serve sachets (30-pack)',
      icon: '✉️',
      leadTimeDays: 20,
      priceDelta: 1.8,
      unavailable: true,
    },
  ],
  properties: [
    { label: 'Shelf life (24 months)', value: 92 },
    { label: 'Stability at room temp', value: 80 },
    { label: 'Cold-water solubility', value: 88 },
    { label: 'Mixability', value: 75 },
  ],
  ingredients: [
    {
      id: 'ashwagandha',
      name: 'Ashwagandha root extract (KSM-66®)',
      percent: 18.3,
      allergens: [],
      replacements: [
        {
          id: 'ashwagandha-sensoril',
          name: 'Ashwagandha (Sensoril®)',
          priceDelta: 0.35,
          allergens: [],
        },
      ],
    },
    {
      id: 'lions-mane',
      name: "Lion's mane mushroom extract",
      percent: 14.0,
      allergens: [],
      replacements: [
        {
          id: 'reishi',
          name: 'Reishi mushroom extract',
          priceDelta: -0.2,
        },
        {
          id: 'cordyceps',
          name: 'Cordyceps mushroom extract',
          priceDelta: 0.1,
        },
      ],
    },
    {
      id: 'rhodiola',
      name: 'Rhodiola rosea extract',
      percent: 9.2,
    },
    {
      id: 'cacao',
      name: 'Organic cacao powder',
      percent: 22.5,
      allergens: [],
    },
    {
      id: 'mct',
      name: 'MCT oil powder',
      percent: 12.1,
      allergens: ['Coconut'],
      replacements: [
        {
          id: 'mct-acacia',
          name: 'MCT (acacia-fiber base, allergen-free)',
          priceDelta: 0.3,
          allergens: [],
        },
      ],
    },
    {
      id: 'sweetener',
      name: 'Monk fruit extract',
      percent: 4.0,
    },
    {
      id: 'natural-flavor',
      name: 'Natural flavor (proprietary blend)',
      percent: 3.0,
    },
    {
      id: 'l-theanine',
      name: 'L-Theanine (Suntheanine®)',
      percent: 8.5,
    },
    {
      id: 'magnesium',
      name: 'Magnesium glycinate',
      percent: 4.5,
    },
    {
      id: 'sea-salt',
      name: 'Himalayan pink salt',
      percent: 1.2,
    },
    {
      id: 'silica',
      name: 'Silicon dioxide (anti-caking)',
      percent: 0.8,
    },
    {
      id: 'fiber',
      name: 'Acacia gum fiber',
      percent: 1.9,
    },
  ],
  ingredientAddOns: [
    {
      id: 'addon-collagen',
      name: 'Collagen peptides',
      description: 'Type I & III bovine collagen, 5 g/serving. Boosts protein content.',
      priceDelta: 0.85,
      allergens: ['Bovine'],
    },
    {
      id: 'addon-electrolytes',
      name: 'Electrolyte blend',
      description: 'Sodium / potassium / magnesium in hydration-aligned ratios.',
      priceDelta: 0.35,
    },
    {
      id: 'addon-probiotic',
      name: 'Spore-forming probiotic',
      description: '2 B CFU shelf-stable strain. No refrigeration required.',
      priceDelta: 0.95,
    },
    {
      id: 'addon-d3',
      name: 'Vitamin D3',
      description: '1,000 IU per serving. Supports immunity claims.',
      priceDelta: 0.15,
    },
  ],
  nutrition: {
    format: 'SUPPLEMENT_FACTS',
    servingSize: '1 scoop (8 g)',
    servingsPerContainer: '30',
    rows: [
      { id: 'calories', label: 'Calories', amount: 20, indent: 0 },
      { id: 'fat', label: 'Total Fat', amount: '0.5', unit: 'g', percentDailyValue: 1, indent: 0 },
      { id: 'carbs', label: 'Total Carbohydrate', amount: 3, unit: 'g', percentDailyValue: 1, indent: 0 },
      { id: 'fiber', label: 'Dietary Fiber', amount: 2, unit: 'g', percentDailyValue: 7, indent: 1 },
      { id: 'sugars', label: 'Total Sugars', amount: 0, unit: 'g', indent: 1 },
      { id: 'protein', label: 'Protein', amount: 1, unit: 'g', indent: 0 },
      { id: 'ashwagandha-row', label: 'Ashwagandha extract', amount: 600, unit: 'mg', indent: 0 },
      { id: 'lionsmane-row', label: "Lion's mane extract", amount: 500, unit: 'mg', indent: 0 },
      { id: 'rhodiola-row', label: 'Rhodiola rosea extract', amount: 300, unit: 'mg', indent: 0 },
      { id: 'theanine-row', label: 'L-Theanine', amount: 200, unit: 'mg', indent: 0 },
      { id: 'magnesium-row', label: 'Magnesium (as glycinate)', amount: 120, unit: 'mg', percentDailyValue: 29, indent: 0 },
    ],
    requiredFooter:
      '† Daily Value not established. Percent Daily Values are based on a 2,000 calorie diet.',
    requiredWarnings: [
      'Consult a healthcare provider before use if you are pregnant, nursing, taking medication, or have a medical condition.',
    ],
  } as PanelData,
  about:
    "A daily adaptogen powder built for the morning ritual market. Spray-dried for cold-water solubility, formulated around clinically-aligned doses of ashwagandha, lion's mane, and rhodiola. Designed to slot into the wellness creator's brand without recipe surgery — pick your flavor, swap one or two ingredients if you want, choose your packaging, and your product is production-ready.",
  designReminder:
    'Product images are for reference only. The final appearance and details are subject to the actual product received. Fiber content on the supplement-facts label is uniformly based on the main fabric blend. Any after-sales claims arising from discrepancies in the care label\'s composition will not be accepted.',
  pictureRequest: '2400 px × 3000 px @ 300 DPI · CMYK',
  sizeChart: [
    { size: '240g', servings: '30 (8g scoop)', bottle: '155mm × 230mm', capsules: 'n/a' },
    { size: '480g', servings: '60', bottle: '185mm × 270mm', capsules: 'n/a' },
    { size: '720g', servings: '90', bottle: '210mm × 305mm', capsules: 'n/a' },
  ],
  packingSpecs: [
    {
      size: '240g',
      box: '12.0 × 9.5 × 5.0 cm',
      boxIn: '4.72 × 3.74 × 1.97 in',
      volumeCm3: '570',
      volumeIn3: '34.78',
      weightG: '260',
      weightLb: '0.57',
    },
    {
      size: '480g',
      box: '14.0 × 11.5 × 6.0 cm',
      boxIn: '5.51 × 4.53 × 2.36 in',
      volumeCm3: '966',
      volumeIn3: '58.95',
      weightG: '510',
      weightLb: '1.12',
    },
    {
      size: '720g',
      box: '16.0 × 13.0 × 7.5 cm',
      boxIn: '6.30 × 5.12 × 2.95 in',
      volumeCm3: '1560',
      volumeIn3: '95.20',
      weightG: '760',
      weightLb: '1.68',
    },
  ],
}

/**
 * Lookup by template slug. Falls back to a generic-but-still-useful detail
 * for templates we haven't populated yet — so every detail page renders
 * something interesting.
 */
export function findTemplateDetail(slug: string): TemplateDetail {
  return DETAILS[slug] ?? GENERIC_DETAIL
}

const DETAILS: Record<string, TemplateDetail> = {
  'adaptogen-powder-blend': ADAPTOGEN,
}

/**
 * Generic fallback — used for templates that don't have rich detail yet.
 * Smaller than ADAPTOGEN but valid in every section.
 */
const GENERIC_DETAIL: TemplateDetail = {
  format: 'Powder · 30 servings',
  productionMethod: 'Spray-dried',
  netWeight: '240 g',
  customizationDescription:
    'Front-label print customization. Recipe ingredients are admin-curated; some slots are swap-able and bonus add-ons can be enabled per template.',
  performanceBullets: [
    'Production-ready: pre-vetted across iLaunchify\'s partner network.',
    'Compliance-aligned: supplement-facts label rendering included.',
    'Subscription-friendly: 30-serving format aligns with monthly cycles.',
  ],
  flavors: [
    { id: 'unflavored', name: 'Unflavored', color: '#F3EFE8' },
    { id: 'berry', name: 'Berry', color: '#A82455' },
    { id: 'citrus', name: 'Citrus', color: '#F2B23E' },
  ],
  packaging: [
    { id: 'pouch', name: 'Stand-up pouch', icon: '🛍️', leadTimeDays: 12 },
    { id: 'jar-pet', name: 'PET jar 8 oz', icon: '🥫', leadTimeDays: 14, priceDelta: 0.6 },
    { id: 'jar-glass', name: 'Glass jar 250 mL', icon: '🫙', leadTimeDays: 18, priceDelta: 1.2 },
  ],
  properties: [
    { label: 'Shelf life (18 months)', value: 75 },
    { label: 'Cold-water solubility', value: 70 },
  ],
  ingredients: [
    { id: 'a', name: 'Primary active', percent: 30 },
    { id: 'b', name: 'Secondary blend', percent: 25 },
    { id: 'c', name: 'Cocoa powder', percent: 20 },
    { id: 'd', name: 'MCT powder', percent: 10, allergens: ['Coconut'] },
    { id: 'e', name: 'Natural flavor', percent: 8 },
    { id: 'f', name: 'Monk fruit', percent: 5 },
    { id: 'g', name: 'Salt', percent: 2 },
  ],
  ingredientAddOns: [
    {
      id: 'addon-d3',
      name: 'Vitamin D3',
      description: '1,000 IU per serving.',
      priceDelta: 0.15,
    },
    {
      id: 'addon-probiotic',
      name: 'Spore-forming probiotic',
      description: 'Shelf-stable, no refrigeration.',
      priceDelta: 0.95,
    },
  ],
  about:
    'A production-ready template across iLaunchify\'s verified partner network. Customize the recipe and label, and we handle manufacturing, printing, and fulfillment.',
  designReminder:
    'Product images are for reference only. Final appearance and details are subject to the actual product received.',
  pictureRequest: '2400 px × 3000 px @ 300 DPI · CMYK',
  sizeChart: [
    { size: '240g', servings: '30', bottle: '155mm × 230mm', capsules: 'n/a' },
    { size: '480g', servings: '60', bottle: '185mm × 270mm', capsules: 'n/a' },
  ],
  packingSpecs: [
    {
      size: '240g',
      box: '12.0 × 9.5 × 5.0 cm',
      boxIn: '4.72 × 3.74 × 1.97 in',
      volumeCm3: '570',
      volumeIn3: '34.78',
      weightG: '260',
      weightLb: '0.57',
    },
  ],
}
