// Admin — Packaging catalog review (docs/PACKAGING_REVIEW.md). Partners submit
// custom packaging from the Packaging Studio "My" tab; admin approves into an
// ACTIVE PackagingType (Library catalog) + assigns a category, or rejects.

import { requireRole } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { loadPackagingReviewQueue } from './actions'
import { ReviewQueue } from './ReviewQueue'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Packaging review — iLaunchify Admin' }

export default async function PackagingReviewPage() {
  await requireRole('ADMIN')
  const queue = await loadPackagingReviewQueue().catch(() => [])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Packaging review"
        description={
          <>
            Partner-submitted custom packaging awaiting approval into the Library catalog. Approve to create an ACTIVE
            packaging type (then add 3D/2D mockups in <b>Product Mockups</b>), or reject with a note.
          </>
        }
      />

      <ReviewQueue initial={queue} />
    </div>
  )
}
