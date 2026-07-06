// Partner capability inbox (docs/PRINT_PROVIDER_SELECTION.md §10.2, PS-8c).
// A LABEL_PRINTING partner sees the uncovered specs they were shortlisted for
// and claims the ones they can produce. Claiming pre-fills a DRAFT offering and
// hands off to the existing offering editor; activating that offering verifies
// the claim, restores coverage, and unparks the manufacturer's template.

import { Megaphone } from 'lucide-react'
import { getCapabilityInbox } from './data'
import { CapabilityRequestsClient } from './CapabilityRequestsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Capability requests — iLaunchify Partners' }

export default async function CapabilityRequestsPage() {
  const { labelServiceId, requests } = await getCapabilityInbox()

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-widest text-pink-700">
          <Megaphone className="h-4 w-4" />
          Print production
        </div>
        <h1 className="mt-1 font-display text-[22px] font-bold text-ink-900">Capability requests</h1>
        <p className="mt-1 text-[13px] text-ink-600">
          Open jobs from manufacturers who need printing no active provider covers yet. Claim one
          and it becomes a new offering in your catalog — you set the pricing, we verify, and the
          manufacturer&rsquo;s product goes live.
        </p>
      </header>

      {labelServiceId === null ? (
        <div className="rounded-2xl border border-dashed border-ink-300 bg-white p-10 text-center text-[13px] text-ink-500">
          Capability requests are for print-production services. Add a printing service to your
          account to receive them.
        </div>
      ) : (
        <CapabilityRequestsClient requests={requests} />
      )}
    </div>
  )
}
