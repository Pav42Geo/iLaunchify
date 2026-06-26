import { getOrderSettings } from '../actions'
import { CancellationsForm } from '../OrderSettingsForms'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cancellations & Refunds — Admin' }

export default async function OrderCancellationsPage() {
  const settings = await getOrderSettings()
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Order settings"
        title="Cancellations & Refunds"
        description="Cancellation windows + fees, refund retention, the dispute window, and partner-strike policy. Most knobs are recorded now and enforced as the cancel / refund / strike flows ship."
      />
      <CancellationsForm initial={settings} />
    </div>
  )
}
