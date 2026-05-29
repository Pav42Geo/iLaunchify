'use client'

// Step 6 — Make it viral. V1 ships the "coming next" empty state per spec
// §8.6. V2 brings the AI generators (social post, video, ad poster).

import { StepShell, PlaceholderBody } from './_StepShell'
import type { ViralState } from '../types'

interface Props {
  state: ViralState
  onChange: (patch: Partial<ViralState>) => void
}

export function ViralStep({ state: _state, onChange: _onChange }: Props) {
  return (
    <StepShell
      index={6}
      title="Make your product viral"
      subtitle="Coming next — AI-generated social post, short product video, ad poster."
    >
      <PlaceholderBody>
        <p className="font-medium text-ink-800">V2 lights this up.</p>
        <p className="mt-1 text-[13px]">
          We&apos;ll use your brand identity (logos, colors, fonts, tagline)
          plus this design as context, then generate launch-ready assets that
          slot directly into your channels. Each generation consumes one AI
          credit from your subscription.
        </p>
        <p className="mt-2 text-[13px]">
          Skip for now and hit Next.
        </p>
      </PlaceholderBody>
    </StepShell>
  )
}
