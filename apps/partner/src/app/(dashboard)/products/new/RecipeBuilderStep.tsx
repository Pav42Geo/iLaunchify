'use client'

// Step 3 content — faithful port of docs/prototypes/recipe-builder-demo.html.
// Ingredients (base + replaceable + optional) · ReciPal Packaging & Serving ·
// Cost Summary · live Nutrition Facts (Public/Preview). The live label is
// computed by the real @ilaunchify/nutrition engine, not a mock.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { calculateLabel, publicSelection, previewSelection, resolveConfiguredSelection, formatNetWeight, type RecipeRow, type Nutrients, type OptionOverlay } from '@ilaunchify/nutrition'
import { IngredientPicker } from '../[id]/edit/cards/IngredientPicker'
import { type OptionAxisUI, type OptionValueUI } from './OptionAxesCard'
import type { IngredientResult } from '../[id]/edit/ingredient-actions'
import { getIngredientNutrition, saveRecipeSlots } from './build-actions'
import { ModeChooser, type Mode } from './ModeChooser'
import { AiParserPanel, type CommittedParseLine } from './AiParserPanel'
import { DeclaredPanelPanel } from './DeclaredPanelPanel'

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

interface Row {
  uid: string
  ingId: string
  qty: number
  unit: 'g' | 'ml'
  waste: number
  category: 'base' | 'optional'
  selected: boolean // optional: ticked into preview
  // Inline nutrient data for rows added from the real IngredientPicker (USDA /
  // library / private). Seeded demo rows leave these undefined and resolve via
  // the demo LIBRARY.
  name?: string
  per100g?: Record<string, number>
  densityGPerMl?: number | null
}

let counter = 0
const uid = () => `r${++counter}`

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
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows && initialRows.length
      ? initialRows.map((s) => ({ uid: uid(), ingId: s.ingId, qty: s.weightG, unit: 'g', waste: 0, category: 'base' as const, selected: true, name: s.name, per100g: s.per100g, densityGPerMl: s.densityGPerMl ?? undefined }))
      : [
          { uid: uid(), ingId: 'water', qty: 320, unit: 'ml', waste: 0, category: 'base', selected: true },
          { uid: uid(), ingId: 'yuzu', qty: 18, unit: 'ml', waste: 0, category: 'base', selected: true },
          { uid: uid(), ingId: 'monk', qty: 0.3, unit: 'g', waste: 0, category: 'base', selected: true },
        ],
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
  // Flavors come from the Variants & packs step (shared). Each = a name + its
  // own distinct flavor ingredient overlaid on the shared base, so each Facts
  // column shows DIFFERENT numbers.
  const setFlavors = (f: Array<{ name: string; ingId: string; soi: string }>) => onFlavors?.(f)

  const ing = (id: string) => LIBRARY.find((l) => l.id === id)
  const [, startPick] = useTransition()
  // Resolve a row's nutrient data — inline (real picker) or via the demo lib.
  function rowData(r: Row): { name: string; per100g: Record<string, number>; densityGPerMl?: number | null; cents: number } {
    if (r.per100g) return { name: r.name ?? '', per100g: r.per100g, densityGPerMl: r.densityGPerMl, cents: 0 }
    const l = ing(r.ingId)
    return { name: l?.name ?? '', per100g: l?.per100g ?? {}, densityGPerMl: undefined, cents: l?.cents ?? 0 }
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
        .map((r, i) => ({ ingredientId: r.ingId, weightG: r.unit === 'ml' ? r.qty * (r.densityGPerMl ?? 1) : r.qty, displayOrder: i }))
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
    quantity: r.qty, unit: r.unit, trimWastePct: r.waste, category: r.category, selected: r.selected,
  }))
  const selected = mode === 'public' ? publicSelection(recipeRows) : previewSelection(recipeRows)
  const result = selected.length
    ? calculateLabel(selected, { basis: lmode, servingSizeG, packageSizeG, servingsPerPackage, numPackages: 1, moistureLossPct: moisture })
    : null
  const ps = result?.perServing

  // Per-flavor label: shared base recipe + that flavor's distinct ingredient,
  // so each column carries its own calories/sugar/etc.
  function flavorResult(ingId: string) {
    const baseRows = publicSelection(recipeRows)
    const overlay: RecipeRow = {
      id: `flav-${ingId}`, name: ing(ingId)?.name ?? '', per100g: ing(ingId)?.per100g ?? {},
      quantity: 20, unit: 'g', category: 'base', selected: true,
    }
    const all = [...baseRows, overlay]
    return all.length
      ? calculateLabel(all, { basis: lmode, servingSizeG, packageSizeG, servingsPerPackage, numPackages: 1, moistureLossPct: moisture })
      : null
  }

  // Cost
  const totalCents = rows.reduce((sum, r) => {
    const grams = r.unit === 'ml' ? r.qty : r.qty // density ~1 for demo
    return sum + ((rowData(r).cents ?? 0) / 100) * grams
  }, 0)
  const perServingCost = result && result.geometry.totalServings > 0 ? totalCents / result.geometry.totalServings : 0
  const retail = perServingCost * 4 // demo 4x markup

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
      <div className="rb-tabs">
        {['🍽 BUILD RECIPE', '≣ INGREDIENTS', '⛨ ALLERGENS', '$ COST', '🏷 LABEL', '🏷 MY RECIPES', '▦ RECIPE TEMPLATES'].map((t, i) => (
          <div key={t} className={`rb-tab ${i === 0 ? 'on' : ''}`}>{t}</div>
        ))}
      </div>

      <div className="rb-wrap">
        <div>
          {/* Recipe Ingredients */}
          <div className="rb-card">
            <div className="rb-h">🍽 Recipe Ingredients ({base.length})</div>
            <table>
              <thead><tr><th>Ingredient Name</th><th className="r">Qty</th><th>Unit</th><th className="r">Waste %</th><th className="r">Grams</th><th /></tr></thead>
              <tbody>
                {base.map((r) => (
                  <tr key={r.uid}>
                    <td>{rowData(r).name}</td>
                    <td className="r"><input className="qty" type="number" value={r.qty} onChange={(e) => patch(r.uid, { qty: parseFloat(e.target.value) || 0 })} /></td>
                    <td><select value={r.unit} onChange={(e) => patch(r.uid, { unit: e.target.value as 'g' | 'ml' })}><option>g</option><option>ml</option></select></td>
                    <td className="r"><input className="waste" type="number" value={r.waste} onChange={(e) => patch(r.uid, { waste: parseFloat(e.target.value) || 0 })} /></td>
                    <td className="r">{(r.qty * (1 - r.waste / 100)).toFixed(1)}</td>
                    <td><span className="del" onClick={() => remove(r.uid)}>🗑</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td /><td /><td /><td className="r grn">Total</td><td className="r grn">{base.reduce((s, r) => s + r.qty * (1 - r.waste / 100), 0).toFixed(1)}</td><td /></tr></tfoot>
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
                      <td className="r"><input className="qty" type="number" value={r.qty} onChange={(e) => patch(r.uid, { qty: parseFloat(e.target.value) || 0 })} /></td>
                      <td><select value={r.unit} onChange={(e) => patch(r.uid, { unit: e.target.value as 'g' | 'ml' })}><option>g</option><option>ml</option></select></td>
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

          {/* Cost Summary */}
          <div className="rb-card">
            <div className="rb-h">$ Cost Summary</div>
            <div className="costgrid">
              <div className="costtile"><div className="l">Total ingredient cost</div><div className="v">${totalCents.toFixed(2)}</div></div>
              <div className="costtile retail"><div className="l">Suggested retail / serving</div><div className="v">${retail.toFixed(2)}</div></div>
            </div>
            <div className="costfoot"><span>Per serving cost</span><b>${perServingCost.toFixed(3)}</b></div>
          </div>

          {/* Nutrition Breakdown — per-ingredient contribution to the batch (base
              ingredients, waste-adjusted). Helps the manufacturer see which slot
              drives each macro before the label rounds it. */}
          {base.length > 0 && (
            <div className="rb-card">
              <div className="rb-h">▦ Nutrition Breakdown</div>
              <p className="muted tiny" style={{ margin: '0 0 8px' }}>
                Each base ingredient&apos;s contribution to the whole batch (waste-adjusted, before serving math).
              </p>
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
                <tfoot>
                  <tr>
                    <td className="grn">Batch total</td>
                    {(['calories', 'protein', 'totalCarbohydrate', 'totalFat', 'totalSugars'] as const).map((k) => {
                      const total = base.reduce((sum, r) => {
                        const d = rowData(r)
                        const grams = (r.unit === 'ml' ? r.qty * (d.densityGPerMl ?? 1) : r.qty) * (1 - r.waste / 100)
                        return sum + ((d.per100g[k] ?? 0) * grams) / 100
                      }, 0)
                      return <td key={k} className="r grn">{k === 'calories' ? Math.round(total) : `${total.toFixed(1)} g`}</td>
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
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
                  <select value={f.ingId} onChange={(e) => setFlavors(flavors.map((x, j) => j === i ? { ...x, ingId: e.target.value } : x))} style={{ border: 0, background: 'transparent', font: 'inherit', fontSize: 10, color: 'var(--g2)' }} aria-label="Flavor ingredient">
                    {LIBRARY.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <button onClick={() => setFlavors(flavors.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
                </span>
              ))}
              {flavors.length < maxColumns && (
                <button className="rb-btn o sm" onClick={() => setFlavors([...flavors, { name: `Flavor ${flavors.length + 1}`, ingId: 'cane', soi: '' }])}>
                  + Flavor ({flavors.length}/{maxColumns})
                </button>
              )}
            </div>
          )}
          {ps && result ? (
            flavorMode === 'MULTI' && flavors.length > 0 ? (
              <>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                  {flavors.map((f, i) => {
                    const fr = flavorResult(f.ingId)
                    return fr ? <FactsPanel key={i} result={fr} ps={fr.perServing} title={f.name || `Flavor ${i + 1}`} narrow /> : null
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
          baseSlots={base.map((r) => ({ id: r.uid, name: rowData(r).name || r.ingId, qty: r.qty, unit: r.unit }))}
          recipeRows={recipeRows}
          geometry={{ basis: lmode, servingSizeG, packageSizeG, servingsPerPackage, numPackages: 1, moistureLossPct: moisture }}
        />
      )}
       </>
      )}
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
  baseSlots: Array<{ id: string; name: string; qty: number; unit: string }>
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
  const overlays: OptionOverlay[] = []
  for (const { a } of labelAxes) {
    const v = a.values.find((x) => x.isDefault) ?? a.values[0]
    if (!v) continue
    if (v.overlayOp === 'SWAP' && a.boundSlotId && v.overlayPer100g) {
      const slot = baseSlots.find((s) => s.id === a.boundSlotId)
      overlays.push({ op: 'SWAP', slotId: a.boundSlotId, ingredient: { id: v.overlayIngId || 'opt', name: v.overlayIngName || v.label, per100g: v.overlayPer100g, quantity: slot?.qty ?? 0, unit: slot?.unit ?? 'g' } })
    } else if (v.overlayOp === 'ADD' && v.overlayPer100g) {
      overlays.push({ op: 'ADD', ingredient: { id: v.overlayIngId || 'opt', name: v.overlayIngName || v.label, per100g: v.overlayPer100g, quantity: v.overlayQty ?? 1, unit: v.overlayUnit ?? 'g' } })
    } else if (v.overlayOp === 'REMOVE' && a.boundSlotId) {
      overlays.push({ op: 'REMOVE', slotId: a.boundSlotId })
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
