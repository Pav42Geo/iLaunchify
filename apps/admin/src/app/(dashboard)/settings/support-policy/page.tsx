import { requireCapability } from '@ilaunchify/auth'
import { getSupportSettings } from '@ilaunchify/db'
import { SupportPolicyForm } from './SupportPolicyForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Support Policy — Admin' }

export default async function SupportPolicyPage() {
  await requireCapability('tickets:admin')
  const settings = await getSupportSettings()

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-7 py-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900">Support Policy</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          How a creator&apos;s subscription tier shapes a new support ticket: the first-response SLA
          target and the minimum priority it lands at. Seeded from the platform plan (Maker 48h ·
          Builder 24h · Agency 4h). Partners are intentionally excluded — their tier is shown for
          context but never auto-prioritizes a ticket.
        </p>
      </div>

      <SupportPolicyForm initial={settings} />
    </div>
  )
}
