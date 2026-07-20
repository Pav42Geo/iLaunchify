// /services/manufacturing — the dedicated manufacturing builder page (co-pack model,
// 2026-07-20). Renders the full 6-step wizard; the builder's first child is the full-bleed
// co-creation stepper (direct grid child), and it carries its own Back-to-services link.

import Link from 'next/link'
import { requireUser } from '@ilaunchify/auth'
import { loadManufacturingBuilderInitial } from './load-initial'
import { ManufacturingServiceBuilder } from './ManufacturingServiceBuilder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Manufacturing builder — Partners' }

export default async function ManufacturingBuilderPage() {
  const user = await requireUser()
  const initial = await loadManufacturingBuilderInitial(user.id)

  if (!initial) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-ink-300 bg-white p-8 text-center">
        <h1 className="font-display text-[18px] font-bold text-ink-900">No manufacturing service yet</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-ink-500">
          Add the manufacturing service from your Services page first, then build out your batches and floors here.
        </p>
        <Link href="/services" className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-black">Go to Services</Link>
      </div>
    )
  }

  return <ManufacturingServiceBuilder initial={initial} />
}
