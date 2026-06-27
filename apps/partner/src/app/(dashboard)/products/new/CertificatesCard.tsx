'use client'

// Builder Certificates card (consolidation) — mood-board styled, reuses the
// editor's real actions + loadCertData. In Basics: a compact attached list + an
// "Add certificates" POPUP of compact cert cards; the manufacturer can attach
// several (or upload a new one for approval) before closing. In Review: a
// read-only preview (preview prop). Rendered in GuidedBuilder's `.gb` scope.

import { useCallback, useEffect, useState, useTransition } from 'react'
import { BadgeCheck } from 'lucide-react'
import { toast } from 'sonner'
import { loadCertData, loadCertTypes, type CertData, type CertRow, type CertTypeOption } from './build-actions'
import { attachCertificate, detachCertificate } from '../[id]/edit/card-actions'
import { claimCertificate } from '../../certifications/actions'
import { CERT_UPLOAD_CONSENT_TEXT } from '../../certifications/consent'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
const isExpired = (iso: string) => new Date(iso).getTime() < Date.now()

function Badge({ row, big }: { row: CertRow; big?: boolean }) {
  const cls = `certbadge${big ? ' big' : ''}`
  if (row.badgeUrl) return <img src={row.badgeUrl} alt="" className={cls} />
  return <span className={`${cls} fallback`}>{row.certName.slice(0, 2).toUpperCase()}</span>
}
function StatusPill({ row }: { row: CertRow }) {
  const expired = row.status === 'EXPIRED' || isExpired(row.expiryDateIso)
  if (expired) return <span className="pill amber">expired</span>
  if (row.status === 'VERIFIED') return <span className="pill green">verified</span>
  if (row.status === 'PENDING_REVIEW') return <span className="pill">pending</span>
  return <span className="pill amber">{row.status.toLowerCase()}</span>
}

const STYLES = (
  <style>{`
    .gb .certbadge{width:34px;height:34px;border-radius:8px;object-fit:cover;flex:none;border:1px solid var(--ink-200);background:#fff}
    .gb .certbadge.big{width:44px;height:44px}
    .gb .certbadge.fallback{display:grid;place-items:center;font-size:11px;font-weight:700;color:var(--pink-700);background:var(--pink-50)}
    .gb .certrow{display:flex;align-items:center;gap:11px;border:1px solid var(--ink-200);border-radius:12px;padding:9px 11px;margin-top:8px}
    .gb .certrow .grow{flex:1;min-width:0}
    .gb .rb-btn-add{background:#fff;color:var(--pink-700);border:1px solid var(--pink-100);border-radius:8px;padding:6px 12px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}
    .gb .rb-btn-add:hover{background:var(--pink-50)} .gb .rb-btn-add:disabled{opacity:.5;cursor:not-allowed}
    .gb .del{color:#e24b4a;cursor:pointer;background:none;border:0;font-size:12px;padding:0} .gb .del:disabled{opacity:.5}
    .gb .cert-modal{position:fixed;inset:0;z-index:1000;background:rgba(20,20,26,.45);display:grid;place-items:center;padding:20px}
    .gb .cert-panel{background:#fff;border-radius:18px;width:min(680px,94vw);max-height:85vh;overflow:auto;padding:20px;box-shadow:0 24px 64px -20px rgba(0,0,0,.4)}
    .gb .cert-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
    .gb .cert-cardlet{display:flex;align-items:center;gap:10px;border:1px solid var(--ink-200);border-radius:12px;padding:10px 12px;background:#fff}
    .gb .cert-cardlet .grow{flex:1;min-width:0}
    .gb .upload-cta{display:flex;align-items:center;gap:8px;margin-top:12px;border:1.5px dashed var(--pink-100);border-radius:12px;padding:11px 13px;color:var(--pink-700);text-decoration:none;font-size:12.5px;font-weight:600}
    .gb .upload-cta:hover{background:var(--pink-50)}
    .gb .cert-upload{margin-top:12px;border:1px solid var(--ink-200);border-radius:14px;padding:14px;background:var(--ink-50)}
    .gb .cert-upload .field label{display:block;font-size:11px;font-weight:600;color:var(--ink-600);margin-bottom:5px}
    @media(max-width:640px){.gb .cert-grid{grid-template-columns:1fr}}
  `}</style>
)

export function CertificatesCard({ draftId, preview = false }: { draftId: string | null; preview?: boolean }) {
  const [data, setData] = useState<CertData>({ attached: [], available: [] })
  const [, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [certTypes, setCertTypes] = useState<CertTypeOption[]>([])

  const refresh = useCallback(() => { if (draftId) void loadCertData(draftId).then(setData) }, [draftId])
  useEffect(() => { refresh() }, [refresh])
  // Load the cert-type catalog the first time the modal opens.
  useEffect(() => { if (open && certTypes.length === 0) void loadCertTypes().then(setCertTypes) }, [open, certTypes.length])

  function submitUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setUploading(true)
    start(async () => {
      const r = await claimCertificate(fd)
      setUploading(false)
      if (!r.ok) { toast.error(r.error ?? 'Could not submit'); return }
      toast.success('Submitted for review & approval'); setShowUpload(false); refresh()
    })
  }

  function attach(instanceId: string) {
    if (!draftId) return
    setBusy(instanceId)
    start(async () => {
      const r = await attachCertificate({ productTemplateId: draftId, instanceId }); setBusy(null)
      if (!r.ok) { toast.error(r.error ?? 'Could not attach'); return }
      toast.success('Certificate added'); refresh()
    })
  }
  function detach(instanceId: string) {
    if (!draftId) return
    setBusy(instanceId)
    start(async () => {
      const r = await detachCertificate({ productTemplateId: draftId, instanceId }); setBusy(null)
      if (!r.ok) { toast.error(r.error ?? 'Could not remove'); return }
      toast.success('Certificate removed'); refresh()
    })
  }

  const attachable = data.available.filter((c) => c.status === 'VERIFIED' && !isExpired(c.expiryDateIso))
  const pending = data.available.filter((c) => c.status === 'PENDING_REVIEW')

  // ----- PREVIEW (Review step) -----
  if (preview) {
    return (
      <div className="card">
        <div className="section-title"><span className="ic">🏅</span> Certificates</div>
        {data.attached.length === 0
          ? <p className="tiny muted" style={{ marginTop: 8 }}>No certificates attached.</p>
          : data.attached.map((c) => (
              <div key={c.instanceId} className="certrow">
                <Badge row={c} />
                <div className="grow"><b>{c.certName}</b><div className="tiny muted">expires {fmtDate(c.expiryDateIso)}</div></div>
                <StatusPill row={c} />
              </div>
            ))}
        {STYLES}
      </div>
    )
  }

  // ----- EDIT (Basics step) -----
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div className="section-title"><span className="ic"><BadgeCheck size={16} strokeWidth={2} /></span> Certificates</div>
        <button className="rb-btn-add" disabled={!draftId} onClick={() => setOpen(true)}>+ Add certificates</button>
      </div>

      {!draftId && <p className="tiny muted" style={{ marginTop: 10 }}>Save the draft first (name + category) to add certificates.</p>}

      {draftId && (
        data.attached.length === 0
          ? <p className="tiny muted" style={{ marginTop: 10 }}>None added yet — click “Add certificates”.</p>
          : data.attached.map((c) => (
              <div key={c.instanceId} className="certrow">
                <Badge row={c} />
                <div className="grow"><b>{c.certName}</b>{c.certificateNumber && <span className="muted tiny"> · {c.certificateNumber}</span>}<div className="tiny muted">expires {fmtDate(c.expiryDateIso)}</div></div>
                <StatusPill row={c} />
                <button className="del" disabled={busy === c.instanceId} onClick={() => detach(c.instanceId)}>remove</button>
              </div>
            ))
      )}

      {/* POPUP — add multiple, then close */}
      {open && draftId && (
        <div className="cert-modal" onClick={() => setOpen(false)}>
          <div className="cert-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="section-title"><span className="ic"><BadgeCheck size={16} strokeWidth={2} /></span> Add certificates</div>
              <button className="del" style={{ fontSize: 18, color: 'var(--ink-500)' }} onClick={() => setOpen(false)}>✕</button>
            </div>
            <p className="tiny muted" style={{ marginTop: 4 }}>Pick the certificates that apply to this product — add as many as you need, then close.</p>

            {attachable.length === 0 && data.attached.length === 0 && (
              <p className="tiny muted" style={{ marginTop: 12 }}>No verified certificates in your catalog yet. Upload one below for review.</p>
            )}

            <div className="cert-grid">
              {/* Already on the product */}
              {data.attached.map((c) => (
                <div key={c.instanceId} className="cert-cardlet">
                  <Badge row={c} big />
                  <div className="grow"><b style={{ fontSize: 13 }}>{c.certName}</b><div className="tiny muted">on product</div></div>
                  <button className="del" disabled={busy === c.instanceId} onClick={() => detach(c.instanceId)}>remove</button>
                </div>
              ))}
              {/* Attachable (verified) */}
              {attachable.map((c) => (
                <div key={c.instanceId} className="cert-cardlet">
                  <Badge row={c} big />
                  <div className="grow"><b style={{ fontSize: 13 }}>{c.certName}</b><div className="tiny muted">verified · exp {fmtDate(c.expiryDateIso)}</div></div>
                  <button className="rb-btn-add" disabled={busy === c.instanceId} onClick={() => attach(c.instanceId)}>+ Add</button>
                </div>
              ))}
              {/* Pending review */}
              {pending.map((c) => (
                <div key={c.instanceId} className="cert-cardlet" style={{ opacity: 0.7 }}>
                  <Badge row={c} big />
                  <div className="grow"><b style={{ fontSize: 13 }}>{c.certName}</b><div className="tiny muted">in review · attachable once approved</div></div>
                  <span className="pill">pending</span>
                </div>
              ))}
            </div>

            {/* Upload / request a new certificate — inline, no navigation */}
            {!showUpload ? (
              <button className="upload-cta" style={{ width: '100%', cursor: 'pointer' }} onClick={() => setShowUpload(true)}>
                ⬆ Upload a new certificate for review &amp; approval
              </button>
            ) : (
              <form onSubmit={submitUpload} className="cert-upload">
                <div className="eyebrow">New certificate · for review &amp; approval</div>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Certificate type</label>
                    <select className="sel" name="certificateTypeId" required defaultValue="">
                      <option value="" disabled>Select…</option>
                      {certTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Certificate number <span className="muted">· optional</span></label>
                    <input className="input" name="certificateNumber" placeholder="e.g. ORG-2024-118" />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Expiry date</label>
                    <input className="input" type="date" name="expiryDate" required />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Document <span className="muted">· PDF / image</span></label>
                    <input className="input" type="file" name="file" accept="application/pdf,image/png,image/jpeg,image/webp" required style={{ padding: 7 }} />
                  </div>
                </div>
                <label className="tiny muted" style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="checkbox" name="consent" value="true" required style={{ marginTop: 2 }} />
                  <span>{CERT_UPLOAD_CONSENT_TEXT}</span>
                </label>
                <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <button type="button" className="btn sm" onClick={() => setShowUpload(false)}>Cancel</button>
                  <button type="submit" className="btn primary sm" disabled={uploading}>{uploading ? 'Submitting…' : 'Submit for approval'}</button>
                </div>
              </form>
            )}

            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn primary sm" onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {STYLES}
    </div>
  )
}
