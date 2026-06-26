// C8 — create a new (container × decoration) compatibility combo.

import { requireRole } from '@ilaunchify/auth'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
import { CompatForm } from '../CompatForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Add compatibility combo — Admin' }

export default async function NewCompatibilityPage() {
  await requireRole('ADMIN')
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AdminDetailHeader
        backHref="/decoration-compatibility"
        backLabel="Decoration compatibility"
        title="Add compatibility combo"
        meta={
          <>
            Mark a decoration method as valid on a container category. Re-saving an
            existing pair updates it instead of duplicating — the (category, method)
            pair is unique.
          </>
        }
      />

      <CompatForm mode="new" />
    </div>
  )
}
