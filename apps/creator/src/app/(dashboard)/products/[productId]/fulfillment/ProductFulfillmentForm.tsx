'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setProductFulfillmentOverride } from './actions'

type Choice = 'INHERIT' | 'BALANCED' | 'SPEED' | 'COST'

const PREF_LABEL: Record<string, string> = { BALANCED: 'Balanced', SPEED: 'Speed', COST: 'Cost' }

export function ProductFulfillmentForm({
  productId,
  initialOverride,
  accountDefault,
}: {
  productId: string
  /** null = inherit the account default. */
  initialOverride: 'BALANCED' | 'SPEED' | 'COST' | null
  accountDefault: 'BALANCED' | 'SPEED' | 'COST'
}) {
  const initial: Choice = initialOverride ?? 'INHERIT'
  const [selected, setSelected] = useState<Choice>(initial)
  const [saved, setSaved] = useState<Choice>(initial)
  const [isPending, startTransition] = useTransition()

  const options: { value: Choice; title: string; blurb: string }[] = [
    { value: 'INHERIT', title: 'Use my account default', blurb: `Follow your account setting (currently ${PREF_LABEL[accountDefault]}).` },
    { value: 'BALANCED', title: 'Balanced', blurb: 'Weigh speed and cost evenly for this product.' },
    { value: 'SPEED', title: 'Prioritize speed', blurb: 'Favor the fulfillment center closest to buyers.' },
    { value: 'COST', title: 'Prioritize cost', blurb: 'Favor the cheapest eligible fulfillment center.' },
  ]

  function choose(next: Choice) {
    if (next === saved || isPending) return
    setSelected(next)
    startTransition(async () => {
      const res = await setProductFulfillmentOverride(productId, next)
      if (res.ok) {
        setSaved(next)
        toast.success('Saved')
      } else {
        setSelected(saved)
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((o) => {
        const on = selected === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => choose(o.value)}
            disabled={isPending}
            aria-pressed={on}
            className={`flex flex-col rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:opacity-60 ${
              on ? 'border-success-500 bg-success-50 ring-1 ring-pink-500' : 'border-ink-200 bg-white hover:border-ink-300'
            }`}
          >
            <span className="font-display text-[15px] font-semibold text-ink-900">{o.title}</span>
            <span className="mt-1 text-[12px] leading-relaxed text-ink-600">{o.blurb}</span>
          </button>
        )
      })}
    </div>
  )
}
