// Admin → Order Settings → Channel Replenishment (C6.3, spec §3.5a).
// The three knobs behind every creator's Stock & replenishment page and the
// stock-alert notifications: processing buffer, safety stock, target cover.

import { getOrderSettings } from '../actions'
import { ChannelReplenishmentForm } from '../OrderSettingsForms'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Channel Replenishment — Admin' }

export default async function OrderChannelsPage() {
  const settings = await getOrderSettings()
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Order settings"
        title="Channel Replenishment"
        description="Platform-wide inventory-intelligence knobs for channel selling: how reorder points, stock alerts, and suggested reorder quantities are computed."
      />
      <ChannelReplenishmentForm initial={settings} />
    </div>
  )
}
