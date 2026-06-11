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
      <header className="rounded-3xl border border-ink-200 bg-[#F3EFE8] px-6 py-6">
        <div className="flex items-center gap-2 text-pink-700">
          <Beaker className="h-5 w-5" />
          <span className="text-[11px] font-semibold uppercase tracking-widest">Order settings</span>
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink-900">Sample Policy</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Platform-wide constraints for pre-production samples. Changes apply to new sample orders and credit
          calculations — no deploy needed.
        </p>
      </header>

      <SampleSettingsForm initial={settings} />
    </div>
  )
}
