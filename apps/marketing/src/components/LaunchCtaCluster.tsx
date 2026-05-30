'use client'

// REBUILD R5 + R4 — primary CTA cluster on the marketplace product
// detail page. Calls the launch server action with the current
// selection; on success hard-navigates to the cross-app Design
// Studio URL.
//
// R4: when the action reports `GUEST`, we open the inline
// GuestGateModal instead of bouncing to /signup. The modal collects
// the minimum signup fields and runs the signup → sign-in → create
// product → canvas chain in one round-trip.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@ilaunchify/ui'
import { startLaunchFromTemplate } from '@/lib/launch-actions'
import { GuestGateModal } from './GuestGateModal'

interface Props {
  templateSlug: string
  templateName: string
  flavorId: string
  sizeKey: string
  packagingId: string
  quantity: number
  /** Unused by the visible label — kept for analytics + future tier
   *  variants. Both guests and authed creators see "Start Launching"
   *  on the CTA per Pavel. */
  isAuthenticated: boolean
}

export function LaunchCtaCluster({
  templateSlug,
  templateName,
  flavorId,
  sizeKey,
  packagingId,
  quantity,
  isAuthenticated: _isAuthenticated,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [guestGateOpen, setGuestGateOpen] = useState(false)

  function onLaunchClick() {
    setError(null)
    startTransition(async () => {
      const result = await startLaunchFromTemplate({
        templateSlug,
        flavor: flavorId,
        size: sizeKey,
        packaging: packagingId,
        quantity,
      })
      if (result.ok) {
        window.location.href = result.url
        return
      }
      if (result.reason === 'GUEST') {
        // R4: open inline modal instead of bouncing to /signup so
        // the selection sticks through account creation.
        setGuestGateOpen(true)
        return
      }
      if (result.reason === 'NO_BRAND') {
        setError(
          "You don't have a brand set up yet. Visit your dashboard to create one.",
        )
        return
      }
      if (result.reason === 'TEMPLATE_NOT_FOUND' || result.reason === 'NO_VARIANT') {
        setError(
          'This template isn\'t available for launch yet. Try a different one or contact support.',
        )
        return
      }
      setError(result.message ?? 'Something went wrong. Please try again.')
    })
  }

  return (
    <div className="mt-1 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="md"
          onClick={onLaunchClick}
          disabled={isPending}
        >
          {isPending ? 'Setting up your design…' : 'Start Launching'}
        </Button>
        <Button asChild variant="secondary" size="md">
          <Link href={`/products/sample?template=${templateSlug}`}>
            Order sample
          </Link>
        </Button>
      </div>
      {error && (
        <p className="text-[12px] font-medium text-pink-700">{error}</p>
      )}

      <GuestGateModal
        open={guestGateOpen}
        onClose={() => setGuestGateOpen(false)}
        templateName={templateName}
        launch={{
          templateSlug,
          flavor: flavorId,
          size: sizeKey,
          packaging: packagingId,
          quantity,
        }}
      />
    </div>
  )
}
