import { DollarSign } from 'lucide-react'
import { getOrderSettings } from '../actions'
import { FeesForm } from '../OrderSettingsForms'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Fees & Commissions — Admin' }

export default async function OrderFeesPage() {
  const settings = await getOrderSettings()
  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700"><DollarSign className="h-3 w-3" /> Order settings</p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">Fees &amp; Commissions</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">iLaunchify&rsquo;s platform commission on creator orders. Applies to new orders — no deploy needed.</p>
      </header>
      <FeesForm initial={settings} />
    </div>
  )
}
