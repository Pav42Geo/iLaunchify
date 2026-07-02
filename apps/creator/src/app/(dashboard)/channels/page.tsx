// Creator → Channels — the sales-channel hub (CHANNEL_MANAGEMENT_SPEC §3.4, C0).
// Connect the stores you sell on; products push from each product's Sell tab,
// consumer orders flow into /orders. C0 ships the stub connect flow end-to-end;
// real OAuth lands per channel phase (C1 Shopify → C3 TikTok → C4 Amazon → C5).

import { loadChannelsHub } from './actions'
import { ChannelsHubClient } from './ChannelsHubClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Channels — iLaunchify' }

export default async function ChannelsPage() {
  const data = await loadChannelsHub()
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">Channels</h1>
        <p className="mt-1 text-[13.5px] text-ink-600">
          Connect the stores you sell on. Push products from each product’s <span className="font-semibold">Sell</span>{' '}
          tab; consumer orders flow into your Orders inbox and route to production automatically.
        </p>
      </div>
      <ChannelsHubClient initial={data} />
    </div>
  )
}
