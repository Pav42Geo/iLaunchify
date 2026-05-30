// REBUILD R15.e — admin per-plan editor.
//
// One page per SubscriptionPlan (creator_maker / partner_trusted / etc.)
// with three editable sections:
//   1. Pricing — monthly/annual cents + description.
//   2. Features — every PlanFeature row, inline-editable based on its
//      tagged-union value type (int / string / bool).
//   3. Fee rules — every FeeRule row keyed by triggerEvent.
//
// Each save fires a server action that audit-logs + invalidates the
// plans cache.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { PlanPricingForm } from './PlanPricingForm'
import { PlanFeaturesEditor } from './PlanFeaturesEditor'
import { PlanFeeRulesEditor } from './PlanFeeRulesEditor'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ code: string }>
}

export default async function PlanEditorPage({ params }: PageProps) {
  await requireRole(['ADMIN'])
  const { code } = await params

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { code },
    include: {
      features: { orderBy: { label: 'asc' } },
      feeRules: { orderBy: { triggerEvent: 'asc' } },
    },
  })
  if (!plan) notFound()

  return (
    <div className="space-y-6">
      <Link
        href="/tiers?tab=plans"
        className="inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> All plans
      </Link>

      <header className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
          {plan.audience === 'CREATOR' ? 'Creator plan' : 'Partner plan'}
        </div>
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-zinc-900">
          {plan.tierName}
        </h1>
        <p className="mt-0.5 font-mono text-[11px] text-zinc-400">{plan.code}</p>
      </header>

      <PlanPricingForm
        planCode={plan.code}
        monthlyPriceCents={plan.monthlyPriceCents}
        annualPriceCents={plan.annualPriceCents}
        description={plan.description}
      />

      <PlanFeaturesEditor
        features={plan.features.map((f) => ({
          id: f.id,
          code: f.code,
          label: f.label,
          description: f.description,
          intValue: f.intValue,
          stringValue: f.stringValue,
          boolValue: f.boolValue,
        }))}
      />

      <PlanFeeRulesEditor
        rules={plan.feeRules.map((r) => ({
          id: r.id,
          triggerEvent: r.triggerEvent,
          ratePercent: r.ratePercent ? Number(r.ratePercent.toString()) : null,
          flatCents: r.flatCents,
          minCents: r.minCents,
          maxCents: r.maxCents,
          notes: r.notes,
          active: r.active,
        }))}
      />
    </div>
  )
}
