'use client'

// Packaging step — attach the partner's packaging systems to the product (real
// persistence). Reuses the editor's addPackagingLink / removePackagingLink +
// loadPackaging. Sits above the die-line studio mockup. `.gb` scope.

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { loadPackaging } from './build-actions'
import { addPackagingLink, removePackagingLink } from '../[id]/edit/card-actions'
import { Package } from 'lucide-react'

interface PackagingOption { id: string; partnerName: string; topology: string; unitCount: number; moq: number; grossWeightG?: number | null; casesPerLayer?: number | null; layersPerPallet?: number | null }

export function PackagingPicker({ draftId, systems }: { draftId: string | null; systems: PackagingOption[] }) {
  const [attached, setAttached] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()

  const refresh = useCallback(() => { if (draftId) void loadPackaging(draftId).then(setAttached) }, [draftId])
  useEffect(() => { refresh() }, [refresh])

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
      <div className="section-title"><span className="ic"><Package size={16} strokeWidth={2} /></span> Packaging systems <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· attach yours</span></div>
      <p className="tiny muted" style={{ marginTop: 4 }}>Attach the packaging this product ships in. Manage your systems on the <a href="/packaging" style={{ color: 'var(--pink-700)' }}>Packaging</a> page.</p>

      {!draftId && <p className="tiny muted" style={{ marginTop: 10 }}>Save the draft first to attach packaging.</p>}
      {draftId && systems.length === 0 && (
        <div className="note grey" style={{ marginTop: 10 }}>No packaging systems yet — add one on the <a href="/packaging" style={{ color: 'var(--pink-700)' }}>Packaging</a> page, then attach it here.</div>
      )}

      {draftId && systems.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          {systems.map((s) => {
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
        .gb .pkgrow{display:flex;align-items:center;gap:10px;border:1px solid var(--ink-200);border-radius:12px;padding:10px 12px}
        .gb .pkgrow[data-on=on]{border-color:var(--pink);background:var(--pink-50)}
        .gb .pkgrow .grow{flex:1;min-width:0}
      `}</style>
    </div>
  )
}
