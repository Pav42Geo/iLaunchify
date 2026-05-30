'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { updateFeeRule } from '../../actions'

interface FeeRuleRow {
  id: string
  triggerEvent: string
  ratePercent: number | null
  flatCents: number | null
  minCents: number | null
  maxCents: number | null
  notes: string | null
  active: boolean
}

interface Props {
  rules: FeeRuleRow[]
}

const TRIGGER_LABEL: Record<string, string> = {
  production_order_subtotal: 'Production order subtotal',
  sample_order: 'Sample order',
  warehouse_referral: 'Warehouse referral',
}

export function PlanFeeRulesEditor({ rules }: Props) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <header className="border-b border-zinc-100 px-5 py-3">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
          Fee rules
        </h2>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          One rule per <code className="rounded bg-zinc-100 px-1 font-mono text-[11px]">triggerEvent</code>. Rate is in percent (e.g. 12 = 12%).
        </p>
      </header>
      <div className="divide-y divide-zinc-100">
        {rules.map((r) => (
          <FeeRuleRowEditor key={r.id} rule={r} />
        ))}
        {rules.length === 0 && (
          <p className="p-5 text-[13px] text-zinc-500">
            No fee rules configured for this plan.
          </p>
        )}
      </div>
    </section>
  )
}

function FeeRuleRowEditor({ rule }: { rule: FeeRuleRow }) {
  const router = useRouter()
  const [saving, startSave] = useTransition()
  const [ratePercent, setRatePercent] = useState(
    rule.ratePercent != null ? rule.ratePercent.toString() : '',
  )
  const [flatCents, setFlatCents] = useState(
    rule.flatCents != null ? rule.flatCents.toString() : '',
  )
  const [minCents, setMinCents] = useState(
    rule.minCents != null ? rule.minCents.toString() : '',
  )
  const [maxCents, setMaxCents] = useState(
    rule.maxCents != null ? rule.maxCents.toString() : '',
  )
  const [notes, setNotes] = useState(rule.notes ?? '')

  function commit() {
    startSave(async () => {
      const r = await updateFeeRule({
        feeRuleId: rule.id,
        ratePercent: ratePercent === '' ? null : parseFloat(ratePercent),
        flatCents: flatCents === '' ? null : parseInt(flatCents, 10),
        minCents: minCents === '' ? null : parseInt(minCents, 10),
        maxCents: maxCents === '' ? null : parseInt(maxCents, 10),
        notes: notes.trim() || null,
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(`Fee rule '${rule.triggerEvent}' updated.`)
      router.refresh()
    })
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[13px] font-medium text-zinc-900">
            {TRIGGER_LABEL[rule.triggerEvent] ?? rule.triggerEvent}
          </div>
          <div className="font-mono text-[11px] text-zinc-500">{rule.triggerEvent}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Rate (%)">
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={ratePercent}
            onChange={(e) => setRatePercent(e.target.value)}
            placeholder="—"
            className="block w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="Flat (cents)">
          <input
            type="number"
            min="0"
            value={flatCents}
            onChange={(e) => setFlatCents(e.target.value)}
            placeholder="—"
            className="block w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="Min (cents)">
          <input
            type="number"
            min="0"
            value={minCents}
            onChange={(e) => setMinCents(e.target.value)}
            placeholder="—"
            className="block w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="Max (cents)">
          <input
            type="number"
            min="0"
            value={maxCents}
            onChange={(e) => setMaxCents(e.target.value)}
            placeholder="—"
            className="block w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
      </div>

      <div className="mt-3">
        <label className="block text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
          Notes
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 block w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
        />
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={commit}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-black disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Save rule
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
