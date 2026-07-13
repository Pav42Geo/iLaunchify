// Settings → Storage — SUPERSEDED (Pavel 2026-07-13).
// The producer "storage at your facility" offering is edited in ONE place now:
// the Storage card on /services (per-service accordion editors). This route
// redirects so old links and the rail never dead-end. The typed columns
// (offersStorage, classes, dwell, billing, pick/pack fees, on-demand) are the
// same either way — no data moved.

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function StorageSettingsRedirect() {
  redirect('/services')
}
