'use client'

// Supplement Formulation step (Phase 1B). Supplements don't use the food
// per-100g recipe model — each dietary ingredient declares an amount PER SERVING
// (+ %DV when an RDI exists), grouped into proprietary blends, with excipients in
// an "Other ingredients" line. Renders a live Supplement Facts (21 CFR 101.36)
// panel via the engine adapter + the shared NutritionFactsRenderer.
//
// GuidedBuilder renders this instead of RecipeBuilderStep when the product domain
// is DIETARY_SUPPLEMENT. docs/PRODUCT_DOMAINS_ARCHITECTURE.md (Phase 1).

import * as React from 'react'
import { Plus, Trash2, FlaskConical, Layers, Search, Loader2 } from 'lucide-react'
import { NutritionFactsRenderer } from '@ilaunchify/ui'
import { toSupplementPanelData, type DietaryIngredient, type ProprietaryBlend } from '@ilaunchify/nutrition'
import { searchDsldIngredients } from './dsld-actions'
import { dsldLabelName, type DsldIngredientCandidate } from './dsld'

const UNITS = ['mg', 'mcg', 'g', 'IU', 'mcg DFE', 'mg NE', 'mg DFE', 'billion CFU', 'mL']
let seq = 0
const uid = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`

interface DietRow {
  uid: string
  name: string
  amount: number
  unit: string
  percentDV: string // '' = no established DV (†)
  blendId: string // '' = standalone
  isOther: boolean
}

const INPUT = 'rounded-md border border-ink-300 bg-white px-2 py-1 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400'

export function SupplementFormulationStep({
  productName,
  servingFormDefault = '1 capsule',
}: {
  productName?: string
  servingFormDefault?: string
}) {
  const [rows, setRows] = React.useState<DietRow[]>([])
  const [blends, setBlends] = React.useState<{ id: string; name: string; total: number; unit: string }[]>([])
  const [servingForm, setServingForm] = React.useState(servingFormDefault)
  const [servingsPerContainer, setSpc] = React.useState(30)

  // NIH DSLD ingredient search (live/hybrid per admin config).
  const [dsldQuery, setDsldQuery] = React.useState('')
  const [dsldResults, setDsldResults] = React.useState<DsldIngredientCandidate[]>([])
  const [dsldNote, setDsldNote] = React.useState<string | null>(null)
  const [dsldPending, startDsld] = React.useTransition()
  React.useEffect(() => {
    const q = dsldQuery.trim()
    if (q.length < 2) { setDsldResults([]); setDsldNote(null); return }
    const t = setTimeout(() => {
      startDsld(async () => {
        const r = await searchDsldIngredients(q)
        if (r.ok) { setDsldResults(r.data); setDsldNote(r.note ?? (r.data.length === 0 ? 'No DSLD matches.' : null)) }
        else { setDsldResults([]); setDsldNote(r.error) }
      })
    }, 300)
    return () => clearTimeout(t)
  }, [dsldQuery])
  const unitFor = (cat: string) => (cat === 'probiotic' ? 'billion CFU' : cat === 'protein' ? 'g' : 'mg')
  const addFromDsld = (c: DsldIngredientCandidate) => {
    setRows((rs) => [...rs, { uid: uid(), name: dsldLabelName(c), amount: 0, unit: unitFor(c.category), percentDV: '', blendId: '', isOther: false }])
    setDsldQuery('')
    setDsldResults([])
  }

  const patch = (id: string, p: Partial<DietRow>) => setRows((rs) => rs.map((r) => (r.uid === id ? { ...r, ...p } : r)))
  const addRow = (isOther = false) =>
    setRows((rs) => [...rs, { uid: uid(), name: '', amount: 0, unit: isOther ? '' : 'mg', percentDV: '', blendId: '', isOther }])
  const remove = (id: string) => setRows((rs) => rs.filter((r) => r.uid !== id))
  const addBlend = () => setBlends((bs) => [...bs, { id: uid(), name: `Proprietary Blend ${bs.length + 1}`, total: 0, unit: 'mg' }])
  const patchBlend = (id: string, p: Partial<(typeof blends)[number]>) => setBlends((bs) => bs.map((b) => (b.id === id ? { ...b, ...p } : b)))
  const removeBlend = (id: string) => {
    setBlends((bs) => bs.filter((b) => b.id !== id))
    setRows((rs) => rs.map((r) => (r.blendId === id ? { ...r, blendId: '' } : r)))
  }

  // Build the live Supplement Facts panel from the current rows.
  const dietary: DietaryIngredient[] = rows
    .filter((r) => r.name.trim())
    .map((r, i) => ({
      id: r.uid,
      name: r.name.trim(),
      amountPerServing: r.amount,
      unit: r.unit,
      percentDV: r.percentDV.trim() === '' ? null : Number(r.percentDV),
      blendId: r.blendId || null,
      isOtherIngredient: r.isOther,
      sortWeight: rows.length - i, // declared order = descending predominance
    }))
  const blendInputs: ProprietaryBlend[] = blends.map((b) => ({ id: b.id, name: b.name, totalAmount: b.total, unit: b.unit, percentDV: null }))
  const { panel, otherIngredients } = toSupplementPanelData(dietary, blendInputs, {
    servingSize: servingForm,
    servingsPerContainer,
  })
  const hasPanel = panel.rows.length > 0

  const dietRows = rows.filter((r) => !r.isOther)
  const otherRows = rows.filter((r) => r.isOther)

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      {/* LEFT — formulation */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-pink-50 text-pink-700"><FlaskConical className="h-4 w-4" /></span>
            <h2 className="text-[15px] font-bold text-ink-900">Dietary ingredients</h2>
          </div>

          {/* NIH DSLD search — validated dietary-ingredient identities. */}
          <div className="relative mb-3">
            <div className="relative">
              <input
                className={`${INPUT} w-full pl-3 pr-8`}
                value={dsldQuery}
                onChange={(e) => setDsldQuery(e.target.value)}
                placeholder="Search NIH DSLD for a dietary ingredient (e.g. Vitamin C, Ashwagandha)…"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400">
                {dsldPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </span>
            </div>
            {(dsldResults.length > 0 || dsldNote) && dsldQuery.trim().length >= 2 && (
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-md border border-ink-200 bg-white shadow-lg">
                {dsldResults.map((c) => (
                  <button key={c.id} type="button" onClick={() => addFromDsld(c)} className="flex w-full items-center justify-between gap-2 border-b border-ink-50 px-3 py-2 text-left text-[13px] last:border-0 hover:bg-pink-50/40">
                    <span className="min-w-0">
                      <span className="font-medium text-ink-900">{c.name}</span>
                      {(c.form || c.altName) && <span className="ml-1 text-[11px] text-ink-500">as {c.form || c.altName}</span>}
                    </span>
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700">{c.category}</span>
                  </button>
                ))}
                {dsldResults.length === 0 && dsldNote && <div className="px-3 py-2 text-[12px] text-ink-500">{dsldNote}</div>}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-ink-200 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  <th className="py-1.5 pr-2">Ingredient (incl. source / plant part)</th>
                  <th className="py-1.5 px-1 text-right">Amount</th>
                  <th className="py-1.5 px-1">Unit</th>
                  <th className="py-1.5 px-1 text-right">% DV</th>
                  <th className="py-1.5 px-1">Blend</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dietRows.map((r) => (
                  <tr key={r.uid} className="border-b border-ink-50">
                    <td className="py-1.5 pr-2"><input className={`${INPUT} w-full`} value={r.name} placeholder="e.g. Vitamin C (as ascorbic acid)" onChange={(e) => patch(r.uid, { name: e.target.value })} /></td>
                    <td className="py-1.5 px-1"><input className={`${INPUT} w-16 text-right`} type="number" min={0} value={r.amount} onChange={(e) => patch(r.uid, { amount: Math.max(0, parseFloat(e.target.value) || 0) })} /></td>
                    <td className="py-1.5 px-1">
                      <select className={`${INPUT} w-24`} value={r.unit} onChange={(e) => patch(r.uid, { unit: e.target.value })}>
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 px-1"><input className={`${INPUT} w-14 text-right`} type="number" min={0} value={r.percentDV} placeholder="†" onChange={(e) => patch(r.uid, { percentDV: e.target.value })} /></td>
                    <td className="py-1.5 px-1">
                      <select className={`${INPUT} w-32`} value={r.blendId} onChange={(e) => patch(r.uid, { blendId: e.target.value })}>
                        <option value="">— none —</option>
                        {blends.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 pl-1 text-right"><button type="button" aria-label="Remove" onClick={() => remove(r.uid)} className="text-ink-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
                {dietRows.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-[12px] text-ink-400">No dietary ingredients yet — add the first below.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => addRow(false)} className="inline-flex items-center gap-1 rounded-full border border-ink-300 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50"><Plus className="h-3.5 w-3.5" /> Dietary ingredient</button>
            <button type="button" onClick={addBlend} className="inline-flex items-center gap-1 rounded-full border border-ink-300 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50"><Layers className="h-3.5 w-3.5" /> Proprietary blend</button>
          </div>
          <p className="mt-2 text-[11px] text-ink-500">Leave <b>% DV</b> blank for ingredients with no established Daily Value — they print with a “†”. Source / plant part goes in the name, e.g. “Turmeric (root) extract”.</p>
        </div>

        {/* Proprietary blends */}
        {blends.length > 0 && (
          <div className="rounded-2xl border border-ink-200 bg-white p-4">
            <h2 className="mb-2 text-[14px] font-bold text-ink-900">Proprietary blends</h2>
            <p className="mb-3 text-[11px] text-ink-500">The blend total is printed; member amounts are hidden. Assign ingredients to a blend in the table above.</p>
            <div className="space-y-2">
              {blends.map((b) => {
                const members = dietRows.filter((r) => r.blendId === b.id).length
                return (
                  <div key={b.id} className="flex flex-wrap items-center gap-2">
                    <input className={`${INPUT} flex-1 min-w-[140px]`} value={b.name} onChange={(e) => patchBlend(b.id, { name: e.target.value })} />
                    <input className={`${INPUT} w-20 text-right`} type="number" min={0} value={b.total} onChange={(e) => patchBlend(b.id, { total: Math.max(0, parseFloat(e.target.value) || 0) })} />
                    <select className={`${INPUT} w-24`} value={b.unit} onChange={(e) => patchBlend(b.id, { unit: e.target.value })}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                    <span className="text-[11px] text-ink-500">{members} member{members === 1 ? '' : 's'}</span>
                    <button type="button" aria-label="Remove blend" onClick={() => removeBlend(b.id)} className="text-ink-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Serving + Other ingredients */}
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <h2 className="mb-3 text-[14px] font-bold text-ink-900">Serving &amp; other ingredients</h2>
          <div className="flex flex-wrap gap-4">
            <label className="text-[12.5px] text-ink-700">Serving form
              <input className={`${INPUT} mt-1 block w-48`} value={servingForm} placeholder="2 capsules" onChange={(e) => setServingForm(e.target.value)} />
            </label>
            <label className="text-[12.5px] text-ink-700">Servings per container
              <input className={`${INPUT} mt-1 block w-32`} type="number" min={1} value={servingsPerContainer} onChange={(e) => setSpc(Math.max(1, parseInt(e.target.value, 10) || 1))} />
            </label>
          </div>

          <div className="mt-4">
            <div className="mb-1 text-[12px] font-semibold text-ink-700">Other ingredients (excipients — capsule shell, fillers, flow agents)</div>
            <div className="space-y-1.5">
              {otherRows.map((r) => (
                <div key={r.uid} className="flex items-center gap-2">
                  <input className={`${INPUT} flex-1`} value={r.name} placeholder="e.g. Gelatin, Rice flour, Magnesium stearate" onChange={(e) => patch(r.uid, { name: e.target.value })} />
                  <button type="button" aria-label="Remove" onClick={() => remove(r.uid)} className="text-ink-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => addRow(true)} className="mt-2 inline-flex items-center gap-1 rounded-full border border-ink-300 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50"><Plus className="h-3.5 w-3.5" /> Other ingredient</button>
          </div>
        </div>

        <p className="text-[11px] text-ink-500">NIH DSLD search is live (admin-configurable). Saving the formulation to the draft lands in the next slice. {productName ? <span>· {productName}</span> : null}</p>
      </div>

      {/* RIGHT — live Supplement Facts */}
      <div className="space-y-3">
        {hasPanel ? (
          <>
            <NutritionFactsRenderer data={panel} widthPx={300} />
            {otherIngredients.length > 0 && (
              <p className="text-[12px] leading-snug text-ink-700"><b>Other ingredients:</b> {otherIngredients.join(', ')}.</p>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-ink-200 bg-white p-5 text-center text-[12.5px] text-ink-500">Add a dietary ingredient to see the live Supplement Facts panel.</div>
        )}
      </div>
    </div>
  )
}
