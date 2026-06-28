'use client'

// Per-row die-line picker for a packaging container (#135). Optimistic update +
// revert on error, mirroring the PackingProfileControls pattern.

import { useState, useTransition } from 'react'
import { setContainerDieCut } from './actions'

export interface DieCutOption {
  id: string
  label: string
}

export function DieCutPicker({
  packagingTypeId,
  value,
  options,
}: {
  packagingTypeId: string
  value: string | null
  options: DieCutOption[]
}) {
  const [val, setVal] = useState<string>(value ?? '')
  const [pending, start] = useTransition()

  function onChange(next: string) {
    const prev = val
    setVal(next)
    start(async () => {
      const res = await setContainerDieCut(packagingTypeId, next || null)
      if (!res.ok) {
        setVal(prev)
        // eslint-disable-next-line no-alert
        alert(res.error)
      }
    })
  }

  return (
    <select
      value={val}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50"
    >
      <option value="">— No default —</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
