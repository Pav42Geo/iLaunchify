// Sample policy — lives under Order Settings for consistency with its siblings
// (Pavel 2026-06-11). Reuses the existing form + actions from the original
// /sample-settings route (which now redirects here).

import { Beaker } from 'lucide-react'
import { getSampleSettings } from '../../sample-settings/actions'
import { SampleSettingsForm } from '../../sample-settings/SampleSettingsForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sample Policy — Admin' }

export default async function OrderSampleSettingsPage() {
  const settings = await getSampleSettings()
  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500"><Beaker className="h-3 w-3" /> Order settings</p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">Sample Policy</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Platform-wide constraints for pre-production samples. Changes apply to new sample orders and credit
          calculations — no deploy needed.
        </p>
      </header>

      <SampleSettingsForm initial={settings} />
    </div>
  )
}
