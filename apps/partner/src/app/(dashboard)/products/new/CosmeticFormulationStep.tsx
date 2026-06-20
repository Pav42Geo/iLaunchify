'use client'

// Cosmetic Formulation step (Phase 2). No facts box — cosmetics declare an INCI
// ingredient list in 21 CFR 701.3 order (>1% by predominance, then ≤1% any order,
// color additives last), plus net contents + MoCRA contact info. Live declaration
// preview via the pure toInciDeclaration builder. GuidedBuilder renders this when
// the domain is COSMETIC. docs/PRODUCT_DOMAINS_ARCHITECTURE.md (Phase 2).

import * as React from 'react'
import { Plus, Trash2, Palette, Search } from 'lucide-react'
import { toInciDeclaration } from './inci'
import { InciDeclarationSvg } from '@ilaunchify/ui'
import { searchInci, type InciEntry } from './inci-dictionary'
import { searchLibraryIngredients } from './domain-library-actions'
import { saveCosmeticFormulation, loadCosmeticFormulation } from './cosmetic-actions'

const INPUT = 'rounded-md border border-ink-300 bg-white px-2 py-1 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400'
const NET_UNITS = ['fl oz', 'mL', 'g', 'oz']
let seq = 0
const uid = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`

interface CosRow { uid: string; inciName: string; pct: number; isColorAdditive: boolean; isFragrance: boolean }

export function CosmeticFormulationStep({ productName, draftId, registerFlush }: { productName?: string; draftId?: string | null; registerFlush?: (fn: () => Promise<void> | void) => () => void }) {
  const [rows, setRows] = React.useState<CosRow[]>([])
  const [netQty, setNetQty] = React.useState(0)
  const [netUnit, setNetUnit] = React.useState('fl oz')
  const [responsiblePerson, setRp] = React.useState('')
  const [adverseEventContact, setAec] = React.useState('')

  const hydrated = React.useRef(false)
  React.useEffect(() => {
    if (!draftId) { hydrated.current = true; return }
    let cancelled = false
    loadCosmeticFormulation(draftId).then((r) => {
      if (cancelled) return
      if (r.ok && r.data) {
        setRows(r.data.ingredients ?? [])
        setNetQty(r.data.netContentsQty ?? 0)
        if (r.data.netContentsUnit) setNetUnit(r.data.netContentsUnit)
        setRp(r.data.responsiblePerson ?? '')
        setAec(r.data.adverseEventContact ?? '')
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
      void saveCosmeticFormulation(draftId, { ingredients: rows, netContentsQty: netQty, netContentsUnit: netUnit, responsiblePerson, adverseEventContact })
    }, 1000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [rows, netQty, netUnit, responsiblePerson, adverseEventContact, draftId])

  // Immediate flush before navigation (registry).
  const flushRef = React.useRef<() => Promise<void>>(async () => {})
  flushRef.current = async () => {
    if (!draftId || !hydrated.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await saveCosmeticFormulation(draftId, { ingredients: rows, netContentsQty: netQty, netContentsUnit: netUnit, responsiblePerson, adverseEventContact })
  }
  React.useEffect(() => {
    if (!registerFlush) return
    return registerFlush(() => flushRef.current())
  }, [registerFlush])

  const patch = (id: string, p: Partial<CosRow>) => setRows((rs) => rs.map((r) => (r.uid === id ? { ...r, ...p } : r)))
  const addRow = () => setRows((rs) => [...rs, { uid: uid(), inciName: '', pct: 0, isColorAdditive: false, isFragrance: false }])
  const remove = (id: string) => setRows((rs) => rs.filter((r) => r.uid !== id))

  // INCI search — admin-managed Library (DB) first, static starter dictionary as
  // fallback (pre-seed / source disabled). Picking pre-fills name + color/fragrance.
  const [inciQuery, setInciQuery] = React.useState('')
  const [inciResults, setInciResults] = React.useState<InciEntry[]>([])
  React.useEffect(() => {
    const q = inciQuery.trim()
    if (q.length < 1) { setInciResults([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      let entries: InciEntry[] = []
      if (q.length >= 2) {
        const r = await searchLibraryIngredients('INCI', q)
        if (!cancelled && r.ok && r.data.length) {
          entries = r.data.map((d) => ({ name: d.name, fn: String(d.meta.function ?? ''), color: !!d.meta.color, fragrance: !!d.meta.fragrance }))
        }
      }
      if (!cancelled && entries.length === 0) entries = searchInci(q)
      if (!cancelled) setInciResults(entries)
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [inciQuery])
  const addFromInci = (e: InciEntry) => {
    setRows((rs) => [...rs, { uid: uid(), inciName: e.name, pct: 0, isColorAdditive: !!e.color, isFragrance: !!e.fragrance }])
    setInciQuery('')
  }

  const totalPct = rows.reduce((n, r) => n + (r.pct || 0), 0)
  const decl = toInciDeclaration(rows.map((r) => ({ id: r.uid, inciName: r.inciName, pct: r.pct, isColorAdditive: r.isColorAdditive, isFragrance: r.isFragrance })))

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      {/* LEFT — formulation */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-pink-50 text-pink-700"><Palette className="h-4 w-4" /></span>
            <h2 className="text-[15px] font-bold text-ink-900">Ingredients (INCI)</h2>
          </div>
          <p className="mb-3 text-[11px] text-ink-500">Enter the % concentration — the declaration auto-orders by 21 CFR 701.3: &gt;1% by predominance, then ≤1% in any order, color additives last.</p>

          {/* INCI dictionary search */}
          <div className="relative mb-3">
            <div className="relative">
              <input className={`${INPUT} w-full pl-3 pr-8`} value={inciQuery} onChange={(e) => setInciQuery(e.target.value)} placeholder="Search INCI ingredients (e.g. Glycerin, Phenoxyethanol, Niacinamide)…" />
              <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            </div>
            {inciQuery.trim().length >= 1 && (
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-md border border-ink-200 bg-white shadow-lg">
                {inciResults.map((e) => (
                  <button key={e.name} type="button" onClick={() => addFromInci(e)} className="flex w-full items-center justify-between gap-2 border-b border-ink-50 px-3 py-2 text-left text-[13px] last:border-0 hover:bg-pink-50/40">
                    <span className="min-w-0"><span className="font-medium text-ink-900">{e.name}</span><span className="ml-1 text-[11px] text-ink-500">{e.fn}</span></span>
                    {(e.color || e.fragrance) && <span className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-600">{e.color ? 'Color' : 'Fragrance'}</span>}
                  </button>
                ))}
                {inciResults.length === 0 && <div className="px-3 py-2 text-[12px] text-ink-500">No match — type the INCI name manually in the table.</div>}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-ink-200 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  <th className="py-1.5 pr-2">INCI name</th>
                  <th className="py-1.5 px-1 text-right">% w/w</th>
                  <th className="py-1.5 px-1 text-center">Color</th>
                  <th className="py-1.5 px-1 text-center">Fragrance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.uid} className="border-b border-ink-50">
                    <td className="py-1.5 pr-2"><input className={`${INPUT} w-full`} value={r.inciName} placeholder="e.g. Aqua (Water), Glycerin, Sodium Hyaluronate" onChange={(e) => patch(r.uid, { inciName: e.target.value })} /></td>
                    <td className="py-1.5 px-1"><input className={`${INPUT} w-16 text-right`} type="number" min={0} max={100} step={0.01} value={r.pct} onChange={(e) => patch(r.uid, { pct: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })} /></td>
                    <td className="py-1.5 px-1 text-center"><input type="checkbox" checked={r.isColorAdditive} onChange={(e) => patch(r.uid, { isColorAdditive: e.target.checked })} /></td>
                    <td className="py-1.5 px-1 text-center"><input type="checkbox" checked={r.isFragrance} onChange={(e) => patch(r.uid, { isFragrance: e.target.checked })} /></td>
                    <td className="py-1.5 pl-1 text-right"><button type="button" aria-label="Remove" onClick={() => remove(r.uid)} className="text-ink-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-[12px] text-ink-400">No ingredients yet — add the first below.</td></tr>}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="text-[12px] font-semibold text-ink-600">
                    <td className="py-1.5">Total</td>
                    <td className={`py-1.5 px-1 text-right ${Math.abs(totalPct - 100) > 0.5 ? 'text-amber-600' : 'text-emerald-700'}`}>{totalPct.toFixed(2)}%</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <button type="button" onClick={addRow} className="mt-3 inline-flex items-center gap-1 rounded-full border border-ink-300 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50"><Plus className="h-3.5 w-3.5" /> Ingredient</button>
          {rows.length > 0 && Math.abs(totalPct - 100) > 0.5 && <p className="mt-2 text-[11px] text-amber-600">Concentrations total {totalPct.toFixed(2)}% — they should add up to ~100% w/w.</p>}
        </div>

        {/* Net contents + MoCRA */}
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <h2 className="mb-3 text-[14px] font-bold text-ink-900">Net contents &amp; responsible person (MoCRA)</h2>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-[12.5px] text-ink-700">Net contents
              <div className="mt-1 flex gap-2">
                <input className={`${INPUT} w-24 text-right`} type="number" min={0} step={0.01} value={netQty} onChange={(e) => setNetQty(Math.max(0, parseFloat(e.target.value) || 0))} />
                <select className={INPUT} value={netUnit} onChange={(e) => setNetUnit(e.target.value)}>{NET_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
              </div>
            </label>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-[12.5px] text-ink-700">Responsible person / business
              <input className={`${INPUT} mt-1 block w-full`} value={responsiblePerson} placeholder="Brand or manufacturer of record" onChange={(e) => setRp(e.target.value)} />
            </label>
            <label className="text-[12.5px] text-ink-700">Adverse-event contact
              <input className={`${INPUT} mt-1 block w-full`} value={adverseEventContact} placeholder="US address, phone, or email" onChange={(e) => setAec(e.target.value)} />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-ink-500">MoCRA requires a responsible person + a way to receive adverse-event reports on the label. Facility registration &amp; product listing are handled separately.</p>
        </div>

        <p className="text-[11px] text-ink-500">{draftId ? 'Autosaves to your draft.' : 'Save your draft to keep this formulation.'} INCI search uses a curated starter dictionary (admin-managed, expandable). {productName ? <span>· {productName}</span> : null}</p>
      </div>

      {/* RIGHT — live INCI declaration (print-grade SVG, CSS-immune like the
          other regulated panels). */}
      <div className="space-y-2">
        {decl.ordered.length > 0 ? (
          <InciDeclarationSvg
            ingredients={decl.ordered.map((o) => o.name).join(', ')}
            netContents={netQty > 0 ? `${netQty} ${netUnit}` : undefined}
            responsiblePerson={responsiblePerson || undefined}
            adverseEventContact={adverseEventContact || undefined}
            widthPx={300}
          />
        ) : (
          <div className="rounded-2xl border border-ink-200 bg-white p-4 text-[12.5px] text-ink-400">Add ingredients to build the declaration.</div>
        )}
        <p className="text-[11px] text-ink-500">Print-grade INCI declaration preview.</p>
      </div>
    </div>
  )
}
