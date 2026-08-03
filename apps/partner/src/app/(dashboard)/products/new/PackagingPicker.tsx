'use client'

// Packaging step: attach the partner's packaging systems to the product (real
// persistence). Reuses the editor's addPackagingLink / removePackagingLink +
// loadPackaging. Sits above the die-line studio mockup. `.gb` scope.

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { loadPackaging } from './build-actions'
import {
  addPackagingLink,
  removePackagingLink,
  loadPackagingCoPackers,
  setPackagingCoPacker,
  type EligibleCoPacker,
} from '../[id]/edit/card-actions'
import { listMyPackagingSystems } from './step4-actions'
import { Package } from 'lucide-react'

interface PackagingOption { id: string; partnerName: string; topology: string; unitCount: number; moq: number; grossWeightG?: number | null; casesPerLayer?: number | null; layersPerPallet?: number | null }

export function PackagingPicker({ draftId, systems, onBrowse, reloadToken = 0 }: {
  draftId: string | null
  systems: PackagingOption[]
  /** Opens the in-flow packaging browser (the Packaging Studio modal's Library
   *  tab) instead of navigating away to /packaging (Pavel 2026-07-29: leaving
   *  the builder mid-flow loses the draft context). When absent, falls back to
   *  the /packaging links. */
  onBrowse?: () => void
  /** Bump to re-fetch attached links (e.g. after the studio modal closes). */
  reloadToken?: number
}) {
  const [attached, setAttached] = useState<string[]>([])
  // Live list: seeded from the server prop, then re-fetched so systems created
  // inside the studio modal (status DRAFT) appear without a page reload.
  const [sysList, setSysList] = useState<PackagingOption[]>(systems)
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()
  // CP-5: eligible co-packers (the manufacturer's own live co-packing service)
  // + the current per-size assignment. Empty eligible ⇒ no picker (self-assemble).
  const [coPackers, setCoPackers] = useState<EligibleCoPacker[]>([])
  const [assignments, setAssignments] = useState<Record<string, string | null>>({})

  const refresh = useCallback(() => {
    if (!draftId) return
    void loadPackaging(draftId).then(setAttached)
    void listMyPackagingSystems().then((r) => { if (r.ok) setSysList(r.data) })
    void loadPackagingCoPackers(draftId).then((r) => {
      if (r.ok) {
        setCoPackers(r.data.eligible)
        setAssignments(r.data.assignments)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, reloadToken])
  useEffect(() => { refresh() }, [refresh])

  function assign(packagingSystemId: string, coPackerServiceId: string | null) {
    if (!draftId) return
    setAssignments((a) => ({ ...a, [packagingSystemId]: coPackerServiceId })) // optimistic
    start(async () => {
      const r = await setPackagingCoPacker({ productTemplateId: draftId, packagingSystemId, coPackerServiceId })
      if (!r.ok) { toast.error(r.error ?? 'Could not update'); refresh(); return }
      toast.success('Co-packer updated')
    })
  }

  function toggle(id: string, on: boolean) {
    if (!draftId) return
    setBusy(id)
    start(async () => {
      const r = on
        ? await addPackagingLink({ productTemplateId: draftId, packagingSystemId: id, basePriceCents: 0, leadTimeDays: 21 })
        : await removePackagingLink({ productTemplateId: draftId, packagingSystemId: id })
      setBusy(null)
      if (!r.ok) { toast.error(r.error ?? 'Could not update'); return }
      toast.success(on ? 'Packaging attached' : 'Packaging removed'); refresh()
    })
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-title"><span className="ic"><Package size={16} strokeWidth={2} /></span> Packaging systems</div>
      <p className="tiny muted" style={{ marginTop: 4 }}>
        Attach the packaging this product ships in.{' '}
        {onBrowse ? (
          <button type="button" className="pk-link" onClick={onBrowse}>Browse the catalog or add a custom one</button>
        ) : (
          <>Manage your systems on the <a href="/packaging" style={{ color: 'var(--pink-700)' }}>Packaging</a> page.</>
        )}
        {onBrowse && ' right here, without leaving the flow.'}
      </p>

      {!draftId && <p className="tiny muted" style={{ marginTop: 10 }}>Save the draft first to attach packaging.</p>}
      {draftId && sysList.length === 0 && (
        <div className="note grey" style={{ marginTop: 10 }}>
          {onBrowse ? (
            <>No packaging attached yet: <button type="button" className="pk-link" onClick={onBrowse}>browse the catalog</button> to pick a container (a custom upload lives there too).</>
          ) : (
            <>No packaging systems yet: add one on the <a href="/packaging" style={{ color: 'var(--pink-700)' }}>Packaging</a> page, then attach it here.</>
          )}
        </div>
      )}

      {draftId && sysList.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          {sysList.map((s) => {
            const on = attached.includes(s.id)
            return (
              <div key={s.id} className="pkgrow" data-on={on ? 'on' : undefined}>
                <div className="grow">
                  <b style={{ fontSize: 13 }}>{s.partnerName}</b>
                  <div className="tiny muted">{s.topology} · {s.unitCount} unit{s.unitCount === 1 ? '' : 's'} · MOQ {s.moq.toLocaleString()}</div>
                  {(s.grossWeightG != null || (s.casesPerLayer != null && s.layersPerPallet != null)) && (
                    <div className="tiny muted">
                      {s.grossWeightG != null && <>gross {s.grossWeightG} g</>}
                      {s.grossWeightG != null && s.casesPerLayer != null && s.layersPerPallet != null && ' · '}
                      {s.casesPerLayer != null && s.layersPerPallet != null && <>pallet {s.casesPerLayer}×{s.layersPerPallet} = {(s.casesPerLayer * s.layersPerPallet).toLocaleString()} cases</>}
                    </div>
                  )}
                  {on && coPackers.length > 0 && (
                    <div className="tiny muted cpsel">
                      <span>Fills&nbsp;/&nbsp;assembles:</span>
                      <select value={assignments[s.id] ?? ''} onChange={(e) => assign(s.id, e.target.value || null)}>
                        <option value="">Manufacturer self-assembles</option>
                        {coPackers.map((cp) => (
                          <option key={cp.serviceId} value={cp.serviceId}>{cp.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <button className={on ? 'btn sm' : 'rb-btn-add'} disabled={busy === s.id} onClick={() => toggle(s.id, !on)}>
                  {busy === s.id ? '…' : on ? 'Attached ✓' : '+ Attach'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        .gb .pk-link{border:0;background:none;padding:0;font:inherit;color:var(--pink-700);font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
        .gb .pk-link:hover{color:var(--pink,#FF2E63)}
        .gb .pkgrow{display:flex;align-items:center;gap:10px;border:1px solid var(--ink-200);border-radius:12px;padding:10px 12px}
        .gb .pkgrow[data-on=on]{border-color:var(--pink);background:var(--pink-50)}
        .gb .pkgrow .grow{flex:1;min-width:0}
        .gb .pkgrow .cpsel{display:flex;align-items:center;gap:6px;margin-top:6px}
        .gb .pkgrow .cpsel select{border:1px solid var(--ink-300);border-radius:8px;padding:3px 7px;font-size:12px;background:#fff;color:var(--ink-900);max-width:220px}
        .gb .pkgrow .cpsel select:focus{outline:none;border-color:var(--pink-500)}
      `}</style>
    </div>
  )
}
