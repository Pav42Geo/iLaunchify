'use client'

// Made-to-order fulfillment card (ON_DEMAND_FULL_SERVICE_GATE §4b.2, 2026-07-22).
//
// Shown in Step 5 (Cost & pricing) ONLY when the template carries ON_DEMAND
// price bands: it declares WHICH of the manufacturer's own decoration offerings
// finishes a qty-1 made-to-order unit. Bulk MOQ'd methods (direct print 5k)
// cannot; this is the partner-authored answer the PDP's on-demand display and
// the C2.2 dispatch read. One candidate = applies implicitly (info only, no
// write). Multiple = pick one (radio, autosaved). Zero = the guidance line.

import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import { loadOnDemandFulfillment, saveOnDemandDecoration, type OnDemandFulfillmentData } from './build-actions'

const METHOD_LABELS: Record<string, string> = {
  DIRECT_PRINT: 'Direct print',
  PRESSURE_SENSITIVE_LABEL: 'Pressure-sensitive label',
  SHRINK_SLEEVE: 'Shrink sleeve',
  IN_MOLD_LABEL: 'In-mold label',
  SCREEN_PRINT: 'Screen print',
  HOT_STAMP: 'Hot stamp',
  EMBOSS: 'Emboss',
  DEBOSS: 'Deboss',
  SPOT_UV: 'Spot UV',
  NONE: 'No decoration',
}
const methodLabel = (m: string) => METHOD_LABELS[m] ?? m.replace(/_/g, ' ').toLowerCase()

export function OnDemandFulfillmentCard({ draftId }: { draftId: string | null }) {
  const [data, setData] = useState<OnDemandFulfillmentData | null>(null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!draftId) return
    void loadOnDemandFulfillment(draftId).then((res) => {
      if (res.ok && res.data) setData(res.data)
    })
  }, [draftId])

  // Hidden until relevant: no draft, still loading, or no on-demand bands authored.
  if (!draftId || !data || !data.hasOnDemandBands) return null

  const pick = async (offeringId: string) => {
    setSaving(true)
    setNote(null)
    const res = await saveOnDemandDecoration(draftId, offeringId)
    setSaving(false)
    if (res.ok) setData({ ...data, pinnedOfferingId: offeringId })
    else setNote(res.error ?? 'Could not save.')
  }

  return (
    <div className="card">
      <div className="section-title">
        <span className="ic"><Zap size={16} strokeWidth={2} /></span> Made-to-order fulfillment
      </div>
      <p className="tiny muted" style={{ marginTop: 8 }}>
        On-demand orders are produced and finished <strong>in-house, one sale at a time</strong> — bulk-MOQ
        decoration runs don&apos;t apply. Declare which of your finishes decorates a made-to-order unit.
      </p>

      {data.candidates.length === 0 && (
        <p className="tiny" style={{ marginTop: 10, color: 'var(--warning-700, #854F0B)' }}>
          No decoration offerings found on this product&apos;s containers yet. Add your container ×
          decoration offerings first — on-demand listings can&apos;t go live without a finish.
        </p>
      )}

      {data.candidates.length === 1 && (
        <p className="tiny" style={{ marginTop: 10 }}>
          Sole finish applies automatically:{' '}
          <strong>{methodLabel(data.candidates[0]!.decorationMethod)}</strong> on {data.candidates[0]!.containerName}.
        </p>
      )}

      {data.candidates.length > 1 && (
        <div role="radiogroup" aria-label="Made-to-order finish" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.candidates.map((c) => {
            const active = data.pinnedOfferingId === c.offeringId
            return (
              <label
                key={c.offeringId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 9,
                  border: active ? '2px solid var(--success-500, #1E7C4A)' : '1px solid var(--ink-200, #e5e5e5)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="ondemand-finish"
                  checked={active}
                  disabled={saving}
                  onChange={() => void pick(c.offeringId)}
                />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{methodLabel(c.decorationMethod)}</span>
                <span className="tiny muted">{c.containerName} · bulk MOQ {c.moq.toLocaleString()}</span>
              </label>
            )
          })}
          {!data.pinnedOfferingId && (
            <p className="tiny" style={{ color: 'var(--warning-700, #854F0B)' }}>
              Pick one — with several finishes available, on-demand needs to know which one runs per order.
            </p>
          )}
        </div>
      )}

      {note && <p className="tiny" style={{ marginTop: 8, color: '#e24b4a' }}>{note}</p>}
    </div>
  )
}
