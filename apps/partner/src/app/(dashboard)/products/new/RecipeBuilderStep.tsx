'use client'

// Step 3 content — faithful port of docs/prototypes/recipe-builder-demo.html.
// Ingredients (base + replaceable + optional) · ReciPal Packaging & Serving ·
// Cost Summary · live Nutrition Facts (Public/Preview). The live label is
// computed by the real @ilaunchify/nutrition engine, not a mock.

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { calculateLabel, publicSelection, previewSelection, resolveConfiguredSelection, formatNetWeight, toGrams, type RecipeRow, type Nutrients, type OptionOverlay } from '@ilaunchify/nutrition'
import { IngredientPicker } from '../[id]/edit/cards/IngredientPicker'
import { type OptionAxisUI, type OptionValueUI } from './OptionAxesCard'
import { searchIngredients, type IngredientResult } from '../[id]/edit/ingredient-actions'
import { getIngredientNutrition, saveRecipeSlots, listMyRecipes, loadSlotCosts, type MyRecipe } from './build-actions'
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
  // Manufacturer's ingredient cost (¢ per kg) — drives the real cost summary.
  costPerKgCents?: number | null
}

let counter = 0
const uid = () => `r${++counter}`

// Selectable recipe units (mirrors the engine's AVAILABLE_UNITS, minus 'each'
// which needs a per-piece weight we don't capture). Volume units only convert
// to mass with a density, so they're shown only for ingredients that have one.
const VOLUME_UNITS = new Set(['ml', 'l', 'fl_oz', 'cup', 'tbsp', 'tsp'])
const UNIT_LABELS: Record<string, string> = { g: 'g', kg: 'kg', oz: 'oz', lb: 'lb', ml: 'ml', l: 'L', fl_oz: 'fl oz', cup: 'cup', tbsp: 'tbsp', tsp: 'tsp' }
const SELECTABLE_UNITS = ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'fl_oz', 'cup', 'tbsp', 'tsp']

type TabKey = 'build' | 'ingredients' | 'allergens' | 'cost' | 'label' | 'recipes' | 'templates'
const TABS: Array<{ key: TabKey; label: string; soon?: boolean }> = [
  { key: 'build', label: '🍽 BUILD RECIPE' },
  { key: 'ingredients', label: '≣ INGREDIENTS' },
  { key: 'allergens', label: '⛨ ALLERGENS' },
  { key: 'cost', label: '$ COST' },
  { key: 'label', label: '🏷 LABEL' },
  { key: 'recipes', label: '🗂 MY RECIPES' },
  { key: 'templates', label: '▦ RECIPE TEMPLATES' },
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
  labelingType = 'FOOD',
  initialEntryMode = null,
}: {
  productName: string
  /** From the chosen packing type — SINGLE = one recipe, MULTI = base + presets. */
  flavorMode?: 'SINGLE' | 'MULTI'
  /** Cap on Facts columns for multi types (manufacturer picks ≤ this). */
  maxColumns?: number
  /** Shared flavor list defined in Variants & packs. */
  flavors?: Array<{ name: string; ingId: string; soi: string }>
  onFlavors?: (f: Array<{ name: string; ingId: string; soi: string }>) => void
  /** Draft id — when present, real-picked base slots autosave to it. */
  draftId?: string | null
  /** Shared configurable axes — label-affecting ones bind overlays here (§12b). */
  axes?: OptionAxisUI[]
  onAxes?: (a: OptionAxisUI[]) => void
  /** Restored base recipe slots (edit mode) — seeds rows so editing shows the
   *  real recipe and the autosave round-trips instead of wiping it. */
  initialRows?: Array<{ ingId: string; name: string; per100g: Record<string, number>; densityGPerMl: number | null; weightG: number }>
  /** Mode 2 (AI parser) enabled for this partner's plan (Trusted+). */
  aiAvailable?: boolean
  /** Mode 3 (declared panel) enabled for this partner's plan. */
  declareAvailable?: boolean
  /** Drives the declared-panel Nutrition vs Supplement Facts default. */
  labelingType?: string
  /** Restored recipe entry mode (resume) — reopens the builder on that surface. */
  initialEntryMode?: Mode | null
}) {
  // Start from the restored recipe, or empty — a new product begins with no
  // ingredients (the partner adds real ones via the picker). The old demo seed
  // rows (water/yuzu/monk) were prototype scaffolding and couldn't persist
  // (not real Ingredient rows), so they're gone.
  const [rows, setRows] = useState<Row[]>(() =>
    (initialRows ?? []).map((s) => ({ uid: uid(), ingId: s.ingId, qty: s.weightG, unit: 'g' as const, waste: 0, category: 'base' as const, selected: true, name: s.name, per100g: s.per100g, densityGPerMl: s.densityGPerMl ?? undefined })),
  )
  const [search, setSearch] = useState('')
  const [addCat, setAddCat] = useState<'base' | 'optional'>('base')
  const [lmode, setLmode] = useState<'package' | 'serving'>('serving')
  const [servingSizeG, setServingSizeG] = useState(30)
  const [packageSizeG, setPackageSizeG] = useState(355)
  const [servingsPerPackage, setServingsPerPackage] = useState(1)
  const [moisture, setMoisture] = useState(0)
  const [subtab, setSubtab] = useState<'pack' | 'adv'>('pack')
  const [mode, setMode] = useState<'public' | 'preview'>('public')
  // Recipe entry method (Search / AI / Declare) + whether the chooser shows its
  // three tiles (open) or the collapsed "Built with: X · Switch mode" pill.
  const [entryMode, setEntryMode] = useState<Mode>(initialEntryMode ?? 'SEARCH_BUILD')
  const [chooserOpen, setChooserOpen] = useState<boolean>(
    !initialEntryMode && !(initialRows && initialRows.length),
  )
  // Active Search & build tab (the 7-tab nav). BUILD is the full editor; the
  // others are focused read views.
  const [activeTab, setActiveTab] = useState<TabKey>('build')
  // Retail markup multiplier over per-serving cost (manufacturer-set; was a
  // hardcoded 4× demo). Suggested retail = per-serving cost × markup.
  const [markup, setMarkup] = useState(4)
  // The base row whose "replaceable" swap modal is open (null = closed).
  const [swapRow, setSwapRow] = useState<Row | null>(null)
  // Ingredients whose nested swap-option list is COLLAPSED (default = expanded,
  // so a freshly-made-replaceable ingredient shows its alternatives immediately).
  const [collapsedSwaps, setCollapsedSwaps] = useState<Set<string>>(() => new Set())
  const toggleSwapOpen = (ingId: string) =>
    setCollapsedSwaps((s) => { const n = new Set(s); if (n.has(ingId)) n.delete(ingId); else n.add(ingId); return n })
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
  // Flavors come from the Variants & packs step (shared). Each = a name + its
  // own distinct flavor ingredient overlaid on the shared base, so each Facts
  // column shows DIFFERENT numbers.
  const setFlavors = (f: Array<{ name: string; ingId: string; soi: string }>) => onFlavors?.(f)

  const ing = (id: string) => LIBRARY.find((l) => l.id === id)
  const [, startPick] = useTransition()
  // Real per-flavor ingredient (MULTI products): each flavor column gets a
  // distinct ingredient picked from the live catalog (replaces the demo
  // library). The per100g cache feeds the per-flavor Facts columns.
  const [flavorPickIdx, setFlavorPickIdx] = useState<number | null>(null)
  const [flavorIng, setFlavorIng] = useState<Record<string, { name: string; per100g: Record<string, number> }>>({})
  function pickFlavorIng(idx: number, picked: IngredientResult) {
    startPick(async () => {
      const res = await getIngredientNutrition(picked.id)
      setFlavorIng((c) => ({ ...c, [picked.id]: { name: picked.internalName, per100g: res.ok ? res.data.per100g : {} } }))
      setFlavors(flavors.map((x, j) => (j === idx ? { ...x, ingId: picked.id } : x)))
      setFlavorPickIdx(null)
    })
  }
  // Hydrate the cache for real flavor ids not yet fetched (resume). Demo/empty
  // ids (no real Ingredient) simply resolve to no column until a real pick.
  useEffect(() => {
    const missing = [...new Set(flavors.map((f) => f.ingId).filter((id) => id && !flavorIng[id]))]
    if (missing.length === 0) return
    startPick(async () => {
      const updates: Record<string, { name: string; per100g: Record<string, number> }> = {}
      for (const id of missing) {
        const res = await getIngredientNutrition(id)
        if (res.ok) updates[id] = { name: '(saved ingredient)', per100g: res.data.per100g }
      }
      if (Object.keys(updates).length) setFlavorIng((c) => ({ ...c, ...updates }))
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
  const rawGrams = (r: Row) => toGrams(r.qty, r.unit, { densityGPerMl: rowData(r).densityGPerMl ?? undefined })
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
      const res = await getIngredientNutrition(picked.id)
      setRows((rs) => [...rs, {
        uid: uid(), ingId: picked.id, qty: 0, unit: 'g', waste: 0, category: addCat, selected: addCat === 'base',
        name: picked.internalName, per100g: res.ok ? res.data.per100g : {}, densityGPerMl: res.ok ? res.data.densityGPerMl : picked.densityGPerML,
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
    quantity: rawGrams(r), unit: 'g', trimWastePct: r.waste, category: r.category, selected: r.selected,
  }))
  const selected = mode === 'public' ? publicSelection(recipeRows) : previewSelection(recipeRows)
  const result = selected.length
    ? calculateLabel(selected, { basis: lmode, servingSizeG, packageSizeG, servingsPerPackage, numPackages: 1, moistureLossPct: moisture })
    : null
  const ps = result?.perServing

  // Per-flavor label: shared base recipe + that flavor's distinct ingredient,
  // so each column carries its own calories/sugar/etc.
  function flavorResult(ingId: string) {
    const fi = flavorIng[ingId]
    if (!fi) return null // no real ingredient picked for this flavor yet
    const baseRows = publicSelection(recipeRows)
    const overlay: RecipeRow = {
      id: `flav-${ingId}`, name: fi.name, per100g: fi.per100g,
      quantity: 20, unit: 'g', category: 'base', selected: true,
    }
    const all = [...baseRows, overlay]
    return all.length
      ? calculateLabel(all, { basis: lmode, servingSizeG, packageSizeG, servingsPerPackage, numPackages: 1, moistureLossPct: moisture })
      : null
  }

  // Real batch ingredient cost ($), from each ingredient's $/kg applied to its
  // raw purchased weight (cost is on what you buy, before waste loss).
  const totalCents = rows.reduce((sum, r) => {
    const grams = rawGrams(r)
    const costPerKg = (r.costPerKgCents ?? 0) / 100 // dollars per kg
    return sum + costPerKg * (grams / 1000)
  }, 0)
  const perServingCost = result && result.geometry.totalServings > 0 ? totalCents / result.geometry.totalServings : 0
  const retail = perServingCost * markup

  return (
    <div className="rb">
      <style>{CSS}</style>

      {/* Mode 1/2/3 chooser — Search & build · Parse with AI · Declare panel. */}
      <div style={{ marginBottom: 14 }}>
        <ModeChooser
          currentMode={entryMode}
          collapsed={!chooserOpen}
          aiAvailable={aiAvailable && !!draftId}
          declareAvailable={declareAvailable && !!draftId}
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
          ? <DeclaredPanelPanel productTemplateId={draftId} labelingType={labelingType} existingSlotCount={base.length} onSaved={() => setChooserOpen(false)} onCancel={() => { setEntryMode('SEARCH_BUILD'); setChooserOpen(false) }} />
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
            {t.label}
            {t.soon && <span style={{ marginLeft: 5, fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--mut)', border: '1px solid var(--bd)', borderRadius: 999, padding: '1px 5px' }}>soon</span>}
          </div>
        ))}
      </div>

      {activeTab === 'build' && (
       <>
      <div className="rb-wrap">
        <div>
          {/* Recipe Ingredients */}
          <div className="rb-card">
            <div className="rb-h">🍽 Recipe Ingredients ({base.length})</div>
            <table>
              <thead><tr><th style={{ width: '99%' }}>Ingredient Name</th><th className="r" style={{ width: 1, whiteSpace: 'nowrap' }} /><th className="r">Qty</th><th className="r">Unit</th><th className="r">Waste %</th><th className="r">Grams</th><th className="r">$/kg</th><th /></tr></thead>
              <tbody>
                {base.map((r) => {
                  const swap = onAxes ? swapAxisFor(r.ingId) : undefined
                  const swapAlts = swap ? swap.values.filter((v) => v.overlayOp === 'SWAP') : []
                  const swapN = swapAlts.length
                  const swapOpen = !collapsedSwaps.has(r.ingId)
                  const showVol = rowData(r).densityGPerMl != null || VOLUME_UNITS.has(r.unit)
                  return (
                  <Fragment key={r.uid}>
                  <tr>
                    <td>{rowData(r).name}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      {onAxes && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            title={swap
                              ? `Replaceable ingredient · ${swapN} swap option${swapN === 1 ? '' : 's'}. Click to edit which alternatives the creator can choose — the FDA label recomputes per choice.`
                              : 'Make this ingredient replaceable — let the creator swap it for an alternative you approve. The Nutrition Facts label recomputes for each option.'}
                            aria-label={swap ? 'Edit replaceable swap options' : 'Make ingredient replaceable'}
                            onClick={() => setSwapRow(r)}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: `1.5px solid ${swap ? 'var(--g2)' : '#c4c9d4'}`, background: swap ? 'rgba(120,190,40,.16)' : 'transparent', color: swap ? 'var(--g2)' : '#6b7280', cursor: 'pointer', fontSize: 13, fontWeight: 700, lineHeight: 1, padding: 0, flex: '0 0 auto' }}
                          >⇄</button>
                          {swapN > 0 && (
                            <button
                              type="button"
                              title={swapOpen ? 'Hide swap options' : 'Show swap options'}
                              aria-label={swapOpen ? 'Hide swap options' : 'Show swap options'}
                              onClick={() => toggleSwapOpen(r.ingId)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 1, border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--g2)', fontSize: 11, fontWeight: 700, padding: 0 }}
                            >{swapN}<span style={{ fontSize: 9, display: 'inline-block', transform: swapOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span></button>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="r"><input className="qty" type="number" value={r.qty} onChange={(e) => patch(r.uid, { qty: parseFloat(e.target.value) || 0 })} /></td>
                    <td className="r">
                      <select value={r.unit} onChange={(e) => patch(r.uid, { unit: e.target.value })}>
                        {SELECTABLE_UNITS.filter((u) => showVol || !VOLUME_UNITS.has(u)).map((u) => <option key={u} value={u}>{UNIT_LABELS[u] ?? u}</option>)}
                      </select>
                    </td>
                    <td className="r"><input className="waste" type="number" value={r.waste} onChange={(e) => patch(r.uid, { waste: parseFloat(e.target.value) || 0 })} /></td>
                    <td className="r">{(rawGrams(r) * (1 - r.waste / 100)).toFixed(1)}</td>
                    <td className="r"><input className="waste" type="number" min={0} step={0.01} value={r.costPerKgCents != null ? r.costPerKgCents / 100 : ''} placeholder="—" onChange={(e) => { const v = parseFloat(e.target.value); patch(r.uid, { costPerKgCents: isNaN(v) ? null : Math.max(0, Math.round(v * 100)) }) }} /></td>
                    <td><span className="del" onClick={() => remove(r.uid)}>🗑</span></td>
                  </tr>
                  {swap && swapOpen && swapN > 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: 0, borderTop: 0 }}>
                        <div style={{ padding: '2px 8px 8px 30px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span className="muted tiny">Creator can swap <b>{rowData(r).name}</b> for:</span>
                          {swapAlts.map((v, k) => (
                            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                              <span style={{ color: 'var(--g2)', fontWeight: 700 }}>⇄</span>
                              <span>{v.overlayIngName || v.label}</span>
                            </div>
                          ))}
                          <button type="button" className="lo-link" style={{ alignSelf: 'flex-start', fontSize: 11, marginTop: 2 }} onClick={() => setSwapRow(r)}>Edit swap options</button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  )
                })}
                {base.length === 0 && (
                  <tr><td colSpan={8} className="muted" style={{ padding: '14px 6px', textAlign: 'center' }}>No ingredients yet — search below to add your first.</td></tr>
                )}
              </tbody>
              <tfoot><tr><td /><td /><td /><td /><td className="grn r">Total</td><td className="grn r">{base.reduce((s, r) => s + rawGrams(r) * (1 - r.waste / 100), 0).toFixed(1)}</td><td className="grn r">${totalCents.toFixed(2)}</td><td /></tr></tfoot>
            </table>
          </div>

          {/* Optional Ingredients */}
          {optional.length > 0 && (
            <div className="rb-card">
              <div className="rb-h">✓ Optional Ingredients ({optional.length})</div>
              <table>
                <tbody>
                  {optional.map((r) => (
                    <tr key={r.uid} className={r.selected ? '' : 'dim'}>
                      <td><span className={`circle ${r.selected ? 'chk' : ''}`} onClick={() => patch(r.uid, { selected: !r.selected })}>{r.selected ? '✓' : ''}</span></td>
                      <td>{rowData(r).name}</td>
                      <td><input className="qty" type="number" value={r.qty} onChange={(e) => patch(r.uid, { qty: parseFloat(e.target.value) || 0 })} /></td>
                      <td>
                        <select value={r.unit} onChange={(e) => patch(r.uid, { unit: e.target.value })}>
                          {SELECTABLE_UNITS.filter((u) => (rowData(r).densityGPerMl != null || VOLUME_UNITS.has(r.unit)) || !VOLUME_UNITS.has(u)).map((u) => <option key={u} value={u}>{UNIT_LABELS[u] ?? u}</option>)}
                        </select>
                      </td>
                      <td><span className="del" onClick={() => remove(r.uid)}>🗑</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted tiny">Optional ingredients tick into the <b>Preview</b> label only — the Public label stays base-only.</p>
            </div>
          )}

          {/* Add Ingredients */}
          <div className="rb-card">
            <div className="rb-h" style={{ justifyContent: 'space-between' }}>
              <span>≣ Add Ingredients</span>
              {rows.length > 0 && (
                <select value={addCat} onChange={(e) => setAddCat(e.target.value as 'base' | 'optional')} style={{ fontWeight: 600 }}>
                  <option value="base">Main Ingredients</option>
                  <option value="optional">Optional Ingredients</option>
                </select>
              )}
            </div>
            <IngredientPicker onPick={handlePick} placeholder="Search USDA, the library, or your private ingredients…" />
            <p className="tiny muted" style={{ marginTop: 8 }}>Real search — picked rows bring their USDA/library nutrient panel into the live label.</p>
          </div>

          {/* Packaging & Serving (ReciPal) */}
          <div className="rb-card">
            <div className="rb-h">⚖ Packaging &amp; Serving Information</div>
            <div className="subtab">
              <button className={subtab === 'pack' ? 'on' : ''} onClick={() => setSubtab('pack')}>Packaging</button>
              <button className={subtab === 'adv' ? 'on' : ''} onClick={() => setSubtab('adv')}>Advanced</button>
            </div>
            {subtab === 'pack' && (
              <>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>
                  How would you like to set up your label?
                  <i className="info" title="BY PACKAGE SIZE: enter the package size + number of packages the recipe makes — precise control of yield. BY SERVING SIZE: enter the serving size weight + optional moisture loss and we calculate the rest (ignores density).">i</i>
                </div>
                <div className="radio">
                  <label><input type="radio" name="lmode" checked={lmode === 'package'} onChange={() => setLmode('package')} /> By package size</label>
                  <label><input type="radio" name="lmode" checked={lmode === 'serving'} onChange={() => setLmode('serving')} /> By serving size</label>
                </div>
                {lmode === 'package' ? (
                  <div className="row2">
                    <div><span className="f">Package size (g)</span><input type="number" value={packageSizeG} onChange={(e) => setPackageSizeG(parseFloat(e.target.value) || 0)} /></div>
                    <div><span className="f">Servings per package <i className="info" title="Non-round values render as “about N” per FDA.">i</i></span><input type="number" value={servingsPerPackage} onChange={(e) => setServingsPerPackage(parseFloat(e.target.value) || 1)} /></div>
                  </div>
                ) : (
                  <div className="row2">
                    <div><span className="f">Serving size (g)</span><input type="number" value={servingSizeG} onChange={(e) => setServingSizeG(parseFloat(e.target.value) || 0)} /></div>
                    <div><span className="f">Servings per package</span><input type="number" value={servingsPerPackage} onChange={(e) => setServingsPerPackage(parseFloat(e.target.value) || 1)} /></div>
                  </div>
                )}
                {result && <p className="makes">Makes about {result.geometry.packagesMade.toFixed(1)} package(s) · {result.geometry.servingsPerContainerLabel} servings/container</p>}
              </>
            )}
            {subtab === 'adv' && (
              <div className="row2">
                <div>
                  <span className="f">Moisture / cook loss % <i className="info" title="Water leaves during cooking; nutrients are conserved so per-serving values concentrate.">i</i></span>
                  <input type="number" value={moisture} onChange={(e) => setMoisture(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            )}
          </div>

          {/* Cost summary + per-ingredient nutrition breakdown live in the COST tab. */}
        </div>

        {/* RIGHT — live label */}
        <div>
          <div className="lblseg" style={{ marginBottom: 10 }}>
            <button className={mode === 'public' ? 'on' : ''} onClick={() => setMode('public')}>Public label</button>
            <button className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>Internal preview</button>
            <style>{`.rb .lblseg{display:inline-flex;background:#EEEFF1;border-radius:10px;padding:3px;gap:3px}.rb .lblseg button{border:0;background:transparent;padding:5px 12px;border-radius:8px;font:inherit;font-size:12px;font-weight:600;color:#6B6D78;cursor:pointer;transition:.12s}.rb .lblseg button:hover{color:#18181A}.rb .lblseg button.on{background:#18181A;color:#fff}`}</style>
          </div>
          {flavorMode === 'MULTI' && (
            <div className="flavbar">
              {flavors.map((f, i) => (
                <span key={i} className="flav">
                  <input value={f.name} onChange={(e) => setFlavors(flavors.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} style={{ width: 64, border: 0, background: 'transparent', font: 'inherit', color: 'inherit', fontWeight: 600 }} />
                  <button type="button" onClick={() => setFlavorPickIdx(flavorPickIdx === i ? null : i)} style={{ border: 0, background: 'transparent', font: 'inherit', fontSize: 10, color: 'var(--g2)', cursor: 'pointer', textDecoration: 'underline' }} aria-label="Set flavor ingredient">
                    {flavorIng[f.ingId]?.name ?? '+ ingredient'}
                  </button>
                  <button onClick={() => setFlavors(flavors.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
                </span>
              ))}
              {flavors.length < maxColumns && (
                <button className="rb-btn o sm" onClick={() => setFlavors([...flavors, { name: `Flavor ${flavors.length + 1}`, ingId: '', soi: '' }])}>
                  + Flavor ({flavors.length}/{maxColumns})
                </button>
              )}
            </div>
          )}
          {flavorMode === 'MULTI' && flavorPickIdx != null && (
            <div style={{ marginBottom: 8 }}>
              <IngredientPicker onPick={(p) => pickFlavorIng(flavorPickIdx, p)} placeholder={`Pick the distinct ingredient for “${flavors[flavorPickIdx]?.name || 'this flavor'}”…`} />
            </div>
          )}
          {ps && result ? (
            flavorMode === 'MULTI' && flavors.length > 0 ? (
              <>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                  {flavors.map((f, i) => {
                    const fr = flavorResult(f.ingId)
                    return fr ? (
                      <FactsPanel key={i} result={fr} ps={fr.perServing} title={f.name || `Flavor ${i + 1}`} narrow />
                    ) : (
                      <div key={i} className="facts" style={{ minWidth: 150, flex: '0 0 auto', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 12, color: 'var(--mut)' }}>
                        <div className="flavhdr">{f.name || `Flavor ${i + 1}`}</div>
                        <button type="button" className="rb-btn o sm" style={{ marginTop: 8 }} onClick={() => setFlavorPickIdx(i)}>Pick ingredient</button>
                      </div>
                    )
                  })}
                </div>
                <div className="netwt">Net Wt {formatNetWeight(result.geometry.netWeightG)}</div>
                <p className="makes">Combined {flavors.length}-column label for the pack · each column = that flavor&apos;s own recipe · plus a single-column label per flavor at print.</p>
              </>
            ) : (
              <>
                <FactsPanel result={result} ps={ps} />
                <div className="netwt">Net Wt {formatNetWeight(result.geometry.netWeightG)}</div>
              </>
            )
          ) : (
            <div className="rb-card" style={{ textAlign: 'center', color: 'var(--mut)' }}>Add ingredients + a serving size to see the label.</div>
          )}
          <p className="muted tiny" style={{ marginTop: 8 }}>{mode === 'public' ? 'Public marketplace label — base ingredients only.' : 'Internal preview — base + ticked optionals.'} · {productName || 'Untitled'}</p>
        </div>
      </div>

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
        <div className="rb-card">
          <div className="rb-h">≣ Ingredients ({rows.length})</div>
          <p className="muted tiny" style={{ margin: '0 0 8px' }}>Read-only summary. Edit quantities in <b>Build recipe</b>.</p>
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
          : <div className="rb-card"><div className="rb-h">⛨ Allergens</div><p className="muted">Save your draft first to manage allergens.</p></div>
      )}

      {/* $ COST — cost summary + per-ingredient nutrition breakdown. */}
      {activeTab === 'cost' && (
        <>
          <CostSummaryCard totalCents={totalCents} perServingCost={perServingCost} retail={retail} markup={markup} onMarkup={setMarkup} />
          {base.length > 0 && (
            <div className="rb-card">
              <div className="rb-h">▦ Nutrition Breakdown</div>
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
        <div className="rb-card">
          <div className="rb-h">🏷 Label preview</div>
          <div className="lblseg" style={{ marginBottom: 10 }}>
            <button className={mode === 'public' ? 'on' : ''} onClick={() => setMode('public')}>Public label</button>
            <button className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>Internal preview</button>
          </div>
          {ps && result ? (
            <div style={{ maxWidth: 340 }}>
              <FactsPanel result={result} ps={ps} />
              <div className="netwt">Net Wt {formatNetWeight(result.geometry.netWeightG)}</div>
            </div>
          ) : (
            <p className="muted">Add ingredients + a serving size to see the label.</p>
          )}
          <p className="muted tiny" style={{ marginTop: 8 }}>{mode === 'public' ? 'Public marketplace label — base ingredients only.' : 'Internal preview — base + ticked optionals.'}</p>
        </div>
      )}

      {/* 🗂 MY RECIPES / ▦ RECIPE TEMPLATES — reuse surfaces (coming soon). */}
      {activeTab === 'recipes' && (
        <div className="rb-card">
          <div className="rb-h">🗂 My recipes</div>
          <p className="muted tiny" style={{ margin: '0 0 8px' }}>
            Reuse a formulation from another of your products — applies its base ingredients here so you can tweak from there.
          </p>
          {myRecipes === null ? (
            <p className="muted">Loading your recipes…</p>
          ) : myRecipes.length === 0 ? (
            <p className="muted">No other recipes yet. Once you’ve built a product, its formulation shows here to reuse.</p>
          ) : (
            <table>
              <thead><tr><th>Product</th><th className="r">Ingredients</th><th>Status</th><th /></tr></thead>
              <tbody>
                {myRecipes.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name || 'Untitled product'}</td>
                    <td className="r">{r.slots.length}</td>
                    <td><span className="muted tiny">{r.status.replace(/_/g, ' ').toLowerCase()}</span></td>
                    <td className="r"><button type="button" className="rb-btn o sm" onClick={() => applyRecipe(r.slots)} disabled={r.slots.length === 0}>Apply</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {activeTab === 'templates' && (
        <div className="rb-card">
          <div className="rb-h">▦ Recipe templates</div>
          <p className="muted tiny" style={{ margin: '0 0 8px' }}>
            Start from a curated base formulation — ingredients are matched to your catalog, and you refine from there.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {RECIPE_TEMPLATES.map((t) => (
              <div key={t.id} className="lo-axis" style={{ marginTop: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <b>{t.name}</b>
                    <p className="muted tiny" style={{ margin: '2px 0 0' }}>{t.desc} · {t.items.length} ingredients</p>
                  </div>
                  <button type="button" className="rb-btn o sm" onClick={() => applyTemplate(t)}>Start from this</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
       </>
      )}

      {swapRow && onAxes && (
        <SwapModal
          ingId={swapRow.ingId}
          baseName={rowData(swapRow).name || swapRow.ingId}
          existingAxis={swapAxisFor(swapRow.ingId)}
          onSave={(axis) => { onAxes([...axes.filter((a) => a.boundSlotId !== swapRow.ingId), axis]); setSwapRow(null) }}
          onRemove={() => { onAxes(axes.filter((a) => a.boundSlotId !== swapRow.ingId)); setSwapRow(null) }}
          onClose={() => setSwapRow(null)}
        />
      )}
    </div>
  )
}

/** Modal launched from a base ingredient row to mark it "replaceable": the base
 *  stays the default and each alternative becomes a SWAP option. Produces a
 *  single label-affecting OptionAxisUI bound to the row's baseIngredientId, fed
 *  back through the existing axes pipeline (persist + live label recompute). */
function SwapModal({
  ingId, baseName, existingAxis, onSave, onRemove, onClose,
}: {
  ingId: string
  baseName: string
  existingAxis?: OptionAxisUI
  onSave: (axis: OptionAxisUI) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [label, setLabel] = useState(existingAxis?.label ?? `${baseName} choice`)
  const [alts, setAlts] = useState<Array<{ ingId: string; name: string; per100g: Record<string, number> }>>(
    () => (existingAxis?.values ?? [])
      .filter((v) => v.overlayOp === 'SWAP' && v.overlayIngId)
      .map((v) => ({ ingId: v.overlayIngId!, name: v.overlayIngName || v.label, per100g: v.overlayPer100g ?? {} })),
  )
  const [, startPick] = useTransition()

  function addAlt(picked: IngredientResult) {
    if (picked.id === ingId) { toast.error('That is the base ingredient.'); return }
    if (alts.some((a) => a.ingId === picked.id)) { toast.error(`${picked.internalName} is already an option.`); return }
    startPick(async () => {
      const res = await getIngredientNutrition(picked.id)
      setAlts((xs) => [...xs, { ingId: picked.id, name: picked.internalName, per100g: res.ok ? res.data.per100g : {} }])
    })
  }

  function save() {
    const values: OptionValueUI[] = [
      { label: baseName, isDefault: true, leadDelta: 0, costDeltaCents: 0, moqOverride: null, overlayOp: 'NONE' },
      ...alts.map((a) => ({
        label: a.name, isDefault: false, leadDelta: 0, costDeltaCents: 0, moqOverride: null,
        overlayOp: 'SWAP' as const, overlayIngId: a.ingId, overlayIngName: a.name, overlayPer100g: a.per100g,
      })),
    ]
    onSave({ key: 'CUSTOM', label: label.trim() || `${baseName} choice`, editableByCreator: true, affectsLabel: true, boundSlotId: ingId, values })
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,22,28,.45)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 16 }}>
      <div className="rb-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(760px, 100%)', maxHeight: '90vh', overflow: 'auto', margin: 0 }}>
        <div className="rb-h" style={{ justifyContent: 'space-between' }}>
          <span>⇄ Make “{baseName}” replaceable</span>
          <button type="button" onClick={onClose} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 16, color: 'var(--mut)' }}>✕</button>
        </div>
        <p className="muted tiny" style={{ margin: '0 0 10px' }}>
          The base stays the default. Each alternative becomes a creator-pickable swap; the FDA label recomputes per choice.
        </p>

        <span className="f">Option label</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`${baseName} choice`} style={{ width: '100%', marginBottom: 12 }} />

        <div className="rb-h" style={{ fontSize: 13 }}>Options ({alts.length + 1})</div>
        <table>
          <tbody>
            <tr>
              <td><b>{baseName}</b></td>
              <td className="r"><span className="muted tiny">default</span></td>
            </tr>
            {alts.map((a) => (
              <tr key={a.ingId}>
                <td>{a.name}</td>
                <td className="r"><span className="del" onClick={() => setAlts((xs) => xs.filter((x) => x.ingId !== a.ingId))}>🗑</span></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 10 }}>
          <span className="f">Add a swap option</span>
          <IngredientPicker onPick={addAlt} placeholder="Search an alternative ingredient…" />
        </div>

        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 8 }}>
          {existingAxis ? (
            <button type="button" className="rb-btn o sm" onClick={onRemove} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>Remove replaceable</button>
          ) : <span />}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="rb-btn o sm" onClick={onClose}>Cancel</button>
            <button type="button" className="rb-btn sm" onClick={save} disabled={alts.length === 0} style={alts.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
              Save {alts.length > 0 ? `(${alts.length} option${alts.length === 1 ? '' : 's'})` : ''}
            </button>
          </div>
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
    <div className="rb-card" style={{ marginTop: 16 }}>
      <div className="rb-h">⚗ Label options · bind ingredient changes</div>
      <p className="muted tiny" style={{ margin: '4px 0 8px' }}>
        These options change the recipe, so the Facts label recomputes per chosen combination. Bind each to a
        base slot, then pick the ingredient for each value. The preview below shows the default combination.
      </p>
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
        .rb .lo-axis{border:1px solid #E0E1E5;border-radius:12px;padding:12px;margin-top:10px}
        .rb .lo-axis select{border:1px solid #E0E1E5;border-radius:8px;padding:4px 8px;font:inherit;font-size:12px;background:#fff}
        .rb .lo-prev{margin-top:12px;border:1px solid #F4C0D1;background:#FBEAF0;color:#C71350;border-radius:10px;padding:8px 12px;font-size:12px}
        .rb .lo-link{background:none;border:0;color:#C71350;cursor:pointer;font:inherit;font-size:11px;text-decoration:underline}
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
    <div className="rb-card">
      <div className="rb-h">$ Cost Summary</div>
      <div className="costgrid">
        <div className="costtile"><div className="l">Total ingredient cost</div><div className="v">${totalCents.toFixed(2)}</div></div>
        <div className="costtile retail"><div className="l">Suggested retail / serving</div><div className="v">${retail.toFixed(2)}</div></div>
      </div>
      <div className="costfoot"><span>Per serving cost</span><b>${perServingCost.toFixed(3)}</b></div>
      <div className="costfoot" style={{ borderTop: 0, paddingTop: 6 }}>
        <span>
          Retail markup ×
          <i className="info" title="Suggested retail = per-serving cost × markup. Set your target margin; fees configured in Variants & packs apply at checkout.">i</i>
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

function FactsPanel({ result, ps, title, narrow }: { result: LabelResult; ps: LabelResult['perServing']; title?: string; narrow?: boolean }) {
  return (
    <div className="facts" style={narrow ? { minWidth: 150, flex: '0 0 auto' } : undefined}>
      {title && <div className="flavhdr">{title}</div>}
      <h2 style={narrow ? { fontSize: 18 } : undefined}>Nutrition Facts</h2>
      <div className="b8" style={{ paddingBottom: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Serving</span><b>{Math.round(result.geometry.servingSizeG)} g</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Per container</span><b>{result.geometry.servingsPerContainerLabel}</b></div>
      </div>
      <div className="cal"><span>Calories</span><span className="n" style={narrow ? { fontSize: 22 } : undefined}>{ps.calories}</span></div>
      <Frow l="Total Fat" v={`${ps.totalFat.amount} g`} dv={ps.totalFat.dv} b />
      <Frow l="Saturated Fat" v={`${ps.saturatedFat.amount} g`} dv={ps.saturatedFat.dv} ind />
      <Frow l="Sodium" v={`${ps.sodium.amount} mg`} dv={ps.sodium.dv} b />
      <Frow l="Total Carbohydrate" v={`${ps.totalCarbohydrate.amount} g`} dv={ps.totalCarbohydrate.dv} b />
      <Frow l="Dietary Fiber" v={`${ps.dietaryFiber.amount} g`} dv={ps.dietaryFiber.dv} ind />
      <Frow l="Total Sugars" v={`${ps.totalSugars.amount} g`} ind />
      <Frow l="Protein" v={`${ps.protein.amount} g`} b />
    </div>
  )
}

function Frow({ l, v, dv, b, ind }: { l: string; v: string; dv?: number; b?: boolean; ind?: boolean }) {
  return (
    <div className="fr" style={ind ? { paddingLeft: 12 } : undefined}>
      <span>{b ? <b>{l}</b> : l} {v}</span>
      {dv !== undefined && <b>{dv}%</b>}
    </div>
  )
}

const CSS = `
.rb{--g:#FF2E63;--g2:#C71350;--g-50:#FCEEF3;--g-bd:#F4C0D1;--ink:#1f2a24;--mut:#6b746e;--bd:#e3e7e4;--bg:#f6f8f7;--red:#e24b4a;font-size:13px;color:var(--ink)}
.rb .muted{color:var(--mut)} .rb .tiny{font-size:10.5px}
.rb-tabs{display:flex;gap:22px;border-bottom:1px solid var(--bd);margin-bottom:14px;overflow:auto}
.rb-tab{padding:12px 2px;font-weight:600;color:var(--mut);cursor:pointer;border-bottom:2px solid transparent;font-size:12.5px;white-space:nowrap}
.rb-tab.on{color:var(--g2);border-color:var(--g)}
.rb-wrap{display:grid;grid-template-columns:1fr 300px;gap:18px}
.rb-card{border:1px solid var(--bd);border-radius:12px;background:#fff;padding:16px;margin-bottom:16px}
.rb-h{display:flex;align-items:center;gap:8px;color:var(--g2);font-weight:700;font-size:15px;margin-bottom:10px}
.rb table{width:100%;border-collapse:collapse}
.rb th{font-size:11px;color:var(--mut);text-align:left;font-weight:600;padding:8px 6px;border-bottom:1px solid var(--bd)}
.rb th.r,.rb td.r{text-align:right} .rb .grn{color:var(--g2);font-weight:700}
.rb td{padding:7px 6px;border-bottom:1px solid #f0f2f0;vertical-align:middle;font-size:12.5px}
.rb input,.rb select{border:1px solid var(--bd);border-radius:8px;padding:6px 8px;font:inherit;font-size:12.5px;background:#fff}
.rb input:focus,.rb select:focus{outline:none;border-color:var(--g);box-shadow:0 0 0 3px var(--g-50)}
.rb .qty{width:60px;text-align:center} .rb .waste{width:50px;text-align:center}
.rb-btn{background:var(--g);color:#fff;border:0;border-radius:8px;padding:7px 14px;font-weight:600;font-size:12.5px;cursor:pointer}
.rb-btn.o{background:#fff;color:var(--g2);border:1px solid var(--g-bd)} .rb-btn.sm{padding:5px 11px;font-size:12px}
.rb .circle{width:24px;height:24px;border-radius:50%;border:1px solid var(--bd);background:#fff;display:grid;place-items:center;cursor:pointer;color:var(--g)}
.rb .circle.chk{border-color:var(--g);background:var(--g-50)}
.rb .dim{opacity:.5} .rb .del{color:var(--red);cursor:pointer}
.rb .res{display:flex;justify-content:space-between;align-items:center;border:1px solid var(--bd);border-radius:10px;padding:9px 12px;margin-bottom:8px;cursor:pointer}
.rb .res:hover{border-color:var(--g-bd);background:var(--g-50)}
.rb .info{display:inline-grid;place-items:center;width:15px;height:15px;border-radius:50%;background:var(--g-50);color:var(--g2);font-size:10px;font-weight:700;cursor:help;margin-left:5px;border:1px solid var(--g-bd);font-style:normal}
.rb input[type=radio]{accent-color:#33343C}
.rb .radio{display:flex;gap:20px;margin:6px 0 12px} .rb .radio label{display:flex;gap:6px;align-items:center;cursor:pointer}
.rb .subtab{display:inline-flex;border-bottom:1px solid var(--bd);gap:18px;margin-bottom:12px;width:100%}
.rb .subtab button{border:0;background:transparent;padding:8px 2px;font:inherit;font-weight:600;color:var(--mut);cursor:pointer;border-bottom:2px solid transparent}
.rb .subtab button.on{color:var(--g2);border-color:var(--g)}
.rb .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px} .rb .row2 input{width:100%}
.rb .f{display:block;font-size:10.5px;color:var(--mut);margin-bottom:3px}
.rb .makes{color:var(--g2);font-size:12px;margin:6px 0 0}
.rb .costgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px 0 12px}
.rb .costtile{border:1px solid var(--bd);border-radius:10px;padding:9px 11px}
.rb .costtile .l{font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--mut)}
.rb .costtile .v{font-size:18px;font-weight:800;margin-top:2px} .rb .costtile.retail .v{color:var(--g2)}
.rb .costfoot{display:flex;justify-content:space-between;border-top:1px solid var(--bd);padding-top:10px;font-size:12px;color:var(--mut)} .rb .costfoot b{color:var(--ink)}
.rb .seg{display:inline-flex;border:1px solid var(--bd);border-radius:999px;padding:3px;background:#fff;gap:3px}
.rb .seg button{border:0;background:transparent;padding:6px 16px;border-radius:999px;font:inherit;font-size:12px;font-weight:600;color:var(--mut);cursor:pointer}
.rb .seg button.on{background:#18181A;color:#fff}
.rb .facts{border:2px solid #000;border-radius:4px;padding:8px;font-family:Helvetica,Arial,sans-serif;color:#000;background:#fff;font-size:11px}
.rb .facts h2{font-size:23px;margin:0;font-weight:800;border-bottom:6px solid #000;padding-bottom:2px}
.rb .b8{border-bottom:8px solid #000}
.rb .cal{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:4px solid #000;margin-top:3px} .rb .cal .n{font-size:28px;font-weight:800}
.rb .fr{display:flex;justify-content:space-between;border-bottom:1px solid #000;padding:1px 0}
.rb .netwt{border:1px solid var(--bd);border-radius:10px;padding:8px 10px;margin-top:10px;font-weight:700;font-size:13px}
.rb .flavbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}
.rb .flav{display:inline-flex;align-items:center;gap:5px;background:var(--g-50);color:var(--g2);border:1px solid var(--g-bd);border-radius:999px;padding:2px 9px;font-size:11px;font-weight:600}
.rb .flav button{border:0;background:transparent;color:var(--g2);cursor:pointer;font-size:11px;padding:0}
.rb .flavhdr{background:var(--g-50);color:var(--g2);font-weight:700;font-size:11px;text-align:center;padding:3px;border:1px solid var(--g-bd);border-radius:4px 4px 0 0;margin:-8px -8px 6px}
@media(max-width:900px){.rb-wrap{grid-template-columns:1fr}}
`
