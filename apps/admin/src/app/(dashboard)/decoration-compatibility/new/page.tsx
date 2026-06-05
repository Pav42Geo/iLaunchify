// C8 — create a new (container × decoration) compatibility combo.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireRole } from '@ilaunchify/auth'
import { CompatForm } from '../CompatForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Add compatibility combo — Admin' }

export default async function NewCompatibilityPage() {
  await requireRole('ADMIN')
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <Link
          href="/decoration-compatibility"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-600 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Decoration compatibility
        </Link>
        <h1 className="mt-2 font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Add compatibility combo
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Mark a decoration method as valid on a container category. Re-saving an
          existing pair updates it instead of duplicating — the (category, method)
          pair is unique.
        </p>
      </div>

      <CompatForm mode="new" />
    </div>
  )
}
