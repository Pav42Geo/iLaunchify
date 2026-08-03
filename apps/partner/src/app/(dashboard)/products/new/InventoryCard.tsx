'use client'

// I2 (docs/MANUFACTURER_INVENTORY_2026-07-27.md): "Available stock" card in the
// Add Product flow, beside ProductBatchCard on the Cost & pricing step.
//
// Unlimited (the default) = exactly today's behavior: nothing tracked, nothing
// ever hides. Limited = per-flavor quantities; a flavor can individually stay
// Unlimited (Pavel 2026-07-27: cap only the scarce flavor). When every needed
// flavor runs out, the product is HIDDEN from the marketplace until restocked.
// Same autosave + registerFlush contract as ProductBatchCard; `.gb` scope.

import { useEffect, useRef, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import {
  loadTemplateInventory,
  saveTemplateInventory,
  type InventoryFlavorRow,
} from './inventory-actions'

const toQty = (s: string): number | null => {
  const n = Math.round(parseFloat((s || '').replace(/[^0-9.]/g, '')))
  return Number.isFinite(n) && n >= 0 ? n : null
}

interface FlavorDraft {
  flavorKey: string
  name: string
  unlimited: boolean
  quantity: string
  alertState: string
}

export function InventoryCard({ draftId, registerFlush }: { draftId: string | null; registerFlush?: (fn: () => Promise<void> | void) => () => void }) {
  const [limited, setLimited] = useState(false)
  const [threshold, setThreshold] = useState('')
  const [flavors, setFlavors] = useState<FlavorDraft[]>([])
  const [ready, setReady] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!draftId) return
    void loadTemplateInventory(draftId)
      .then((s) => {
        setReady(s.ready)
        setLimited(s.limited)
        setThreshold(s.lowStockThreshold != null ? String(s.lowStockThreshold) : '')
        setFlavors(
          s.rows.map((r: InventoryFlavorRow) => ({
            flavorKey: r.flavorKey,
            name: r.name,
            unlimited: !r.tracked,
            quantity: r.tracked ? String(r.quantityAvailable) : '',
            alertState: r.alertState,
          })),
        )
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [draftId])

  const payload = () => ({
    limited,
    lowStockThreshold: toQty(threshold),
    flavors: flavors.map((f) => ({ flavorKey: f.flavorKey, unlimited: f.unlimited, quantity: toQty(f.quantity) })),
  })

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serialized = JSON.stringify({ limited, threshold, flavors: flavors.map((f) => [f.flavorKey, f.unlimited, f.quantity]) })
  useEffect(() => {
    if (!draftId || !loaded || !ready) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void saveTemplateInventory(draftId, payload()) }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, draftId, loaded, ready])

  const flushRef = useRef<() => Promise<void>>(async () => {})
  flushRef.current = async () => {
    if (timer.current) clearTimeout(timer.current)
    if (draftId && loaded && ready) await saveTemplateInventory(draftId, payload())
  }
  useEffect(() => {
    if (!registerFlush) return
    return registerFlush(() => flushRef.current())
  }, [registerFlush])

  const setFlavor = (key: string, patch: Partial<FlavorDraft>) =>
    setFlavors((fs) => fs.map((f) => (f.flavorKey === key ? { ...f, ...patch } : f)))

  const pill = (state: string) =>
    state === 'STOCKOUT' ? <span className="inv-pill out">Out</span> : state === 'LOW' ? <span className="inv-pill low">Low</span> : null

  return (
    <div className="card">
      <div className="section-title"><span className="ic"><PackageCheck size={16} strokeWidth={2} /></span> Available stock</div>
      <p className="tiny muted" style={{ marginTop: 8 }}>
        Cap how many units of this product can be sold. <strong>Unlimited</strong> is the default: creators can order any
        quantity. With <strong>Limited stock</strong>, orders can never exceed what is left, and the product is
        hidden from the marketplace when it runs out (until you restock from your products list).
      </p>

      {!ready && loaded && (
        <p className="tiny muted" style={{ marginTop: 10 }}>
          Stock tracking is being enabled for this workspace: finish the pending database update, then reopen this step.
        </p>
      )}

      {ready && (
        <>
          <div className="inv-mode" style={{ marginTop: 12 }}>
            <label className={`inv-opt ${!limited ? 'on' : ''}`}>
              <input type="radio" name="inv-mode" checked={!limited} onChange={() => setLimited(false)} />
              <span><strong>Unlimited</strong> <span className="tiny muted">no cap, never hides</span></span>
            </label>
            <label className={`inv-opt ${limited ? 'on' : ''}`}>
              <input type="radio" name="inv-mode" checked={limited} onChange={() => setLimited(true)} />
              <span><strong>Limited stock</strong> <span className="tiny muted">per-flavor caps</span></span>
            </label>
          </div>

          {limited && (
            <>
              <div className="inv-rows" style={{ marginTop: 12 }}>
                {flavors.map((f) => (
                  <div className="inv-row" key={f.flavorKey}>
                    <span className="inv-name">{f.name} {pill(f.alertState)}</span>
                    <label className="inv-unl tiny">
                      <input
                        type="checkbox"
                        checked={f.unlimited}
                        onChange={(e) => setFlavor(f.flavorKey, { unlimited: e.target.checked })}
                      />
                      Unlimited
                    </label>
                    <input
                      className="input inv-qty"
                      inputMode="numeric"
                      placeholder="units"
                      value={f.unlimited ? '' : f.quantity}
                      disabled={f.unlimited}
                      onChange={(e) => setFlavor(f.flavorKey, { quantity: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <label className="pb-f" style={{ marginTop: 12, maxWidth: 260 }}>
                <span className="pb-l">Low-stock alert <span className="tiny muted" style={{ fontWeight: 400 }}>units, optional</span></span>
                <input className="input" inputMode="numeric" value={threshold} placeholder="e.g. 500" onChange={(e) => setThreshold(e.target.value)} />
              </label>
            </>
          )}
        </>
      )}

      <style>{`
        .gb .inv-mode{display:flex;gap:10px;flex-wrap:wrap}
        .gb .inv-opt{display:flex;align-items:center;gap:8px;border:1px solid var(--ink-200,#e5e5e5);border-radius:10px;padding:9px 13px;cursor:pointer;font-size:13px}
        .gb .inv-opt.on{border-color:var(--pink-200,#ffd0dd);background:rgba(255,46,99,.05)}
        .gb .inv-rows{display:flex;flex-direction:column;gap:8px}
        .gb .inv-row{display:grid;grid-template-columns:1fr auto 130px;gap:10px;align-items:center}
        @media (max-width:640px){.gb .inv-row{grid-template-columns:1fr}}
        .gb .inv-name{font-size:13px;color:var(--ink-800,#333);display:flex;align-items:center;gap:6px}
        .gb .inv-unl{display:flex;align-items:center;gap:5px;color:var(--ink-600,#555)}
        .gb .inv-qty{text-align:right}
        .gb .inv-pill{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border-radius:999px;padding:2px 8px}
        .gb .inv-pill.low{background:var(--warning-50,#fff7e6);color:var(--warning-800,#8a5b00);border:1px solid var(--warning-200,#ffe0a3)}
        .gb .inv-pill.out{background:var(--danger-50,#ffecec);color:var(--danger-800,#8f1d1d);border:1px solid var(--danger-200,#ffc2c2)}
      `}</style>
    </div>
  )
}
