'use client'

// Received-vs-expected reconciliation form (Phase L1.1c). Defaults every line
// to the expected quantity; a mismatch or damage flag files a discrepancy that
// the server action records + escalates to admin.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ClipboardCheck } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { confirmInboundReceipt } from '../actions'

interface ItemLine {
  orderItemId: string
  productName: string
  sku: string | null
  gtin: string | null
  expectedQty: number
}

interface Props {
  dispatchId: string
  items: ItemLine[]
  checklist: { key: string; label: string }[]
}

export function ConfirmReceiptForm({ dispatchId, items, checklist }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [received, setReceived] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.orderItemId, String(i.expectedQty)])),
  )
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [note, setNote] = useState('')
  const [damaged, setDamaged] = useState(false)

  const parsed = useMemo(
    () =>
      items.map((i) => {
        const raw = received[i.orderItemId] ?? ''
        const qty = Number.parseInt(raw, 10)
        const valid = raw.trim() !== '' && Number.isInteger(qty) && qty >= 0
        return { item: i, qty: valid ? qty : null }
      }),
    [items, received],
  )
  const hasInvalid = parsed.some((p) => p.qty === null)
  const hasDiscrepancy = parsed.some((p) => p.qty !== null && p.qty !== p.item.expectedQty)
  const allChecked = checklist.every((c) => checked[c.key] === true)
  const needsNote = (hasDiscrepancy || damaged) && note.trim().length === 0

  async function submit() {
    if (hasInvalid || !allChecked || needsNote) return
    setBusy(true)
    try {
      const r = await confirmInboundReceipt({
        dispatchId,
        received: parsed.map((p) => ({ orderItemId: p.item.orderItemId, receivedQty: p.qty ?? 0 })),
        discrepancyNote: note.trim() || undefined,
        damaged,
        confirmedChecklistKeys: checklist.filter((c) => checked[c.key]).map((c) => c.key),
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(hasDiscrepancy || damaged ? 'Receipt confirmed — discrepancy filed' : 'Receipt confirmed')
      router.push('/inbound')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Received quantities */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-3">
          <h2 className="font-display text-[15px] font-semibold text-ink-900">Received quantities</h2>
          <p className="text-[12px] text-ink-600">
            Count every line against the manifest. Defaults are the expected quantities — adjust
            anything short, over, or missing.
          </p>
        </header>
        <div className="divide-y divide-ink-100">
          {items.map((i) => {
            const raw = received[i.orderItemId] ?? ''
            const qty = Number.parseInt(raw, 10)
            const mismatch = raw.trim() !== '' && Number.isInteger(qty) && qty !== i.expectedQty
            return (
              <div key={i.orderItemId} className="flex flex-wrap items-center gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink-900">{i.productName}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-500">
                    {i.sku && <span className="font-mono">{i.sku}</span>}
                    {i.sku && i.gtin && ' · '}
                    {i.gtin && <span className="font-mono">GTIN {i.gtin}</span>}
                  </p>
                </div>
                <div className="text-right text-[12px] text-ink-500">
                  Expected
                  <span className="ml-1.5 font-semibold tabular-nums text-ink-900">
                    {i.expectedQty.toLocaleString()}
                  </span>
                </div>
                <label className="flex items-center gap-2 text-[12px] text-ink-700">
                  Received
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={raw}
                    onChange={(e) =>
                      setReceived((prev) => ({ ...prev, [i.orderItemId]: e.target.value }))
                    }
                    className={cn(
                      'h-9 w-28 rounded-lg border bg-white px-3 text-right text-[13px] tabular-nums text-ink-900 focus:outline-none focus:ring-2',
                      mismatch
                        ? 'border-warning-300 focus:border-warning-400 focus:ring-warning-200'
                        : 'border-ink-200 focus:border-pink-400 focus:ring-pink-200',
                    )}
                  />
                </label>
              </div>
            )
          })}
        </div>
        {hasDiscrepancy && (
          <div className="flex items-center gap-2 border-t border-warning-200 bg-warning-50/60 px-5 py-2.5 text-[12px] text-warning-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Received counts differ from the manifest — a discrepancy report will be filed with iLaunchify.
          </div>
        )}
      </section>

      {/* Receiving checklist */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-3">
          <h2 className="font-display text-[15px] font-semibold text-ink-900">Receiving checklist</h2>
          <p className="text-[12px] text-ink-600">
            Confirm each step before signing for the shipment.
          </p>
        </header>
        <div className="divide-y divide-ink-100">
          {checklist.map((c) => (
            <label
              key={c.key}
              className="flex cursor-pointer items-start gap-3 px-5 py-3 text-[13px] text-ink-800 transition-colors hover:bg-ink-50/60"
            >
              <input
                type="checkbox"
                checked={checked[c.key] === true}
                onChange={(e) => setChecked((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-ink-300 text-pink-600 focus:ring-pink-500"
              />
              {c.label}
            </label>
          ))}
        </div>
      </section>

      {/* Discrepancy note + damage flag */}
      <section className="space-y-3 rounded-2xl border border-ink-200 bg-white px-5 py-4">
        <label className="flex items-center gap-2 text-[13px] font-medium text-ink-800">
          <input
            type="checkbox"
            checked={damaged}
            onChange={(e) => setDamaged(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-pink-600 focus:ring-pink-500"
          />
          Damage or leaks observed on arrival
        </label>
        <div>
          <label htmlFor="inbound-note" className="block text-[12px] font-medium text-ink-700">
            Discrepancy note {hasDiscrepancy || damaged ? <span className="text-danger-600">(required)</span> : <span className="text-ink-400">(optional)</span>}
          </label>
          <textarea
            id="inbound-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Short/over counts, damaged cartons, seal issues, temperature concerns…"
            className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {!allChecked && (
          <span className="text-[12px] text-ink-500">Complete the checklist to confirm.</span>
        )}
        {needsNote && (
          <span className="text-[12px] text-danger-600">Add a note describing the discrepancy.</span>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={busy || hasInvalid || !allChecked || needsNote}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-900 px-5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          {busy ? 'Confirming…' : 'Confirm receipt'}
        </button>
      </div>
    </div>
  )
}
