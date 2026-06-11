import { Truck } from 'lucide-react'
import { getOrderSettings } from '../actions'
import { ShippingForm } from '../OrderSettingsForms'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Shipping & Fulfillment — Admin' }

export default async function OrderShippingPage() {
  const settings = await getOrderSettings()
  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-ink-200 bg-[#F3EFE8] px-6 py-6">
        <div className="flex items-center gap-2 text-pink-700">
          <Truck className="h-5 w-5" />
          <span className="text-[11px] font-semibold uppercase tracking-widest">Order settings</span>
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink-900">Shipping &amp; Fulfillment</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">Flat-rate shipping, free-shipping threshold, and production defaults like MOQ.</p>
      </header>
      <ShippingForm initial={settings} />
    </div>
  )
}
