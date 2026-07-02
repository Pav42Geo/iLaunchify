// Partner → On-demand requests (CHANNEL_MANAGEMENT_SPEC C2.3). Review queue for
// creator requests to sell a product on-demand: each consumer sale then becomes
// a production order to THIS manufacturer with the approved branding.

import { loadOnDemandRequests } from './actions'
import { OnDemandQueueClient } from './OnDemandQueueClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'On-demand requests — Partners' }

export default async function OnDemandRequestsPage() {
  const { migrated, rows } = await loadOnDemandRequests()
  const pending = rows.filter((r) => r.status === 'REQUESTED' || r.status === 'PARTNER_REVIEW')
  const decided = rows.filter((r) => r.status !== 'REQUESTED' && r.status !== 'PARTNER_REVIEW')

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">On-demand requests</h1>
        <p className="mt-1 text-[13.5px] text-ink-600">
          Creators asking to sell these products on-demand: every consumer sale becomes a production order to you,
          printed and shipped as orders arrive. Approving locks the reviewed branding — the creator can’t change the
          design without a new request.
        </p>
      </div>
      <OnDemandQueueClient pending={pending} decided={decided} migrated={migrated} />
    </div>
  )
}
