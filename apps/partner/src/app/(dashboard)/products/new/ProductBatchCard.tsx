'use client'

// MB-5 (product side) — "Batch & minimum order". The manufacturer picks which LINE
// runs this product and (optionally) overrides the batch size for it. The card then
// shows the DERIVED minimum order: one batch of that line, because you cannot run half
// a batch. This is the missing half of the MOQ split — the LINE default lives in the
// manufacturing service builder; the PRODUCT override lives here — so routing's derived
// MOQ actually varies per product. Self-loads via loadProductBatchOptions (no edit to
// the shared draft loader). `.gb` scope, autosave + registerFlush like PricingTiersCard.

import { useEffect, useRef, useState } from 'react'
import { Boxes } from 'lucide-react'
import { loadProductBatchOptions, saveProductBatch, type BatchLine } from './product-batch-actions'

const toInt = (s: string) => {
  const n = Math.round(parseFloat((s || '').replace(/[^0-9.]/g, '')))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function ProductBatchCard({ draftId, registerFlush }: { draftId: string | null; registerFlush?: (fn: () => Promise<void> | void) => () => void }) {
  const [lines, setLines] = useState<BatchLine[]>([])
  const [declaredMoqMin, setDeclaredMoqMin] = useState<number | null>(null)
  const [lineId, setLineId] = useState<string>('')
  const [unitsPerBatch, setUnitsPerBatch] = useState<string>('')
  const [batchTimeMinutes, setBatchTimeMinutes] = useState<string>('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!draftId) return
    void loadProductBatchOptions(draftId)
      .then((o) => {
        setLines(o.lines)
        setDeclaredMoqMin(o.declaredMoqMin)
        setLineId(o.manufacturingLineId ?? '')
        setUnitsPerBatch(o.unitsPerBatch != null ? String(o.unitsPerBatch) : '')
        setBatchTimeMinutes(o.batchTimeMinutes != null ? String(o.batchTimeMinutes) : '')
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [draftId])

  const payload = () => ({ manufacturingLineId: lineId || null, unitsPerBatch: toInt(unitsPerBatch), batchTimeMinutes: toInt(batchTimeMinutes) })

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId || !loaded) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void saveProductBatch(draftId, payload()) }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineId, unitsPerBatch, batchTimeMinutes, draftId, loaded])

  const flushRef = useRef<() => Promise<void>>(async () => {})
  flushRef.current = async () => {
    if (timer.current) clearTimeout(timer.current)
    if (draftId && loaded) await saveProductBatch(draftId, payload())
  }
  useEffect(() => {
    if (!registerFlush) return
    return registerFlush(() => flushRef.current())
  }, [registerFlush])

  const selectedLine = lines.find((l) => l.id === lineId) ?? null
  // Derived MOQ = one batch of this product: override → line default → declared floor.
  const override = toInt(unitsPerBatch)
  const derived: { units: number; basis: string } | null =
    override != null
      ? { units: override, basis: 'this product’s batch' }
      : selectedLine?.unitsPerBatch != null
        ? { units: selectedLine.unitsPerBatch, basis: `the ${selectedLine.name} default batch` }
        : declaredMoqMin != null
          ? { units: declaredMoqMin, basis: 'the manufacturer’s declared floor' }
          : null

  return (
    <div className="card">
      <div className="section-title"><span className="ic"><Boxes size={16} strokeWidth={2} /></span> Batch &amp; minimum order</div>
      <p className="tiny muted" style={{ marginTop: 8 }}>
        The minimum order for a product is <strong>one batch</strong> of the line that makes it — you cannot run half a batch.
        Pick the line, and override the batch size only if this product runs differently from the line default.
      </p>

      {lines.length === 0 && loaded && (
        <p className="tiny muted" style={{ marginTop: 10 }}>
          No manufacturing lines yet. Add lines in your manufacturing service builder first, then assign one here.
        </p>
      )}

      <div className="pb-grid" style={{ marginTop: 12 }}>
        <label className="pb-f">
          <span className="pb-l">Manufacturing line</span>
          <select className="input" value={lineId} onChange={(e) => setLineId(e.target.value)}>
            <option value="">Not assigned</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.unitsPerBatch != null ? ` (${l.unitsPerBatch.toLocaleString()}/batch)` : ''}</option>
            ))}
          </select>
        </label>
        <label className="pb-f">
          <span className="pb-l">Batch size override <span className="tiny muted" style={{ fontWeight: 400 }}>units, optional</span></span>
          <input className="input" value={unitsPerBatch} placeholder={selectedLine?.unitsPerBatch != null ? String(selectedLine.unitsPerBatch) : 'line default'} onChange={(e) => setUnitsPerBatch(e.target.value)} />
        </label>
        <label className="pb-f">
          <span className="pb-l">Run time / batch <span className="tiny muted" style={{ fontWeight: 400 }}>minutes, optional</span></span>
          <input className="input" value={batchTimeMinutes} placeholder="line default" onChange={(e) => setBatchTimeMinutes(e.target.value)} />
        </label>
      </div>

      <div className={`pb-moq ${derived ? 'on' : ''}`} style={{ marginTop: 12 }}>
        {derived ? (
          <>Minimum order for this product: <strong>{derived.units.toLocaleString()} units</strong> <span className="tiny muted">(one batch, from {derived.basis})</span></>
        ) : (
          <span className="tiny muted">Assign a line with a batch size, or set an override, to derive this product’s minimum order.</span>
        )}
      </div>

      <style>{`
        .gb .pb-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:12px}
        @media (max-width:640px){.gb .pb-grid{grid-template-columns:1fr}}
        .gb .pb-f{display:flex;flex-direction:column;gap:5px}
        .gb .pb-l{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-600,#555)}
        .gb .pb-moq{border:1px solid var(--ink-200,#e5e5e5);background:var(--ink-50,#fafafa);border-radius:10px;padding:11px 13px;font-size:13px;color:var(--ink-700,#444)}
        .gb .pb-moq.on{border-color:var(--pink-200,#ffd0dd);background:rgba(255,46,99,.05)}
      `}</style>
    </div>
  )
}
