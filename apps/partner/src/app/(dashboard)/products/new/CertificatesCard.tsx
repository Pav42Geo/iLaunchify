'use client'

// Builder Certificates card (consolidation slice 1) — mood-board styled, but
// reuses the editor's real server actions + data (attachCertificate /
// detachCertificate / loadCertData). The manufacturer attaches VERIFIED cert
// instances from their Certifications catalog to this product. Lights up once
// the draft exists (needs a productTemplateId). Rendered in GuidedBuilder's `.gb`
// scope (Review & submit step).

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { loadCertData, type CertData, type CertRow } from './build-actions'
import { attachCertificate, detachCertificate } from '../[id]/edit/card-actions'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
const isExpired = (iso: string) => new Date(iso).getTime() < Date.now()

function StatusPill({ row }: { row: CertRow }) {
  const expired = row.status === 'EXPIRED' || isExpired(row.expiryDateIso)
  if (expired) return <span className="pill amber">expired</span>
  if (row.status === 'VERIFIED') return <span className="pill green">verified</span>
  if (row.status === 'PENDING_REVIEW') return <span className="pill">pending review</span>
  return <span className="pill amber">{row.status.toLowerCase()}</span>
}

export function CertificatesCard({ draftId }: { draftId: string | null }) {
  const [data, setData] = useState<CertData>({ attached: [], available: [] })
  const [, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!draftId) return
    void loadCertData(draftId).then(setData)
  }, [draftId])
  useEffect(() => { refresh() }, [refresh])

  function attach(instanceId: string) {
    if (!draftId) return
    setBusy(instanceId)
    start(async () => {
      const r = await attachCertificate({ productTemplateId: draftId, instanceId })
      setBusy(null)
      if (!r.ok) { toast.error(r.error ?? 'Could not attach'); return }
      toast.success('Certificate attached'); refresh()
    })
  }
  function detach(instanceId: string) {
    if (!draftId) return
    setBusy(instanceId)
    start(async () => {
      const r = await detachCertificate({ productTemplateId: draftId, instanceId })
      setBusy(null)
      if (!r.ok) { toast.error(r.error ?? 'Could not remove'); return }
      toast.success('Certificate removed'); refresh()
    })
  }

  const attachable = data.available.filter((c) => c.status === 'VERIFIED' && !isExpired(c.expiryDateIso))
  const pending = data.available.filter((c) => c.status === 'PENDING_REVIEW')

  return (
    <div className="card">
      <div className="section-title"><span className="ic">🏅</span> Certificates</div>
      <p className="tiny muted" style={{ marginTop: 4 }}>
        Attach VERIFIED certificates from your <a href="/certifications" style={{ color: 'var(--pink-700)' }}>Certifications</a> catalog
        (Organic, Kosher, GMP, …). They appear on the marketplace listing and in compliance checks.
      </p>

      {!draftId && <p className="tiny muted" style={{ marginTop: 10 }}>Save the draft first (complete Basics) to attach certificates.</p>}

      {draftId && (
        <>
          {/* Attached */}
          <div className="eyebrow" style={{ marginTop: 14 }}>Attached ({data.attached.length})</div>
          {data.attached.length === 0 && <p className="tiny muted" style={{ marginTop: 6 }}>None attached yet.</p>}
          {data.attached.map((c) => (
            <div key={c.instanceId} className="certrow">
              <div><b>{c.certName}</b> {c.certificateNumber && <span className="muted tiny">· {c.certificateNumber}</span>}<div className="tiny muted">expires {fmtDate(c.expiryDateIso)}</div></div>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <StatusPill row={c} />
                <button className="del" disabled={busy === c.instanceId} onClick={() => detach(c.instanceId)}>remove</button>
              </div>
            </div>
          ))}

          {/* Attachable */}
          {attachable.length > 0 && (
            <>
              <div className="eyebrow" style={{ marginTop: 14 }}>Available to attach</div>
              {attachable.map((c) => (
                <div key={c.instanceId} className="certrow">
                  <div><b>{c.certName}</b> {c.certificateNumber && <span className="muted tiny">· {c.certificateNumber}</span>}<div className="tiny muted">expires {fmtDate(c.expiryDateIso)}</div></div>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <StatusPill row={c} />
                    <button className="rb-btn-add" disabled={busy === c.instanceId} onClick={() => attach(c.instanceId)}>+ Attach</button>
                  </div>
                </div>
              ))}
            </>
          )}

          {pending.length > 0 && (
            <div className="note grey" style={{ marginTop: 12 }}>
              {pending.length} certificate{pending.length === 1 ? '' : 's'} pending admin review ({pending.map((c) => c.certName).join(', ')}) — attachable once verified.
            </div>
          )}
          {attachable.length === 0 && pending.length === 0 && data.attached.length === 0 && (
            <div className="note grey" style={{ marginTop: 12 }}>No verified certificates in your catalog yet. Add them on the <a href="/certifications" style={{ color: 'var(--pink-700)' }}>Certifications</a> page.</div>
          )}
        </>
      )}

      <style>{`
        .gb .certrow{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--ink-200);border-radius:12px;padding:10px 12px;margin-top:8px}
        .gb .rb-btn-add{background:#fff;color:var(--pink-700);border:1px solid var(--pink-100);border-radius:8px;padding:5px 11px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}
        .gb .rb-btn-add:hover{background:var(--pink-50)} .gb .rb-btn-add:disabled{opacity:.5;cursor:not-allowed}
        .gb .del{color:#e24b4a;cursor:pointer;background:none;border:0;font-size:12px;padding:0} .gb .del:disabled{opacity:.5;cursor:not-allowed}
      `}</style>
    </div>
  )
}
