// Slice C8 — new packaging offering. After save, returns to the offerings list.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { loadOfferingsContext } from '../data'
import { OfferingForm } from '../OfferingForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Add offering — iLaunchify Partners' }

export default async function NewOfferingPage() {
  const ctx = await loadOfferingsContext()
  if (!ctx) return null

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/packaging/offerings"
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to offerings
        </Link>
        <h1 className="text-ui-title">Add offering</h1>
        <p className="mt-1 text-ui-body text-ink-500">
          Declare a container type, a compatible decoration method, and your pricing.
        </p>
      </header>

      <OfferingForm
        mode="create"
        services={ctx.services}
        packagingTypes={ctx.packagingTypes}
        dielines={ctx.dielines}
      />
    </div>
  )
}
