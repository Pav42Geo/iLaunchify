import { getOrderSettings } from '../actions'
import { ShippingForm } from '../OrderSettingsForms'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Shipping & Fulfillment — Admin' }

export default async function OrderShippingPage() {
  const settings = await getOrderSettings()
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Order settings"
        title="Shipping & Fulfillment"
        description="Flat-rate shipping, free-shipping threshold, and production defaults like MOQ."
      />
      <ShippingForm initial={settings} />
    </div>
  )
}
