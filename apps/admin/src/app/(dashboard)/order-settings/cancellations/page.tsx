import { RotateCcw } from 'lucide-react'
import { getOrderSettings } from '../actions'
import { CancellationsForm } from '../OrderSettingsForms'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cancellations & Refunds — Admin' }

export default async function OrderCancellationsPage() {
  const settings = await getOrderSettings()
  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-4">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700"><RotateCcw className="h-3 w-3" /> Order settings</p>
        <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">Cancellations &amp; Refunds</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
          Cancellation windows + fees, refund retention, the dispute window, and partner-strike policy. Most knobs
          are recorded now and enforced as the cancel / refund / strike flows ship.
        </p>
      </header>
      <CancellationsForm initial={settings} />
    </div>
  )
}
