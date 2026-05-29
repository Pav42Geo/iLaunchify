'use client'

// Step 5 — Accessories. V1 ships the "coming next" empty state per spec
// §8.5. V2 brings the per-packaging-topology suggestion engine.

import { StepShell, PlaceholderBody } from './_StepShell'
import type { AccessoriesState } from '../types'

interface Props {
  state: AccessoriesState
  onChange: (patch: Partial<AccessoriesState>) => void
}

export function AccessoriesStep({ state: _state, onChange: _onChange }: Props) {
  return (
    <StepShell
      index={5}
      title="Accessories"
      subtitle="Coming next — neck tags, shrink sleeves, tissue paper, thank-you cards."
    >
      <PlaceholderBody>
        <p className="font-medium text-ink-800">V2 lights this up.</p>
        <p className="mt-1 text-[13px]">
          A dynamic catalog of add-ons keyed to your packaging topology —
          twine + kraft for jars, neck-tags for bottles, ribbon for boxes —
          surfaces the top 6 most-picked accessories. Each adds a line to the
          order summary.
        </p>
        <p className="mt-2 text-[13px]">
          Skip for now and hit Next.
        </p>
      </PlaceholderBody>
    </StepShell>
  )
}
