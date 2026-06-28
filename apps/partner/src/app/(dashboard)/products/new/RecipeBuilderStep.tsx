'use client'

// Step 3 content — faithful port of docs/prototypes/recipe-builder-demo.html.
// Ingredients (base + replaceable + optional) · ReciPal Packaging & Serving ·
// Cost Summary · live Nutrition Facts (Public/Preview). The live label is
// computed by the real @ilaunchify/nutrition engine, not a mock.

import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ComponentType } from 'react'
import { ChefHat, List, ShieldAlert, DollarSign, Tag, FolderOpen, LayoutGrid, Utensils, Sparkles, Scale, ListPlus, ListChecks, FlaskConical, Table, ArrowLeftRight } from 'lucide-react'
import { toast } from 'sonner'
import { calculateLabel, toPanelData, perContainerPanel, assessSimplified, publicSelection, previewSelection, resolveConfiguredSelection, formatNetWeight, toGrams, type RecipeRow, type Nutrients, type OptionOverlay, type NutritionAudience } from '@ilaunchify/nutrition'
import { NutritionFactsSvg, type VarietyColumn } from '@ilaunchify/ui'
import { getDomain, legacyLabelingType, type DomainKey } from './product-domains'
import { IngredientPicker } from '../[id]/edit/cards/IngredientPicker'
import { type OptionAxisUI, type OptionValueUI } from './OptionAxesCard'
import { type Flavor, type FlavorLine } from './VariantsPacksStep'
import { LabelViewerModal } from './LabelViewerModal'
import { searchIngredients, type IngredientResult } from '../[id]/edit/ingredient-actions'
import { getIngredientNutrition, saveRecipeSlots, listMyRecipes, loadSlotCosts, setIntendedAgeGroup, saveFlavors, type MyRecipe } from './build-actions'
import { ModeChooser, type Mode } from './ModeChooser'
import { AiParserPanel, type CommittedParseLine } from './AiParserPanel'
import { DeclaredPanelPanel } from './DeclaredPanelPanel'
import { AllergensCard } from './AllergensCard'

// Small demo ingredient library (per-100g) so the engine produces real numbers.
// Swaps to the live IngredientPicker (USDA/library/private) when wired.
const LIBRARY: Array<{ id: string; name: string; per100g: Partial<Nutrients>; cents: number }> = [
  { id: 'water', name: 'Carbonated water', per100g: {}, cents: 1 },
  { id: 'yuzu', name: 'Yuzu juice concentrate', per100g: { calories: 50, totalCarbohydrate: 12, totalSugars: 9 }, cents: 60 },
  { id: 'monk', name: 'Monk fruit extract', per100g: { calories: 0 }, cents: 220 },
  { id: 'cane', name: 'Cane sugar', per100g: { calories: 387, totalCarbohydrate: 100, totalSugars: 100 }, cents: 12 },
  { id: 'whey', name: 'Whey protein concentrate', per100g: { calories: 400, protein: 80, totalFat: 7, saturatedFat: 4, totalCarbohydrate: 8, sodium: 200 }, cents: 90 },
  { id: 'cocoa', name: 'Cocoa powder', per100g: { calories: 228, protein: 20, totalFat: 14, totalCarbohydrate: 58, dietaryFiber: 33 }, cents: 40 },
  { id: 'salt', name: 'Sea salt', per100g: { sodium: 38758 }, cents: 5 },
]

// Per-100g nutrient fallback for catalog ingredients that were seeded WITHOUT
// nutrition data (the starter-template ingredients persist `nutritionPer100g: {}`,
// so applying a template / picking those rows would otherwise yield an all-zero
// Facts label). Real catalog/USDA per100g always wins — this only fills the gap
// when a row carries none. Values are USDA-approximate per 100 g edible portion.
const NUTRIENT_FALLBACK: Array<{ match: RegExp; per100g: Partial<Nutrients> }> = [
  { match: /carbonated water|sparkling water|filtered water|\bwater\b/, per100g: {} },
  { match: /glucose syrup|corn syrup/, per100g: { calories: 316, totalCarbohydrate: 79, totalSugars: 79 } },
  { match: /cane sugar|granulated sugar|\bsugar\b/, per100g: { calories: 387, totalCarbohydrate: 100, totalSugars: 100 } },
  { match: /citric acid/, per100g: { calories: 247, totalCarbohydrate: 63 } },
  { match: /whey protein/, per100g: { calories: 400, protein: 80, totalFat: 7, saturatedFat: 4, totalCarbohydrate: 8, totalSugars: 5, sodium: 200 } },
  { match: /cocoa/, per100g: { calories: 228, protein: 20, totalFat: 14, saturatedFat: 8, totalCarbohydrate: 58, dietaryFiber: 33 } },
  { match: /sea salt|table salt|\bsalt\b/, per100g: { sodium: 38758 } },
  { match: /stevia|monk fruit|erythritol/, per100g: { calories: 0 } },
  { match: /lecithin/, per100g: { calories: 763, totalFat: 100, saturatedFat: 15 } },
  { match: /caffeine|beta-?alanine|citrulline|tyrosine|premix/, per100g: { calories: 0 } },
  { match: /\boats?\b|oatmeal|whole grain oat/, per100g: { calories: 389, protein: 17, totalFat: 7, saturatedFat: 1, totalCarbohydrate: 66, dietaryFiber: 11, totalSugars: 1 } },
  { match: /sunflower oil|vegetable oil|canola oil|olive oil/, per100g: { calories: 884, totalFat: 100, saturatedFat: 11 } },
  { match: /vinegar/, per100g: { calories: 18, totalCarbohydrate: 0.9 } },
  { match: /spirulina/, per100g: { calories: 290, protein: 57, totalFat: 8, totalCarbohydrate: 24, dietaryFiber: 4, sodium: 1048 } },
  { match: /chlorella/, per100g: { calories: 410, protein: 58, totalFat: 9, totalCarbohydrate: 23, dietaryFiber: 13 } },
  { match: /wheatgrass|barley grass/, per100g: { calories: 350, protein: 25, totalCarbohydrate: 45, dietaryFiber: 35 } },
  { match: /acai/, per100g: { calories: 70, totalFat: 5, totalCarbohydrate: 4, dietaryFiber: 2 } },
  { match: /pectin|xanthan gum|gellan gum|guar gum/, per100g: { calories: 325, totalCarbohydrate: 90, dietaryFiber: 90 } },
  { match: /cayenne|chili|pepper mash|hot pepper/, per100g: { calories: 40, protein: 1.9, totalCarbohydrate: 8.8, dietaryFiber: 1.5, totalSugars: 5 } },
  { match: /garlic/, per100g: { calories: 149, protein: 6.4, totalCarbohydrate: 33, dietaryFiber: 2.1, totalSugars: 1 } },
  { match: /\bflour\b|\bwheat\b/, per100g: { calories: 364, protein: 10, totalFat: 1, totalCarbohydrate: 76, dietaryFiber: 2.7, totalSugars: 0.3 } },
  { match: /honey/, per100g: { calories: 304, totalCarbohydrate: 82, totalSugars: 82 } },
]

/** Per-100g nutrients for an ingredient name when the catalog carries none. */
function fallbackPer100g(name: string): Record<string, number> | null {
  if (!name) return null
  const n = name.toLowerCase()
  const hit = NUTRIENT_FALLBACK.find((e) => e.match.test(n))
  return hit ? (hit.per100g as Record<string, number>) : null
}

interface Row {
  uid: string
  ingId: string
  qty: number
  unit: string
  waste: number
  category: 'base' | 'optional'
  selected: boolean // optional: ticked into preview
  // Inline nutrient data for rows added from the real IngredientPicker (USDA /
  // library / private). Seeded demo rows leave these undefined and resolve via
  // the demo LIBRARY.
  name?: string
  per100g?: Record<string, number>
  densityGPerMl?: number | null
  // Big-9 allergen flags carried from the ingredient → drive the label "Contains:"
  // statement (FALCPA / 21 CFR 101.4(b)).
  allergens?: string[]
  // Manufacturer's ingredient cost (¢ per kg) — drives the real cost summary.
  // Stored canonically per-kg; the row's costUnit only changes how it's entered.
  costPerKgCents?: number | null // primary currency (currencies[0]) cost, per-kg
  costUnit?: string // cost-entry basis: 'kg' | 'lb' | 'g' | 'oz'
  // Per-kg cost in each NON-primary market currency, keyed by ISO code. The
  // primary currency stays on costPerKgCents (persisted); these are client-side.
  costByCurrencyCents?: Record<string, number>
  // Account-defined custom measures for this row (e.g. "1 case = 500 g"). Each
  // stores grams per 1 unit; selecting one in the Unit dropdown converts by it.
  customUnits?: Array<{ name: string; grams: number }>
}

let counter = 0
const uid = () => `r${++counter}`

// FALCPA Big-9 → label display names + canonical print order (21 CFR 101.4(b)).
// Accepts the various flag spellings seen across USDA / library / private rows.
const ALLERGEN_LABELS: Record<string, string> = {
  milk: 'Milk', eggs: 'Eggs', egg: 'Eggs', fish: 'Fish',
  shellfish: 'Shellfish', crustacean_shellfish: 'Shellfish', crustacean: 'Shellfish',
  tree_nuts: 'Tree Nuts', treenuts: 'Tree Nuts', 'tree-nuts': 'Tree Nuts',
  peanuts: 'Peanuts', peanut: 'Peanuts', wheat: 'Wheat',
  soybeans: 'Soy', soybean: 'Soy', soy: 'Soy', sesame: 'Sesame',
}
const ALLERGEN_ORDER = ['Milk', 'Eggs', 'Fish', 'Shellfish', 'Tree Nuts', 'Peanuts', 'Wheat', 'Soy', 'Sesame']

// Net-contents casing: the term (NET WT) + US-customary units (OZ, LB, FL OZ)
// print uppercase, but SI metric SYMBOLS keep their mandated case (g, mg, kg, mL;
// L stays capital for liter). FDA 21 CFR 101.105 / FPLA + SI symbol rules.
function netUpper(s: string): string {
  return s
    .toUpperCase()
    .replace(/\bMG\b/g, 'mg')
    .replace(/\bKG\b/g, 'kg')
    .replace(/\bML\b/g, 'mL')
    .replace(/\bG\b/g, 'g')
}

/** "Milk, Soy, Wheat" from a set of flags — deduped to display names, in the FDA
 *  canonical order. The renderer prefixes "Contains:". '' when none. */
function formatContains(flags: Iterable<string>): string {
  const names = new Set<string>()
  for (const f of flags) {
    const label = ALLERGEN_LABELS[f.toLowerCase().trim()]
    if (label) names.add(label)
  }
  return ALLERGEN_ORDER.filter((n) => names.has(n)).join(', ')
}

// Selectable recipe units (mirrors the engine's AVAILABLE_UNITS, minus 'each'
// which needs a per-piece weight we don't capture). Volume units only convert
// to mass with a density, so they're shown only for ingredients that have one.
const VOLUME_UNITS = new Set(['ml', 'l', 'fl_oz', 'cup', 'tbsp', 'tsp'])
const UNIT_LABELS: Record<string, string> = { g: 'g', kg: 'kg', oz: 'oz', lb: 'lb', ml: 'ml', l: 'L', fl_oz: 'fl oz', cup: 'cup', tbsp: 'tbsp', tsp: 'tsp' }
const SELECTABLE_UNITS = ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'fl_oz', 'cup', 'tbsp', 'tsp']
// Serving / package weight unit choices (ReciPal: grams · kg · oz · lb + volume).
const WEIGHT_UNITS = ['g', 'kg', 'oz', 'lb', 'ml', 'fl_oz']
// Cost-entry basis units → grams per 1 unit. Cost is stored canonically per-kg.
const COST_UNITS = ['kg', 'lb', 'g', 'oz']
const COST_UNIT_G: Record<string, number> = { kg: 1000, lb: 453.592, g: 1, oz: 28.3495 }
// Display symbol per ISO currency (the Cost column follows the product's market).
const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$', CAD: 'C$', EUR: '€', GBP: '£', AUD: 'A$', MXN: 'MX$', JPY: '¥',
}
const curSym = (ccy: string) => CURRENCY_SYMBOL[ccy] ?? `${ccy} `
const UNIT_FULL: Record<string, string> = { g: 'grams', kg: 'kilograms', oz: 'ounces', lb: 'pounds', ml: 'milliliters', fl_oz: 'fluid ounces' }
// FDA reference serving sizes (RACC, 21 CFR 101.12) by food group — the typical
// household measure + its gram weight. Selecting one in "Find serving" fills the
// descriptive serving and the serving-size weight. (Representative subset.)
const RACC: Array<{ group: string; serving: string; grams: number }> = [
  { group: 'Bakery Products', serving: '1 piece', grams: 55 },
  { group: 'Beverages', serving: '8 fl oz', grams: 240 },
  { group: 'Cereals and Other Grain Products', serving: '1 cup', grams: 40 },
  { group: 'Dairy Products and Substitutes', serving: '1 cup', grams: 240 },
  { group: 'Desserts', serving: '1/2 cup', grams: 85 },
  { group: 'Dessert Toppings and Fillings', serving: '2 tbsp', grams: 30 },
  { group: 'Egg and Egg Substitutes', serving: '1 egg', grams: 50 },
  { group: 'Fats and Oils', serving: '1 tbsp', grams: 14 },
  { group: 'Fish, Shellfish, Game Meats, and Meat or Poultry Substitutes', serving: '3 oz', grams: 85 },
  { group: 'Fruits and Fruit Juices', serving: '1 cup', grams: 140 },
  { group: 'Legumes', serving: '1/2 cup', grams: 130 },
  { group: 'Miscellaneous', serving: '1 serving', grams: 30 },
  { group: 'Mixed Dishes', serving: '1 cup', grams: 140 },
  { group: 'Nuts and Seeds', serving: '1 oz', grams: 30 },
  { group: 'Potatoes and Sweet Potatoes/Yams', serving: '1/2 cup', grams: 90 },
  { group: 'Salads', serving: '1 cup', grams: 100 },
  { group: 'Sauces, Dips, Gravies, and Condiments', serving: '2 tbsp', grams: 30 },
  { group: 'Snacks', serving: '1 oz', grams: 30 },
  { group: 'Soups', serving: '1 cup', grams: 245 },
  { group: 'Sugars and Sweets', serving: '1 piece', grams: 40 },
  { group: 'Vegetables', serving: '1 cup', grams: 85 },
]
const RACC_INFANT: Array<{ group: string; serving: string; grams: number }> = [
  { group: 'Cereals, dry instant', serving: '15 g', grams: 15 },
  { group: 'Cereals, prepared, ready-to-serve', serving: '110 g', grams: 110 },
  { group: 'Other cereal and grain products, dry ready-to-eat', serving: '7 g', grams: 7 },
  { group: 'Dinners, desserts, fruits, vegetables or soups, dry mix', serving: '15 g', grams: 15 },
  { group: 'Dinners, desserts, fruits, vegetables or soups, ready-to-serve, junior type', serving: '110 g', grams: 110 },
  { group: 'Dinners, desserts, fruits, vegetables or soups, ready-to-serve, strained type', serving: '60 g', grams: 60 },
  { group: 'Dinners, stews or soups for young children, ready-to-serve', serving: '170 g', grams: 170 },
  { group: 'Fruits for young children, ready-to-serve', serving: '125 g', grams: 125 },
  { group: 'Vegetables for young children, ready-to-serve', serving: '70 g', grams: 70 },
  { group: 'Eggs/egg yolks, ready-to-serve', serving: '55 g', grams: 55 },
  { group: 'Juices, all varieties', serving: '120 mL', grams: 120 },
]

// Pink "active" dot shown next to the ingredient currently in the recipe (base
// when no swap is active, otherwise the active replaceable). Mirrors the prototype.
const DOT_STYLE: CSSProperties = { width: 8, height: 8, borderRadius: '50%', background: 'var(--pink)', display: 'inline-block', marginLeft: 6, verticalAlign: 'middle' }
// Circular action button: the base ingredient's "＋ add replaceable" and each
// replaceable's "⇄ activate" share this chrome (filled/accented when active).
const iconBtnStyle = (active: boolean): CSSProperties => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: `1.5px solid ${active ? 'var(--pink-700)' : 'var(--ink-300)'}`, background: active ? 'var(--pink-50)' : 'transparent', color: active ? 'var(--pink-700)' : 'var(--ink-500)', cursor: 'pointer', fontSize: 14, fontWeight: 700, lineHeight: 1, padding: 0, flex: '0 0 auto' })

type TabKey = 'build' | 'ingredients' | 'allergens' | 'cost' | 'label' | 'recipes' | 'templates'
const TABS: Array<{ key: TabKey; label: string; icon: ComponentType<{ className?: string }>; soon?: boolean }> = [
  { key: 'build', label: 'BUILD RECIPE', icon: ChefHat },
  { key: 'ingredients', label: 'INGREDIENTS', icon: List },
  { key: 'allergens', label: 'ALLERGENS', icon: ShieldAlert },
  { key: 'cost', label: 'COST', icon: DollarSign },
  { key: 'label', label: 'LABEL', icon: Tag },
  { key: 'recipes', label: 'MY RECIPES', icon: FolderOpen },
  { key: 'templates', label: 'RECIPE TEMPLATES', icon: LayoutGrid },
]

// Curated starter formulations (V1, code-defined — a content set admin can move
// to a model later). Ingredients are resolved against the live catalog at apply
// time by search term, so each template is a starting scaffold the partner refines.
const RECIPE_TEMPLATES: Array<{ id: string; name: string; desc: string; items: Array<{ search: string; grams: number }> }> = [
  { id: 'sparkling', name: 'Sparkling beverage base', desc: 'Carbonated water + a touch of sweetener and acid — a clean soda scaffold.', items: [{ search: 'carbonated water', grams: 320 }, { search: 'cane sugar', grams: 18 }, { search: 'citric acid', grams: 1 }] },
  { id: 'protein', name: 'Protein shake base', desc: 'Whey protein + cocoa + sweetener — a chocolate shake scaffold.', items: [{ search: 'whey protein', grams: 30 }, { search: 'cocoa', grams: 5 }, { search: 'cane sugar', grams: 8 }] },
  { id: 'hydration', name: 'Electrolyte hydration base', desc: 'Water + a pinch of salt and sugar — a hydration scaffold.', items: [{ search: 'water', grams: 350 }, { search: 'sea salt', grams: 0.5 }, { search: 'cane sugar', grams: 6 }] },
]

export function RecipeBuilderStep({
  productName,
  flavorMode = 'SINGLE',
  maxColumns = 1,
  flavors = [],
  onFlavors,
  draftId,
  axes = [],
  onAxes,
  initialRows,
  aiAvailable = false,
  declareAvailable = false,
  domain = 'FOOD',
  initialEntryMode = null,
  initialAgeGroup = 'GENERAL',
  unitsPerPack = 1,
  currencies = ['USD'],
  registerFlush,
}: {
  productName: string
  /** Units per outer pack/box (packingConfig.unitsPerPack) — drives the
   *  multiunit net-contents statement on the variety-pack/outer-box label. */
  unitsPerPack?: number
  /** From the chosen packing type — SINGLE = one recipe, MULTI = base + presets. */
  flavorMode?: 'SINGLE' | 'MULTI'
  /** Cap on Facts columns for multi types (manufacturer picks ≤ this). */
  maxColumns?: number
  /** Shared flavor list defined in Variants & packs. Each flavor carries its
   *  own overlay lines (flavor-only ingredients with amounts). */
  flavors?: Flavor[]
  onFlavors?: (f: Flavor[]) => void
  /** Draft id — when present, real-picked base slots autosave to it. */
  draftId?: string | null
  /** Shared configurable axes — label-affecting ones bind overlays here (§12b). */
  axes?: OptionAxisUI[]
  onAxes?: (a: OptionAxisUI[]) => void
  /** Restored base recipe slots (edit mode) — seeds rows so editing shows the
   *  real recipe and the autosave round-trips instead of wiping it. */
  initialRows?: Array<{ ingId: string; name: string; per100g: Record<string, number>; densityGPerMl: number | null; weightG: number; allergens?: string[] }>
  /** Mode 2 (AI parser) enabled for this partner's plan (Trusted+). */
  aiAvailable?: boolean
  /** Mode 3 (declared panel) enabled for this partner's plan. */
  declareAvailable?: boolean
  /** Product domain — drives terminology, label kind, search source, panel
   *  format (Food / Supplement / Cosmetic / Pet / OTC). See product-domains.ts. */
  domain?: DomainKey
  /** Restored recipe entry mode (resume) — reopens the builder on that surface. */
  initialEntryMode?: Mode | null
  /** Restored Nutrition Facts audience (21 CFR 101.9(j)(5)) — FOOD only. */
  initialAgeGroup?: string
  /** ISO currency codes of the product's ACTIVE target markets (V1: ['USD']).
   *  One Cost input per currency; the first is primary (persisted per-kg). */
  currencies?: string[]
  /** Register an immediate flush of the debounced recipe/flavor autosaves. */
  registerFlush?: (fn: () => Promise<void> | void) => () => void
}) {
  // Start from the restored recipe, or empty — a new product begins with no
  // ingredients (the partner adds real ones via the picker). The old demo seed
  // rows (water/yuzu/monk) were prototype scaffolding and couldn't persist
  // (not real Ingredient rows), so they're gone.
  const [rows, setRows] = useState<Row[]>(() =>
    (initialRows ?? []).map((s) => ({ uid: uid(), ingId: s.ingId, qty: s.weightG, unit: 'g' as const, waste: 0, category: 'base' as const, selected: true, name: s.name, per100g: s.per100g, densityGPerMl: s.densityGPerMl ?? undefined, allergens: s.allergens ?? [] })),
  )
  const [search, setSearch] = useState('')
  const [addCat, setAddCat] = useState<'base' | 'optional'>('base')
  const [lmode, setLmode] = useState<'package' | 'serving'>('serving')
  const [servingSizeG, setServingSizeG] = useState(30)
  const [servingUnit, setServingUnit] = useState<string>('g')
  const [packageSizeG, setPackageSizeG] = useState(355)
  const [packageUnit, setPackageUnit] = useState<string>('g')
  const [numPackages, setNumPackages] = useState(1)
  const [servingsPerPackage, setServingsPerPackage] = useState(2)
  const [moisture, setMoisture] = useState(0)
  // Nutrition Facts audience (21 CFR 101.9(j)(5)) — switches the panel VARIANT
  // (DV table + which %DV columns/rows show). FOOD only; persisted to the draft.
  const [ageGroup, setAgeGroup] = useState<NutritionAudience>(
    (['GENERAL', 'CHILD_1_3', 'INFANT_0_12'].includes(initialAgeGroup) ? initialAgeGroup : 'GENERAL') as NutritionAudience,
  )
  const changeAgeGroup = (v: NutritionAudience) => {
    setAgeGroup(v)
    if (draftId) void setIntendedAgeGroup(draftId, v)
  }
  // Recipe-wide waste %, applied to EVERY ingredient on top of its own waste
  // (ReciPal "Recipe Waste %" in the Totals row). Drives yield, grams + cost.
  const [recipeWaste, setRecipeWaste] = useState(0)
  // FDA simplified format (21 CFR 101.9(f)) — opt-in, only offered when eligible.
  const [simplifiedOn, setSimplifiedOn] = useState(false)
  // The row whose "Add custom unit" modal is open (null = closed).
  const [customMeasureRow, setCustomMeasureRow] = useState<Row | null>(null)
  // Descriptive ("suggested") serving — the household measure printed on the
  // label, e.g. "1 cup", "1 scoop", "4 pieces". Separate from the gram weight.
  const [suggestedServing, setSuggestedServing] = useState<string>('1 serving')
  const [suggestedServingFr, setSuggestedServingFr] = useState<string>('')
  const [aggCount, setAggCount] = useState(1)
  const [findServingOpen, setFindServingOpen] = useState(false)
  const [subtab, setSubtab] = useState<'pack' | 'adv'>('pack')
  const [mode, setMode] = useState<'public' | 'preview'>('public')
  // Recipe entry method (Search / AI / Declare) + whether the chooser shows its
  // three tiles (open) or the collapsed "Built with: X · Switch mode" pill.
  // Declared is the default path for food: most manufacturers already have a
  // formulated product + COA and just need to put their values on the label.
  // Building from ingredients is the secondary path. (Decision 2026-06-13.)
  const [entryMode, setEntryMode] = useState<Mode>(initialEntryMode ?? 'DECLARED_PANEL')
  const [chooserOpen, setChooserOpen] = useState<boolean>(
    !initialEntryMode && !(initialRows && initialRows.length),
  )
  // Active Search & build tab (the 7-tab nav). BUILD is the full editor; the
  // others are focused read views.
  const [activeTab, setActiveTab] = useState<TabKey>('build')
  // Retail markup multiplier over per-serving cost (manufacturer-set; was a
  // hardcoded 4× demo). Suggested retail = per-serving cost × markup.
  const [markup, setMarkup] = useState(4)
  // The base row whose "Add replaceable ingredient" search overlay is open.
  const [addReplRow, setAddReplRow] = useState<Row | null>(null)
  // Which replaceable is currently active (swapped-in) per base ingredient:
  // base ingId → active alternative's ingredient id. Absent = the base itself is
  // active. Activating a swap previews it on the Facts label (prototype model).
  const [activeSwap, setActiveSwap] = useState<Record<string, string>>({})
  // "My recipes" reuse list — lazily loaded the first time that tab opens.
  const [myRecipes, setMyRecipes] = useState<MyRecipe[] | null>(null)
  useEffect(() => {
    if (activeTab !== 'recipes' || myRecipes !== null) return
    void listMyRecipes(draftId ?? undefined).then(setMyRecipes)
  }, [activeTab, myRecipes, draftId])
  // Restore saved per-ingredient costs once (best-effort; no-ops until migrated).
  const costsLoaded = useRef(false)
  useEffect(() => {
    if (!draftId || costsLoaded.current) return
    costsLoaded.current = true
    void loadSlotCosts(draftId).then((costs) => {
      if (Object.keys(costs).length === 0) return
      setRows((rs) => rs.map((r) => (r.category === 'base' && costs[r.ingId] != null ? { ...r, costPerKgCents: costs[r.ingId] } : r)))
    })
  }, [draftId])
  // Apply another product's formulation onto this one (replaces base, keeps optionals).
  function applyRecipe(slots: MyRecipe['slots']) {
    setRows((rs) => [
      ...slots.map((s) => ({ uid: uid(), ingId: s.ingId, qty: s.weightG, unit: 'g' as const, waste: 0, category: 'base' as const, selected: true, name: s.name, per100g: s.per100g, densityGPerMl: s.densityGPerMl ?? undefined })),
      ...rs.filter((r) => r.category === 'optional'),
    ])
    setActiveTab('build')
    toast.success('Recipe applied — review the ingredients.')
  }
  // Start from a curated template: resolve each item against the catalog, seed
  // what matches, and flag anything not found so the partner can add it.
  function applyTemplate(tpl: { name: string; items: Array<{ search: string; grams: number }> }) {
    startPick(async () => {
      const built: Row[] = []
      const missing: string[] = []
      for (const item of tpl.items) {
        const res = await searchIngredients({ query: item.search, limit: 1 })
        const match = res.ok ? res.data.results[0] : undefined
        if (!match) { missing.push(item.search); continue }
        const nut = await getIngredientNutrition(match.id)
        built.push({ uid: uid(), ingId: match.id, qty: item.grams, unit: 'g', waste: 0, category: 'base', selected: true, name: match.internalName, per100g: nut.ok ? nut.data.per100g : {}, densityGPerMl: nut.ok ? nut.data.densityGPerMl : null })
      }
      if (built.length === 0) { toast.error('Could not match any of this template’s ingredients in your catalog.'); return }
      setRows((rs) => [...built, ...rs.filter((r) => r.category === 'optional')])
      setActiveTab('build')
      toast.success(`Started from “${tpl.name}”${missing.length ? ` · ${missing.length} not in catalog — add manually` : ''}.`)
    })
  }
  // The SWAP axis bound to a given base ingredient, if any.
  const swapAxisFor = (ingId: string) =>
    axes.find((a) => a.boundSlotId === ingId && a.values.some((v) => v.overlayOp === 'SWAP'))
  // ── Replaceable ingredients (inline child rows · prototype model) ──────────
  // The SWAP alternatives bound to a base ingredient.
  const swapAltsFor = (ingId: string) => swapAxisFor(ingId)?.values.filter((v) => v.overlayOp === 'SWAP') ?? []
  // Add a replaceable alternative under the base row the overlay was opened for.
  function addReplaceable(picked: IngredientResult) {
    if (!onAxes || !addReplRow) return
    const baseRow = addReplRow
    if (picked.id === baseRow.ingId) { toast.error('That is the base ingredient.'); return }
    if (swapAltsFor(baseRow.ingId).some((v) => v.overlayIngId === picked.id)) { toast.error(`${picked.internalName} is already a replaceable.`); return }
    startPick(async () => {
      const res = await getIngredientNutrition(picked.id)
      const value: OptionValueUI = {
        label: picked.internalName, isDefault: false, leadDelta: 0, costDeltaCents: 0, moqOverride: null,
        overlayOp: 'SWAP', overlayIngId: picked.id, overlayIngName: picked.internalName, overlayPer100g: res.ok ? res.data.per100g : {},
        overlayQty: baseRow.qty, overlayUnit: baseRow.unit, overlayWaste: baseRow.waste, overlayCostPerKgCents: null, overlayDensityGPerMl: res.ok ? res.data.densityGPerMl : null,
      }
      const baseName = rowData(baseRow).name || baseRow.ingId
      const existing = axes.find((a) => a.boundSlotId === baseRow.ingId)
      onAxes(existing
        ? axes.map((a) => (a.boundSlotId === baseRow.ingId ? { ...a, values: [...a.values, value] } : a))
        : [...axes, { key: 'CUSTOM', label: `${baseName} choice`, editableByCreator: true, affectsLabel: true, boundSlotId: baseRow.ingId, values: [
            { label: baseName, isDefault: true, leadDelta: 0, costDeltaCents: 0, moqOverride: null, overlayOp: 'NONE' }, value,
          ] }])
    })
  }
  // Edit one replaceable's fields (qty/unit/waste/cost) in place.
  function patchSwapValue(baseIngId: string, swapIngId: string, p: Partial<OptionValueUI>) {
    if (!onAxes) return
    onAxes(axes.map((a) => (a.boundSlotId !== baseIngId ? a : { ...a, values: a.values.map((v) => (v.overlayOp === 'SWAP' && v.overlayIngId === swapIngId ? { ...v, ...p } : v)) })))
  }
  // Remove a replaceable; drop the whole axis if it was the last alternative.
  function removeSwapValue(baseIngId: string, swapIngId: string) {
    if (!onAxes) return
    setActiveSwap((m) => { if (m[baseIngId] !== swapIngId) return m; const n = { ...m }; delete n[baseIngId]; return n })
    onAxes(axes
      .map((a) => (a.boundSlotId !== baseIngId ? a : { ...a, values: a.values.filter((v) => !(v.overlayOp === 'SWAP' && v.overlayIngId === swapIngId)) }))
      .filter((a) => a.boundSlotId !== baseIngId || a.values.some((v) => v.overlayOp === 'SWAP')))
  }
  // Toggle which alternative is swapped-in (active). Activating previews it.
  function toggleActiveSwap(baseIngId: string, swapIngId: string) {
    const isActive = activeSwap[baseIngId] === swapIngId
    setActiveSwap((m) => { const n = { ...m }; if (isActive) delete n[baseIngId]; else n[baseIngId] = swapIngId; return n })
    if (!isActive) setMode('preview')
  }
  // Flavors come from the Variants & packs step (shared). Each = a name + its
  // own distinct flavor ingredient overlaid on the shared base, so each Facts
  // column shows DIFFERENT numbers.
  const setFlavors = (f: Flavor[]) => onFlavors?.(f)

  const ing = (id: string) => LIBRARY.find((l) => l.id === id)
  const [, startPick] = useTransition()
  // Which flavor's Facts label is shown in the tabbed preview (one per view).
  const [activeFlavor, setActiveFlavor] = useState(0)
  // Full-screen label viewer modal (compare flavors + aggregate columns).
  const [labelViewerOpen, setLabelViewerOpen] = useState(false)
  // Add a flavor-only overlay line (its own child mini-recipe row). The line
  // carries amount + unit, so the engine recomputes THAT flavor's Facts.
  function addFlavorLine(idx: number, picked: IngredientResult) {
    if ((flavors[idx]?.lines ?? []).some((l) => l.ingId === picked.id)) {
      toast.error(`${picked.internalName} is already in this flavor.`)
      return
    }
    startPick(async () => {
      const res = await getIngredientNutrition(picked.id).catch(() => undefined)
      const ok = res != null && res.ok
      const line: FlavorLine = {
        // For a live USDA pick the action materializes a real row and returns its
        // REAL id — use it so the flavor extra persists against a true FK.
        ingId: ok ? res.data.id : picked.id, name: picked.internalName, qty: 0, unit: 'g',
        per100g: ok ? res.data.per100g : {},
        densityGPerMl: ok ? res.data.densityGPerMl : picked.densityGPerML,
        allergens: ok ? res.data.allergens : (picked.allergenFlags ?? []),
      }
      setFlavors(flavors.map((f, j) => (j === idx ? { ...f, lines: [...(f.lines ?? []), line] } : f)))
    })
  }
  function patchFlavorLine(idx: number, li: number, p: Partial<FlavorLine>) {
    setFlavors(flavors.map((f, j) => (j === idx ? { ...f, lines: (f.lines ?? []).map((l, k) => (k === li ? { ...l, ...p } : l)) } : f)))
  }
  function removeFlavorLine(idx: number, li: number) {
    setFlavors(flavors.map((f, j) => (j === idx ? { ...f, lines: (f.lines ?? []).filter((_, k) => k !== li) } : f)))
  }
  // Resume: hydrate per100g for any persisted overlay line missing nutrient data
  // (extras store ingId+qty+unit, not nutrients, to avoid staleness). We track
  // already-attempted ids in a ref so an ingredient that legitimately has NO
  // nutrition data ({}), is fetched ONCE — never refetched on every render
  // (that loop was firing unbounded network requests).
  const flavorHydrated = useRef<Set<string>>(new Set())
  useEffect(() => {
    const needs = (l: FlavorLine) => l.ingId && !(l.per100g && Object.keys(l.per100g).length)
    const missing = [
      ...new Set(
        flavors.flatMap((f) => (f.lines ?? []).filter(needs).map((l) => l.ingId)),
      ),
    ].filter((id) => !flavorHydrated.current.has(id))
    if (missing.length === 0) return
    // Mark attempted up-front so a re-render before the fetch resolves can't
    // re-enqueue the same ids.
    missing.forEach((id) => flavorHydrated.current.add(id))
    startPick(async () => {
      const cache: Record<string, { per100g: Record<string, number>; density: number | null }> = {}
      for (const id of missing) {
        const res = await getIngredientNutrition(id).catch(() => undefined)
        if (res && res.ok) cache[id] = { per100g: res.data.per100g, density: res.data.densityGPerMl ?? null }
      }
      if (!Object.keys(cache).length) return
      onFlavors?.(
        flavors.map((f) => ({
          ...f,
          lines: (f.lines ?? []).map((l) => (cache[l.ingId] && needs(l) ? { ...l, per100g: cache[l.ingId]!.per100g, densityGPerMl: cache[l.ingId]!.density } : l)),
        })),
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flavors])
  // Resolve a row's nutrient data — inline (real picker) or via the demo lib.
  function rowData(r: Row): { name: string; per100g: Record<string, number>; densityGPerMl?: number | null; cents: number } {
    if (r.per100g) {
      // Catalog rows seeded without nutrition data persist `{}` — fall back to a
      // name-keyed estimate so the live label still computes. Real data wins.
      const per100g = Object.keys(r.per100g).length === 0 ? (fallbackPer100g(r.name ?? '') ?? r.per100g) : r.per100g
      return { name: r.name ?? '', per100g, densityGPerMl: r.densityGPerMl, cents: 0 }
    }
    const l = ing(r.ingId)
    return { name: l?.name ?? '', per100g: l?.per100g ?? {}, densityGPerMl: undefined, cents: l?.cents ?? 0 }
  }
  // The row's quantity converted to grams (density-aware for volume units), via
  // the engine's canonical unit table — the single basis for grams/cost/label.
  const rawGrams = (r: Row) => {
    const cu = r.customUnits?.find((c) => c.name === r.unit)
    if (cu) return r.qty * cu.grams
    return toGrams(r.qty, r.unit, { densityGPerMl: rowData(r).densityGPerMl ?? undefined })
  }
  // Effective waste for a row = its own waste compounded with the recipe-wide
  // waste (both remove mass; nutrients on the remaining mass are conserved).
  const effWaste = (rowWaste: number) => (1 - (1 - rowWaste / 100) * (1 - recipeWaste / 100)) * 100
  // The product's market currencies; the first is primary (persisted per-kg).
  const primaryCcy = currencies[0] ?? 'USD'
  // Per-kg cost stored for a row in a given currency (primary ↔ costPerKgCents).
  const costCentsFor = (r: Row, ccy: string): number | null =>
    ccy === primaryCcy ? (r.costPerKgCents ?? null) : (r.costByCurrencyCents?.[ccy] ?? null)
  // Cost entry ⇄ canonical per-kg cents, via the row's chosen cost basis unit,
  // for a specific market currency.
  const costDisplayFor = (r: Row, ccy: string): number | '' => {
    const cents = costCentsFor(r, ccy)
    if (cents == null) return ''
    const gPerUnit = COST_UNIT_G[r.costUnit ?? 'kg'] ?? 1000
    return Math.round((cents / 100) * (gPerUnit / 1000) * 100) / 100
  }
  const costPatchFor = (r: Row, ccy: string, val: string): Partial<Row> => {
    const v = parseFloat(val)
    const gPerUnit = COST_UNIT_G[r.costUnit ?? 'kg'] ?? 1000
    const cents = isNaN(v) || v < 0 ? null : Math.max(0, Math.round((v / (gPerUnit / 1000)) * 100))
    if (ccy === primaryCcy) return { costPerKgCents: cents }
    const next = { ...(r.costByCurrencyCents ?? {}) }
    if (cents == null) delete next[ccy]; else next[ccy] = cents
    return { costByCurrencyCents: next }
  }
  function handlePick(picked: IngredientResult) {
    // Duplicate guard — flag the same ingredient anywhere in the recipe, not just
    // the section being added to, so a base ingredient can't be re-added as an
    // optional (and vice-versa) by mistake.
    const existing = rows.find((r) => r.ingId === picked.id)
    if (existing) {
      toast.error(
        existing.category === addCat
          ? `${picked.internalName} is already added.`
          : `${picked.internalName} is already in your ${existing.category === 'base' ? 'main' : 'optional'} ingredients.`,
      )
      return
    }
    startPick(async () => {
      const res = await getIngredientNutrition(picked.id).catch(() => undefined)
      const ok = res != null && res.ok
      setRows((rs) => [...rs, {
        // Live USDA pick → use the materialized real id so the slot persists.
        uid: uid(), ingId: ok ? res.data.id : picked.id, qty: 0, unit: 'g', waste: 0, category: addCat, selected: addCat === 'base',
        name: picked.internalName, per100g: ok ? res.data.per100g : {}, densityGPerMl: ok ? res.data.densityGPerMl : picked.densityGPerML,
        allergens: ok ? res.data.allergens : (picked.allergenFlags ?? []),
      }])
    })
  }
  // Mode 2 → live recipe: seed the accepted AI lines as base rows (replacing the
  // existing base set, keeping optionals), then return to Search & build to
  // refine. Nutrient data is fetched per ingredient so the live label populates;
  // the existing autosave effect persists via saveRecipeSlots (single write path).
  function handleAiCommit(lines: CommittedParseLine[]) {
    startPick(async () => {
      const built: Row[] = []
      for (const l of lines) {
        const res = await getIngredientNutrition(l.ingredientId)
        built.push({
          uid: uid(), ingId: l.ingredientId, qty: l.weightG, unit: 'g', waste: 0,
          category: 'base', selected: true, name: l.name,
          per100g: res.ok ? res.data.per100g : {}, densityGPerMl: res.ok ? res.data.densityGPerMl : null,
          allergens: res.ok ? res.data.allergens : [],
        })
      }
      setRows((rs) => [...built, ...rs.filter((r) => r.category === 'optional')])
      setEntryMode('SEARCH_BUILD')
      setChooserOpen(false)
    })
  }

  const base = rows.filter((r) => r.category === 'base')
  const optional = rows.filter((r) => r.category === 'optional')

  // Autosave real-picked base slots to the draft (debounced). Demo rows (no
  // inline per100g, not a real Ingredient FK) are skipped.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    // Declared mode owns the slots server-side (one synthetic slot); never let
    // the client base rows overwrite it.
    if (entryMode === 'DECLARED_PANEL') return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const slots = rows
        .filter((r) => r.category === 'base' && r.per100g !== undefined && r.qty > 0)
        .map((r, i) => ({ ingredientId: r.ingId, weightG: rawGrams(r), displayOrder: i, costPerKgCents: r.costPerKgCents ?? null }))
      void saveRecipeSlots(draftId, slots)
    }, 1000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, draftId])

  // Autosave flavor overlays (name + soi + extras lines) while editing in the
  // Recipe step — the Variants step (the other writer) isn't mounted here, so
  // this keeps each flavor's added ingredients + amounts persisted.
  const flavorSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId || flavorMode !== 'MULTI') return
    if (flavorSaveTimer.current) clearTimeout(flavorSaveTimer.current)
    flavorSaveTimer.current = setTimeout(() => {
      void saveFlavors(draftId, flavors.map((f, i) => ({
        name: f.name, statementOfIdentity: f.soi, sortOrder: i,
        extras: (f.lines ?? []).map((l) => ({ ingredientId: l.ingId, name: l.name, qty: l.qty, unit: l.unit })),
      })))
    }, 1000)
    return () => { if (flavorSaveTimer.current) clearTimeout(flavorSaveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flavors, draftId, flavorMode])

  // Immediate flush of both debounced recipe autosaves before navigation (registry).
  const flushRef = useRef<() => Promise<void>>(async () => {})
  flushRef.current = async () => {
    if (!draftId) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (flavorSaveTimer.current) clearTimeout(flavorSaveTimer.current)
    if (entryMode !== 'DECLARED_PANEL') {
      const slots = rows
        .filter((r) => r.category === 'base' && r.per100g !== undefined && r.qty > 0)
        .map((r, i) => ({ ingredientId: r.ingId, weightG: rawGrams(r), displayOrder: i, costPerKgCents: r.costPerKgCents ?? null }))
      await saveRecipeSlots(draftId, slots)
    }
    if (flavorMode === 'MULTI') {
      await saveFlavors(draftId, flavors.map((f, i) => ({
        name: f.name, statementOfIdentity: f.soi, sortOrder: i,
        extras: (f.lines ?? []).map((l) => ({ ingredientId: l.ingId, name: l.name, qty: l.qty, unit: l.unit })),
      })))
    }
  }
  useEffect(() => {
    if (!registerFlush) return
    return registerFlush(() => flushRef.current())
  }, [registerFlush])

  function patch(u: string, p: Partial<Row>) { setRows((rs) => rs.map((r) => (r.uid === u ? { ...r, ...p } : r))) }
  function remove(u: string) { setRows((rs) => rs.filter((r) => r.uid !== u)) }
  function add(ingId: string) {
    if (rows.some((r) => r.ingId === ingId && r.category === addCat)) return
    setRows((rs) => [...rs, { uid: uid(), ingId, qty: 0, unit: 'g', waste: 0, category: addCat, selected: addCat === 'base' }])
    setSearch('')
  }

  const results = useMemo(
    () => (search.trim() ? LIBRARY.filter((l) => l.name.toLowerCase().includes(search.toLowerCase())) : LIBRARY.slice(0, 5)),
    [search],
  )

  // Build engine rows + compute the live label.
  const recipeRows: RecipeRow[] = rows.map((r) => ({
    id: r.uid, name: rowData(r).name ?? '', per100g: rowData(r).per100g ?? {},
    quantity: rawGrams(r), unit: 'g', trimWastePct: effWaste(r.waste), category: r.category, selected: r.selected,
  }))
  // Preview rows substitute any active replaceable in for its base ingredient,
  // so the Internal-preview label reflects the swapped-in choice.
  const previewEngineRows: RecipeRow[] = rows.map((r) => {
    const actIng = r.category === 'base' ? activeSwap[r.ingId] : undefined
    const v = actIng ? swapAxisFor(r.ingId)?.values.find((x) => x.overlayOp === 'SWAP' && x.overlayIngId === actIng) : undefined
    if (v) {
      const sq = v.overlayQty ?? r.qty, su = v.overlayUnit ?? r.unit
      return { id: r.uid, name: v.overlayIngName ?? '', per100g: v.overlayPer100g ?? {}, quantity: toGrams(sq, su, { densityGPerMl: v.overlayDensityGPerMl ?? undefined }), unit: 'g', trimWastePct: effWaste(v.overlayWaste ?? r.waste), category: r.category, selected: r.selected }
    }
    return { id: r.uid, name: rowData(r).name ?? '', per100g: rowData(r).per100g ?? {}, quantity: rawGrams(r), unit: 'g', trimWastePct: effWaste(r.waste), category: r.category, selected: r.selected }
  })
  const selected = mode === 'public' ? publicSelection(recipeRows) : previewSelection(previewEngineRows)
  // Serving / package weights entered in g·kg·oz·lb·ml·fl oz → grams for the engine.
  const servingGrams = toGrams(servingSizeG, servingUnit)
  const packageGrams = toGrams(packageSizeG, packageUnit)
  const geoArgs = { basis: lmode, servingSizeG: servingGrams, packageSizeG: packageGrams, servingsPerPackage, numPackages, moistureLossPct: moisture }
  // FOOD-only audience; other domains keep the standard panel.
  const audience: NutritionAudience = domain === 'FOOD' ? ageGroup : 'GENERAL'
  const result = selected.length ? calculateLabel(selected, geoArgs, { audience }) : null
  // Simplified-format eligibility (≥8 insignificant nutrients) — gates the opt-in.
  const simpEligible = result ? assessSimplified(result, audience).eligible : false
  // Ingredient statement for the label: ingredient names in descending order by
  // weight (21 CFR 101.4), joined — the renderer prefixes "INGREDIENTS:".
  const ingredientStatement = [...selected]
    .sort((a, b) =>
      toGrams(b.quantity, b.unit, b) * (1 - (b.trimWastePct ?? 0) / 100) -
      toGrams(a.quantity, a.unit, a) * (1 - (a.trimWastePct ?? 0) / 100),
    )
    .map((s) => s.name?.trim())
    .filter((n): n is string => !!n)
    .join(', ')
  // "Contains:" allergen statement (FALCPA, 21 CFR 101.4(b)) — union of Big-9
  // flags across the ingredients actually in the product (base + ticked optional).
  const baseAllergens = new Set<string>()
  for (const r of rows) {
    if (r.category === 'base' || r.selected) (r.allergens ?? []).forEach((a) => baseAllergens.add(a))
  }
  const containsStatement = formatContains(baseAllergens)
  // Per-flavor: the base allergens plus that flavor's own overlay-line allergens.
  const flavorContains = (f: Flavor) => {
    const s = new Set(baseAllergens)
    for (const l of f.lines ?? []) (l.allergens ?? []).forEach((a) => s.add(a))
    return formatContains(s)
  }
  const ps = result?.perServing
  // Per-ingredient Nutrition Breakdown (QA): each selected ingredient's exact
  // batch contribution from the engine, plus its per-serving share. Makes a bad
  // input (missing per100g, wrong qty) obvious. Geometry-independent batch.
  const breakdown = result
    ? selected.map((s) => ({
        name: s.name || '—',
        usableG: toGrams(s.quantity, s.unit, s) * (1 - (s.trimWastePct ?? 0) / 100),
        batch: calculateLabel([s], geoArgs).raw.batch,
      }))
    : []
  const ts = result?.geometry.totalServings ?? 0
  // Everything domain-specific reads from the registry (product-domains.ts):
  // terminology, search source, label kind, and panel format — no ad-hoc branches.
  const dom = getDomain(domain)
  const noFactsPanel = !dom.hasFactsPanel // cosmetic / pet / OTC
  const panelFormat: 'STANDARD' | 'SUPPLEMENT_FACTS' = dom.panelFormat ?? 'STANDARD'
  // What this no-panel domain carries instead of a Facts box.
  const noPanelMsg =
    dom.labelKind === 'GUARANTEED_ANALYSIS' ? 'Pet products carry an AAFCO Guaranteed Analysis + nutritional-adequacy statement + feeding directions instead of a Facts panel.'
    : dom.labelKind === 'DRUG_FACTS' ? 'OTC products carry a Drug Facts panel instead of a Nutrition / Supplement Facts box.'
    : 'Cosmetics carry an INCI ingredient declaration + net contents instead of a Facts panel.'
  // True when ingredients are present but none carry nutrient data — the label
  // would read all-zero, which looks like "it doesn't calculate". We surface a
  // hint instead of a silent zeroed panel.
  const noNutritionData = selected.length > 0 &&
    selected.every((r) => !r.per100g || Object.keys(r.per100g).length === 0)

  // Per-flavor label: shared base recipe + that flavor's overlay lines (each
  // with its own amount), so every flavor carries its own calories/sugar/etc.
  function flavorResult(f: Flavor) {
    const baseRows = publicSelection(recipeRows)
    const overlay: RecipeRow[] = (f.lines ?? [])
      .filter((l) => l.qty > 0)
      .map((l, k) => ({
        id: `flav-${k}-${l.ingId}`,
        name: l.name,
        per100g: l.per100g && Object.keys(l.per100g).length ? l.per100g : (fallbackPer100g(l.name) ?? {}),
        quantity: toGrams(l.qty, l.unit, { densityGPerMl: l.densityGPerMl ?? undefined }),
        unit: 'g', category: 'base', selected: true,
      }))
    const all = [...baseRows, ...overlay]
    return all.length ? calculateLabel(all, geoArgs, { audience }) : null
  }
  // Grams a flavor's overlay adds on top of the base (live total readout).
  const flavorOverlayGrams = (f: Flavor) =>
    (f.lines ?? []).reduce((s, l) => s + (l.qty > 0 ? toGrams(l.qty, l.unit, { densityGPerMl: l.densityGPerMl ?? undefined }) : 0), 0)

  // Flavors that carry overlay data → one aggregate column each (variety pack).
  const flavorsWithData = flavors.filter((f) => flavorOverlayGrams(f) > 0)
  // Net-contents TERM follows the measure (FPLA): fluid-measured products declare
  // a volume statement ("NET 12 FL OZ"), weight-measured declare "NET WT". We key
  // off the package unit the manufacturer entered.
  const isFluidPack = VOLUME_UNITS.has(packageUnit) && packageSizeG > 0
  const fluidUnit = netUpper(UNIT_LABELS[packageUnit] ?? packageUnit)
  const perUnitNet = isFluidPack ? `${+packageSizeG.toFixed(2)} ${fluidUnit}` : (result ? netUpper(formatNetWeight(result.geometry.netWeightG)) : '')
  // Single-unit net-contents line.
  const netContentsLabel = result ? (isFluidPack ? `NET ${perUnitNet}` : `NET WT ${perUnitNet}`) : ''
  // Multiunit net-contents statement for the OUTER box (21 CFR 101.7(q) / FPLA):
  // "N × <per-unit net> (total)" — shown on the variety-pack / aggregate label,
  // not on a single unit. Only when the pack holds >1 unit.
  const packNetContents = (() => {
    if (unitsPerPack <= 1 || !result) return undefined
    if (isFluidPack) {
      const total = +(packageSizeG * unitsPerPack).toFixed(2)
      return `${unitsPerPack} × ${perUnitNet} (${total} ${fluidUnit})`
    }
    const per = result.geometry.netWeightG
    if (!per || per <= 0) return undefined
    return `${unitsPerPack} × ${netUpper(formatNetWeight(per))} (${netUpper(formatNetWeight(per * unitsPerPack))})`
  })()
  // Per-flavor panels for the variety views + modal (computed once).
  const varietyCols: VarietyColumn[] = flavorsWithData
    .map((fl): VarietyColumn | null => {
      const r = flavorResult(fl)
      return r ? { label: fl.name || 'Flavor', data: toPanelData(r, { suggestedServing, showVoluntaryFats: true, format: panelFormat }), contains: flavorContains(fl) } : null
    })
    .filter((c): c is VarietyColumn => c !== null)

  // Real batch ingredient cost per market currency, from each ingredient's
  // per-kg price applied to its raw purchased weight (cost is on what you buy,
  // before waste loss). One total per active-market currency.
  const totalsByCurrency: Record<string, number> = {}
  for (const ccy of currencies) {
    totalsByCurrency[ccy] = rows.reduce((sum, r) => {
      const grams = rawGrams(r)
      const perKg = (costCentsFor(r, ccy) ?? 0) / 100
      return sum + perKg * (grams / 1000)
    }, 0)
  }
  const totalCents = totalsByCurrency[primaryCcy] ?? 0
  const perServingCost = result && result.geometry.totalServings > 0 ? totalCents / result.geometry.totalServings : 0
  const retail = perServingCost * markup

  return (
    <div className="rb">
      <style>{CSS}</style>

      {findServingOpen && (
        <FindServingModal
          onClose={() => setFindServingOpen(false)}
          onPick={(serving, grams) => {
            setSuggestedServing(serving)
            setServingSizeG(grams)
            setServingUnit('g')
            setLmode('serving')
            setFindServingOpen(false)
          }}
        />
      )}

      {customMeasureRow && (
        <AddCustomMeasureModal
          ingredientName={rowData(customMeasureRow).name}
          existing={customMeasureRow.customUnits ?? []}
          onClose={() => setCustomMeasureRow(null)}
          onSave={(name, grams) => {
            const row = customMeasureRow
            patch(row.uid, { customUnits: [...(row.customUnits ?? []), { name, grams }], unit: name })
            setCustomMeasureRow(null)
          }}
        />
      )}

      {labelViewerOpen && varietyCols.length > 0 && (
        <LabelViewerModal columns={varietyCols} productName={productName} netContents={packNetContents} onClose={() => setLabelViewerOpen(false)} />
      )}

      {/* Mode 1/2/3 chooser — Search & build · Parse with AI · Declare panel. */}
      <div style={{ marginBottom: 14 }}>
        <ModeChooser
          currentMode={entryMode}
          collapsed={!chooserOpen}
          aiAvailable={aiAvailable && !!draftId}
          // Declared is a shipped, ungated path — available whenever a draft
          // exists (the panel needs a productTemplateId to save).
          declareAvailable={!!draftId}
          onSelect={(m) => { setEntryMode(m); setChooserOpen(false) }}
          onExpand={() => setChooserOpen(true)}
        />
      </div>

      {entryMode === 'AI_PARSER' && (
        draftId
          ? <AiParserPanel productTemplateId={draftId} onCommit={handleAiCommit} onCancel={() => { setEntryMode('SEARCH_BUILD'); setChooserOpen(false) }} />
          : <p className="muted tiny">Save your draft first to parse a recipe with AI.</p>
      )}

      {entryMode === 'DECLARED_PANEL' && (
        draftId
          ? <DeclaredPanelPanel productTemplateId={draftId} labelingType={legacyLabelingType(domain)} existingSlotCount={base.length} onSaved={() => setChooserOpen(false)} onCancel={() => { setEntryMode('SEARCH_BUILD'); setChooserOpen(false) }} />
          : <p className="muted tiny">Save your draft first to declare a nutrition panel.</p>
      )}

      {entryMode === 'SEARCH_BUILD' && (
       <>
      <div className="rb-tabs" role="tablist">
        {TABS.map((t) => (
          <div
            key={t.key}
            role="tab"
            tabIndex={0}
            aria-selected={activeTab === t.key}
            className={`rb-tab ${activeTab === t.key ? 'on' : ''}`}
            style={t.soon ? { opacity: 0.6 } : undefined}
            onClick={() => setActiveTab(t.key)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab(t.key) } }}
          >
            <t.icon className="rb-tab-ic" />
            {t.label}
            {t.soon && <span style={{ marginLeft: 5, fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-500)', border: '1px solid var(--ink-200)', borderRadius: 999, padding: '1px 5px' }}>soon</span>}
          </div>
        ))}
      </div>

      {activeTab === 'build' && (
       <>
      {domain === 'FOOD' && (
        <div className="agebar">
          <div className="agebar-l">
            <span className="agebar-t">Who are you building this for?
              <i className="info" data-tip="Sets the FDA Nutrition Facts format (21 CFR 101.9(j)(5)); the live label updates automatically. General (adults & children 4+) prints the standard panel. Children 1–3 uses the toddler Daily Values. Infants 0–12 months uses infant Daily Values and drops Saturated Fat, Trans Fat and Cholesterol. Note: infant FORMULA (21 CFR 107) is a separately regulated product — this is for baby/toddler FOOD.">i</i>
            </span>
          </div>
          <div className="agebar-seg" role="radiogroup" aria-label="Intended age group">
            {([['GENERAL', 'General · 4+'], ['CHILD_1_3', 'Children 1–3'], ['INFANT_0_12', 'Infants 0–12 mo']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={ageGroup === v}
                className={ageGroup === v ? 'on' : ''}
                onClick={() => changeAgeGroup(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={`rb-wrap${base.length === 0 ? ' solo' : ''}`}>
        <div>
          {/* Add Ingredients — search sits ABOVE the recipe table. */}
          <div className="card">
            <div className="section-title" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="ic"><ListPlus size={16} strokeWidth={2} /></span> Add Ingredients</span>
              {rows.length > 0 && (
                <select className="sel" value={addCat} onChange={(e) => setAddCat(e.target.value as 'base' | 'optional')} style={{ width: 'auto', fontWeight: 600 }}>
                  <option value="base">Main Ingredients</option>
                  <option value="optional">Optional Ingredients</option>
                </select>
              )}
            </div>
            <IngredientPicker onPick={handlePick} placeholder={dom.searchBuilt ? `Search ${dom.searchSourceLabel}, the library, or your private ${dom.ingredientNounPlural}…` : `Search the library or your private ${dom.ingredientNounPlural}…`} />
            {dom.searchBuilt ? (
              <p className="tiny muted" style={{ marginTop: 8 }}>Picked rows pull their {dom.searchSourceLabel} nutrients into the live label.</p>
            ) : (
              <p className="tiny muted" style={{ marginTop: 8 }}>Dedicated <b>{dom.searchSourceLabel}</b> {dom.ingredientNoun} search ships later — using the shared library for now.</p>
            )}
          </div>

          {/* Recipe Ingredients — appears only once the first ingredient is added. */}
          {base.length > 0 && (
          <div className="card">
            <div className="section-title"><span className="ic"><Utensils size={16} strokeWidth={2} /></span> {dom.stepName} {dom.ingredientNounPlural} ({base.length})</div>
            <table>
              <thead><tr><th style={{ width: '99%' }}>Ingredient Name</th><th className="r" style={{ width: 1, whiteSpace: 'nowrap' }} /><th className="r">Qty</th><th className="r">Unit</th><th className="r" style={{ whiteSpace: 'nowrap' }}>Waste %</th><th className="r">Grams</th><th className="r" style={{ whiteSpace: 'nowrap' }}>Cost <i className="info" data-tip="You set ingredient prices here — they aren't stored in the catalog. Enter your price and pick the basis (kg · lb · g · oz). The Total sums each ingredient's price × its grams.">i</i></th><th /></tr></thead>
              <tbody>
                {base.map((r) => {
                  const alts = onAxes ? swapAltsFor(r.ingId) : []
                  const hasAlts = alts.length > 0
                  const baseActive = !activeSwap[r.ingId] // no swap selected → base is in the recipe
                  const showVol = rowData(r).densityGPerMl != null || VOLUME_UNITS.has(r.unit)
                  return (
                  <Fragment key={r.uid}>
                  <tr style={hasAlts && !baseActive ? { opacity: 0.45 } : undefined}>
                    <td>{rowData(r).name}{hasAlts && baseActive && <span style={DOT_STYLE} />}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      {onAxes && (
                        <button
                          type="button"
                          title="Add a replaceable ingredient — let the creator swap this for an alternative you approve. The Nutrition Facts label recomputes per choice."
                          aria-label="Add replaceable ingredient"
                          onClick={() => setAddReplRow(r)}
                          style={iconBtnStyle(false)}
                        >＋</button>
                      )}
                    </td>
                    <td className="r"><input className="num" type="number" min={0} value={r.qty} onChange={(e) => patch(r.uid, { qty: Math.max(0, parseFloat(e.target.value) || 0) })} /></td>
                    <td className="r">
                      <select className="num" value={r.unit} onChange={(e) => { if (e.target.value === '__add__') { setCustomMeasureRow(r); return } patch(r.uid, { unit: e.target.value }) }}>
                        {SELECTABLE_UNITS.filter((u) => showVol || !VOLUME_UNITS.has(u)).map((u) => <option key={u} value={u}>{UNIT_LABELS[u] ?? u}</option>)}
                        {(r.customUnits ?? []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                        <option value="__add__">+ Add custom unit…</option>
                      </select>
                    </td>
                    <td className="r"><input className="num" type="number" min={0} max={100} value={r.waste} onChange={(e) => patch(r.uid, { waste: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })} /></td>
                    <td className="r">{(rawGrams(r) * (1 - effWaste(r.waste) / 100)).toFixed(1)}</td>
                    <td className="r">
                      <span className="costcell">
                        <span className="costins">
                          {currencies.map((ccy) => (
                            <span key={ccy} className="curin" title={ccy}>
                              <span className="cursym">{curSym(ccy)}</span>
                              <input className="num" type="number" min={0} step={0.01} value={costDisplayFor(r, ccy)} placeholder="—" onChange={(e) => patch(r.uid, costPatchFor(r, ccy, e.target.value))} />
                            </span>
                          ))}
                        </span>
                        <select className="cu" value={r.costUnit ?? 'kg'} onChange={(e) => patch(r.uid, { costUnit: e.target.value })}>
                          {COST_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </span>
                    </td>
                    <td><span className="del" onClick={() => remove(r.uid)}>🗑</span></td>
                  </tr>
                  {/* Inline replaceable child rows — dimmed unless swapped-in (active). */}
                  {alts.map((v) => {
                    const sIng = v.overlayIngId!
                    const isAct = activeSwap[r.ingId] === sIng
                    const sq = v.overlayQty ?? r.qty
                    const su = v.overlayUnit ?? r.unit
                    const sw = v.overlayWaste ?? r.waste
                    const sDens = v.overlayDensityGPerMl ?? null
                    const sShowVol = sDens != null || VOLUME_UNITS.has(su)
                    const sg = toGrams(sq, su, { densityGPerMl: sDens ?? undefined }) * (1 - sw / 100)
                    return (
                      <tr key={`${r.uid}-swap-${sIng}`} style={{ borderLeft: '3px solid var(--pink)', background: isAct ? 'var(--pink-50)' : 'transparent', opacity: isAct ? 1 : 0.6 }}>
                        <td style={{ paddingLeft: 22 }}>{v.overlayIngName || v.label}{isAct && <span style={DOT_STYLE} />}</td>
                        <td className="r" style={{ whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            title={isAct ? 'Swapped in — click to revert to the base ingredient' : 'Swap this in — preview the label with this alternative'}
                            aria-label={isAct ? 'Revert to base ingredient' : 'Activate this swap'}
                            onClick={() => toggleActiveSwap(r.ingId, sIng)}
                            style={iconBtnStyle(isAct)}
                          >⇄</button>
                        </td>
                        <td className="r"><input className="qty" type="number" min={0} value={sq} onChange={(e) => patchSwapValue(r.ingId, sIng, { overlayQty: Math.max(0, parseFloat(e.target.value) || 0) })} /></td>
                        <td className="r">
                          <select value={su} onChange={(e) => patchSwapValue(r.ingId, sIng, { overlayUnit: e.target.value })}>
                            {SELECTABLE_UNITS.filter((u) => sShowVol || !VOLUME_UNITS.has(u)).map((u) => <option key={u} value={u}>{UNIT_LABELS[u] ?? u}</option>)}
                          </select>
                        </td>
                        <td className="r"><input className="waste" type="number" min={0} max={100} value={sw} onChange={(e) => patchSwapValue(r.ingId, sIng, { overlayWaste: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })} /></td>
                        <td className="r">{sg.toFixed(1)}</td>
                        <td className="r"><input className="waste" type="number" min={0} step={0.01} value={v.overlayCostPerKgCents != null ? v.overlayCostPerKgCents / 100 : ''} placeholder="—" onChange={(e) => { const c = parseFloat(e.target.value); patchSwapValue(r.ingId, sIng, { overlayCostPerKgCents: isNaN(c) ? null : Math.max(0, Math.round(c * 100)) }) }} /></td>
                        <td><span className="del" onClick={() => removeSwapValue(r.ingId, sIng)}>🗑</span></td>
                      </tr>
                    )
                  })}
                  </Fragment>
                  )
                })}
                {base.length === 0 && (
                  <tr><td colSpan={8} className="muted" style={{ padding: '14px 6px', textAlign: 'center' }}>No ingredients yet — search below to add your first.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td /><td /><td />
                  <td className="grn r" style={{ whiteSpace: 'nowrap' }}>Total <i className="info" data-tip="Recipe Waste % is applied to EVERY ingredient, in addition to each ingredient's own waste. Use it when a known fraction of the whole batch is lost — spillage, trim left in the mixer, residue, etc.">i</i></td>
                  <td className="r">
                    <span className="rwcell">
                      <input className="num" type="number" min={0} max={100} value={recipeWaste} onChange={(e) => setRecipeWaste(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} aria-label="Recipe waste percent" />
                    </span>
                  </td>
                  <td className="grn r">{base.reduce((s, r) => s + rawGrams(r) * (1 - effWaste(r.waste) / 100), 0).toFixed(1)}</td>
                  <td className="grn r">
                    {currencies.map((ccy) => (
                      <div key={ccy} style={{ whiteSpace: 'nowrap' }}>{curSym(ccy)}{(totalsByCurrency[ccy] ?? 0).toFixed(2)}</div>
                    ))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
            {base.length > 0 && totalCents === 0 && (
              <p className="muted tiny" style={{ marginTop: 8 }}>Total is {curSym(primaryCcy)}0.00 — set a price per ingredient in the <b>Cost</b> column.{currencies.length > 1 && <> One price per active market currency ({currencies.join(' · ')}).</>}</p>
            )}
          </div>
          )}

          {/* Optional Ingredients — same columns as the base table, plus an
              activation toggle: click the check to tick the ingredient into the
              Preview label, click again to deactivate it. */}
          {optional.length > 0 && (
            <div className="card">
              <div className="section-title"><span className="ic"><ListChecks size={16} strokeWidth={2} /></span> Optional Ingredients ({optional.length})</div>
              <table>
                <thead><tr><th className="r" style={{ width: 1, whiteSpace: 'nowrap' }} title="Click to activate / deactivate">On</th><th style={{ width: '99%' }}>Ingredient Name</th><th className="r">Qty</th><th className="r">Unit</th><th className="r" style={{ whiteSpace: 'nowrap' }}>Waste %</th><th className="r">Grams</th><th className="r">$/kg</th><th /></tr></thead>
                <tbody>
                  {optional.map((r) => {
                    const showVol = rowData(r).densityGPerMl != null || VOLUME_UNITS.has(r.unit)
                    return (
                    <tr key={r.uid} className={r.selected ? '' : 'dim'}>
                      <td className="r">
                        <span
                          className={`circle ${r.selected ? 'chk' : ''}`}
                          role="checkbox"
                          aria-checked={r.selected}
                          tabIndex={0}
                          title={r.selected ? 'Active — ticked into the Preview label. Click to deactivate.' : 'Inactive — click to activate.'}
                          aria-label={r.selected ? 'Deactivate optional ingredient' : 'Activate optional ingredient'}
                          onClick={() => patch(r.uid, { selected: !r.selected })}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); patch(r.uid, { selected: !r.selected }) } }}
                        >{r.selected ? '✓' : ''}</span>
                      </td>
                      <td>{rowData(r).name}</td>
                      <td className="r"><input className="qty" type="number" min={0} value={r.qty} onChange={(e) => patch(r.uid, { qty: Math.max(0, parseFloat(e.target.value) || 0) })} /></td>
                      <td className="r">
                        <select value={r.unit} onChange={(e) => patch(r.uid, { unit: e.target.value })}>
                          {SELECTABLE_UNITS.filter((u) => showVol || !VOLUME_UNITS.has(u)).map((u) => <option key={u} value={u}>{UNIT_LABELS[u] ?? u}</option>)}
                        </select>
                      </td>
                      <td className="r"><input className="waste" type="number" min={0} max={100} value={r.waste} onChange={(e) => patch(r.uid, { waste: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })} /></td>
                      <td className="r">{(rawGrams(r) * (1 - r.waste / 100)).toFixed(1)}</td>
                      <td className="r"><input className="waste" type="number" min={0} step={0.01} value={r.costPerKgCents != null ? r.costPerKgCents / 100 : ''} placeholder="—" onChange={(e) => { const v = parseFloat(e.target.value); patch(r.uid, { costPerKgCents: isNaN(v) ? null : Math.max(0, Math.round(v * 100)) }) }} /></td>
                      <td><span className="del" onClick={() => remove(r.uid)}>🗑</span></td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="muted tiny">Optional ingredients tick into the <b>Preview</b> label only; the Public label stays base-only. Click a check to drop it without deleting.</p>
            </div>
          )}

          {/* Flavor variants — tabs per flavor; each flavor's own flavored
              ingredients overlay the shared base recipe. Drives the per-flavor
              label shown in the live preview on the right. */}
          {flavorMode === 'MULTI' && (
            <div className="card">
              <div className="section-title"><span className="ic"><Sparkles size={16} strokeWidth={2} /></span> Flavor variants ({flavors.length})</div>
              <div className="flavtabs" role="tablist" aria-label="Flavors">
                {flavors.map((f, i) => (
                  <button key={i} type="button" role="tab" aria-selected={activeFlavor === i} className={`flavtab${activeFlavor === i ? ' on' : ''}`} onClick={() => setActiveFlavor(i)}>
                    {f.name || `Flavor ${i + 1}`}
                  </button>
                ))}
                {flavors.length < maxColumns && (
                  <button type="button" className="flavtab add" aria-label="Add flavor" onClick={() => { setFlavors([...flavors, { name: `Flavor ${flavors.length + 1}`, ingId: '', soi: '' }]); setActiveFlavor(flavors.length) }}>+ Flavor</button>
                )}
              </div>
              {flavors.length === 0 ? (
                <p className="muted tiny" style={{ marginTop: 8 }}>Add a flavor to start.</p>
              ) : (() => {
                const idx = Math.min(activeFlavor, flavors.length - 1)
                const f = flavors[idx]!
                const lines = f.lines ?? []
                const overlayG = flavorOverlayGrams(f)
                return (
                  <>
                    <div className="flavedit" style={{ marginTop: 10 }}>
                      <input className="flavname" value={f.name} onChange={(e) => setFlavors(flavors.map((x, j) => (j === idx ? { ...x, name: e.target.value } : x)))} placeholder={`Flavor ${idx + 1}`} aria-label="Flavor name" />
                      {flavors.length > 1 && <button type="button" className="btn sm" onClick={() => { setFlavors(flavors.filter((_, j) => j !== idx)); setActiveFlavor(Math.max(0, idx - 1)) }} aria-label="Remove this flavor">Remove flavor</button>}
                    </div>
                    {lines.length > 0 ? (
                      <table style={{ marginTop: 10 }}>
                        <thead><tr><th style={{ width: '99%' }}>Flavor ingredient</th><th className="r">Qty</th><th className="r">Unit</th><th className="r">Grams</th><th /></tr></thead>
                        <tbody>
                          {lines.map((l, li) => {
                            const showVol = l.densityGPerMl != null || VOLUME_UNITS.has(l.unit)
                            const grams = toGrams(l.qty, l.unit, { densityGPerMl: l.densityGPerMl ?? undefined })
                            return (
                              <tr key={li}>
                                <td>{l.name}{l.per100g && Object.keys(l.per100g).length === 0 && <span className="tiny" style={{ color: 'var(--warn,#b45309)' }}> · no nutrient data</span>}</td>
                                <td className="r"><input className="num" type="number" min={0} value={l.qty || ''} onChange={(e) => patchFlavorLine(idx, li, { qty: Math.max(0, parseFloat(e.target.value) || 0) })} aria-label={`${l.name} amount`} /></td>
                                <td className="r">
                                  <select className="num" value={l.unit} onChange={(e) => patchFlavorLine(idx, li, { unit: e.target.value })} aria-label={`${l.name} unit`}>
                                    {SELECTABLE_UNITS.filter((u) => showVol || !VOLUME_UNITS.has(u)).map((u) => <option key={u} value={u}>{UNIT_LABELS[u] ?? u}</option>)}
                                  </select>
                                </td>
                                <td className="r">{grams ? grams.toFixed(1) : '—'}</td>
                                <td className="r"><button type="button" className="del" onClick={() => removeFlavorLine(idx, li)} aria-label="Remove ingredient">🗑</button></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <p className="tiny muted" style={{ margin: '10px 0 6px' }}>No flavor ingredients yet — add the flavor system, color, sweetener, etc.</p>
                    )}
                    <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 240px' }}><IngredientPicker onPick={(p) => addFlavorLine(idx, p)} placeholder={`Add an ingredient for “${f.name || 'this flavor'}”…`} /></div>
                      {overlayG > 0 && <span className="tiny muted">This flavor adds {Math.round(overlayG * 10) / 10} g on top of the base.</span>}
                    </div>
                  </>
                )
              })()}
            </div>
          )}


          {/* Packaging & Serving — appears only once the first ingredient is added. */}
          {base.length > 0 && (
          <div className="card">
            <div className="section-title"><span className="ic"><Scale size={16} strokeWidth={2} /></span> Packaging &amp; Serving Information</div>
            <div className="subtab">
              <button className={subtab === 'pack' ? 'on' : ''} onClick={() => setSubtab('pack')}>Packaging</button>
              <button className={subtab === 'adv' ? 'on' : ''} onClick={() => setSubtab('adv')}>Advanced</button>
            </div>
            {subtab === 'pack' && (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                  How would you like to set up your label?
                  <i className="info" data-tip="To create your nutrition label we need the serving and package size. BY PACKAGE SIZE: enter the package size and the number of packages the recipe makes — precisely controls how much product your recipe yields. BY SERVING SIZE: enter only the serving size weight and optional moisture loss and we calculate the rest (this method does not account for density).">i</i>
                </div>
                <div className="radio">
                  <label><input type="radio" name="lmode" checked={lmode === 'package'} onChange={() => setLmode('package')} /> By package size</label>
                  <label><input type="radio" name="lmode" checked={lmode === 'serving'} onChange={() => setLmode('serving')} /> By serving size</label>
                </div>

                {lmode === 'serving' ? (
                  <div>
                    <span className="f">Serving size weight <i className="info" data-tip="The amount customarily consumed per sitting by a person 4+ years of age. Enter the weight and pick the unit. Nutrition is scaled to this serving size.">i</i></span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" min={0} style={{ flex: 1 }} value={servingSizeG} onChange={(e) => setServingSizeG(parseFloat(e.target.value) || 0)} />
                      <select value={servingUnit} onChange={(e) => setServingUnit(e.target.value)}>
                        {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{UNIT_FULL[u] ?? u}</option>)}
                      </select>
                    </div>
                    {result && <p className="makes">This recipe makes about {result.geometry.packagesMade.toFixed(1)} package(s)</p>}
                  </div>
                ) : (
                  <div>
                    <span className="f">Package size</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" min={0} style={{ flex: 1 }} value={packageSizeG} onChange={(e) => setPackageSizeG(parseFloat(e.target.value) || 0)} />
                      <select value={packageUnit} onChange={(e) => setPackageUnit(e.target.value)}>
                        {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{UNIT_FULL[u] ?? u}</option>)}
                      </select>
                    </div>
                    <span className="f" style={{ marginTop: 8 }}>Number of packages this recipe makes</span>
                    <input type="number" min={0} style={{ width: 140 }} value={numPackages} onChange={(e) => setNumPackages(parseFloat(e.target.value) || 1)} />
                  </div>
                )}

                <span className="f" style={{ marginTop: 10 }}>Moisture loss % <i className="info" data-tip="The decrease in water content during cooking/preparation. A 100 g recipe that loses 20% to evaporation yields 80 g. Reducing water concentrates nutrients — higher moisture loss = LARGER per-serving values, assuming the serving size stays the same.">i</i></span>
                <input type="number" min={0} max={100} style={{ width: 120 }} value={moisture} onChange={(e) => setMoisture(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} />

                <div className="row2" style={{ marginTop: 10 }}>
                  <div>
                    <span className="f">Suggested serving <i className="info" data-tip="The descriptive household measure printed on the label — 1 cup, 1 tbsp, 1 scoop, 1 cookie, etc. Use your best judgment, or Find serving for FDA reference amounts.">i</i></span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input style={{ flex: 1 }} value={suggestedServing} onChange={(e) => setSuggestedServing(e.target.value)} placeholder="1 cup" />
                      <button type="button" className="btn pink sm" onClick={() => setFindServingOpen(true)}>Find serving</button>
                    </div>
                  </div>
                  <div>
                    <span className="f">How many servings are in each package? <i className="info" data-tip="The number of servings EACH PACKAGE has. 20 cookies at 1 cookie/serving = 20 servings. Non-round numbers (e.g. 2.2) round on the label and are prefixed “about”.">i</i></span>
                    <input type="number" min={0} style={{ width: '100%' }} value={servingsPerPackage} onChange={(e) => setServingsPerPackage(parseFloat(e.target.value) || 1)} />
                  </div>
                </div>
              </>
            )}
            {subtab === 'adv' && (
              <>
                <span className="f">Suggested serving (French) <i className="info" data-tip="For Canadian nutrition labels, provide the same serving size in French as in English.">i</i></span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={{ flex: 1 }} value={suggestedServingFr} onChange={(e) => setSuggestedServingFr(e.target.value)} placeholder="ex. 1 tasse" />
                  <button type="button" className="btn sm" onClick={() => setSuggestedServingFr(suggestedServing ? `${suggestedServing} (FR)` : '')}>Translate</button>
                </div>
                <span className="f" style={{ marginTop: 10 }}>Package count for aggregate labels <i className="info" data-tip="If this recipe appears in an FDA aggregate (combined) label, this is the number of servings it contributes. Each recipe’s aggregate servings are summed for the total.">i</i></span>
                <input type="number" min={0} style={{ width: 140 }} value={aggCount} onChange={(e) => setAggCount(parseFloat(e.target.value) || 1)} />
              </>
            )}
          </div>
          )}

          {/* Cost summary + per-ingredient nutrition breakdown live in the COST tab. */}
        </div>

        {/* RIGHT — live label (hidden until the first ingredient is added) */}
        <div style={base.length === 0 ? { display: 'none' } : undefined}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <div className="seg">
              <button className={mode === 'public' ? 'on' : ''} onClick={() => setMode('public')}>Public label</button>
              <button className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>Internal preview</button>
            </div>
            {/* Only products with multiple label previews (≥2 flavors with data). */}
            {varietyCols.length >= 2 && (
              <button type="button" className="btn sm" onClick={() => setLabelViewerOpen(true)}>View all labels ↗</button>
            )}
          </div>
          {flavorMode === 'MULTI' && flavors.length > 0 && (
            <div className="tiny muted" style={{ marginBottom: 8 }}>
              Previewing <b style={{ color: 'var(--ink-900)' }}>{flavors[Math.min(activeFlavor, flavors.length - 1)]?.name || `Flavor ${Math.min(activeFlavor, flavors.length - 1) + 1}`}</b> · switch flavors in the <b>Flavor variants</b> card on the left
            </div>
          )}
          {noFactsPanel ? (
            <div className="card" style={{ color: 'var(--ink-500)', fontSize: 12.5, lineHeight: 1.5 }}>
              <b style={{ color: 'var(--ink-900)' }}>No Nutrition / Supplement Facts panel.</b> {noPanelMsg} {!dom.labelBuilt && <span className="tiny">This domain&apos;s label renderer ships in a later phase.</span>} <span className="tiny">(Auto-selected from this product&apos;s category.)</span>
            </div>
          ) : ps && result ? (
            flavorMode === 'MULTI' && flavors.length > 0 ? (() => {
              const idx = Math.min(activeFlavor, flavors.length - 1)
              const f = flavors[idx]!
              const fr = flavorResult(f)
              const overlayG = flavorOverlayGrams(f)
              return (
                <>
                  {fr && overlayG > 0 ? (
                    <FactsPanel result={fr} ps={fr.perServing} title={f.name || `Flavor ${idx + 1}`} format={panelFormat} contains={flavorContains(f)} />
                  ) : (
                    <div className="card" style={{ textAlign: 'center', color: 'var(--ink-500)', padding: 20 }}>
                      <div className="flavhdr" style={{ margin: '0 0 8px' }}>{f.name || `Flavor ${idx + 1}`}</div>
                      <p className="tiny" style={{ margin: 0 }}>Add at least one flavor ingredient with an amount to generate this flavor&apos;s Facts label.</p>
                    </div>
                  )}
                  <div className="netwt">{netContentsLabel}</div>
                  <p className="makes">{flavors.length} flavors · one Facts label each.{varietyCols.length >= 2 ? ' Use “View all labels” to compare + see the pack aggregate.' : ''}</p>
                </>
              )
            })() : (
              <>
                {simpEligible && (
                  <label className="muted tiny" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={simplifiedOn} onChange={(e) => setSimplifiedOn(e.target.checked)} style={{ marginTop: 1 }} />
                    <span>Use the <b>simplified format</b> (qualifies) — hides zero rows, adds “Not a significant source of…” (21 CFR 101.9(f)). <i className="info" data-tip="Offered only when most nutrients are insignificant. Drops the zero rows and prints the “Not a significant source of…” statement per 21 CFR 101.9(f).">i</i></span>
                  </label>
                )}
                <FactsPanel result={result} ps={ps} serving={suggestedServing} format={panelFormat} simplified={simplifiedOn} ingredientStatement={ingredientStatement} contains={containsStatement} />
                <div className="netwt">{netContentsLabel}</div>
              </>
            )
          ) : (
            <div className="card" style={{ textAlign: 'center', color: 'var(--ink-500)' }}>Add ingredients + a serving size to see the label.</div>
          )}
          {!noFactsPanel && noNutritionData && (
            <p className="rb-warn">⚠ These ingredients have no nutrition data yet, so the label reads all zeros. Pick USDA / library ingredients, or open the ingredient to add per-100 g values.</p>
          )}
          <p className="muted tiny" style={{ marginTop: 8 }}>{mode === 'public' ? 'Public marketplace label — base ingredients only.' : 'Internal preview — base + ticked optionals.'} · {productName || 'Untitled'}</p>
        </div>
      </div>

      {result && breakdown.length > 0 && (
        <details className="card" style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>🧪 Nutrition Breakdown — per-ingredient contribution (QA)</summary>
          <p className="muted tiny" style={{ marginTop: 6 }}>Each ingredient&apos;s exact <b>batch</b> contribution from the engine. Per serving = batch ÷ {ts.toFixed(2)} servings.</p>
          <table>
            <thead><tr><th>Ingredient</th><th className="r">Usable g</th><th className="r">Cal</th><th className="r">Protein</th><th className="r">Fat</th><th className="r">Carb</th><th className="r">Sugars</th><th className="r">Sodium</th></tr></thead>
            <tbody>
              {breakdown.map((b, i) => {
                const noData = b.usableG > 0 && b.batch.calories === 0 && b.batch.protein === 0 && b.batch.totalFat === 0 && b.batch.totalCarbohydrate === 0
                return (
                  <tr key={i}>
                    <td>{b.name}{noData && <span style={{ color: 'var(--danger-600)', marginLeft: 6, fontSize: 10 }} title="This ingredient has no stored nutrition data — it contributes 0 to the label.">⚠ no data</span>}</td>
                    <td className="r">{b.usableG.toFixed(1)}</td>
                    <td className="r">{Math.round(b.batch.calories)}</td>
                    <td className="r">{b.batch.protein.toFixed(1)}</td>
                    <td className="r">{b.batch.totalFat.toFixed(1)}</td>
                    <td className="r">{b.batch.totalCarbohydrate.toFixed(1)}</td>
                    <td className="r">{b.batch.totalSugars.toFixed(1)}</td>
                    <td className="r">{Math.round(b.batch.sodium)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="grn">
                <td>Batch total</td>
                <td className="r">{result.geometry.rawMassG.toFixed(1)}</td>
                <td className="r">{Math.round(result.raw.batch.calories)}</td>
                <td className="r">{result.raw.batch.protein.toFixed(1)}</td>
                <td className="r">{result.raw.batch.totalFat.toFixed(1)}</td>
                <td className="r">{result.raw.batch.totalCarbohydrate.toFixed(1)}</td>
                <td className="r">{result.raw.batch.totalSugars.toFixed(1)}</td>
                <td className="r">{Math.round(result.raw.batch.sodium)}</td>
              </tr>
              <tr>
                <td>Per serving (exact, pre-rounding)</td>
                <td className="r">{Math.round(result.geometry.servingSizeG)}</td>
                <td className="r">{result.raw.perServingExact.calories.toFixed(0)}</td>
                <td className="r">{result.raw.perServingExact.protein.toFixed(1)}</td>
                <td className="r">{result.raw.perServingExact.totalFat.toFixed(1)}</td>
                <td className="r">{result.raw.perServingExact.totalCarbohydrate.toFixed(1)}</td>
                <td className="r">{result.raw.perServingExact.totalSugars.toFixed(1)}</td>
                <td className="r">{result.raw.perServingExact.sodium.toFixed(0)}</td>
              </tr>
            </tfoot>
          </table>
        </details>
      )}

      {onAxes && axes.some((a) => a.affectsLabel) && (
        <LabelOptionsSection
          axes={axes}
          onAxes={onAxes}
          baseSlots={base.map((r) => ({ id: r.ingId, uid: r.uid, name: rowData(r).name || r.ingId, qty: rawGrams(r), unit: 'g' }))}
          recipeRows={recipeRows}
          geometry={{ basis: lmode, servingSizeG, packageSizeG, servingsPerPackage, numPackages: 1, moistureLossPct: moisture }}
        />
      )}
       </>
      )}

      {/* ≣ INGREDIENTS — read-only summary of the full recipe. */}
      {activeTab === 'ingredients' && (
        <div className="card">
          <div className="section-title"><span className="ic"><List size={16} strokeWidth={2} /></span> Ingredients ({rows.length})</div>
          <p className="muted tiny" style={{ margin: '0 0 8px' }}>Read-only — edit in <b>Build recipe</b>.</p>
          <table>
            <thead><tr><th>Ingredient</th><th>Section</th><th className="r">Qty</th><th>Unit</th><th className="r">Grams</th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="muted">No ingredients yet — add some in Build recipe.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.uid} className={r.category === 'optional' && !r.selected ? 'dim' : ''}>
                  <td>{rowData(r).name || r.ingId}</td>
                  <td>{r.category === 'base' ? 'Main' : `Optional${r.selected ? '' : ' · off'}`}</td>
                  <td className="r">{r.qty}</td>
                  <td>{UNIT_LABELS[r.unit] ?? r.unit}</td>
                  <td className="r">{(rawGrams(r) * (1 - r.waste / 100)).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ⛨ ALLERGENS — the real allergen manager, folded into the tab. */}
      {activeTab === 'allergens' && (
        draftId
          ? <AllergensCard draftId={draftId} />
          : <div className="card"><div className="section-title"><span className="ic"><ShieldAlert size={16} strokeWidth={2} /></span> Allergens</div><p className="muted">Save your draft first to manage allergens.</p></div>
      )}

      {/* $ COST — cost summary + per-ingredient nutrition breakdown. */}
      {activeTab === 'cost' && (
        <>
          <CostSummaryCard totalCents={totalCents} perServingCost={perServingCost} retail={retail} markup={markup} onMarkup={setMarkup} />
          {base.length > 0 && (
            <div className="card">
              <div className="section-title"><span className="ic"><Table size={16} strokeWidth={2} /></span> Nutrition Breakdown</div>
              <table>
                <thead><tr><th>Ingredient</th><th className="r">Cal</th><th className="r">Protein</th><th className="r">Carbs</th><th className="r">Fat</th><th className="r">Sugars</th></tr></thead>
                <tbody>
                  {base.map((r) => {
                    const d = rowData(r)
                    const grams = (r.unit === 'ml' ? r.qty * (d.densityGPerMl ?? 1) : r.qty) * (1 - r.waste / 100)
                    const c = (k: string) => ((d.per100g[k] ?? 0) * grams) / 100
                    return (
                      <tr key={r.uid}>
                        <td>{d.name || r.ingId}</td>
                        <td className="r">{Math.round(c('calories'))}</td>
                        <td className="r">{c('protein').toFixed(1)} g</td>
                        <td className="r">{c('totalCarbohydrate').toFixed(1)} g</td>
                        <td className="r">{c('totalFat').toFixed(1)} g</td>
                        <td className="r">{c('totalSugars').toFixed(1)} g</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* 🏷 LABEL — full live label preview (Public / Internal). */}
      {activeTab === 'label' && (
        <div className="card">
          <div className="section-title"><span className="ic"><Tag size={16} strokeWidth={2} /></span> Label preview</div>
          <div className="seg" style={{ marginBottom: 10 }}>
            <button className={mode === 'public' ? 'on' : ''} onClick={() => setMode('public')}>Public label</button>
            <button className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>Internal preview</button>
          </div>
          {noFactsPanel ? (
            <p className="muted" style={{ lineHeight: 1.5 }}><b style={{ color: 'var(--ink-900)' }}>No Nutrition / Supplement Facts panel.</b> {noPanelMsg} <span className="tiny">(Auto-selected from this product&apos;s category.)</span></p>
          ) : ps && result ? (
            <div style={{ maxWidth: 340 }}>
              {simpEligible && (
                <label className="muted tiny" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={simplifiedOn} onChange={(e) => setSimplifiedOn(e.target.checked)} style={{ marginTop: 1 }} />
                  <span>Use the <b>simplified format</b> (qualifies) — adds “Not a significant source of…” (21 CFR 101.9(f)).</span>
                </label>
              )}
              <FactsPanel result={result} ps={ps} serving={suggestedServing} format={panelFormat} simplified={simplifiedOn} ingredientStatement={ingredientStatement} contains={containsStatement} />
              <div className="netwt">{netContentsLabel}</div>
            </div>
          ) : (
            <p className="muted">Add ingredients + a serving size to see the label.</p>
          )}
          <p className="muted tiny" style={{ marginTop: 8 }}>{mode === 'public' ? 'Public marketplace label — base ingredients only.' : 'Internal preview — base + ticked optionals.'}</p>
        </div>
      )}

      {/* 🗂 MY RECIPES / ▦ RECIPE TEMPLATES — reuse surfaces. My recipes copies a
          past product's base slots; templates resolve curated items to the catalog. */}
      {activeTab === 'recipes' && (
        <div className="card">
          <div className="section-title"><span className="ic"><FolderOpen size={16} strokeWidth={2} /></span> My recipes</div>
          <p className="muted tiny" style={{ margin: '0 0 8px' }}>Reuse a formulation from another product — applies its base ingredients here to tweak.</p>
          {myRecipes === null ? (
            <p className="muted">Loading your recipes…</p>
          ) : myRecipes.length === 0 ? (
            <p className="muted">No other recipes yet — built products show here to reuse.</p>
          ) : (
            <table>
              <thead><tr><th>Product</th><th className="r">Ingredients</th><th>Status</th><th /></tr></thead>
              <tbody>
                {myRecipes.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name || 'Untitled product'}</td>
                    <td className="r">{r.slots.length}</td>
                    <td><span className="muted tiny">{r.status.replace(/_/g, ' ').toLowerCase()}</span></td>
                    <td className="r"><button type="button" className="btn sm" onClick={() => applyRecipe(r.slots)} disabled={r.slots.length === 0}>Apply</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {activeTab === 'templates' && (
        <div className="card">
          <div className="section-title"><span className="ic"><LayoutGrid size={16} strokeWidth={2} /></span> Recipe templates</div>
          <p className="muted tiny" style={{ margin: '0 0 8px' }}>Start from a curated formulation — ingredients are matched to your catalog to refine.</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {RECIPE_TEMPLATES.map((t) => (
              <div key={t.id} className="lo-axis" style={{ marginTop: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <b>{t.name}</b>
                    <p className="muted tiny" style={{ margin: '2px 0 0' }}>{t.desc} · {t.items.length} ingredients</p>
                  </div>
                  <button type="button" className="btn sm" onClick={() => applyTemplate(t)}>Start from this</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
       </>
      )}

      {addReplRow && onAxes && (
        <AddReplaceableOverlay
          baseName={rowData(addReplRow).name || addReplRow.ingId}
          onPick={addReplaceable}
          onClose={() => setAddReplRow(null)}
        />
      )}
    </div>
  )
}

/** Modal launched from a base ingredient row to mark it "replaceable": the base
 *  stays the default and each alternative becomes a SWAP option. Produces a
 *  single label-affecting OptionAxisUI bound to the row's baseIngredientId, fed
 *  back through the existing axes pipeline (persist + live label recompute). */
/** Small search-only overlay to add a replaceable ingredient under a base row
 *  (prototype "Add Replaceable Ingredient"). The picked ingredient is appended
 *  as a dimmed inline child row; editing + activating happen inline in the table. */
function AddReplaceableOverlay({ baseName, onPick, onClose }: {
  baseName: string
  onPick: (picked: IngredientResult) => void
  onClose: () => void
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,22,28,.45)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)', margin: 0 }}>
        <div className="section-title" style={{ justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="ic"><ArrowLeftRight size={16} strokeWidth={2} /></span> Add Replaceable Ingredient</span>
          <button type="button" onClick={onClose} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 16, color: 'var(--ink-500)' }}>✕</button>
        </div>
        <p className="muted tiny" style={{ margin: '0 0 10px' }}>Search for an ingredient to replace “{baseName}” — added as a dimmed alternative; click its ⇄ to swap in.</p>
        <IngredientPicker onPick={(p) => { onPick(p); onClose() }} placeholder="Search for replaceable ingredients…" />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/** §12b — bind label-affecting axes to base slots + per-value ingredient ops,
 *  with a live default-combination preview via resolveConfiguredSelection. */
function LabelOptionsSection({
  axes, onAxes, baseSlots, recipeRows, geometry,
}: {
  axes: OptionAxisUI[]
  onAxes: (a: OptionAxisUI[]) => void
  /** id = stable baseIngredientId (binding key); uid = ephemeral engine row id. */
  baseSlots: Array<{ id: string; uid: string; name: string; qty: number; unit: string }>
  recipeRows: RecipeRow[]
  geometry: Parameters<typeof calculateLabel>[1]
}) {
  const [, startPick] = useTransition()
  const labelAxes = axes.map((a, i) => ({ a, i })).filter(({ a }) => a.affectsLabel)

  function patchAxis(i: number, p: Partial<OptionAxisUI>) {
    onAxes(axes.map((a, j) => (j === i ? { ...a, ...p } : a)))
  }
  function patchValue(ai: number, vi: number, p: Partial<OptionValueUI>) {
    onAxes(axes.map((a, j) => (j !== ai ? a : { ...a, values: a.values.map((v, k) => (k === vi ? { ...v, ...p } : v)) })))
  }
  function pickFor(ai: number, vi: number, picked: IngredientResult) {
    startPick(async () => {
      const res = await getIngredientNutrition(picked.id)
      patchValue(ai, vi, { overlayIngId: picked.id, overlayIngName: picked.internalName, overlayPer100g: res.ok ? res.data.per100g : {} })
    })
  }

  // Live preview of the DEFAULT combination (each label-affecting axis's default).
  // Axes bind by baseIngredientId; the engine matches rows by uid, so translate.
  const overlays: OptionOverlay[] = []
  for (const { a } of labelAxes) {
    const v = a.values.find((x) => x.isDefault) ?? a.values[0]
    if (!v) continue
    const slot = baseSlots.find((s) => s.id === a.boundSlotId)
    if (v.overlayOp === 'SWAP' && slot && v.overlayPer100g) {
      overlays.push({ op: 'SWAP', slotId: slot.uid, ingredient: { id: v.overlayIngId || 'opt', name: v.overlayIngName || v.label, per100g: v.overlayPer100g, quantity: slot.qty, unit: slot.unit } })
    } else if (v.overlayOp === 'ADD' && v.overlayPer100g) {
      overlays.push({ op: 'ADD', ingredient: { id: v.overlayIngId || 'opt', name: v.overlayIngName || v.label, per100g: v.overlayPer100g, quantity: v.overlayQty ?? 1, unit: v.overlayUnit ?? 'g' } })
    } else if (v.overlayOp === 'REMOVE' && slot) {
      overlays.push({ op: 'REMOVE', slotId: slot.uid })
    }
  }
  const baseList = publicSelection(recipeRows)
  const baseLabel = baseList.length ? calculateLabel(baseList, geometry) : null
  const cfgList = resolveConfiguredSelection(recipeRows, [], overlays)
  const cfgLabel = cfgList.length ? calculateLabel(cfgList, geometry) : null

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-title"><span className="ic"><FlaskConical size={16} strokeWidth={2} /></span> Label options · bind ingredient changes</div>
      {labelAxes.map(({ a, i }) => (
        <div key={i} className="lo-axis">
          <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b>{a.label || 'Option'}</b>
            <label className="tiny muted">Bind to slot{' '}
              <select value={a.boundSlotId ?? ''} onChange={(e) => patchAxis(i, { boundSlotId: e.target.value || null })}>
                <option value="">— none (Add only) —</option>
                {baseSlots.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Value</th><th>Operation</th><th>Ingredient</th></tr></thead>
            <tbody>
              {a.values.map((v, vi) => (
                <tr key={vi}>
                  <td>{v.label || `Value ${vi + 1}`}{v.isDefault && <span className="muted tiny"> · default</span>}</td>
                  <td>
                    <select value={v.overlayOp ?? 'NONE'} onChange={(e) => patchValue(i, vi, { overlayOp: e.target.value as OptionValueUI['overlayOp'] })}>
                      <option value="NONE">No change</option>
                      <option value="SWAP">Swap slot</option>
                      <option value="ADD">Add ingredient</option>
                      <option value="REMOVE">Remove slot</option>
                    </select>
                  </td>
                  <td>
                    {(v.overlayOp === 'SWAP' || v.overlayOp === 'ADD') ? (
                      v.overlayIngName
                        ? <span className="tiny">{v.overlayIngName} <button className="lo-link" onClick={() => patchValue(i, vi, { overlayIngId: undefined, overlayIngName: undefined, overlayPer100g: undefined })}>change</button></span>
                        : <IngredientPicker onPick={(p) => pickFor(i, vi, p)} placeholder="Pick ingredient…" />
                    ) : <span className="muted tiny">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {baseLabel && cfgLabel && (
        <div className="lo-prev">
          Default combination · Calories {baseLabel.perServing.calories} → <b>{cfgLabel.perServing.calories}</b> ·
          Sugars {baseLabel.perServing.totalSugars.amount}g → <b>{cfgLabel.perServing.totalSugars.amount}g</b>
          <span className="muted tiny"> (per serving)</span>
        </div>
      )}
      <style>{`
        .rb .lo-axis{border:1px solid var(--ink-200);border-radius:16px;padding:12px;margin-top:10px}
        .rb .lo-axis select{border:1px solid var(--ink-200);border-radius:8px;padding:4px 8px;font:inherit;font-size:12px;background:#fff}
        .rb .lo-prev{margin-top:12px;border:1px solid var(--pink-100);background:var(--pink-50);color:var(--pink-700);border-radius:10px;padding:8px 12px;font-size:12px}
        .rb .lo-link{background:none;border:0;color:var(--pink-700);cursor:pointer;font:inherit;font-size:11px;text-decoration:underline}
      `}</style>
    </div>
  )
}

/** Cost summary with an editable retail markup. Rendered in both the Build and
 *  Cost tabs (one source of truth). Per-ingredient catalog costs aren't captured
 *  yet, so "total ingredient cost" reflects what cost data the rows carry. */
function CostSummaryCard({
  totalCents, perServingCost, retail, markup, onMarkup,
}: {
  totalCents: number
  perServingCost: number
  retail: number
  markup: number
  onMarkup: (m: number) => void
}) {
  return (
    <div className="card">
      <div className="section-title"><span className="ic"><DollarSign size={16} strokeWidth={2} /></span> Cost Summary</div>
      <div className="costgrid">
        <div className="costtile"><div className="l">Total ingredient cost</div><div className="v">${totalCents.toFixed(2)}</div></div>
        <div className="costtile retail"><div className="l">Suggested retail / serving</div><div className="v">${retail.toFixed(2)}</div></div>
      </div>
      <div className="costfoot"><span>Per serving cost</span><b>${perServingCost.toFixed(3)}</b></div>
      <div className="costfoot" style={{ borderTop: 0, paddingTop: 6 }}>
        <span>
          Retail markup ×
          <i className="info" data-tip="Suggested retail = per-serving cost × markup. Set your target margin; fees configured in Variants & packs apply at checkout.">i</i>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <input
            className="qty"
            type="number"
            min={1}
            step={0.1}
            value={markup}
            onChange={(e) => onMarkup(Math.max(1, parseFloat(e.target.value) || 1))}
            aria-label="Retail markup multiplier"
          />
          <b>${perServingCost.toFixed(3)} × {markup} = ${retail.toFixed(2)}</b>
        </span>
      </div>
    </div>
  )
}

type LabelResult = NonNullable<ReturnType<typeof calculateLabel>>

// Find Serving Size — FDA reference-amount (RACC) picker. General foods vs.
// infants, searchable, one click fills the descriptive serving + gram weight.
function FindServingModal({ onClose, onPick }: { onClose: () => void; onPick: (serving: string, grams: number) => void }) {
  const [tab, setTab] = useState<'general' | 'infant'>('general')
  const [q, setQ] = useState('')
  const source = tab === 'general' ? RACC : RACC_INFANT
  const list = q.trim() ? source.filter((r) => r.group.toLowerCase().includes(q.toLowerCase())) : source
  return (
    <div className="fs-overlay" role="dialog" aria-modal="true" aria-label="Find serving size" onClick={onClose}>
      <div className="fs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fs-head">
          <b>Find Serving Size</b>
          <button type="button" className="fs-x" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="fs-seg">
          <button className={tab === 'general' ? 'on' : ''} onClick={() => setTab('general')}>General foods</button>
          <button className={tab === 'infant' ? 'on' : ''} onClick={() => setTab('infant')}>Infants and young (1–3 years of age)</button>
        </div>
        <div style={{ padding: '0 16px' }}>
          <span className="f">Search product category</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. bread, syrup, candies, bar" style={{ width: '100%' }} />
        </div>
        <div className="fs-list">
          {list.map((r) => (
            <div key={r.group} className="fs-row">
              <div><b>{r.group}</b><span className="muted tiny" style={{ marginLeft: 8 }}>{r.serving} · {r.grams} g</span></div>
              <button type="button" className="btn pink sm" onClick={() => onPick(r.serving, r.grams)}>Select</button>
            </div>
          ))}
          {list.length === 0 && <p className="muted tiny" style={{ padding: 16 }}>No categories match “{q}”.</p>}
        </div>
      </div>
    </div>
  )
}

// Add custom measure — define an account-specific unit for one ingredient,
// e.g. "1 case = 500 g" (Weight) or "1 scoop = 30 ml" (Volume). Resolves to
// grams-per-1-unit so the recipe math stays in the engine's canonical grams.
function AddCustomMeasureModal({
  ingredientName, existing, onClose, onSave,
}: { ingredientName: string; existing: Array<{ name: string; grams: number }>; onClose: () => void; onSave: (name: string, grams: number) => void }) {
  const [kind, setKind] = useState<'weight' | 'volume'>('weight')
  const [qty, setQty] = useState('1')
  const [name, setName] = useState('')
  const [eqQty, setEqQty] = useState('')
  const [eqUnit, setEqUnit] = useState('g')
  const opts = kind === 'weight' ? ['g', 'kg', 'oz', 'lb'] : ['ml', 'fl_oz', 'cup', 'tbsp', 'tsp']
  const q = parseFloat(qty), eq = parseFloat(eqQty)
  const gramsPerUnit = q > 0 && eq > 0 ? toGrams(eq, eqUnit) / q : 0
  const dupe = !!name.trim() && existing.some((e) => e.name.toLowerCase() === name.trim().toLowerCase())
  const valid = !!name.trim() && gramsPerUnit > 0 && !dupe
  return (
    <div className="fs-overlay" role="dialog" aria-modal="true" aria-label="Add custom measure" onClick={onClose}>
      <div className="fs-modal" style={{ width: 'min(520px,100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="fs-head"><b>Add custom measure</b><button type="button" className="fs-x" aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="fs-seg">
          <button className={kind === 'weight' ? 'on' : ''} onClick={() => { setKind('weight'); setEqUnit('g') }}>Weight</button>
          <button className={kind === 'volume' ? 'on' : ''} onClick={() => { setKind('volume'); setEqUnit('ml') }}>Volume</button>
        </div>
        <div style={{ padding: '4px 16px 16px' }}>
          <p className="muted tiny" style={{ marginTop: 0 }}>For things like <em>case, jar, 12-pack</em>. Specific to {ingredientName || 'this ingredient'} only.</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="num" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" />
            <input style={{ flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "case"' aria-label="Unit name" />
          </div>
          <div style={{ textAlign: 'center', color: 'var(--ink-500)', fontSize: 12, margin: '10px 0' }}>is equivalent to</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="num" type="number" min={0} value={eqQty} onChange={(e) => setEqQty(e.target.value)} aria-label="Equivalent quantity" />
            <select style={{ flex: 1 }} value={eqUnit} onChange={(e) => setEqUnit(e.target.value)}>
              {opts.map((u) => <option key={u} value={u}>{UNIT_LABELS[u] ?? u}</option>)}
            </select>
          </div>
          {dupe && <p className="rb-warn" style={{ marginTop: 10 }}>“{name.trim()}” already exists for this ingredient.</p>}
          {valid && <p className="muted tiny" style={{ marginTop: 8 }}>1 {name.trim()} = {gramsPerUnit.toFixed(1)} g</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" className="btn pink sm" disabled={!valid} style={!valid ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} onClick={() => valid && onSave(name.trim(), gramsPerUnit)}>Save</button>
            <button type="button" className="btn sm" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Live label — renders the canonical FDA Nutrition Facts panel as print-grade SVG
// (@ilaunchify/ui NutritionFactsSvg), fed by the engine's toPanelData (single
// source of truth for the math). When the package holds 2–3 servings, FDA
// (21 CFR 101.9(e)) requires the dual "per serving | per container" column
// format — surfaced here via perContainerPanel.
function FactsPanel({ result, title, narrow, serving, format = 'STANDARD', simplified = false, ingredientStatement, contains }: { result: LabelResult; ps?: LabelResult['perServing']; title?: string; narrow?: boolean; serving?: string; format?: 'STANDARD' | 'SUPPLEMENT_FACTS' | 'TABULAR' | 'LINEAR'; simplified?: boolean; ingredientStatement?: string; contains?: string }) {
  const data = toPanelData(result, { suggestedServing: serving, showVoluntaryFats: true, format, simplified })
  // Dual-column (per serving | per container, 21 CFR 101.9(e)) is an explicit
  // opt-in for the specific 2–3-serving single-eating-occasion case — NOT auto-
  // applied (auto-applying it made the standard panel look wrong). Default = the
  // standard single-column Nutrition Facts.
  const dual = false
  const perContainer = dual ? perContainerPanel(result, { suggestedServing: serving }) : undefined
  return (
    <div style={narrow ? { minWidth: 196, flex: '0 0 auto' } : undefined}>
      {title && <div className="flavhdr" style={{ marginBottom: 6 }}>{title}</div>}
      <NutritionFactsSvg
        data={data}
        perContainer={perContainer}
        columnHeaders={dual ? { primary: 'Per serving', secondary: 'Per container' } : undefined}
        ingredientStatement={ingredientStatement}
        contains={contains}
        widthPx={narrow ? 196 : dual ? 340 : 290}
      />
    </div>
  )
}

const CSS = `
.rb{font-size:var(--fs-sm);color:var(--ink-900)}
.rb .muted{color:var(--ink-500)} .rb .tiny{font-size:10.5px}
.rb-tabs{display:flex;gap:22px;border-bottom:1px solid var(--ink-200);margin-bottom:14px;overflow:auto}
.rb-tab{display:inline-flex;align-items:center;gap:6px;padding:12px 2px;font-weight:600;color:var(--ink-500);cursor:pointer;border-bottom:2px solid transparent;font-size:12.5px;white-space:nowrap}
.rb-tab .rb-tab-ic{width:15px;height:15px;flex:0 0 auto;stroke-width:2}
.rb-tab.on{color:var(--pink-700);border-color:var(--pink)}
.rb-wrap{display:grid;grid-template-columns:1fr 300px;gap:18px}
.rb-wrap.solo{grid-template-columns:1fr}
.rb .card{margin-bottom:16px}
.agebar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;border:1px solid var(--pink-100);background:var(--pink-50);border-radius:16px;padding:12px 16px;margin-bottom:16px}
.agebar-l{display:flex;flex-direction:column;gap:2px;min-width:220px}
.agebar-t{font-weight:700;font-size:13.5px;color:var(--ink-900)}
.agebar-s{font-size:11px;color:var(--ink-500)}
.agebar-seg{display:inline-flex;background:#fff;border:1px solid var(--pink-100);border-radius:999px;padding:3px}
.agebar-seg button{appearance:none;border:0;background:transparent;color:var(--ink-500);font-weight:600;font-size:12px;padding:7px 14px;border-radius:999px;cursor:pointer;white-space:nowrap}
.agebar-seg button:hover{color:var(--ink-900)}
.agebar-seg button.on{background:var(--ink-900);color:#fff}
.agebar-seg button:focus-visible{outline:2px solid var(--pink);outline-offset:2px}
.rb table{width:100%;border-collapse:collapse}
.rb th{font-size:11px;color:var(--ink-500);text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:8px 6px;border-bottom:1px solid var(--ink-200)}
.rb th.r,.rb td.r{text-align:right} .rb .grn{color:var(--pink-700);font-weight:700}
.rb td{padding:7px 6px;border-bottom:1px solid var(--ink-100);vertical-align:middle;font-size:12.5px}
.rb input,.rb select{border:1px solid var(--ink-200);border-radius:var(--input-radius);padding:6px 8px;font:inherit;font-size:12.5px;background:#fff}
.rb input:focus,.rb select:focus{outline:none;border-color:var(--pink);box-shadow:0 0 0 3px var(--pink-50)}
/* All compact table fields share the Waste field's width — equal, not wider. */
.rb .qty,.rb .waste,.rb .num{width:52px;text-align:center;padding-left:4px;padding-right:4px}
.rb select.num{width:52px}
.rb .costcell{display:inline-flex;gap:3px;align-items:center;justify-content:flex-end}
.rb .costins{display:inline-flex;flex-direction:column;gap:3px}
.rb .curin{display:inline-flex;align-items:center;gap:2px;justify-content:flex-end}
.rb .cursym{font-size:14px;font-weight:700;color:var(--pink);min-width:18px;text-align:right}
.rb .costcell .num{width:46px}
.rb .cu{width:46px;padding:6px 2px;text-align:center}
.rb .rwcell{display:inline-flex;gap:5px;align-items:center;justify-content:flex-end}
.rb .rwcell .num{width:52px}
.rb .circle{width:24px;height:24px;border-radius:50%;border:1px solid var(--ink-200);background:#fff;display:grid;place-items:center;cursor:pointer;color:var(--pink)}
.rb .circle.chk{border-color:var(--pink);background:var(--pink-50)}
.rb .dim{opacity:.5} .rb .del{color:var(--danger-600);cursor:pointer}
.rb .res{display:flex;justify-content:space-between;align-items:center;border:1px solid var(--ink-200);border-radius:10px;padding:9px 12px;margin-bottom:8px;cursor:pointer}
.rb .res:hover{border-color:var(--pink-100);background:var(--pink-50)}
.rb input[type=radio]{accent-color:var(--ink-700)}
.rb .radio{display:flex;gap:20px;margin:6px 0 12px} .rb .radio label{display:flex;gap:6px;align-items:center;cursor:pointer}
.rb .subtab{display:inline-flex;border-bottom:1px solid var(--ink-200);gap:18px;margin-bottom:12px;width:100%}
.rb .subtab button{border:0;background:transparent;padding:8px 2px;font:inherit;font-weight:600;color:var(--ink-500);cursor:pointer;border-bottom:2px solid transparent}
.rb .subtab button.on{color:var(--pink-700);border-color:var(--pink)}
.rb .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px} .rb .row2 input{width:100%}
.rb .f{display:block;font-size:10.5px;color:var(--ink-500);margin-bottom:3px}
.rb .makes{color:var(--pink-700);font-size:12px;margin:6px 0 0}
.rb .costgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px 0 12px}
.rb .costtile{border:1px solid var(--ink-200);border-radius:10px;padding:9px 11px}
.rb .costtile .l{font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-500)}
.rb .costtile .v{font-size:18px;font-weight:800;margin-top:2px} .rb .costtile.retail .v{color:var(--pink-700)}
.rb .costfoot{display:flex;justify-content:space-between;border-top:1px solid var(--ink-200);padding-top:10px;font-size:12px;color:var(--ink-500)} .rb .costfoot b{color:var(--ink-900)}
.rb .seg{display:inline-flex;border:1px solid var(--ink-200);border-radius:999px;padding:3px;background:#fff;gap:3px}
.rb .seg button{border:0;background:transparent;padding:6px 16px;border-radius:999px;font:inherit;font-size:12px;font-weight:600;color:var(--ink-500);cursor:pointer}
.rb .seg button.on{background:var(--ink-900);color:#fff}
.rb .facts{border:2px solid #000;border-radius:4px;padding:8px;font-family:Helvetica,Arial,sans-serif;color:#000;background:#fff;font-size:11px}
.rb .facts h2{font-size:23px;margin:0;font-weight:800;border-bottom:6px solid #000;padding-bottom:2px}
.rb .b8{border-bottom:8px solid #000}
.rb .cal{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:4px solid #000;margin-top:3px} .rb .cal .n{font-size:28px;font-weight:800}
.rb .fr{display:flex;justify-content:space-between;border-bottom:1px solid #000;padding:1px 0}
.rb .netwt{border:1px solid var(--ink-200);border-radius:10px;padding:8px 10px;margin-top:10px;font-weight:700;font-size:13px}
.rb .flavtabs{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-bottom:10px;border-bottom:1px solid var(--ink-200);padding-bottom:0}
.rb .flavtab{border:1px solid transparent;border-bottom:0;background:transparent;color:var(--pink-700);cursor:pointer;font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px 8px 0 0;margin-bottom:-1px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rb .flavtab:hover{color:var(--ink-900);background:var(--pink-50)}
.rb .flavtab.on{color:var(--ink-900);background:#fff;border-color:var(--ink-200);border-bottom:1px solid #fff;font-weight:700}
.rb .flavtab.add{color:var(--pink-700);font-weight:600;border-style:dashed;border-color:var(--pink-100);border-bottom-color:var(--pink-100);border-radius:8px;margin-bottom:0}
.rb .flavedit{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}
.rb .flavname{flex:1 1 120px;min-width:100px;border:1px solid var(--ink-200);border-radius:8px;padding:6px 9px;font:inherit;font-weight:600;color:var(--ink-900)}
.rb .flavbuilder{border:1px solid var(--ink-200);border-radius:10px;padding:10px;margin-bottom:10px;background:var(--pink-50)}
.rb .flavbuilder-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:12px;font-weight:600;color:var(--ink-900);margin-bottom:6px}
.rb .flavbuilder table{background:#fff;border-radius:8px}
.rb .del{border:0;background:transparent;cursor:pointer;font-size:13px;opacity:.7;padding:0 2px}
.rb .del:hover{opacity:1}
.rb .varietypack{margin-top:14px;padding-top:12px;border-top:2px solid var(--ink-900)}
.rb .vp-h{font-size:13px;font-weight:700;color:var(--ink-900);margin-bottom:8px}
.rb .seg.sm button{font-size:11px;padding:4px 9px}
.rb .flavhdr{background:var(--pink-50);color:var(--pink-700);font-weight:700;font-size:11px;text-align:center;padding:3px;border:1px solid var(--pink-100);border-radius:4px 4px 0 0;margin:-8px -8px 6px}
/* Readable hover tooltip for the "i" info icons (replaces the tiny native title). */
.rb .info{display:inline-grid;place-items:center;width:15px;height:15px;border-radius:50%;background:var(--pink-50);color:var(--pink-700);font-size:10px;font-weight:700;cursor:help;margin-left:5px;border:1px solid var(--pink-100);font-style:normal}
.rb .info[data-tip]{position:relative}
.rb .info[data-tip]:hover::after,.rb .info[data-tip]:focus::after{content:attr(data-tip);position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);width:max-content;max-width:280px;white-space:normal;text-align:left;background:var(--ink-900);color:#fff;font-size:11.5px;font-weight:400;line-height:1.45;font-style:normal;letter-spacing:0;padding:8px 10px;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.22);z-index:60;pointer-events:none}
.rb .info[data-tip]:hover::before,.rb .info[data-tip]:focus::before{content:"";position:absolute;left:50%;bottom:calc(100% + 2px);transform:translateX(-50%);border:6px solid transparent;border-top-color:var(--ink-900);z-index:60;pointer-events:none}
.rb .rb-warn{margin-top:10px;background:var(--warning-50);border:1px solid var(--warning-200);color:var(--warning-700);font-size:11.5px;line-height:1.45;border-radius:10px;padding:9px 11px}
/* Find Serving Size modal */
.fs-overlay{position:fixed;inset:0;background:rgba(20,20,24,.5);display:grid;place-items:start center;padding:48px 16px;z-index:200;overflow:auto}
.fs-modal{background:#fff;border-radius:16px;width:min(640px,100%);box-shadow:0 24px 80px rgba(0,0,0,.3);overflow:hidden}
.fs-head{display:flex;justify-content:space-between;align-items:center;padding:16px 16px 8px;font-size:18px}
.fs-x{border:0;background:transparent;font-size:16px;color:var(--ink-500);cursor:pointer;width:28px;height:28px;border-radius:50%}
.fs-x:hover{background:var(--ink-100)}
.fs-seg{display:flex;gap:8px;padding:6px 16px 12px}
.fs-seg button{flex:1;border:1px solid var(--pink-100);background:#fff;color:var(--pink-700);font:inherit;font-weight:600;font-size:12.5px;padding:9px 10px;border-radius:8px;cursor:pointer}
.fs-seg button.on{background:var(--pink);color:#fff;border-color:var(--pink)}
.fs-list{max-height:52vh;overflow:auto;padding:8px 16px 16px}
.fs-row{display:flex;justify-content:space-between;align-items:center;gap:12px;border-left:3px solid var(--pink-100);background:#fff;border-bottom:1px solid var(--ink-200);padding:11px 12px}
.fs-row:hover{background:var(--pink-50)}
@media(max-width:900px){.rb-wrap{grid-template-columns:1fr}}
`
