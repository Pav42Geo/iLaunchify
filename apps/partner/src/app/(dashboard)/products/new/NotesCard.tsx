'use client'

// Builder Notes card (consolidation) — admin↔partner thread, mood-board styled,
// reusing the editor's real `postPartnerProductNote` action + a `loadNotes`
// loader. Lights up once the draft exists. Rendered in GuidedBuilder's `.gb`
// scope (Review & submit step).

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { loadNotes, type NoteRowData } from './build-actions'
import { postPartnerProductNote } from '../[id]/edit/card-actions'
import { MessageSquare } from 'lucide-react'

const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function NotesCard({ draftId }: { draftId: string | null }) {
  const [notes, setNotes] = useState<NoteRowData[]>([])
  const [body, setBody] = useState('')
  const [, start] = useTransition()
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    if (!draftId) return
    void loadNotes(draftId).then(setNotes)
  }, [draftId])
  useEffect(() => { refresh() }, [refresh])

  function post() {
    if (!draftId || !body.trim()) return
    setBusy(true)
    start(async () => {
      const r = await postPartnerProductNote({ productTemplateId: draftId, body: body.trim() })
      setBusy(false)
      if (!r.ok) { toast.error(r.error ?? 'Could not post'); return }
      setBody(''); toast.success('Note posted'); refresh()
    })
  }

  return (
    <div className="card">
      <div className="section-title"><span className="ic"><MessageSquare size={16} strokeWidth={2} /></span> Notes</div>

      {!draftId && <p className="tiny muted" style={{ marginTop: 10 }}>Save the draft first to start a thread.</p>}

      {draftId && (
        <>
          <div className="notelist">
            {notes.length === 0 && <p className="tiny muted">No notes yet.</p>}
            {notes.map((n) => {
              const admin = n.authorType.toUpperCase().includes('ADMIN')
              return (
                <div key={n.id} className={`note-msg ${admin ? 'admin' : 'partner'}`}>
                  <div className="tiny" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <b>{n.authorName}{admin ? ' · admin' : ''}</b><span className="muted">{fmt(n.createdAtIso)}</span>
                  </div>
                  <div style={{ marginTop: 3, fontSize: 13, whiteSpace: 'pre-wrap' }}>{n.body}</div>
                </div>
              )
            })}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
            <textarea className="input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a note to the review admins…" style={{ flex: 1, resize: 'vertical' }} />
            <button className="btn primary sm" onClick={post} disabled={busy || !body.trim()}>{busy ? 'Posting…' : 'Post'}</button>
          </div>
        </>
      )}

      <style>{`
        .gb .notelist{display:flex;flex-direction:column;gap:8px;margin-top:12px;max-height:280px;overflow:auto}
        .gb .note-msg{border:1px solid var(--ink-200);border-radius:12px;padding:9px 12px;background:#fff}
        .gb .note-msg.admin{background:var(--info-50,#E6F1FB);border-color:#B5D4F4}
        .gb .note-msg.partner{background:var(--ink-50)}
      `}</style>
    </div>
  )
}
