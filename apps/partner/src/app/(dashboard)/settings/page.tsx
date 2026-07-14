// Settings hub retired (Pavel 2026-07-13) — the rail merged into the main
// sidebar and every destination is one click away; status pills live on the
// Dashboard. /settings lands on the first Business destination.
import { redirect } from 'next/navigation'

export default function SettingsHubRedirect() {
  redirect('/settings/company')
}
