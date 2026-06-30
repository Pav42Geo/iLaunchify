'use client'

// REBUILD R5 — primary CTA cluster on the marketplace product detail
// page. Calls the launch server action with the current selection.
//
// Routing (Pavel 2026-06-22):
//   - ok            → hard-nav to the cross-app Design Studio URL.
//   - GUEST         → hard-nav to the REAL creator /signup page, with the
//                     product selection preserved in the query string. The
//                     inline "quick account" modal is retired: new users must
//                     finish account setup (payment etc.) before the build
//                     flow, or they'd design an order they can't complete.
//   - NOT_CREATOR   → inline notice pointing an admin/partner account to the
//                     creator login (no signup modal — email already exists).

import { useState, useTransition } from 'react'
import { Button } from '@ilaunchify/ui'
import { startLaunchFromTemplate } from '@/lib/launch-actions'
import { creatorUrl } from '@/lib/app-urls'

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
  /** Slice C8.2 — chosen decoration offering, carried into product creation
   *  so checkout can price the primary container. Null when none picked. */
  decorationMethod?: string | null
  partnerOfferingId?: string | null
  /** Variety-pack model (docs/VARIETY_PACK_MODEL.md, step 4) — the chosen pack
   *  composition. Carried into the AUTHENTICATED launch so the wizard resumes
   *  pre-filled. Null for single-flavor / non-pack products. */
  pack?: {
    packVariantId: string
    unitsPerPack: number
    packCount: number
    slots: Array<{ flavorPresetId: string; units: number }>
  } | null
}

export function LaunchCtaCluster({
  templateSlug,
  flavorId,
  sizeKey,
  packagingId,
  quantity,
  isAuthenticated: _isAuthenticated,
  decorationMethod = null,
  partnerOfferingId = null,
  pack = null,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notCreatorRole, setNotCreatorRole] = useState<string | null>(null)

  function onLaunchClick() {
    setError(null)
    setNotCreatorRole(null)
    startTransition(async () => {
      const result = await startLaunchFromTemplate({
        templateSlug,
        flavor: flavorId,
        size: sizeKey,
        packaging: packagingId,
        quantity,
        ...(decorationMethod
          ? { decorationMethod: decorationMethod as never }
          : {}),
        ...(partnerOfferingId ? { partnerOfferingId } : {}),
        ...(pack ? { pack } : {}),
      })
      if (result.ok) {
        window.location.href = result.url
        return
      }
      if (result.reason === 'GUEST') {
        // No session → send the visitor to the REAL creator sign-up page
        // (Pavel 2026-06-22). New users must set up their account (payment
        // method etc.) before entering the build flow — a quick inline
        // account would let them design an order they can't actually
        // complete. The product selection is preserved in `signupUrl`'s
        // query params (template/flavor/size/packaging/quantity), so once
        // they finish setup the launch resumes straight into the Studio.
        window.location.href = result.signupUrl
        return
      }
      if (result.reason === 'NOT_CREATOR') {
        // Signed in, but on a non-creator account (admin/partner). Launching
        // needs a creator brand — don't show the guest signup modal (the email
        // is already registered). Point them to the creator login instead.
        setNotCreatorRole(result.role)
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
      {/* Single primary CTA. The "Order a sample →" trigger lives in the
          configure box (opens the SampleDrawer) — the duplicate sample button
          that used to sit here was removed in the PDP polish pass. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="md"
          className="w-full"
          onClick={onLaunchClick}
          disabled={isPending}
        >
          {isPending ? 'Setting up your design…' : 'Launch this product'}
        </Button>
      </div>
      {error && (
        <p className="text-[12px] font-medium text-pink-700">{error}</p>
      )}

      {notCreatorRole && (
        <div className="rounded-lg border border-ink-200 bg-ink-50 px-3.5 py-3 text-[12.5px] leading-snug text-ink-700">
          You&rsquo;re signed in with{' '}
          {notCreatorRole === 'ADMIN' ? 'an admin' : 'a partner'} account, which
          can&rsquo;t launch products — only creator accounts have a brand to
          launch under.{' '}
          <a
            href={creatorUrl('/login')}
            className="font-semibold text-pink-700 underline underline-offset-2 hover:text-pink-800"
          >
            Sign in with your creator account
          </a>{' '}
          to continue.
        </div>
      )}
    </div>
  )
}
