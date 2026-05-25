'use client'

// Section 1 — "Your business"
// Per docs/PARTNER_ONBOARDING.md §7.4 + §7.5 (multi-select partner types).
//
// Captures:
//   - Markets the partner serves into (multi-select from ACTIVE markets only)
//   - Region they operate from (single-select state/province)
//   - Partner types: MANUFACTURING / COPACKING / LABEL_PRINTING / WAREHOUSE
//     (multi-select per Pavel decision 2026-05-25 — a partner can be more than one)
//
// Save behavior: each change triggers a debounced server save. Optimistic
// local state for snappy UX; server is source of truth.

import { useState, useTransition } from 'react'
import { Label } from '@ilaunchify/ui'
import type { ServiceType } from '@prisma/client'
import { saveYourBusinessSection } from '../../../app/(onboarding)/onboarding/actions'

interface MarketOption {
  id: string
  code: string
  name: string
  region: string | null
}

interface RegionOption {
  id: string
  code: string
  name: string
  marketId: string
  parentRegionId: string | null
}

interface SectionState {
  targetMarketIds: string[]
  primaryRegionId: string | null
  serviceTypes: ServiceType[]
}

interface YourBusinessSectionProps {
  initialState: SectionState
  markets: MarketOption[]
  regions: RegionOption[]
  onChange: (state: SectionState) => void
}

const SERVICE_TYPE_OPTIONS: Array<{ value: ServiceType; label: string; description: string }> = [
  {
    value: 'MANUFACTURING',
    label: 'Manufacturing',
    description: 'You produce finished goods from ingredients / raw materials',
  },
  {
    value: 'COPACKING',
    label: 'Co-packing',
    description: 'You package products supplied by creators or other manufacturers',
  },
  {
    value: 'LABEL_PRINTING',
    label: 'Label printing',
    description: 'You print labels, stickers, or full packaging artwork',
  },
  {
    value: 'WAREHOUSE',
    label: 'Warehouse / 3PL',
    description: 'You hold inventory + pick-and-pack for fulfillment',
  },
]

export function YourBusinessSection({
  initialState,
  markets,
  regions,
  onChange,
}: YourBusinessSectionProps) {
  const [state, setState] = useState<SectionState>(initialState)
  const [isPending, startTransition] = useTransition()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function update(patch: Partial<SectionState>) {
    const next = { ...state, ...patch }
    setState(next)
    onChange(next)

    // Save server-side (debounce-ish via React transition).
    setSaveStatus('saving')
    startTransition(async () => {
      const result = await saveYourBusinessSection(next)
      if (result.ok) {
        setSaveStatus('saved')
        // Reset to idle after a moment so the indicator doesn't linger forever
        setTimeout(() => setSaveStatus('idle'), 2000)
      } else {
        setSaveStatus('error')
      }
    })
  }

  function toggleServiceType(type: ServiceType) {
    const next = state.serviceTypes.includes(type)
      ? state.serviceTypes.filter((t) => t !== type)
      : [...state.serviceTypes, type]
    update({ serviceTypes: next })
  }

  function toggleMarket(marketId: string) {
    const next = state.targetMarketIds.includes(marketId)
      ? state.targetMarketIds.filter((id) => id !== marketId)
      : [...state.targetMarketIds, marketId]
    update({ targetMarketIds: next })
  }

  return (
    <div className="space-y-8">
      {/* Save indicator */}
      <div className="-mt-3 flex justify-end">
        <SaveIndicator status={saveStatus} pending={isPending} />
      </div>

      {/* Markets you sell into */}
      <Field
        label="Which markets do you sell into?"
        hint="Pick all that apply. We'll match you with creators selling in these markets."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {markets.map((m) => {
            const checked = state.targetMarketIds.includes(m.id)
            return (
              <label
                key={m.id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                  checked
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleMarket(m.id)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <div className="font-medium text-zinc-900">{m.name}</div>
                  {m.region && <div className="text-xs text-zinc-500">{m.region}</div>}
                </div>
              </label>
            )
          })}
        </div>
        {markets.length === 0 && (
          <p className="text-sm text-zinc-500">
            No markets are currently active. Contact support if you think this is wrong.
          </p>
        )}
      </Field>

      {/* Region you operate from */}
      <Field
        label="Where do you operate from?"
        hint="Your primary facility location. We use this to match you with nearby creators."
      >
        <select
          value={state.primaryRegionId ?? ''}
          onChange={(e) => update({ primaryRegionId: e.target.value || null })}
          className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Select a state…</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>

      {/* Partner types — multi-select */}
      <Field
        label="What do you do?"
        hint="Pick all that apply — many partners offer more than one. You can change this anytime."
      >
        <div className="space-y-2">
          {SERVICE_TYPE_OPTIONS.map((opt) => {
            const checked = state.serviceTypes.includes(opt.value)
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                  checked
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleServiceType(opt.value)}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-zinc-900">{opt.label}</div>
                  <div className="text-sm text-zinc-500">{opt.description}</div>
                </div>
              </label>
            )
          })}
        </div>
      </Field>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Label className="text-base font-semibold text-zinc-900">{label}</Label>
      {hint && <p className="mt-0.5 text-sm text-zinc-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  )
}

function SaveIndicator({
  status,
  pending,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error'
  pending: boolean
}) {
  if (status === 'idle' && !pending) return null
  const display = pending ? 'saving' : status
  const text = {
    saving: 'Saving…',
    saved: '✓ Saved',
    error: '⚠ Save failed',
    idle: '',
  }[display]
  const cls = {
    saving: 'text-zinc-500',
    saved: 'text-emerald-600',
    error: 'text-red-600',
    idle: '',
  }[display]
  return <span className={`text-xs ${cls}`}>{text}</span>
}
