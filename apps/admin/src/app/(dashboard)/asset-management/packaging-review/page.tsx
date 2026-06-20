// Admin — Packaging catalog review (docs/PACKAGING_REVIEW.md). Partners submit
// custom packaging from the Packaging Studio "My" tab; admin approves into an
// ACTIVE PackagingType (Library catalog) + assigns a category, or rejects.

import { requireRole } from '@ilaunchify/auth'
import { loadPackagingReviewQueue } from './actions'
import { ReviewQueue } from './ReviewQueue'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Packaging review — iLaunchify Admin' }

export default async function PackagingReviewPage() {
  await requireRole('ADMIN')
  const queue = await loadPackagingReviewQueue().catch(() => [])

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-[#F3EFE8] px-7 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900">Packaging review</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          Partner-submitted custom packaging awaiting approval into the Library catalog. Approve to create an ACTIVE
          packaging type (then add 3D/2D mockups in <b>Product Mockups</b>), or reject with a note.
        </p>
      </div>

      <ReviewQueue initial={queue} />
    </div>
  )
}
