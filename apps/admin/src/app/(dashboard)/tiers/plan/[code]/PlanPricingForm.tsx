'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { updatePlanPricing } from '../../actions'

interface Props {
  planCode: string
  monthlyPriceCents: number
  annualPriceCents: number
  description: string | null
}

export function PlanPricingForm({
  planCode,
  monthlyPriceCents,
  annualPriceCents,
  description,
}: Props) {
  const router = useRouter()
  const [monthly, setMonthly] = useState((monthlyPriceCents / 100).toFixed(2))
  const [annual, setAnnual] = useState((annualPriceCents / 100).toFixed(2))
  const [desc, setDesc] = useState(description ?? '')
  const [saving, startSave] = useTransition()

  function commit() {
    startSave(async () => {
      const r = await updatePlanPricing({
        planCode,
        monthlyPriceCents: Math.round(parseFloat(monthly || '0') * 100),
        annualPriceCents: Math.round(parseFloat(annual || '0') * 100),
        description: desc.trim() || null,
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Pricing updated · cache invalidated · audit logged.')
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
        Pricing
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <Field label="Monthly ($)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            className="block w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="Annual ($)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={annual}
            onChange={(e) => setAnnual(e.target.value)}
            className="block w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="Description (admin)">
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="block w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={commit}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-white hover:bg-black disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? 'Saving…' : 'Save pricing'}
        </button>
      </div>
    </section>
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
