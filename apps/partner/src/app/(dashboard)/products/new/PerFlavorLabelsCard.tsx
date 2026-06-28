'use client'

// Per-flavor labels Phase 3 — step-4 (Packaging Studio) section to assign a
// die-line per flavor. Rendered by GuidedBuilder when the packing type is
// individually-labeled (structuralType ∈ PER_FLAVOR_IN_OUTER / CUSTOMIZABLE_PICK_N).
// Loads the persisted FlavorPresets directly (the in-builder flavor objects carry
// no preset ids) + the die-lines available for the product's packaging.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  loadPerFlavorDielines,
  setFlavorDieline,
  type FlavorDielineRow,
  type DielineOption,
} from './perflavor-dieline-actions'
import { Tags } from 'lucide-react'

export function PerFlavorLabelsCard({ draftId }: { draftId: string | null }) {
  const [flavors, setFlavors] = useState<FlavorDielineRow[]>([])
  const [dielines, setDielines] = useState<DielineOption[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    if (!draftId) { setLoading(false); return }
    loadPerFlavorDielines(draftId).then((res) => {
      if (!live) return
      if (res.ok) { setFlavors(res.flavors); setDielines(res.dielines) }
      setLoading(false)
    })
    return () => { live = false }
  }, [draftId])

  async function change(flavorPresetId: string, value: string) {
    const dielineId = value || null
    setFlavors((fs) => fs.map((f) => (f.id === flavorPresetId ? { ...f, dielineId } : f)))
    if (!draftId) return
    setSavingId(flavorPresetId)
    const res = await setFlavorDieline(draftId, flavorPresetId, dielineId)
    setSavingId(null)
    if (!res.ok) toast.error(res.error)
  }

  // Nothing to show until flavors are authored (steps 2/3 persist them).
  if (loading || flavors.length === 0) return null

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-title">
        <span className="ic"><Tags size={16} strokeWidth={2} /></span> Per-flavor labels
      </div>

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {flavors.map((f) => (
          <div
            key={f.id}
            className="row"
            style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: f.swatchHex ?? '#d4d4d8',
                  border: '1px solid rgba(0,0,0,.12)',
                  flex: '0 0 auto',
                }}
              />
              <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</b>
            </span>
            <select
              value={f.dielineId ?? ''}
              onChange={(e) => change(f.id, e.target.value)}
              disabled={savingId === f.id}
              style={{ minWidth: 220, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--ink-200)' }}
            >
              <option value="">Shared template die-line</option>
              {dielines.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {dielines.length === 0 && (
        <p className="tiny muted" style={{ marginTop: 10 }}>
          No alternate die-lines yet — all flavors share the template die-line. Add die-lines in the Packaging Studio for per-flavor overrides.
        </p>
      )}
    </div>
  )
}
