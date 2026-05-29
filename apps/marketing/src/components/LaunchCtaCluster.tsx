'use client'

// REBUILD R5 — primary CTA cluster on the marketplace product detail
// page. Calls the launch server action with the current selection,
// shows a quick error inline if anything goes wrong, otherwise hard-
// navigates to the cross-app Design Studio URL.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@ilaunchify/ui'
import { startLaunchFromTemplate } from '@/lib/launch-actions'

interface Props {
  templateSlug: string
  flavorId: string
  sizeKey: string
  packagingId: string
  quantity: number
  isAuthenticated: boolean
}

export function LaunchCtaCluster({
  templateSlug,
  flavorId,
  sizeKey,
  packagingId,
  quantity,
  isAuthenticated,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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
        window.location.href = result.signupUrl
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
          {isPending
            ? 'Setting up your design…'
            : isAuthenticated
              ? 'Open in Design Studio'
              : 'Start launching'}
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
    </div>
  )
}
