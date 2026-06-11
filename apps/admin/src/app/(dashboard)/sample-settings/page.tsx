// Legacy route — Sample Policy now lives under Order Settings for consistency
// with its siblings (Pavel 2026-06-11). Redirect to the canonical location.

import { redirect } from 'next/navigation'

export default function SampleSettingsRedirect() {
  redirect('/order-settings/sample-settings')
}
