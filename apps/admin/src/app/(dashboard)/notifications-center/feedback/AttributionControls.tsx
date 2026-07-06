'use client'

// Admin controls for the review-attribution layer (docs/REVIEW_ATTRIBUTION_MODEL.md
// §3.4a). Singleton knobs — Pavel monitors and course-corrects from here.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateAttributionControls } from './actions'

const ALL_ASPECTS = [
  { key: 'PACKAGING', label: 'Packaging' },
  { key: 'PRINTING', label: 'Printing' },
  { key: 'FULFILLMENT', label: 'Delivery' },
] as const

export interface AttributionControlsValue {
  attributionEnabled: boolean
  reanchorEnabled: boolean
  enforceReanchorFloor: boolean
  offeredAspects: string[]
  reanchorFlagRate: number
  reanchorFlagMinNotes: number
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint: string
}) {
  return (
    <label className="flex items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-pink-600"
      />
      <span>
        <span className="block text-[13px] font-medium text-ink-900">{label}</span>
        <span className="block text-[11.5px] text-ink-500">{hint}</span>
      </span>
    </label>
  )
}

export function AttributionControls({ value }: { value: AttributionControlsValue }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [v, setV] = useState(value)

  function save() {
    start(async () => {
      const r = await updateAttributionControls(v)
      if (r.ok) {
        toast.success('Attribution controls saved')
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  function toggleAspect(key: string) {
    setV((p) => ({
      ...p,
      offeredAspects: p.offeredAspects.includes(key)
        ? p.offeredAspects.filter((a) => a !== key)
        : [...p.offeredAspects, key],
    }))
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="font-display text-[15px] font-semibold text-ink-900">Controls</h2>
      <p className="mt-0.5 text-[11.5px] text-ink-500">
        Tune how creators attribute a review to a partner. Changes are audited.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Toggle
            checked={v.attributionEnabled}
            onChange={(c) => setV((p) => ({ ...p, attributionEnabled: c }))}
            label="Attribution enabled"
            hint="Master switch — offer aspect chips on the review composer."
          />
          <Toggle
            checked={v.reanchorEnabled}
            onChange={(c) => setV((p) => ({ ...p, reanchorEnabled: c }))}
            label="Re-anchor fork"
            hint="On a low + tagged review, ask “product or partner?” and let the product star re-anchor."
          />
          <Toggle
            checked={v.enforceReanchorFloor}
            onChange={(c) => setV((p) => ({ ...p, enforceReanchorFloor: c }))}
            label="Enforce ≥-original floor"
            hint="A re-anchored product-only star can only be the same or higher than the original."
          />
        </div>

        <div className="space-y-4">
          <div>
            <span className="block text-[13px] font-medium text-ink-900">Aspects offered</span>
            <span className="block text-[11.5px] text-ink-500">Which partner aspects a creator may tag.</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ALL_ASPECTS.map((a) => {
                const on = v.offeredAspects.includes(a.key)
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => toggleAspect(a.key)}
                    className={`rounded-full border px-3 py-1 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                      on ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'
                    }`}
                  >
                    {a.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex gap-4">
            <label className="text-[12px] text-ink-600">
              <span className="block font-medium text-ink-800">Abuse-flag rate</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={v.reanchorFlagRate}
                onChange={(e) => setV((p) => ({ ...p, reanchorFlagRate: Number(e.target.value) }))}
                className="mt-1 w-24 rounded-lg border border-ink-200 px-2 py-1 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
              <span className="mt-0.5 block text-[11px] text-ink-400">re-anchor share (0–1)</span>
            </label>
            <label className="text-[12px] text-ink-600">
              <span className="block font-medium text-ink-800">Min notes</span>
              <input
                type="number"
                min={1}
                step={1}
                value={v.reanchorFlagMinNotes}
                onChange={(e) => setV((p) => ({ ...p, reanchorFlagMinNotes: Number(e.target.value) }))}
                className="mt-1 w-24 rounded-lg border border-ink-200 px-2 py-1 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
              <span className="mt-0.5 block text-[11px] text-ink-400">before flag fires</span>
            </label>
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          {pending ? 'Saving…' : 'Save controls'}
        </button>
      </div>
    </div>
  )
}
