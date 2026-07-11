'use client'

// Post-a-brief CTA with the Maker-tier gate (Pavel 2026-07-11).
//
// Co-creation is a Builder / Agency feature (D-CC1). When the creator can post
// (Builder+), the CTA links straight to the brief builder. When they can't
// (Maker), it opens the upgrade modal instead of navigating — the gate lives
// on the CTA, before they ever reach the builder.

import * as React from 'react'
import Link from 'next/link'
import type { CreatorTierPricingInput } from '@ilaunchify/ui'
import { CoCreationUpgradeModal } from '@/components/cocreation/CoCreationUpgradeModal'

const HREF = '/products/new/brief'

export function PostBriefCta({
  canPost,
  label,
  variant = 'primary',
  pricing,
}: {
  canPost: boolean
  label: string
  /** 'primary' = black pill button; 'link' = inline pink text link. */
  variant?: 'primary' | 'link'
  /** Live tier pricing for the upgrade modal (Maker gate). */
  pricing?: CreatorTierPricingInput
}) {
  const [open, setOpen] = React.useState(false)

  const className =
    variant === 'primary'
      ? 'inline-flex items-center rounded-pill bg-ink-900 px-s-5 py-s-3 text-ui-caption font-bold text-white transition hover:-translate-y-px'
      : 'inline-block text-ui-caption font-bold text-pink-700 hover:underline'

  if (canPost) {
    return (
      <Link href={HREF} className={className}>
        {label}
      </Link>
    )
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      <CoCreationUpgradeModal open={open} onClose={() => setOpen(false)} pricing={pricing} />
    </>
  )
}
