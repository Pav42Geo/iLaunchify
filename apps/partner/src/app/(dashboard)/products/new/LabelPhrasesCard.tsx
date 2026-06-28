'use client'

// Builder Label Phrases card (consolidation — Packaging step). Mood-board styled,
// reuses the marketplace phrase engine via loadPhraseData + the editor's
// saveProductPhraseFacts / saveProductPhrases actions. The manufacturer answers
// product-fact questions; the engine suggests mandatory/recommended label phrases
// (locked ones can't be removed). Rendered in GuidedBuilder's `.gb` scope.

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { loadPhraseData, type PhraseData } from './build-actions'
import { saveProductPhraseFacts, saveProductPhrases } from '../[id]/edit/card-actions'
import { Type } from 'lucide-react'

export function LabelPhrasesCard({ draftId }: { draftId: string | null }) {
  const [data, setData] = useState<PhraseData | null>(null)
  const [, start] = useTransition()
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => { if (draftId) void loadPhraseData(draftId).then(setData) }, [draftId])
  useEffect(() => { refresh() }, [refresh])

  function toggleFact(key: string, on: boolean) {
    if (!draftId || !data) return
    const facts = { ...data.facts, [key]: on }
    setData({ ...data, facts }) // optimistic
    setBusy(true)
    start(async () => {
      const r = await saveProductPhraseFacts(draftId, facts)
      setBusy(false)
      if (!r.ok) { toast.error(r.error ?? 'Could not save'); refresh(); return }
      refresh() // engine recomputed — pull fresh suggestions + selection
    })
  }

  function togglePhrase(phraseId: string, on: boolean) {
    if (!draftId || !data) return
    const ids = on ? [...new Set([...data.selectedPhraseIds, phraseId])] : data.selectedPhraseIds.filter((p) => p !== phraseId)
    setData({ ...data, selectedPhraseIds: ids }) // optimistic
    setBusy(true)
    start(async () => {
      const r = await saveProductPhrases(draftId, ids)
      setBusy(false)
      if (!r.ok) { toast.error(r.error ?? 'Could not save'); refresh(); return }
      refresh()
    })
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="section-title"><span className="ic"><Type size={16} strokeWidth={2} /></span> Label phrases <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· compliance</span> <i className="info" data-tip="Answer the product facts; we suggest the mandatory + recommended phrases that must appear on the label. Locked phrases are legally required and can't be removed." tabIndex={0} role="img" aria-label="About label phrases">i</i></div>

      {!draftId && <p className="tiny muted" style={{ marginTop: 10 }}>Save the draft first to load label phrases.</p>}

      {draftId && data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 14 }}>
          {/* Product facts */}
          <div>
            <div className="eyebrow">Product facts</div>
            {data.factFlags.length === 0 && <p className="tiny muted" style={{ marginTop: 6 }}>No fact questions for this labeling type ({data.labelingType}).</p>}
            {data.factFlags.map((f) => (
              <label key={f.key} className="factrow">
                <input type="checkbox" checked={!!data.facts[f.key]} disabled={busy} onChange={(e) => toggleFact(f.key, e.target.checked)} />
                <span><b style={{ fontSize: 12.5 }}>{f.label}</b><div className="tiny muted">{f.help}</div></span>
              </label>
            ))}
          </div>

          {/* Suggested phrases */}
          <div>
            <div className="eyebrow">Required &amp; suggested phrases ({data.suggestions.length})</div>
            {data.suggestions.length === 0 && <p className="tiny muted" style={{ marginTop: 6 }}>None triggered yet.</p>}
            {data.suggestions.map((s) => {
              const selected = s.isLocked || data.selectedPhraseIds.includes(s.phraseId)
              return (
                <label key={s.phraseId} className="phraserow">
                  <input type="checkbox" checked={selected} disabled={busy || s.isLocked} onChange={(e) => togglePhrase(s.phraseId, e.target.checked)} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <b style={{ fontSize: 12.5 }}>{s.title}</b>
                      <span className={`pill ${s.requirement === 'MANDATORY' ? 'amber' : ''}`} style={{ padding: '1px 7px', fontSize: 9 }}>{s.isLocked ? 'required' : s.requirement.toLowerCase()}</span>
                    </span>
                    <div className="tiny muted" style={{ marginTop: 2 }}>{s.body}{s.cfrCitation && <span> · {s.cfrCitation}</span>}</div>
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      <style>{`
        .gb .factrow,.gb .phraserow{display:flex;gap:9px;align-items:flex-start;border:1px solid var(--ink-200);border-radius:11px;padding:9px 11px;margin-top:8px;cursor:pointer}
        .gb .factrow input,.gb .phraserow input{margin-top:3px;flex:none}
      `}</style>
    </div>
  )
}
