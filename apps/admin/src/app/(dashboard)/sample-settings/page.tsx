// Admin sample-policy settings (Pavel 2026-06-11) — the global knobs for
// pre-production samples. Cream-hero header (v2 admin pattern) + a grouped
// settings form. The createSampleOrder action, production-checkout credit
// consumption, marketplace gating, and webhook mint read from this singleton.

import { Beaker } from 'lucide-react'
import { getSampleSettings } from './actions'
import { SampleSettingsForm } from './SampleSettingsForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sample settings — Admin' }

export default async function SampleSettingsPage() {
  const settings = await getSampleSettings()
  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-ink-200 bg-[#F3EFE8] px-6 py-6">
        <div className="flex items-center gap-2 text-pink-700">
          <Beaker className="h-5 w-5" />
          <span className="text-[11px] font-semibold uppercase tracking-widest">Samples</span>
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink-900">Sample policy settings</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Platform-wide constraints for pre-production samples. Changes apply to new sample orders and credit
          calculations — no deploy needed.
        </p>
      </header>

      <SampleSettingsForm initial={settings} />
    </div>
  )
}
