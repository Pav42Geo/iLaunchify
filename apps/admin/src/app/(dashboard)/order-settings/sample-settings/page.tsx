// Sample policy — lives under Order Settings for consistency with its siblings
// (Pavel 2026-06-11). Reuses the existing form + actions from the original
// /sample-settings route (which now redirects here).

import { getSampleSettings } from '../../sample-settings/actions'
import { SampleSettingsForm } from '../../sample-settings/SampleSettingsForm'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sample Policy — Admin' }

export default async function OrderSampleSettingsPage() {
  const settings = await getSampleSettings()
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Order settings"
        title="Sample Policy"
        description="Platform-wide constraints for pre-production samples. Changes apply to new sample orders and credit calculations — no deploy needed."
      />

      <SampleSettingsForm initial={settings} />
    </div>
  )
}
