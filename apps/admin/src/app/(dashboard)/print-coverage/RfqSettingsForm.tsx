'use client'

// PS-8 — admin control for the RFQ broadcast knobs (§10.2). Previously hardcoded
// constants (shortlist 10 / expiry 14d / re-broadcast 7d); now tunable here.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { SlidersHorizontal } from 'lucide-react'
import { saveRfqSettings, type RfqSettingsInput } from './actions'

export function RfqSettingsForm({ initial }: { initial: RfqSettingsInput }) {
  const [v, setV] = useState(initial)
  const [isSaving, start] = useTransition()

  function patch(key: keyof RfqSettingsInput, value: number, min: number) {
    setV((prev) => ({ ...prev, [key]: Math.max(min, Math.floor(value) || min) }))
  }
  function save() {
    start(async () => {
      const res = await saveRfqSettings(v)
      if (!res.ok) return void toast.error(res.error)
      toast.success(res.message)
    })
  }

  const inputCls =
    'w-24 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500'

  const rows: Array<[keyof RfqSettingsInput, string, string, number]> = [
    ['rfqShortlistSize', 'Shortlist size', 'Top-N printers notified per broadcast band', 1],
    ['rfqExpiryDays', 'Expiry (days)', 'Open request window before ops escalation', 1],
    ['rfqRebroadcastDays', 'Re-broadcast (days)', 'Idle days before the next band is notified', 1],
  ]

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-ink-500" />
        <h2 className="font-display text-[14px] font-semibold text-ink-900">RFQ broadcast settings</h2>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
        {rows.map(([key, label, hint, min]) => (
          <div key={key}>
            <label className="text-[11px] font-bold uppercase tracking-widest text-ink-700">{label}</label>
            <div className="mt-1">
              <input
                type="number"
                min={min}
                value={v[key]}
                onChange={(e) => patch(key, parseInt(e.target.value, 10), min)}
                className={inputCls}
                aria-label={label}
              />
            </div>
            <div className="mt-1 max-w-[180px] text-[11px] text-ink-500">{hint}</div>
          </div>
        ))}
        <button
          onClick={save}
          disabled={isSaving}
          className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  )
}
