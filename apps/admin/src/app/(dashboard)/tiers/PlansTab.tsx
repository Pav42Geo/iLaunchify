// REBUILD R15.c — Plans & Fees tab in admin Tiers module.
//
// Card grid: 3 creator plans then 3 partner plans, each with price,
// commission, and a digest of every PlanFeature row (with int / bool /
// string value rendered appropriately). Each card has an Edit link to
// the dedicated /tiers/plan/[code] page (R15.e).

import Link from 'next/link'
import { Check, X, Infinity as InfinityIcon } from 'lucide-react'
import { prisma } from '@ilaunchify/db'

export async function PlansTab() {
  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: [{ audience: 'asc' }, { tierOrder: 'asc' }],
    include: {
      features: { orderBy: { code: 'asc' } },
      feeRules: { where: { active: true }, orderBy: { triggerEvent: 'asc' } },
    },
  })

  const creators = plans.filter((p) => p.audience === 'CREATOR')
  const partners = plans.filter((p) => p.audience === 'PARTNER')

  if (plans.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 p-8 text-center">
        <p className="text-sm font-medium text-zinc-900">No plans seeded yet.</p>
        <p className="mt-1 text-[12.5px] text-zinc-500">
          Run{' '}
          <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px]">
            pnpm --filter @ilaunchify/db seed:subscription-plans
          </code>{' '}
          to populate the 6 baseline rows from PLATFORM_SPEC §Tier 1.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PlanSection title="Creator plans" plans={creators as never[]} />
      <PlanSection title="Partner plans" plans={partners as never[]} />
    </div>
  )
}

interface PlanRow {
  id: string
  code: string
  audience: 'CREATOR' | 'PARTNER'
  tierName: string
  tierOrder: number
  monthlyPriceCents: number
  annualPriceCents: number
  active: boolean
  description: string | null
  features: Array<{
    id: string
    code: string
    label: string
    description: string | null
    intValue: number | null
    stringValue: string | null
    boolValue: boolean | null
  }>
  feeRules: Array<{
    id: string
    triggerEvent: string
    ratePercent: { toString(): string } | null
    flatCents: number | null
    minCents: number | null
    notes: string | null
  }>
}

function PlanSection({ title, plans }: { title: string; plans: PlanRow[] }) {
  if (plans.length === 0) return null
  return (
    <section>
      <h2 className="mb-3 text-[16px] font-semibold text-zinc-900">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </div>
    </section>
  )
}

function PlanCard({ plan }: { plan: PlanRow }) {
  const isHighlight = plan.tierOrder === 1 // Builder / Trusted
  const productionFee = plan.feeRules.find(
    (r) => r.triggerEvent === 'production_order_subtotal',
  )
  const monthly = plan.monthlyPriceCents / 100
  return (
    <article
      className={
        'overflow-hidden rounded-xl border bg-white ' +
        (isHighlight
          ? 'border-pink-200 shadow-[inset_0_0_0_1px_rgb(255,208,224)]'
          : 'border-zinc-200')
      }
    >
      <header className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-[#FAF8F2] px-5 py-3">
        <div>
          <div className="text-[14px] font-semibold text-zinc-900">{plan.tierName}</div>
          <div className="font-mono text-[11px] text-zinc-400">{plan.code}</div>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {isHighlight ? 'Recommended' : `Tier ${plan.tierOrder}`}
        </span>
      </header>

      <div className="px-5 py-4">
        <div className="font-display text-[28px] font-bold leading-none tracking-tight text-zinc-900">
          ${monthly.toFixed(0)}
          <span className="ml-1 text-[12px] font-normal text-zinc-500">/ month</span>
        </div>
        {productionFee?.ratePercent != null && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[11.5px] text-zinc-700">
            {plan.audience === 'CREATOR' ? 'Platform fee' : 'Commission'}{' '}
            <span className="font-semibold text-zinc-900">
              · {Number(productionFee.ratePercent.toString()).toFixed(2)}%
            </span>
          </div>
        )}

        <div className="mt-4 border-t border-dashed border-zinc-200 pt-3">
          <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
            Features
          </h3>
          <dl className="space-y-1.5 text-[12.5px]">
            {plan.features.map((f) => (
              <FeatureRow key={f.id} feature={f} />
            ))}
            {plan.features.length === 0 && (
              <p className="text-zinc-400">No features configured.</p>
            )}
          </dl>
        </div>
      </div>

      <footer className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50 px-5 py-2.5">
        <Link
          href={`/tiers/plan/${plan.code}`}
          className="inline-flex items-center rounded-full bg-pink-500 px-3.5 py-1.5 text-[11.5px] font-semibold text-white hover:bg-pink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
        >
          Edit plan
        </Link>
      </footer>
    </article>
  )
}

function FeatureRow({
  feature,
}: {
  feature: PlanRow['features'][number]
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="truncate text-zinc-700" title={feature.description ?? undefined}>
        {feature.label}
      </dt>
      <dd className="font-medium tabular-nums">
        {feature.boolValue !== null ? (
          feature.boolValue ? (
            <Check className="h-3.5 w-3.5 text-emerald-700" aria-label="Yes" />
          ) : (
            <X className="h-3.5 w-3.5 text-zinc-400" aria-label="No" />
          )
        ) : feature.intValue !== null ? (
          <span className="text-zinc-900">{feature.intValue}</span>
        ) : feature.stringValue !== null ? (
          <span className="text-zinc-900">{feature.stringValue}</span>
        ) : (
          // All three null = unlimited
          <InfinityIcon className="h-3.5 w-3.5 text-zinc-700" aria-label="Unlimited" />
        )}
      </dd>
    </div>
  )
}
