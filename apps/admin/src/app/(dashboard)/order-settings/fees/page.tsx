import { getOrderSettings } from '../actions'
import { FeesForm } from '../OrderSettingsForms'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Fees & Commissions — Admin' }

export default async function OrderFeesPage() {
  const settings = await getOrderSettings()
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Order settings"
        title="Fees & Commissions"
        description={<>iLaunchify&rsquo;s platform commission on creator orders. Applies to new orders — no deploy needed.</>}
      />
      <FeesForm initial={settings} />
    </div>
  )
}
