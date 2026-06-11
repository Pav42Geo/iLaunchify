import { DollarSign } from 'lucide-react'
import { getOrderSettings } from '../actions'
import { FeesForm } from '../OrderSettingsForms'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Fees & Commissions — Admin' }

export default async function OrderFeesPage() {
  const settings = await getOrderSettings()
  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-ink-200 bg-[#F3EFE8] px-6 py-6">
        <div className="flex items-center gap-2 text-pink-700">
          <DollarSign className="h-5 w-5" />
          <span className="text-[11px] font-semibold uppercase tracking-widest">Order settings</span>
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink-900">Fees &amp; Commissions</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">iLaunchify&rsquo;s platform commission on creator orders. Applies to new orders — no deploy needed.</p>
      </header>
      <FeesForm initial={settings} />
    </div>
  )
}
