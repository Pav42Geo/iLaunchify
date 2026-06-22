'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { RotateCw, Check } from 'lucide-react'
import { recordRotation, setRotationCadence } from './actions'

export function RotationControl({
  integrationKey,
  cadenceDays,
}: {
  integrationKey: string
  cadenceDays: number | null
}) {
  const [days, setDays] = useState<string>(cadenceDays != null ? String(cadenceDays) : '')
  const [pending, start] = useTransition()

  function markRotated() {
    start(async () => {
      const r = await recordRotation({ key: integrationKey })
      if (!r.ok) return void toast.error(r.error)
      toast.success('Recorded — rotation clock reset to today.')
    })
  }

  function saveCadence() {
    const parsed = days.trim() === '' ? null : Number(days)
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error('Enter a positive number of days, or blank to use the default.')
      return
    }
    start(async () => {
      const r = await setRotationCadence({ key: integrationKey, days: parsed })
      if (!r.ok) return void toast.error(r.error)
      toast.success('Cadence updated.')
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={markRotated}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full bg-ink-900 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" /> Mark rotated
      </button>
      <span className="inline-flex items-center gap-1 text-[11px] text-ink-500">
        <RotateCw className="h-3 w-3" /> every
        <input
          type="number"
          min={1}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          placeholder="default"
          className="w-16 rounded border border-ink-200 px-1.5 py-0.5 text-[11.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        />
        days
        <button
          type="button"
          onClick={saveCadence}
          disabled={pending}
          className="rounded border border-ink-200 px-1.5 py-0.5 font-medium text-ink-600 hover:bg-ink-50 disabled:opacity-50"
        >
          Save
        </button>
      </span>
    </div>
  )
}
