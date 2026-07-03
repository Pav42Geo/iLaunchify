'use client'

// Received-vs-expected reconciliation form (Phase L1.1c, upgraded for Partner
// Role Accounts P0 — docs/PARTNER_ROLE_ACCOUNTS.md §3.1.A).
//
// D2 (LOCKED): lot number + expiry date are a HARD GATE for lot-tracked lines —
// the submit button stays disabled until every lot-tracked line carries both.
// They're immutable after confirm (no post-receipt backfill; corrections flow
// through a discrepancy). Defaults every line to the expected quantity; a
// mismatch or damage flag files a first-class ReceivingDiscrepancy the admin
// exceptions queue works.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ClipboardCheck, Lock } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { confirmInboundReceipt } from '../actions'

interface ItemLine {
  orderItemId: string
  productName: string
  sku: string | null
  gtin: string | null
  expectedQty: number
  lotTracked: boolean
}

interface Props {
  dispatchId: string
  items: ItemLine[]
  checklist: { key: string; label: string }[]
  /** Manifest-declared lot numbers (ShipmentDocument) — offered as prefill only. */
  declaredLots: string[]
}

export function ConfirmReceiptForm({ dispatchId, items, checklist, declaredLots }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [received, setReceived] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.orderItemId, String(i.expectedQty)])),
  )
  // D2 prefill: a single declared lot on the manifest very likely covers every
  // line — offer it, but the FC verifies against the physical carton label.
  const [lots, setLots] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.map((i) => [i.orderItemId, i.lotTracked && declaredLots.length === 1 ? (declaredLots[0] ?? '') : '']),
    ),
  )
  const [expiries, setExpiries] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.orderItemId, ''])),
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
        const lot = (lots[i.orderItemId] ?? '').trim()
        const expiry = (expiries[i.orderItemId] ?? '').trim()
        const lotOk = !i.lotTracked || (lot.length > 0 && expiry.length > 0)
        return { item: i, qty: valid ? qty : null, lot, expiry, lotOk }
      }),
    [items, received, lots, expiries],
  )
  const hasInvalid = parsed.some((p) => p.qty === null)
  const hasDiscrepancy = parsed.some((p) => p.qty !== null && p.qty !== p.item.expectedQty)
  const lotGateBlocked = parsed.some((p) => !p.lotOk)
  const allChecked = checklist.every((c) => checked[c.key] === true)
  const needsNote = (hasDiscrepancy || damaged) && note.trim().length === 0

  async function submit() {
    if (hasInvalid || !allChecked || needsNote || lotGateBlocked) return
    setBusy(true)
    try {
      const r = await confirmInboundReceipt({
        dispatchId,
        received: parsed.map((p) => ({
          orderItemId: p.item.orderItemId,
          receivedQty: p.qty ?? 0,
          lotNumber: p.item.lotTracked ? p.lot : p.lot || undefined,
          lotExpiry: p.item.lotTracked ? p.expiry : p.expiry || undefined,
        })),
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
      {/* Received quantities + lot capture */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-3">
          <h2 className="font-display text-[15px] font-semibold text-ink-900">Received quantities</h2>
          <p className="text-[12px] text-ink-600">
            Count every line against the manifest. Lot-tracked lines require the lot number and
            expiry date printed on the received cartons — these are locked once you confirm.
          </p>
        </header>
        <div className="divide-y divide-ink-100">
          {items.map((i) => {
            const raw = received[i.orderItemId] ?? ''
            const qty = Number.parseInt(raw, 10)
            const mismatch = raw.trim() !== '' && Number.isInteger(qty) && qty !== i.expectedQty
            const lot = lots[i.orderItemId] ?? ''
            const expiry = expiries[i.orderItemId] ?? ''
            const lotMissing = i.lotTracked && (lot.trim() === '' || expiry.trim() === '')
            return (
              <div key={i.orderItemId} className="space-y-3 px-5 py-3">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink-900">{i.productName}</p>
                    <p className="mt-0.5 text-[11.5px] text-ink-500">
                      {i.sku && <span className="font-mono">{i.sku}</span>}
                      {i.sku && i.gtin && ' · '}
                      {i.gtin && <span className="font-mono">GTIN {i.gtin}</span>}
                      {i.lotTracked && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-info-200 bg-info-50 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-info-800">
                          <Lock className="h-2.5 w-2.5" aria-hidden="true" /> Lot-tracked
                        </span>
                      )}
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
                {i.lotTracked && (
                  <div className="flex flex-wrap items-end gap-3 rounded-xl bg-ink-50/70 px-3 py-2.5">
                    <label className="flex-1 text-[12px] font-medium text-ink-700">
                      Lot number <span className="text-danger-600">*</span>
                      <input
                        type="text"
                        value={lot}
                        onChange={(e) =>
                          setLots((prev) => ({ ...prev, [i.orderItemId]: e.target.value }))
                        }
                        placeholder="As printed on the carton"
                        className={cn(
                          'mt-1 h-9 w-full rounded-lg border bg-white px-3 font-mono text-[12.5px] text-ink-900 placeholder:font-sans placeholder:text-ink-400 focus:outline-none focus:ring-2',
                          lot.trim() === ''
                            ? 'border-danger-200 focus:border-danger-300 focus:ring-danger-100'
                            : 'border-ink-200 focus:border-pink-400 focus:ring-pink-200',
                        )}
                      />
                    </label>
                    <label className="text-[12px] font-medium text-ink-700">
                      Expiry date <span className="text-danger-600">*</span>
                      <input
                        type="date"
                        value={expiry}
                        onChange={(e) =>
                          setExpiries((prev) => ({ ...prev, [i.orderItemId]: e.target.value }))
                        }
                        className={cn(
                          'mt-1 h-9 rounded-lg border bg-white px-3 text-[12.5px] text-ink-900 focus:outline-none focus:ring-2',
                          expiry.trim() === ''
                            ? 'border-danger-200 focus:border-danger-300 focus:ring-danger-100'
                            : 'border-ink-200 focus:border-pink-400 focus:ring-pink-200',
                        )}
                      />
                    </label>
                    {lotMissing && (
                      <p className="basis-full text-[11px] text-danger-600">
                        Required for lot-tracked products — cannot be added after confirmation.
                      </p>
                    )}
                  </div>
                )}
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
        {lotGateBlocked && allChecked && (
          <span className="text-[12px] text-danger-600">Enter lot + expiry for every lot-tracked line.</span>
        )}
        {needsNote && (
          <span className="text-[12px] text-danger-600">Add a note describing the discrepancy.</span>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={busy || hasInvalid || !allChecked || needsNote || lotGateBlocked}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-900 px-5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          {busy ? 'Confirming…' : 'Confirm receipt'}
        </button>
      </div>
    </div>
  )
}
