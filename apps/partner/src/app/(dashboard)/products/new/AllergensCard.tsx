'use client'

// Builder Allergens card (consolidation — Recipe step). Mood-board styled, reuses
// loadAllergenData + the editor's saveManualAllergens (overrides) and updateBasics
// (cross-contamination). autoDerived allergens come from the base ingredients;
// the manufacturer can ADD a missed allergen or REMOVE a false-positive (with a
// reason), and write a cross-contamination statement. Rendered in `.gb` scope.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { loadAllergenData, updateBasics, type AllergenData, type AllergenOverride } from './build-actions'
import { saveManualAllergens } from '../[id]/edit/card-actions'
import { TriangleAlert } from 'lucide-react'

const BIG_9 = ['Milk', 'Eggs', 'Fish', 'Crustacean shellfish', 'Tree nuts', 'Peanuts', 'Wheat', 'Soybeans', 'Sesame']

export function AllergensCard({ draftId }: { draftId: string | null }) {
  const [data, setData] = useState<AllergenData>({ autoDerived: [], manualOverrides: [], crossContamination: '' })
  const [cross, setCross] = useState('')
  const [, start] = useTransition()

  const refresh = useCallback(() => {
    if (!draftId) return
    void loadAllergenData(draftId).then((d) => { setData(d); setCross(d.crossContamination) })
  }, [draftId])
  useEffect(() => { refresh() }, [refresh])

  function persistOverrides(next: AllergenOverride[]) {
    setData((d) => ({ ...d, manualOverrides: next }))
    if (!draftId) return
    start(async () => {
      const r = await saveManualAllergens({ productTemplateId: draftId, manualOverrides: next })
      if (!r.ok) { toast.error(r.error ?? 'Could not save'); refresh() }
    })
  }
  function addOverride(o: AllergenOverride) {
    if (data.manualOverrides.some((x) => x.allergen === o.allergen && x.action === o.action)) return
    persistOverrides([...data.manualOverrides, o])
  }
  function removeOverride(i: number) { persistOverrides(data.manualOverrides.filter((_, j) => j !== i)) }

  // Cross-contamination — debounced autosave.
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  function onCross(v: string) {
    setCross(v)
    if (!draftId) return
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => { void updateBasics(draftId, { allergenCrossContamination: v }) }, 700)
  }

  // Effective declared set = auto − REMOVE + ADD.
  const removed = new Set(data.manualOverrides.filter((o) => o.action === 'REMOVE').map((o) => o.allergen))
  const added = data.manualOverrides.filter((o) => o.action === 'ADD').map((o) => o.allergen)
  const declared = [...new Set([...data.autoDerived.filter((a) => !removed.has(a)), ...added])].sort()
  const addable = BIG_9.filter((a) => !declared.includes(a))

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="section-title" style={{ fontSize: 15 }}><span className="ic"><TriangleAlert size={16} strokeWidth={2} /></span> Allergens <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· FDA Big-9</span></div>
      <p className="tiny muted" style={{ marginTop: 4 }}>Auto-detected from your ingredients. Add a missed allergen or remove a false positive (a reason is required).</p>

      {!draftId && <p className="tiny muted" style={{ marginTop: 10 }}>Save the draft + add ingredients to detect allergens.</p>}

      {draftId && (
        <>
          <div className="eyebrow" style={{ marginTop: 14 }}>Declared on label</div>
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            {declared.length === 0 && <span className="tiny muted">None detected.</span>}
            {declared.map((a) => <span key={a} className="pill amber">{a}</span>)}
          </div>

          {addable.length > 0 && (
            <>
              <div className="eyebrow" style={{ marginTop: 14 }}>Add a missed allergen</div>
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                {addable.map((a) => (
                  <button key={a} className="chip" type="button" onClick={() => {
                    const reason = window.prompt(`Why add ${a}? (e.g. shared line / hidden source)`)?.trim()
                    if (reason) addOverride({ allergen: a, action: 'ADD', reason })
                  }}>+ {a}</button>
                ))}
              </div>
            </>
          )}

          {data.manualOverrides.length > 0 && (
            <>
              <div className="eyebrow" style={{ marginTop: 14 }}>Manual overrides</div>
              {data.manualOverrides.map((o, i) => (
                <div key={i} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, border: '1px solid var(--ink-200)', borderRadius: 10, padding: '7px 11px', marginTop: 6 }}>
                  <span className="tiny"><b>{o.action === 'ADD' ? '+ Add' : '− Remove'} {o.allergen}</b> <span className="muted">· {o.reason}</span></span>
                  <button className="del" onClick={() => removeOverride(i)}>undo</button>
                </div>
              ))}
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                {data.autoDerived.filter((a) => !removed.has(a)).map((a) => (
                  <button key={a} className="chip" type="button" onClick={() => {
                    const reason = window.prompt(`Why remove ${a}? (false positive reason)`)?.trim()
                    if (reason) addOverride({ allergen: a, action: 'REMOVE', reason })
                  }}>− {a}</button>
                ))}
              </div>
            </>
          )}
          {data.manualOverrides.length === 0 && removed.size === 0 && data.autoDerived.length > 0 && (
            <p className="tiny muted" style={{ marginTop: 10 }}>To remove a false positive, add an override below — click an allergen: {data.autoDerived.map((a) => (
              <button key={a} className="chip" type="button" style={{ margin: '0 3px' }} onClick={() => { const r = window.prompt(`Why remove ${a}?`)?.trim(); if (r) addOverride({ allergen: a, action: 'REMOVE', reason: r }) }}>− {a}</button>
            ))}</p>
          )}

          <div className="field" style={{ marginTop: 16 }}>
            <label>Cross-contamination statement <span className="muted">· optional</span></label>
            <textarea rows={2} value={cross} onChange={(e) => onCross(e.target.value)} placeholder="e.g. Made in a facility that also processes tree nuts and milk." />
          </div>
        </>
      )}
    </div>
  )
}
