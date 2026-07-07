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

  // PT-2 (docs/PARTNER_TIER_VS_MERIT.md decision C): partner tiers are EARNED via
  // the Merit Engine, not purchased. Show the Merit commission by badge and drop
  // the "price" framing on partner cards. tierOrder 0/1/2 → Verified/Trusted/Premier.
  const meritPolicy = await prisma.meritPolicy.findUnique({ where: { id: 1 } }).catch(() => null)
  const meritFeeByOrder: (number | undefined)[] = [
    meritPolicy?.verifiedFeeBps,
    meritPolicy?.trustedFeeBps,
    meritPolicy?.premierFeeBps,
  ]

  if (plans.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50/40 p-8 text-center">
        <p className="text-sm font-medium text-ink-900">No plans seeded yet.</p>
        <p className="mt-1 text-[12.5px] text-ink-500">
          Run{' '}
          <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[11px]">
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
      <PlanSection
        title="Partner plans"
        subtitle="Earned through the Merit Engine — not purchased. Each badge unlocks the commission below plus its perks."
        plans={partners as never[]}
        meritFeeByOrder={meritFeeByOrder}
      />
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

function PlanSection({
  title,
  subtitle,
  plans,
  meritFeeByOrder,
}: {
  title: string
  subtitle?: string
  plans: PlanRow[]
  meritFeeByOrder?: (number | undefined)[]
}) {
  if (plans.length === 0) return null
  return (
    <section>
      <h2 className="text-[16px] font-semibold text-ink-900">{title}</h2>
      {subtitle && <p className="mb-3 mt-0.5 text-[12.5px] text-ink-500">{subtitle}</p>}
      <div className={subtitle ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} meritFeeBps={meritFeeByOrder?.[p.tierOrder]} />
        ))}
      </div>
    </section>
  )
}

function feePct(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`
}

function PlanCard({ plan, meritFeeBps }: { plan: PlanRow; meritFeeBps?: number }) {
  const isPartner = plan.audience === 'PARTNER'
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
          : 'border-ink-200')
      }
    >
      <header className="flex items-center justify-between gap-3 border-b border-ink-100 bg-[#FAF8F2] px-5 py-3">
        <div>
          <div className="text-[14px] font-semibold text-ink-900">{plan.tierName}</div>
          <div className="font-mono text-[11px] text-ink-400">{plan.code}</div>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
          {isPartner ? 'Earned' : isHighlight ? 'Recommended' : `Tier ${plan.tierOrder}`}
        </span>
      </header>

      <div className="px-5 py-4">
        {isPartner ? (
          // Earned badge — no purchase price. Show the Merit commission for this badge.
          <div>
            <div className="font-display text-[26px] font-bold leading-none tracking-tight text-ink-900">
              {meritFeeBps != null ? feePct(meritFeeBps) : productionFee?.ratePercent != null ? `${Number(productionFee.ratePercent.toString()).toFixed(2)}%` : '—'}
              <span className="ml-1.5 text-[12px] font-normal text-ink-500">commission</span>
            </div>
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-semibold text-pink-700">
              Earned by standing{meritFeeBps != null ? ' · Merit-set' : ''}
            </div>
          </div>
        ) : (
          <>
            <div className="font-display text-[28px] font-bold leading-none tracking-tight text-ink-900">
              ${monthly.toFixed(0)}
              <span className="ml-1 text-[12px] font-normal text-ink-500">/ month</span>
            </div>
            {productionFee?.ratePercent != null && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-[11.5px] text-ink-700">
                Platform fee{' '}
                <span className="font-semibold text-ink-900">
                  · {Number(productionFee.ratePercent.toString()).toFixed(2)}%
                </span>
              </div>
            )}
          </>
        )}

        <div className="mt-4 border-t border-dashed border-ink-200 pt-3">
          <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">
            {isPartner ? 'Perks unlocked' : 'Features'}
          </h3>
          <dl className="space-y-1.5 text-[12.5px]">
            {plan.features.map((f) => (
              <FeatureRow key={f.id} feature={f} />
            ))}
            {plan.features.length === 0 && (
              <p className="text-ink-400">No features configured.</p>
            )}
          </dl>
        </div>
      </div>

      <footer className="flex justify-end gap-2 border-t border-ink-100 bg-ink-50 px-5 py-2.5">
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
      <dt className="truncate text-ink-700" title={feature.description ?? undefined}>
        {feature.label}
      </dt>
      <dd className="font-medium tabular-nums">
        {feature.boolValue !== null ? (
          feature.boolValue ? (
            <Check className="h-3.5 w-3.5 text-success-700" aria-label="Yes" />
          ) : (
            <X className="h-3.5 w-3.5 text-ink-400" aria-label="No" />
          )
        ) : feature.intValue !== null ? (
          <span className="text-ink-900">{feature.intValue}</span>
        ) : feature.stringValue !== null ? (
          <span className="text-ink-900">{feature.stringValue}</span>
        ) : (
          // All three null = unlimited
          <InfinityIcon className="h-3.5 w-3.5 text-ink-700" aria-label="Unlimited" />
        )}
      </dd>
    </div>
  )
}
