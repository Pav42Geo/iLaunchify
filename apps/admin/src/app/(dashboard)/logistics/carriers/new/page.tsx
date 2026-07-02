// New CarrierServiceRule page (Phase L2). Guarded like the logistics-gates
// page — requireCapability('platform:admin'); the server actions repeat the
// same fence (the page guard is UX, the action guard is the fence).

import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { CarrierRuleForm } from '../CarrierRuleForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New carrier rule — Admin' }

export default async function NewCarrierRulePage() {
  await requireCapability('platform:admin')

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Logistics · Carrier rail"
        title="New carrier rule"
        description="Add a carrier-service row to the eligibility matrix. Storage classes are a HARD filter (never traded for cost); priority orders the fallback chain within an eligible set."
      />
      <CarrierRuleForm />
    </div>
  )
}
