// Edit CarrierServiceRule page (Phase L2). Deep-linked from the list page's
// RowActionsMenu (locked pattern: never inline-mutate from the list). Guarded
// like the logistics-gates page — requireCapability('platform:admin'); the
// server actions repeat the same fence.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { CarrierRuleForm, type CarrierRuleFormValues } from '../CarrierRuleForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit carrier rule — Admin' }

interface PageProps {
  params: Promise<{ ruleId: string }>
}

export default async function EditCarrierRulePage({ params }: PageProps) {
  await requireCapability('platform:admin')
  const { ruleId } = await params

  const rule = await prisma.carrierServiceRule.findUnique({ where: { id: ruleId } })
  if (!rule) notFound()

  // JSON column → pretty string for the textarea; {} / null render empty.
  const seasonal =
    rule.seasonalWindowJson && Object.keys(rule.seasonalWindowJson as object).length > 0
      ? JSON.stringify(rule.seasonalWindowJson, null, 2)
      : null

  const initial: CarrierRuleFormValues = {
    carrier: rule.carrier,
    serviceLevel: rule.serviceLevel,
    modes: rule.modes,
    storageClasses: rule.storageClasses,
    hazmatAllowed: rule.hazmatAllowed,
    maxWeightLb: rule.maxWeightLb,
    maxTransitDays: rule.maxTransitDays,
    groundOnly: rule.groundOnly,
    seasonalWindowJson: seasonal,
    priority: rule.priority,
    active: rule.active,
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Logistics · Carrier rail"
        title={`${rule.carrier} · ${rule.serviceLevel}`}
        description="Edit this eligibility-matrix row. Changes apply to the next quote — already-booked shipments keep the rate they bought."
        actions={
          <Link
            href={`/audit?entityType=LogisticsSetting&entityId=${rule.id}`}
            className="inline-flex h-9 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Audit history
          </Link>
        }
      />
      <CarrierRuleForm ruleId={rule.id} initial={initial} />
    </div>
  )
}
