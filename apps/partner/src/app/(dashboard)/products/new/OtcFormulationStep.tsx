'use client'

// OTC Drug Facts step. Monograph OTC drugs declare a Drug Facts box
// (21 CFR 201.66): active ingredients (+ purpose), uses, warnings (with bold
// sub-headers), directions, other information, inactive ingredients and the
// questions line. Live print-grade preview via DrugFactsSvg. GuidedBuilder
// renders this when the domain is OTC (admin-gated — the OTC tile only shows
// once the admin enables the domain). Persisted to formulationData.otc, the
// exact shape computeProductLabel's OTC resolver reads.

import * as React from 'react'
import { Plus, Trash2, Cross, ListChecks, AlertTriangle, FileText } from 'lucide-react'
import { DrugFactsSvg, type DrugFactsData } from '@ilaunchify/ui'
import { saveOtcFormulation, loadOtcFormulation, type OtcActiveIngredientRow, type OtcWarningRow } from './otc-actions'

const INPUT = 'rounded-[var(--input-radius)] border border-ink-200 bg-white px-2.5 py-1.5 text-[13px] text-ink-900 focus:border-pink-500 focus:outline-none focus:shadow-[0_0_0_3px_var(--pink-50)]'
let seq = 0
const uid = () => `o${Date.now().toString(36)}${(seq++).toString(36)}`

export function OtcFormulationStep({ productName, draftId, registerFlush }: { productName?: string; draftId?: string | null; registerFlush?: (fn: () => Promise<void> | void) => () => void }) {
  const [actives, setActives] = React.useState<OtcActiveIngredientRow[]>([])
  const [uses, setUses] = React.useState<string[]>([])
  const [warnings, setWarnings] = React.useState<OtcWarningRow[]>([])
  const [directions, setDirections] = React.useState('')
  const [otherInfo, setOtherInfo] = React.useState<string[]>([])
  const [inactives, setInactives] = React.useState('')
  const [questions, setQuestions] = React.useState('')

  const hydrated = React.useRef(false)
  React.useEffect(() => {
    if (!draftId) { hydrated.current = true; return }
    let cancelled = false
    loadOtcFormulation(draftId).then((r) => {
      if (cancelled) return
      if (r.ok && r.data) {
        setActives(r.data.activeIngredients ?? [])
        setUses(r.data.uses ?? [])
        setWarnings(r.data.warnings ?? [])
        setDirections(r.data.directions ?? '')
        setOtherInfo(r.data.otherInformation ?? [])
        setInactives(r.data.inactiveIngredients ?? '')
        setQuestions(r.data.questions ?? '')
      }
      hydrated.current = true
    })
    return () => { cancelled = true }
  }, [draftId])

  const payload = React.useCallback(
    () => ({ activeIngredients: actives, uses, warnings, directions, otherInformation: otherInfo, inactiveIngredients: inactives, questions }),
    [actives, uses, warnings, directions, otherInfo, inactives, questions],
  )
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    if (!draftId || !hydrated.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void saveOtcFormulation(draftId, payload()) }, 1000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [payload, draftId])

  // Immediate flush before navigation (registry).
  const flushRef = React.useRef<() => Promise<void>>(async () => {})
  flushRef.current = async () => {
    if (!draftId || !hydrated.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await saveOtcFormulation(draftId, payload())
  }
  React.useEffect(() => {
    if (!registerFlush) return
    return registerFlush(() => flushRef.current())
  }, [registerFlush])

  // List helpers — string lists (uses / other info) edited as simple rows.
  const patchAt = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (i: number, v: string) =>
    setter((xs) => xs.map((x, k) => (k === i ? v : x)))
  const removeAt = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (i: number) =>
    setter((xs) => xs.filter((_, k) => k !== i))

  const preview: DrugFactsData = {
    activeIngredients: actives.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), purpose: a.purpose.trim() })),
    uses: uses.map((u) => u.trim()).filter(Boolean),
    warnings: warnings.filter((w) => w.text.trim()).map((w) => ({ text: w.text.trim(), bold: w.bold })),
    directions: directions.trim(),
    otherInformation: otherInfo.map((o) => o.trim()).filter(Boolean),
    inactiveIngredients: inactives.trim(),
    questions: questions.trim() || undefined,
  }
  const hasContent = preview.activeIngredients.length > 0

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      {/* LEFT — Drug Facts sections */}
      <div className="space-y-4">
        <div className="card">
          <div className="section-title" style={{ marginBottom: 12 }}><span className="ic"><Cross size={16} strokeWidth={2} /></span> Active ingredients</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-ink-200 text-left text-[12px] font-bold uppercase tracking-wide text-ink-700">
                  <th className="py-1.5 pr-2">Active ingredient (with amount per unit)</th>
                  <th className="py-1.5 px-1">Purpose</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {actives.map((r) => (
                  <tr key={r.uid} className="border-b border-ink-50">
                    <td className="py-1.5 pr-2"><input className={`${INPUT} w-full`} value={r.name} placeholder="e.g. Acetaminophen 500 mg (in each caplet)" onChange={(e) => setActives((rs) => rs.map((x) => (x.uid === r.uid ? { ...x, name: e.target.value } : x)))} /></td>
                    <td className="py-1.5 px-1"><input className={`${INPUT} w-full`} value={r.purpose} placeholder="e.g. Pain reliever/fever reducer" onChange={(e) => setActives((rs) => rs.map((x) => (x.uid === r.uid ? { ...x, purpose: e.target.value } : x)))} /></td>
                    <td className="py-1.5 pl-1 text-right"><button type="button" aria-label="Remove" onClick={() => setActives((rs) => rs.filter((x) => x.uid !== r.uid))} className="text-ink-400 hover:text-danger-600"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
                {actives.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-[12px] text-ink-400">No active ingredients yet — a Drug Facts box needs at least one.</td></tr>}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={() => setActives((rs) => [...rs, { uid: uid(), name: '', purpose: '' }])} className="btn sm" style={{ marginTop: 12 }}><Plus className="h-3.5 w-3.5" /> Active ingredient</button>
        </div>

        <div className="card">
          <div className="section-title" style={{ marginBottom: 12 }}><span className="ic"><ListChecks size={16} strokeWidth={2} /></span> Uses</div>
          <div className="space-y-2">
            {uses.map((u, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={`${INPUT} w-full`} value={u} placeholder="e.g. temporarily relieves minor aches and pains" onChange={(e) => patchAt(setUses)(i, e.target.value)} />
                <button type="button" aria-label="Remove" onClick={() => removeAt(setUses)(i)} className="text-ink-400 hover:text-danger-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {uses.length === 0 && <p className="text-[12px] text-ink-400">No uses yet.</p>}
          </div>
          <button type="button" onClick={() => setUses((xs) => [...xs, ''])} className="btn sm" style={{ marginTop: 12 }}><Plus className="h-3.5 w-3.5" /> Use</button>
        </div>

        <div className="card">
          <div className="section-title" style={{ marginBottom: 12 }}><span className="ic"><AlertTriangle size={16} strokeWidth={2} /></span> Warnings</div>
          <p className="mb-2 text-[11px] text-ink-500">Mark sub-header lines bold (&ldquo;Do not use&rdquo;, &ldquo;Ask a doctor before use if&rdquo;, &ldquo;Keep out of reach of children.&rdquo;) — the text after each renders as its body.</p>
          <div className="space-y-2">
            {warnings.map((w) => (
              <div key={w.uid} className="flex items-center gap-2">
                <input className={`${INPUT} w-full ${w.bold ? 'font-bold' : ''}`} value={w.text} placeholder={w.bold ? 'e.g. Do not use' : 'e.g. with any other drug containing acetaminophen.'} onChange={(e) => setWarnings((rs) => rs.map((x) => (x.uid === w.uid ? { ...x, text: e.target.value } : x)))} />
                <label className="flex shrink-0 items-center gap-1 text-[11px] text-ink-600"><input type="checkbox" checked={w.bold} onChange={(e) => setWarnings((rs) => rs.map((x) => (x.uid === w.uid ? { ...x, bold: e.target.checked } : x)))} /> bold</label>
                <button type="button" aria-label="Remove" onClick={() => setWarnings((rs) => rs.filter((x) => x.uid !== w.uid))} className="text-ink-400 hover:text-danger-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {warnings.length === 0 && <p className="text-[12px] text-ink-400">No warnings yet.</p>}
          </div>
          <button type="button" onClick={() => setWarnings((rs) => [...rs, { uid: uid(), text: '', bold: false }])} className="btn sm" style={{ marginTop: 12 }}><Plus className="h-3.5 w-3.5" /> Warning line</button>
        </div>

        <div className="card">
          <div className="section-title" style={{ marginBottom: 12 }}><span className="ic"><FileText size={16} strokeWidth={2} /></span> Directions &amp; other information</div>
          <label className="block text-[12.5px] text-ink-700">Directions
            <textarea className={`${INPUT} mt-1 block w-full`} rows={3} value={directions} placeholder="e.g. Adults and children 12 years and over: take 2 caplets every 6 hours while symptoms last…" onChange={(e) => setDirections(e.target.value)} />
          </label>
          <div className="mt-3">
            <span className="text-[12.5px] text-ink-700">Other information</span>
            <div className="mt-1 space-y-2">
              {otherInfo.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className={`${INPUT} w-full`} value={o} placeholder="e.g. store at 20-25°C (68-77°F)" onChange={(e) => patchAt(setOtherInfo)(i, e.target.value)} />
                  <button type="button" aria-label="Remove" onClick={() => removeAt(setOtherInfo)(i)} className="text-ink-400 hover:text-danger-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setOtherInfo((xs) => [...xs, ''])} className="btn sm" style={{ marginTop: 8 }}><Plus className="h-3.5 w-3.5" /> Line</button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-[12.5px] text-ink-700">Inactive ingredients
              <input className={`${INPUT} mt-1 block w-full`} value={inactives} placeholder="e.g. corn starch, hypromellose, magnesium stearate…" onChange={(e) => setInactives(e.target.value)} />
            </label>
            <label className="text-[12.5px] text-ink-700">Questions line
              <input className={`${INPUT} mt-1 block w-full`} value={questions} placeholder="e.g. Questions or comments? 1-800-555-0123" onChange={(e) => setQuestions(e.target.value)} />
            </label>
          </div>
        </div>

        <p className="text-[11px] text-ink-500">{draftId ? 'Autosaves to your draft.' : 'Save your draft to keep this Drug Facts box.'} {productName ? <span>· {productName}</span> : null}</p>
      </div>

      {/* RIGHT — live Drug Facts box (print-grade SVG, CSS-immune like the other
          regulated panels). */}
      <div className="space-y-2">
        {hasContent ? (
          <DrugFactsSvg data={preview} widthPx={300} />
        ) : (
          <div className="card text-[12.5px] text-ink-400">Add an active ingredient to build the Drug Facts box.</div>
        )}
        <p className="text-[11px] text-ink-500">Print-grade Drug Facts preview (21 CFR 201.66).</p>
      </div>
    </div>
  )
}
