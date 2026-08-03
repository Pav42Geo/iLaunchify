'use client'

// I2b (docs/MANUFACTURER_INVENTORY_2026-07-27.md): Restock from the products
// list. Opens a small dialog listing the product's LIMITED flavors, takes units
// to add + an optional note, and writes audited RESTOCK ledger entries (doctrine:
// restock is a ledger action, never a count edit). Unlimited flavors are not
// shown: there is nothing to top up.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PackagePlus, X } from 'lucide-react'
import { loadTemplateInventory, restockTemplateInventory } from './new/inventory-actions'

interface RowDraft {
  flavorKey: string
  name: string
  quantityAvailable: number
  add: string
}

export function RestockButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<RowDraft[]>([])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, startTransition] = useTransition()

  async function openDialog() {
    setOpen(true)
    setLoading(true)
    try {
      const s = await loadTemplateInventory(id)
      setRows(
        s.rows
          .filter((r) => r.tracked)
          .map((r) => ({ flavorKey: r.flavorKey, name: r.name, quantityAvailable: r.quantityAvailable, add: '' })),
      )
    } finally {
      setLoading(false)
    }
  }

  function save() {
    const entries = rows
      .map((r) => ({ flavorKey: r.flavorKey, quantity: Math.round(parseFloat(r.add.replace(/[^0-9.]/g, '')) || 0) }))
      .filter((e) => e.quantity > 0)
    if (entries.length === 0) {
      toast.error('Enter how many units to add.')
      return
    }
    startTransition(async () => {
      const r = await restockTemplateInventory(id, entries, note.trim() || null)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Stock added.')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-700 hover:border-ink-400 hover:text-ink-900"
        title="Add stock"
      >
        <PackagePlus className="h-3.5 w-3.5" aria-hidden="true" /> Restock
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => !pending && setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-ink-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold text-ink-900">Restock {name}</div>
                <div className="mt-0.5 text-[12px] text-ink-500">Units are added to what is left; every restock is logged.</div>
              </div>
              <button type="button" className="text-ink-400 hover:text-ink-700" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading ? (
              <div className="py-6 text-center text-[12px] text-ink-500">Loading stock…</div>
            ) : rows.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-ink-500">
                No limited flavors on this product: stock is Unlimited. Set Limited stock in the product builder first.
              </div>
            ) : (
              <>
                <div className="mt-4 flex flex-col gap-2">
                  {rows.map((r) => (
                    <label key={r.flavorKey} className="grid grid-cols-[1fr_110px] items-center gap-3">
                      <span className="text-[13px] text-ink-800">
                        {r.name} <span className="text-[11px] tabular-nums text-ink-400">({r.quantityAvailable.toLocaleString()} left)</span>
                      </span>
                      <input
                        className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-right text-[13px] tabular-nums outline-none focus:border-ink-400"
                        inputMode="numeric"
                        placeholder="+ units"
                        value={r.add}
                        onChange={(e) => setRows((rs) => rs.map((x) => (x.flavorKey === r.flavorKey ? { ...x, add: e.target.value } : x)))}
                      />
                    </label>
                  ))}
                </div>
                <input
                  className="mt-3 w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-ink-400"
                  placeholder="Note, optional (e.g. batch #82 delivered)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-ink-600 hover:text-ink-900" onClick={() => setOpen(false)} disabled={pending}>
                    Cancel
                  </button>
                  <button type="button" className="rounded-full bg-ink-900 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-700 disabled:opacity-50" onClick={save} disabled={pending}>
                    {pending ? 'Adding…' : 'Add stock'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
