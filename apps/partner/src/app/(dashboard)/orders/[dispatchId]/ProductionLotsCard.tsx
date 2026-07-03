'use client'

// Production-lot capture card (P2 §3.2.B) — output lot ↔ ingredient lots +
// yield, on PRODUCT/COPACKING dispatches from PRODUCING onward. Records are
// immutable; the COA upload (ship-docs card) references these lot numbers.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FlaskConical, Plus, Trash2 } from 'lucide-react'
import { recordProductionLot, type IngredientLotLine } from './lot-actions'

export interface ProductionLotView {
  id: string
  lotNumber: string
  expiryAt: string | null
  unitsProduced: number
  unitsExpected: number | null
  scrapReason: string | null
  ingredientLots: IngredientLotLine[]
}

export function ProductionLotsCard({
  dispatchId,
  lots,
  canRecord,
}: {
  dispatchId: string
  lots: ProductionLotView[]
  canRecord: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [lotNumber, setLotNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [produced, setProduced] = useState('')
  const [expected, setExpected] = useState('')
  const [scrap, setScrap] = useState('')
  const [ingredients, setIngredients] = useState<IngredientLotLine[]>([])

  async function submit() {
    setBusy(true)
    try {
      const r = await recordProductionLot({
        dispatchId,
        lotNumber,
        expiryAt: expiry || undefined,
        unitsProduced: Number.parseInt(produced, 10),
        unitsExpected: expected ? Number.parseInt(expected, 10) : undefined,
        scrapReason: scrap || undefined,
        ingredientLots: ingredients,
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(`Lot ${lotNumber.trim()} recorded`)
      setOpen(false)
      setLotNumber(''); setExpiry(''); setProduced(''); setExpected(''); setScrap(''); setIngredients([])
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200'

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
          <FlaskConical className="h-4 w-4 text-ink-500" aria-hidden="true" /> Production lots
        </h2>
        {canRecord && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Record lot
          </button>
        )}
      </div>
      <p className="mt-1 text-[12px] text-ink-600">
        Output lot ↔ ingredient lots + yield. This is the recall trace — one click from any lot
        to everything it touched. Attach the COA under shipping documents using the same lot number.
      </p>

      {lots.length > 0 && (
        <ul className="mt-4 divide-y divide-ink-50 rounded-xl border border-ink-100">
          {lots.map((l) => (
            <li key={l.id} className="px-4 py-2.5 text-[13px]">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[12px] font-medium text-ink-900">{l.lotNumber}</span>
                <span className="tabular-nums text-ink-700">{l.unitsProduced.toLocaleString()} units</span>
                {l.unitsExpected != null && (
                  <span className="text-[12px] text-ink-500">
                    yield {Math.round((l.unitsProduced / l.unitsExpected) * 100)}% of {l.unitsExpected.toLocaleString()}
                  </span>
                )}
                {l.expiryAt && (
                  <span className="ml-auto text-[12px] tabular-nums text-ink-500">
                    exp {new Date(l.expiryAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              {l.ingredientLots.length > 0 && (
                <p className="mt-1 text-[11.5px] text-ink-500">
                  Inputs: {l.ingredientLots.map((i) => `${i.ingredientName} (${i.supplierLot})`).join(' · ')}
                </p>
              )}
              {l.scrapReason && (
                <p className="mt-0.5 text-[11.5px] text-warning-700">Scrap: {l.scrapReason}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-4 space-y-3 rounded-xl border border-ink-100 bg-ink-50/60 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="col-span-2 text-[12px] font-medium text-ink-700 sm:col-span-1">
              Lot number *
              <input type="text" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} className={`${inputCls} font-mono`} />
            </label>
            <label className="text-[12px] font-medium text-ink-700">
              Expiry
              <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputCls} />
            </label>
            <label className="text-[12px] font-medium text-ink-700">
              Units produced *
              <input type="number" min={1} value={produced} onChange={(e) => setProduced(e.target.value)} className={inputCls} />
            </label>
            <label className="text-[12px] font-medium text-ink-700">
              Units expected
              <input type="number" min={1} value={expected} onChange={(e) => setExpected(e.target.value)} className={inputCls} />
            </label>
          </div>
          <label className="block text-[12px] font-medium text-ink-700">
            Scrap / waste reason (if yield below expected)
            <input type="text" value={scrap} onChange={(e) => setScrap(e.target.value)} className={inputCls} />
          </label>

          <div>
            <p className="text-[12px] font-medium text-ink-700">Ingredient lots</p>
            {ingredients.map((line, i) => (
              <div key={i} className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={line.ingredientName}
                  onChange={(e) =>
                    setIngredients((prev) => prev.map((l, j) => (j === i ? { ...l, ingredientName: e.target.value } : l)))
                  }
                  placeholder="Ingredient"
                  className="h-9 flex-1 rounded-lg border border-ink-200 bg-white px-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
                />
                <input
                  type="text"
                  value={line.supplierLot}
                  onChange={(e) =>
                    setIngredients((prev) => prev.map((l, j) => (j === i ? { ...l, supplierLot: e.target.value } : l)))
                  }
                  placeholder="Supplier lot #"
                  className="h-9 w-40 rounded-lg border border-ink-200 bg-white px-3 font-mono text-[12px] text-ink-900 placeholder:font-sans placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
                />
                <button
                  type="button"
                  onClick={() => setIngredients((prev) => prev.filter((_, j) => j !== i))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-500 hover:border-danger-300 hover:text-danger-600"
                  aria-label="Remove ingredient lot"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setIngredients((prev) => [...prev, { ingredientName: '', supplierLot: '' }])}
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-ink-600 hover:text-ink-900"
            >
              <Plus className="h-3 w-3" aria-hidden="true" /> Add ingredient lot
            </button>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="rounded-full border border-ink-200 bg-white px-4 py-1.5 text-[12.5px] font-medium text-ink-600 hover:border-ink-400"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || lotNumber.trim() === '' || produced.trim() === ''}
              onClick={submit}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-5 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              {busy ? 'Saving…' : 'Record lot'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
