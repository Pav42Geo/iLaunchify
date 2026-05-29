'use client'

// Step 1 — Review design. Stubbed for G1; G2 brings the 2D/3D preview +
// design checklist + empty-text detection.

import Link from 'next/link'
import { StepShell, PlaceholderBody } from './_StepShell'
import type { ReviewState } from '../types'

interface Props {
  productId: string
  state: ReviewState
  onChange: (patch: Partial<ReviewState>) => void
}

export function ReviewStep({ productId, state, onChange }: Props) {
  return (
    <StepShell
      index={1}
      title="Review your design"
      subtitle="One last look before you commit to a production run."
    >
      <PlaceholderBody>
        <p className="font-medium text-ink-800">G2 will fill this in.</p>
        <p className="mt-1 text-[13px]">
          2D / 3D preview, automated quality checklist (empty text fields, low-
          resolution images, low-contrast text), and a button that bounces back
          to the canvas if anything needs fixing.
        </p>
      </PlaceholderBody>

      <div className="mt-4 flex items-center gap-3 text-sm">
        <Link
          href={`/products/${productId}/design/canvas`}
          onClick={() => onChange({ bouncedToCanvas: true })}
          className="inline-flex items-center rounded-full border border-ink-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink-700 hover:bg-ink-50"
        >
          ← Back to canvas
        </Link>
        <span className="text-xs text-ink-500">
          {state.bouncedToCanvas
            ? 'You already bounced back once.'
            : 'Looks good? Hit Next.'}
        </span>
      </div>
    </StepShell>
  )
}
