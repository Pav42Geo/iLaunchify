// iLaunchify Plans — the creator plan-upgrade landing (repurposed from the old
// /subscriptions recurring-runs list, 2026-06-26). Research-backed conversion
// page: savings calculator (the hook — higher tiers = lower platform fee), tier
// cards with a highlighted recommended plan, an expandable full comparison, and
// an objection-handling FAQ. Upgrade CTAs reuse the real Stripe flow
// (UpgradeButton → startTierUpgrade). Honest: monthly-only, no fake social proof,
// and the calculator tells you to stay on Maker below break-even.
//
// Plan MANAGEMENT (cancel / resume / billing) stays at /settings/plan.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser, TIER_RANK, normalizeTier } from '@ilaunchify/auth'
import { CREATOR_PLAN_CODES } from '@ilaunchify/plans'
import {
  Sparkles,
  Rocket,
  Crown,
  Check,
  ChevronDown,
  ArrowRight,
  TrendingDown,
  Minus,
} from 'lucide-react'
import { UpgradeButton } from '../settings/plan/PlanActionButtons'
import { PlansSavingsCalculator, type CalcTier } from './PlansSavingsCalculator'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'iLaunchify Plans — iLaunchify' }

type TierKey = 'maker' | 'builder' | 'agency'

// Editorial tier metadata. Prices come from the DB (admin-editable); fee % are
// the real take rates from seed-subscription-plans.ts (Maker 15 / Builder 12 /
// Agency 8). Features lead with the fee — the savings lever — per the research.
const TIERS: ReadonlyArray<{
  key: TierKey
  planCode: string
  name: string
  tagline: string
  feePct: number
  Icon: typeof Sparkles
  recommended?: boolean
  features: string[]
}> = [
  {
    key: 'maker',
    planCode: CREATOR_PLAN_CODES.maker,
    name: 'Maker',
    tagline: 'Test ideas, pay only when you produce.',
    feePct: 0.15,
    Icon: Sparkles,
    features: [
      '15% platform fee on production',
      'Unlimited products & label drafts',
      'Marketplace + partner matching',
      'Standard order routing & tracking',
      '1 brand kit',
    ],
  },
  {
    key: 'builder',
    planCode: CREATOR_PLAN_CODES.builder,
    name: 'Builder',
    tagline: 'For creators running real production.',
    feePct: 0.12,
    Icon: Rocket,
    recommended: true,
    features: [
      'Everything in Maker, plus:',
      '12% platform fee — save 3% on every run',
      'Print-ready Design Studio export',
      'Priority human support on every order',
      'Up to 3 brand kits',
    ],
  },
  {
    key: 'agency',
    planCode: CREATOR_PLAN_CODES.agency,
    name: 'Agency',
    tagline: 'Multi-brand teams & influencer agencies.',
    feePct: 0.08,
    Icon: Crown,
    features: [
      'Everything in Builder, plus:',
      '8% platform fee — our best rate',
      'Unlimited brand kits & multi-brand workspace',
      'Custom domain storefronts',
      'Dedicated launch partner',
    ],
  },
] as const

const COMPARISON: Array<{ label: string; cells: [string, string, string] }> = [
  { label: 'Platform fee on production', cells: ['15%', '12%', '8%'] },
  { label: 'Products & label drafts', cells: ['Unlimited', 'Unlimited', 'Unlimited'] },
  { label: 'Brand kits', cells: ['1', '3', 'Unlimited'] },
  { label: 'Marketplace + partner matching', cells: ['✓', '✓', '✓'] },
  { label: 'Order routing & tracking', cells: ['Standard', 'Standard', 'Standard'] },
  { label: 'Print-ready Studio export', cells: ['—', '✓', '✓'] },
  { label: 'Priority human support', cells: ['—', '✓', 'Dedicated'] },
  { label: 'Custom domain storefronts', cells: ['—', '—', '✓'] },
  { label: 'Launch partner & roadmap input', cells: ['—', '—', '✓'] },
]

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'How does the platform fee work?',
    a: 'We charge a percentage of each production order’s subtotal — 15% on Maker, 12% on Builder, 8% on Agency. Shipping and taxes are excluded. The calculator above shows what the lower fee nets you at your volume.',
  },
  {
    q: 'When does a paid plan pay for itself?',
    a: 'As soon as the fee you save each month exceeds the subscription price. The calculator above computes your exact break-even from your monthly production spend — and if you’re below it, it’ll tell you to stay on Maker.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from Settings → Plan and you keep your tier’s benefits until the end of the current billing period, then drop back to the free Maker plan. No long-term commitment.',
  },
  {
    q: 'Monthly or annual billing?',
    a: 'Plans are billed monthly through Stripe. You can switch tiers at any time.',
  },
  {
    q: 'What if my volume changes month to month?',
    a: 'Upgrade whenever your production grows and the savings kick in. To move down a tier, cancel your current subscription — you’ll drop to the lower plan at the end of the period.',
  },
]

export default async function PlansPage() {
  const user = await requireUser()

  const [profile, plans] = await Promise.all([
    prisma.creatorProfile.findUnique({
      where: { userId: user.id },
      select: { subscriptionTier: true },
    }),
    prisma.subscriptionPlan.findMany({
      where: {
        code: { in: [CREATOR_PLAN_CODES.maker, CREATOR_PLAN_CODES.builder, CREATOR_PLAN_CODES.agency] },
      },
      select: { code: true, monthlyPriceCents: true },
    }),
  ])

  const priceByCode = new Map(plans.map((p) => [p.code, p.monthlyPriceCents]))
  const currentTier = normalizeTier(profile?.subscriptionTier) as TierKey

  const calcTiers: CalcTier[] = TIERS.map((t) => ({
    key: t.key,
    name: t.name,
    feePct: t.feePct,
    monthlyCents: priceByCode.get(t.planCode) ?? 0,
  }))

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">iLaunchify Plans</p>
        <h1 className="mt-1.5 font-display text-[28px] font-bold leading-[1.08] tracking-[-0.02em] text-ink-900">
          Plans that pay for themselves
        </h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-600">
          Every plan unlocks a lower platform fee on production. The more you make, the more you save —
          most creators find a paid plan costs less than it saves. You’re on{' '}
          <span className="font-semibold capitalize text-ink-900">{currentTier}</span> today.
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1 text-[11.5px] font-medium text-ink-600">
          <TrendingDown className="h-3.5 w-3.5 text-success-600" aria-hidden="true" />
          Cancel anytime · billed monthly via Stripe · keep your tier till period end
        </p>
      </div>

      {/* Savings calculator — the hook */}
      <PlansSavingsCalculator tiers={calcTiers} currentTier={currentTier} />

      {/* Tier cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        {TIERS.map((t) => {
          const price = priceByCode.get(t.planCode) ?? 0
          const isCurrent = currentTier === t.key
          const isUpgrade = TIER_RANK[t.key] > TIER_RANK[currentTier]
          return (
            <article
              key={t.key}
              className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white ${
                t.recommended ? 'border-pink-300 shadow-[0_10px_30px_-14px_rgba(255,46,99,0.35)]' : 'border-ink-200'
              }`}
            >
              {t.recommended && (
                <span className="absolute right-4 top-4 rounded-full bg-pink-500 px-2.5 py-[3px] text-[10px] font-semibold uppercase tracking-wider text-white">
                  Most popular
                </span>
              )}
              <div className="px-5 pt-5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-ink-50 text-ink-700">
                  <t.Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <h3 className="mt-3 font-display text-[19px] font-bold text-ink-900">{t.name}</h3>
                <p className="mt-0.5 text-[12.5px] text-ink-500">{t.tagline}</p>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-bold tabular-nums text-ink-900">
                    {price > 0 ? `$${Math.round(price / 100)}` : 'Free'}
                  </span>
                  {price > 0 && <span className="text-[12px] text-ink-500">/ month</span>}
                </div>
              </div>

              {/* CTA at the top, by the price */}
              <div className="px-5 pt-4">
                {isCurrent ? (
                  <Link
                    href="/settings/plan"
                    className="inline-flex h-10 w-full items-center justify-center rounded-full border border-ink-300 bg-white text-[12.5px] font-semibold uppercase tracking-wider text-ink-700 transition hover:bg-ink-100"
                  >
                    Current plan · manage
                  </Link>
                ) : isUpgrade && t.key !== 'maker' ? (
                  <UpgradeButton targetTier={t.key.toUpperCase() as 'BUILDER' | 'AGENCY'} label={`Upgrade to ${t.name}`} />
                ) : (
                  <Link
                    href="/settings/plan"
                    className="inline-flex h-10 w-full items-center justify-center rounded-full border border-ink-200 bg-white text-[12.5px] font-semibold uppercase tracking-wider text-ink-500 transition hover:bg-ink-50"
                  >
                    {t.key === 'maker' ? 'Included' : 'Manage in settings'}
                  </Link>
                )}
                <p className="mt-2 text-center text-[11px] text-ink-400">Cancel anytime</p>
              </div>

              {/* Features */}
              <ul className="mt-4 space-y-1.5 px-5 pb-5 text-[12.5px] text-ink-700">
                {t.features.map((f, i) => {
                  const isHeader = f.endsWith('plus:')
                  return (
                    <li key={i} className={`flex items-start gap-2 ${isHeader ? 'font-semibold text-ink-900' : ''}`}>
                      {!isHeader && (
                        <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-success-600" aria-hidden="true" />
                      )}
                      <span>{f}</span>
                    </li>
                  )
                })}
              </ul>
            </article>
          )
        })}
      </div>

      {/* Full comparison — expandable */}
      <details className="group overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 hover:bg-ink-50/50">
          <span className="font-display text-[15px] font-semibold text-ink-900">Compare every feature</span>
          <ChevronDown className="h-4 w-4 text-ink-500 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="overflow-x-auto border-t border-ink-100">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink-100 bg-[var(--bg-hero)] text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-5 py-3 font-semibold">Feature</th>
                {TIERS.map((t) => (
                  <th key={t.key} className="px-4 py-3 text-center font-semibold text-ink-700">
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr key={i} className="border-b border-ink-50 last:border-0">
                  <td className="px-5 py-2.5 text-ink-700">{row.label}</td>
                  {row.cells.map((c, j) => (
                    <td key={j} className="px-4 py-2.5 text-center tabular-nums text-ink-900">
                      {c === '—' ? (
                        <Minus className="mx-auto h-3.5 w-3.5 text-ink-300" aria-hidden="true" />
                      ) : c === '✓' ? (
                        <Check className="mx-auto h-4 w-4 text-success-600" aria-hidden="true" />
                      ) : (
                        c
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* FAQ */}
      <section>
        <h2 className="mb-2 font-display text-[15px] font-semibold text-ink-900">Questions</h2>
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          {FAQ.map((item, i) => (
            <details key={i} className={`group ${i > 0 ? 'border-t border-ink-100' : ''}`}>
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 hover:bg-ink-50/50">
                <span className="text-[13.5px] font-medium text-ink-900">{item.q}</span>
                <ChevronDown className="h-4 w-4 flex-shrink-0 text-ink-400 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="px-5 pb-4 text-[13px] leading-relaxed text-ink-600">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-ink-900 px-6 py-5">
        <div>
          <p className="font-display text-[16px] font-bold text-white">Ready to keep more of every run?</p>
          <p className="mt-0.5 text-[12.5px] text-white/70">Upgrade in a tap — it’s prorated and cancellable anytime.</p>
        </div>
        {currentTier !== 'agency' ? (
          <Link
            href="/settings/plan"
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink-900 transition-colors hover:bg-ink-100"
          >
            Manage my plan <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <Link
            href="/contact-sales"
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink-900 transition-colors hover:bg-ink-100"
          >
            Talk to our team <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  )
}
