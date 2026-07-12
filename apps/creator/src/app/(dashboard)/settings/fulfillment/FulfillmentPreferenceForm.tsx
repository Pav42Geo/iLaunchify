'use client'

import { useState, useTransition } from 'react'
import { Gauge, DollarSign, Scale } from 'lucide-react'
import { toast } from 'sonner'
import { saveFulfillmentPreference } from './actions'

type Pref = 'BALANCED' | 'SPEED' | 'COST'

const OPTIONS: { value: Pref; title: string; blurb: string; icon: typeof Scale }[] = [
  { value: 'BALANCED', title: 'Balanced', blurb: 'Weigh speed and cost evenly — a sensible default for most products.', icon: Scale },
  { value: 'SPEED', title: 'Prioritize speed', blurb: 'Favor the fulfillment center closest to your buyers for the fastest delivery.', icon: Gauge },
  { value: 'COST', title: 'Prioritize cost', blurb: 'Favor the cheapest eligible fulfillment center, even if delivery is a little slower.', icon: DollarSign },
]

export function FulfillmentPreferenceForm({ initial }: { initial: Pref }) {
  const [selected, setSelected] = useState<Pref>(initial)
  const [saved, setSaved] = useState<Pref>(initial)
  const [isPending, startTransition] = useTransition()

  function choose(pref: Pref) {
    if (pref === saved || isPending) return
    setSelected(pref)
    startTransition(async () => {
      const res = await saveFulfillmentPreference(pref)
      if (res.ok) {
        setSaved(pref)
        toast.success('Fulfillment preference saved')
      } else {
        setSelected(saved) // revert
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {OPTIONS.map((o) => {
        const on = selected === o.value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => choose(o.value)}
            disabled={isPending}
            aria-pressed={on}
            className={`flex flex-col rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:opacity-60 ${
              on
                ? 'border-pink-500 bg-pink-50 ring-1 ring-pink-500'
                : 'border-ink-200 bg-white hover:border-ink-300'
            }`}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                on ? 'bg-pink-600 text-white' : 'bg-ink-900 text-white'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span className="mt-3 font-display text-[15px] font-semibold text-ink-900">{o.title}</span>
            <span className="mt-1 text-[12px] leading-relaxed text-ink-600">{o.blurb}</span>
          </button>
        )
      })}
    </div>
  )
}
