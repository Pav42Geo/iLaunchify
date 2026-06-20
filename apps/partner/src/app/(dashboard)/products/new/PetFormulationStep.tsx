'use client'

// Pet Formulation step (Phase 3). AAFCO label = ingredient list (descending
// predominance) + Guaranteed Analysis + nutritional-adequacy statement + feeding
// directions. Live preview via the pure pet builder. GuidedBuilder renders this
// when the domain is PET_PRODUCT. docs/PRODUCT_DOMAINS_ARCHITECTURE.md (Phase 3).

import * as React from 'react'
import { Plus, Trash2, PawPrint, Search } from 'lucide-react'
import { petIngredientOrder, formatGuaranteedAnalysis, adequacyStatement, type PetSpecies, type LifeStage, type AdequacyMethod } from './pet'
import { GuaranteedAnalysisSvg } from '@ilaunchify/ui'
import { searchAafco, type AafcoEntry } from './aafco-dictionary'
import { searchLibraryIngredients } from './domain-library-actions'
import { savePetFormulation, loadPetFormulation } from './pet-actions'

const INPUT = 'rounded-md border border-ink-300 bg-white px-2 py-1 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400'
let seq = 0
const uid = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`

interface PetRow { uid: string; name: string; weight: number }
interface GaOther { name: string; value: number; bound: 'min' | 'max'; unit: string }

export function PetFormulationStep({ productName, draftId, registerFlush }: { productName?: string; draftId?: string | null; registerFlush?: (fn: () => Promise<void> | void) => () => void }) {
  const [rows, setRows] = React.useState<PetRow[]>([])
  const [cp, setCp] = React.useState(0)
  const [cf, setCf] = React.useState(0)
  const [fiber, setFiber] = React.useState(0)
  const [moisture, setMoisture] = React.useState(0)
  const [others, setOthers] = React.useState<GaOther[]>([])
  const [species, setSpecies] = React.useState<PetSpecies>('Dog')
  const [lifeStage, setLifeStage] = React.useState<LifeStage>('maintenance')
  const [method, setMethod] = React.useState<AdequacyMethod>('formulated')
  const [feedingDirections, setFeeding] = React.useState('')

  const hydrated = React.useRef(false)
  React.useEffect(() => {
    if (!draftId) { hydrated.current = true; return }
    let cancelled = false
    loadPetFormulation(draftId).then((r) => {
      if (cancelled) return
      if (r.ok && r.data) {
        const d = r.data
        setRows(d.ingredients ?? [])
        setCp(d.ga?.crudeProteinMinPct ?? 0); setCf(d.ga?.crudeFatMinPct ?? 0)
        setFiber(d.ga?.crudeFiberMaxPct ?? 0); setMoisture(d.ga?.moistureMaxPct ?? 0)
        setOthers(d.ga?.others ?? [])
        if (d.species) setSpecies(d.species)
        if (d.lifeStage) setLifeStage(d.lifeStage)
        if (d.method) setMethod(d.method)
        setFeeding(d.feedingDirections ?? '')
      }
      hydrated.current = true
    })
    return () => { cancelled = true }
  }, [draftId])
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    if (!draftId || !hydrated.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void savePetFormulation(draftId, {
        ingredients: rows,
        ga: { crudeProteinMinPct: cp, crudeFatMinPct: cf, crudeFiberMaxPct: fiber, moistureMaxPct: moisture, others },
        species, lifeStage, method, feedingDirections,
      })
    }, 1000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [rows, cp, cf, fiber, moisture, others, species, lifeStage, method, feedingDirections, draftId])

  // Immediate flush before navigation (registry).
  const flushRef = React.useRef<() => Promise<void>>(async () => {})
  flushRef.current = async () => {
    if (!draftId || !hydrated.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await savePetFormulation(draftId, {
      ingredients: rows,
      ga: { crudeProteinMinPct: cp, crudeFatMinPct: cf, crudeFiberMaxPct: fiber, moistureMaxPct: moisture, others },
      species, lifeStage, method, feedingDirections,
    })
  }
  React.useEffect(() => {
    if (!registerFlush) return
    return registerFlush(() => flushRef.current())
  }, [registerFlush])

  const patch = (id: string, p: Partial<PetRow>) => setRows((rs) => rs.map((r) => (r.uid === id ? { ...r, ...p } : r)))
  const addRow = () => setRows((rs) => [...rs, { uid: uid(), name: '', weight: 0 }])
  const remove = (id: string) => setRows((rs) => rs.filter((r) => r.uid !== id))

  // AAFCO search — admin-managed Library (DB) first, static starter dictionary as
  // fallback (pre-seed / source disabled).
  const [aafcoQuery, setAafcoQuery] = React.useState('')
  const [aafcoResults, setAafcoResults] = React.useState<AafcoEntry[]>([])
  React.useEffect(() => {
    const q = aafcoQuery.trim()
    if (q.length < 1) { setAafcoResults([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      let entries: AafcoEntry[] = []
      if (q.length >= 2) {
        const r = await searchLibraryIngredients('AAFCO', q)
        if (!cancelled && r.ok && r.data.length) {
          entries = r.data.map((d) => ({ name: d.name, category: String(d.meta.category ?? '') }))
        }
      }
      if (!cancelled && entries.length === 0) entries = searchAafco(q)
      if (!cancelled) setAafcoResults(entries)
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [aafcoQuery])
  const addFromAafco = (e: AafcoEntry) => {
    setRows((rs) => [...rs, { uid: uid(), name: e.name, weight: 0 }])
    setAafcoQuery('')
  }
  const addOther = () => setOthers((o) => [...o, { name: '', value: 0, bound: 'min', unit: '%' }])
  const patchOther = (i: number, p: Partial<GaOther>) => setOthers((o) => o.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const removeOther = (i: number) => setOthers((o) => o.filter((_, j) => j !== i))

  const ordered = petIngredientOrder(rows.map((r) => ({ id: r.uid, name: r.name, weight: r.weight })))
  const gaRows = formatGuaranteedAnalysis({ crudeProteinMinPct: cp, crudeFatMinPct: cf, crudeFiberMaxPct: fiber, moistureMaxPct: moisture, others })
  const statement = adequacyStatement(productName ?? '', species, lifeStage, method)

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      {/* LEFT — formulation */}
      <div className="space-y-4">
        {/* Species / adequacy */}
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-pink-50 text-pink-700"><PawPrint className="h-4 w-4" /></span>
            <h2 className="text-[15px] font-bold text-ink-900">Species &amp; nutritional adequacy</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-[12.5px] text-ink-700">Species
              <select className={`${INPUT} mt-1 block w-full`} value={species} onChange={(e) => setSpecies(e.target.value as PetSpecies)}><option>Dog</option><option>Cat</option></select>
            </label>
            <label className="text-[12.5px] text-ink-700">Life stage
              <select className={`${INPUT} mt-1 block w-full`} value={lifeStage} onChange={(e) => setLifeStage(e.target.value as LifeStage)}>
                <option value="growth">Growth</option><option value="maintenance">Adult maintenance</option><option value="all">All life stages</option><option value="gestation">Gestation/lactation</option>
              </select>
            </label>
            <label className="text-[12.5px] text-ink-700">Adequacy basis
              <select className={`${INPUT} mt-1 block w-full`} value={method} onChange={(e) => setMethod(e.target.value as AdequacyMethod)}>
                <option value="formulated">Formulated to meet</option><option value="feeding_test">Animal feeding test</option><option value="intermittent">Intermittent / supplemental (treats)</option>
              </select>
            </label>
          </div>
        </div>

        {/* Ingredients */}
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <h2 className="mb-1 text-[14px] font-bold text-ink-900">Ingredients</h2>
          <p className="mb-3 text-[11px] text-ink-500">Enter a relative weight — the statement auto-orders by descending predominance.</p>

          {/* AAFCO ingredient search */}
          <div className="relative mb-3">
            <div className="relative">
              <input className={`${INPUT} w-full pl-3 pr-8`} value={aafcoQuery} onChange={(e) => setAafcoQuery(e.target.value)} placeholder="Search AAFCO ingredients (e.g. Chicken Meal, Brown Rice, Salmon Oil)…" />
              <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            </div>
            {aafcoQuery.trim().length >= 1 && (
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-md border border-ink-200 bg-white shadow-lg">
                {aafcoResults.map((e) => (
                  <button key={e.name} type="button" onClick={() => addFromAafco(e)} className="flex w-full items-center justify-between gap-2 border-b border-ink-50 px-3 py-2 text-left text-[13px] last:border-0 hover:bg-pink-50/40">
                    <span className="font-medium text-ink-900">{e.name}</span>
                    <span className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-600">{e.category}</span>
                  </button>
                ))}
                {aafcoResults.length === 0 && <div className="px-3 py-2 text-[12px] text-ink-500">No match — type the ingredient name manually in the table.</div>}
              </div>
            )}
          </div>

          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-ink-200 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500"><th className="py-1.5 pr-2">Ingredient</th><th className="py-1.5 px-1 text-right">Weight</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid} className="border-b border-ink-50">
                  <td className="py-1.5 pr-2"><input className={`${INPUT} w-full`} value={r.name} placeholder="e.g. Chicken, Brown Rice, Chicken Fat" onChange={(e) => patch(r.uid, { name: e.target.value })} /></td>
                  <td className="py-1.5 px-1"><input className={`${INPUT} w-20 text-right`} type="number" min={0} value={r.weight} onChange={(e) => patch(r.uid, { weight: Math.max(0, parseFloat(e.target.value) || 0) })} /></td>
                  <td className="py-1.5 pl-1 text-right"><button type="button" aria-label="Remove" onClick={() => remove(r.uid)} className="text-ink-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-[12px] text-ink-400">No ingredients yet — add the first below.</td></tr>}
            </tbody>
          </table>
          <button type="button" onClick={addRow} className="mt-3 inline-flex items-center gap-1 rounded-full border border-ink-300 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50"><Plus className="h-3.5 w-3.5" /> Ingredient</button>
        </div>

        {/* Guaranteed analysis */}
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <h2 className="mb-3 text-[14px] font-bold text-ink-900">Guaranteed Analysis</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-[12.5px] text-ink-700">Crude Protein (min)<div className="mt-1 flex items-center gap-1"><input className={`${INPUT} w-20 text-right`} type="number" min={0} value={cp} onChange={(e) => setCp(Math.max(0, parseFloat(e.target.value) || 0))} /><span className="text-ink-500">%</span></div></label>
            <label className="text-[12.5px] text-ink-700">Crude Fat (min)<div className="mt-1 flex items-center gap-1"><input className={`${INPUT} w-20 text-right`} type="number" min={0} value={cf} onChange={(e) => setCf(Math.max(0, parseFloat(e.target.value) || 0))} /><span className="text-ink-500">%</span></div></label>
            <label className="text-[12.5px] text-ink-700">Crude Fiber (max)<div className="mt-1 flex items-center gap-1"><input className={`${INPUT} w-20 text-right`} type="number" min={0} value={fiber} onChange={(e) => setFiber(Math.max(0, parseFloat(e.target.value) || 0))} /><span className="text-ink-500">%</span></div></label>
            <label className="text-[12.5px] text-ink-700">Moisture (max)<div className="mt-1 flex items-center gap-1"><input className={`${INPUT} w-20 text-right`} type="number" min={0} value={moisture} onChange={(e) => setMoisture(Math.max(0, parseFloat(e.target.value) || 0))} /><span className="text-ink-500">%</span></div></label>
          </div>
          {others.map((o, i) => (
            <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
              <input className={`${INPUT} flex-1 min-w-[140px]`} value={o.name} placeholder="e.g. Omega-3 Fatty Acids" onChange={(e) => patchOther(i, { name: e.target.value })} />
              <select className={INPUT} value={o.bound} onChange={(e) => patchOther(i, { bound: e.target.value as 'min' | 'max' })}><option value="min">min</option><option value="max">max</option></select>
              <input className={`${INPUT} w-20 text-right`} type="number" min={0} value={o.value} onChange={(e) => patchOther(i, { value: Math.max(0, parseFloat(e.target.value) || 0) })} />
              <input className={`${INPUT} w-16`} value={o.unit} onChange={(e) => patchOther(i, { unit: e.target.value })} />
              <button type="button" aria-label="Remove" onClick={() => removeOther(i)} className="text-ink-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={addOther} className="mt-2 inline-flex items-center gap-1 rounded-full border border-ink-300 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50"><Plus className="h-3.5 w-3.5" /> Extra guarantee</button>
        </div>

        {/* Feeding directions */}
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <h2 className="mb-2 text-[14px] font-bold text-ink-900">Feeding directions</h2>
          <textarea className={`${INPUT} w-full`} rows={3} value={feedingDirections} placeholder="e.g. Feed 1 cup per 20 lbs of body weight daily, divided into two meals. Adjust to maintain ideal body condition. Provide fresh water." onChange={(e) => setFeeding(e.target.value)} />
          {method !== 'intermittent' && !feedingDirections.trim() && <p className="mt-1 text-[11px] text-amber-600">Feeding directions are required for complete &amp; balanced products.</p>}
        </div>

        <p className="text-[11px] text-ink-500">{draftId ? 'Autosaves to your draft.' : 'Save your draft to keep this formulation.'} AAFCO search uses a curated starter dictionary (admin-managed, expandable). {productName ? <span>· {productName}</span> : null}</p>
      </div>

      {/* RIGHT — live AAFCO label (print-grade SVG, CSS-immune like the other
          regulated panels — not app-styled HTML). */}
      <div className="space-y-2">
        <GuaranteedAnalysisSvg
          gaRows={gaRows}
          ingredients={ordered.length > 0 ? ordered.join(', ') : undefined}
          adequacyStatement={statement}
          feedingDirections={feedingDirections.trim() || undefined}
          widthPx={300}
        />
        <p className="text-[11px] text-ink-500">Print-grade AAFCO label preview.</p>
      </div>
    </div>
  )
}
