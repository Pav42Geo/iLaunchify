'use client'

// Full-page co-creation gate for the brief builder (deep-link entry).
//
// Shares the exact same upgrade surface as the /briefs CTA — a hero panel with
// context, and a button that opens the shared TierUpgradeModal (via
// CoCreationUpgradeModal). Both entry points now render one modal; only the
// framing around it differs.

import * as React from 'react'
import type { CreatorTierPricingInput } from '@ilaunchify/ui'
import { CoCreationUpgradeModal } from './CoCreationUpgradeModal'

export function CoCreationUpgradePanel({ pricing }: { pricing?: CreatorTierPricingInput }) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-ink-200 bg-white p-10 text-center">
      <div className="text-4xl">🤝</div>
      <h1 className="mt-3 font-display text-ui-title">Co-create with a manufacturer</h1>
      <p className="mt-2 text-ui-body text-ink-500">
        Post your own product brief — a recipe or just an idea — and get it formulated, branded, and
        produced by a matched, verified maker. Co-creation briefs are included in the <b>Builder</b>{' '}
        and <b>Agency</b> plans.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 inline-flex items-center justify-center rounded-full bg-ink-900 px-6 py-3 text-ui-body font-semibold text-white transition hover:-translate-y-px hover:bg-black"
      >
        See plans &amp; upgrade →
      </button>
      <CoCreationUpgradeModal open={open} onClose={() => setOpen(false)} pricing={pricing} />
    </div>
  )
}
