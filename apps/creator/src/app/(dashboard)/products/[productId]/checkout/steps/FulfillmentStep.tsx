'use client'

// Step 4 — Fulfillment. Stubbed for G1; G4 adds the SavedAddress model +
// warehouse picker + inline new-address form.

import { StepShell, PlaceholderBody } from './_StepShell'
import type { FulfillmentState } from '../types'

interface Props {
  state: FulfillmentState
  onChange: (patch: Partial<FulfillmentState>) => void
}

export function FulfillmentStep({ state, onChange }: Props) {
  const options: Array<{
    key: NonNullable<FulfillmentState['shipToType']>
    label: string
    hint: string
  }> = [
    {
      key: 'CLOSEST_WAREHOUSE',
      label: 'Closest WAREHOUSE partner',
      hint: 'We auto-pick the nearest one in your region.',
    },
    {
      key: 'SPECIFIC_WAREHOUSE',
      label: 'Specific WAREHOUSE partner',
      hint: 'Pick from the list of activated warehouses.',
    },
    {
      key: 'SAVED_ADDRESS',
      label: 'Saved address',
      hint: 'Your home / studio / 3PL on file.',
    },
    { key: 'NEW_ADDRESS', label: 'New address', hint: 'Add a one-off destination.' },
  ]

  return (
    <StepShell
      index={4}
      title="Where should we ship?"
      subtitle="Goods land at your destination after production wraps."
    >
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={o.key}
            className={
              'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ' +
              (state.shipToType === o.key
                ? 'border-pink-300 bg-pink-50/40'
                : 'border-ink-200 hover:bg-ink-50/50')
            }
          >
            <input
              type="radio"
              name="shipToType"
              value={o.key}
              checked={state.shipToType === o.key}
              onChange={() => onChange({ shipToType: o.key })}
              className="mt-0.5 accent-pink-500"
            />
            <span>
              <span className="block text-sm font-medium text-ink-900">{o.label}</span>
              <span className="block text-xs text-ink-500">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <PlaceholderBody>
        <p className="mt-6 font-medium text-ink-800">G4 fills this in.</p>
        <p className="mt-1 text-[13px]">
          Selected option expands: warehouse picker with region + capability
          filtering, saved addresses list with default-pick logic, inline new-
          address form with optional save-for-later.
        </p>
      </PlaceholderBody>
    </StepShell>
  )
}
