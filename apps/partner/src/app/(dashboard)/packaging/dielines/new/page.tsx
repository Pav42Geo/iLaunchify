// Slice C9 Phase 1 — new packaging dieline. After save, returns to the list.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { loadDielinesContext } from '../data'
import { DielineForm } from '../DielineForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Add dieline — iLaunchify Partners' }

export default async function NewDielinePage() {
  const ctx = await loadDielinesContext()
  if (!ctx) return null

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/packaging/dielines"
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dielines
        </Link>
        <h1 className="text-ui-title">Add dieline</h1>
        <p className="mt-1 text-ui-body text-ink-500">
          Pick a container and decoration method, upload the source artwork, and enter the cut
          dimensions.
        </p>
      </header>

      <DielineForm mode="create" services={ctx.services} packagingTypes={ctx.packagingTypes} />
    </div>
  )
}
