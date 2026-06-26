import { Truck } from 'lucide-react'
import { getOrderSettings } from '../actions'
import { ShippingForm } from '../OrderSettingsForms'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Shipping & Fulfillment — Admin' }

export default async function OrderShippingPage() {
  const settings = await getOrderSettings()
  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-4">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700"><Truck className="h-3 w-3" /> Order settings</p>
        <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">Shipping &amp; Fulfillment</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">Flat-rate shipping, free-shipping threshold, and production defaults like MOQ.</p>
      </header>
      <ShippingForm initial={settings} />
    </div>
  )
}
