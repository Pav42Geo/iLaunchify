import { getOrderSettings } from '../actions'
import { RoutingForm } from '../OrderSettingsForms'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Partner Routing — Admin' }

export default async function OrderRoutingPage() {
  const settings = await getOrderSettings()
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Order settings"
        title="Partner Routing & Dispatch"
        description="Accept windows, reroute limits, auto-cancel timing, and how partners are scored for a dispatch."
      />
      <RoutingForm initial={settings} />
    </div>
  )
}
