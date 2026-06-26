'use client'

import { useState, useTransition } from 'react'
import { updatePackingProfile, type PackingProfilePatch } from './actions'

export interface ProfileRow {
  id: string
  isActive: boolean
  flavorMode: 'SINGLE' | 'MULTI'
  labelColumns: number
  isSubscription: boolean
  isCustomizable: boolean
}

export function PackingProfileControls({ row }: { row: ProfileRow }) {
  const [r, setR] = useState(row)
  const [pending, start] = useTransition()

  function save(patch: PackingProfilePatch) {
    setR((prev) => ({ ...prev, ...patch } as ProfileRow))
    start(async () => {
      const res = await updatePackingProfile(r.id, patch)
      if (!res.ok) {
        setR(row) // revert
        // eslint-disable-next-line no-alert
        alert(res.error)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <select
        value={r.flavorMode}
        onChange={(e) => save({ flavorMode: e.target.value as 'SINGLE' | 'MULTI' })}
        disabled={pending}
        className="rounded-md border border-ink-300 bg-white px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        aria-label="Flavor mode"
      >
        <option value="SINGLE">One recipe</option>
        <option value="MULTI">Base + presets</option>
      </select>
      <select
        value={r.labelColumns}
        onChange={(e) => save({ labelColumns: parseInt(e.target.value, 10) })}
        disabled={pending}
        className="rounded-md border border-ink-300 bg-white px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        aria-label="Label columns"
      >
        <option value={1}>1-col</option>
        <option value={2}>2-col</option>
        <option value={3}>3-col</option>
      </select>
      <Toggle label="Sub" on={r.isSubscription} onClick={() => save({ isSubscription: !r.isSubscription })} disabled={pending} />
      <Toggle label="Pick-N" on={r.isCustomizable} onClick={() => save({ isCustomizable: !r.isCustomizable })} disabled={pending} />
      <button
        type="button"
        onClick={() => save({ isActive: !r.isActive })}
        disabled={pending}
        className={
          'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ' +
          (r.isActive ? 'bg-success-100 text-success-700' : 'bg-ink-100 text-ink-500')
        }
      >
        {r.isActive ? '● Active' : '○ Inactive'}
      </button>
    </div>
  )
}

function Toggle({ label, on, onClick, disabled }: { label: string; on: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ' +
        (on ? 'bg-pink-100 text-pink-700' : 'bg-ink-100 text-ink-400')
      }
    >
      {label}
    </button>
  )
}
