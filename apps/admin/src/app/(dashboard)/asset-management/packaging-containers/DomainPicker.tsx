'use client'

// Per-row product-domain toggles for a packaging type. Empty selection = applies
// to ALL domains (scopes the marketplace packaging filter + partner picker).
// Optimistic update + revert on error, mirroring DieCutPicker.

import { useState, useTransition } from 'react'
import { setContainerDomains } from './actions'

const DOMAINS: { key: string; label: string }[] = [
  { key: 'FOOD', label: 'Food' },
  { key: 'DIETARY_SUPPLEMENT', label: 'Supp' },
  { key: 'PET_PRODUCT', label: 'Pet' },
  { key: 'COSMETIC', label: 'Cosmetic' },
  { key: 'OTC', label: 'OTC' },
]

export function DomainPicker({
  packagingTypeId,
  value,
}: {
  packagingTypeId: string
  value: string[]
}) {
  const [sel, setSel] = useState<string[]>(value)
  const [pending, start] = useTransition()

  function toggle(key: string) {
    const prev = sel
    const next = sel.includes(key) ? sel.filter((d) => d !== key) : [...sel, key]
    setSel(next)
    start(async () => {
      const res = await setContainerDomains(packagingTypeId, next)
      if (!res.ok) {
        setSel(prev)
        // eslint-disable-next-line no-alert
        alert(res.error)
      }
    })
  }

  return (
    <div className={`flex flex-wrap gap-1 ${pending ? 'opacity-50' : ''}`}>
      {DOMAINS.map((d) => {
        const on = sel.includes(d.key)
        return (
          <button
            key={d.key}
            type="button"
            disabled={pending}
            onClick={() => toggle(d.key)}
            aria-pressed={on}
            className={
              'rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ' +
              (on
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-300 bg-white text-ink-600 hover:border-ink-500')
            }
          >
            {d.label}
          </button>
        )
      })}
      {sel.length === 0 && <span className="self-center text-[11px] italic text-ink-400">all</span>}
    </div>
  )
}
