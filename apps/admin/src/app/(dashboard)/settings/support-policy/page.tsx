import { requireCapability } from '@ilaunchify/auth'
import { getSupportSettings } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { SupportPolicyForm } from './SupportPolicyForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Support Policy — Admin' }

export default async function SupportPolicyPage() {
  await requireCapability('tickets:admin')
  const settings = await getSupportSettings()

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Support Policy"
        description={
          <>
            How a creator&apos;s subscription tier shapes a new support ticket: the first-response SLA
            target and the minimum priority it lands at. Seeded from the platform plan (Maker 48h ·
            Builder 24h · Agency 4h). Partners are intentionally excluded — their tier is shown for
            context but never auto-prioritizes a ticket.
          </>
        }
      />

      <SupportPolicyForm initial={settings} />
    </div>
  )
}
