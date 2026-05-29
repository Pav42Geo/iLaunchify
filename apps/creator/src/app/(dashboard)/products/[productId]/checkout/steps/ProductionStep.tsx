'use client'

// Step 2 — Production options. Stubbed for G1; G3 brings the typed
// Substrate + PackagingMaterial pickers + Finishes picker + live price.
// G1 ships a minimal quantity input so the Order Summary right rail has
// something to react to during shell-testing.

import { StepShell, PlaceholderBody } from './_StepShell'
import type { ProductionState } from '../types'

interface Props {
  state: ProductionState
  onChange: (patch: Partial<ProductionState>) => void
}

export function ProductionStep({ state, onChange }: Props) {
  return (
    <StepShell
      index={2}
      title="Production options"
      subtitle="Choose your run size, substrate, packaging material, and any finishes."
    >
      <div className="space-y-5">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Quantity (units)
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={state.quantity ?? ''}
            onChange={(e) =>
              onChange({
                quantity: e.target.value ? parseInt(e.target.value, 10) : null,
              })
            }
            placeholder="e.g. 500"
            className="mt-1 block w-40 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
          <p className="mt-1 text-[11px] text-ink-500">
            MOQ + per-tier volume discount kicks in once G3 ships the typed
            partner capability schema.
          </p>
        </div>

        <PlaceholderBody>
          <p className="font-medium text-ink-800">G3 fills this in.</p>
          <p className="mt-1 text-[13px]">
            Substrate picker (Matte / Glossy / Textured / Clear / Recycled
            kraft / …), packaging material picker (conditional on packaging
            topology), Finishes picker reading PartnerFinish rows. Each option
            mutates the live Order Summary with a &ldquo;this choice
            ±$X.XX&rdquo; microcopy line.
          </p>
        </PlaceholderBody>
      </div>
    </StepShell>
  )
}
