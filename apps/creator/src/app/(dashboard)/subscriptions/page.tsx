// iLaunchify Plans — the creator plan-upgrade landing (repurposed from the old
// /subscriptions recurring-runs list, 2026-06-26). Wears the marketing /pricing
// editorial look (Pavel 2026-06-26 — "escape the boring account look"): big
// Fraunces-italic hero, premium tier cards with the signature black-pill CTA,
// section eyebrows, a dark CTA band — inside the account shell. Keeps the unique
// savings calculator, the REAL Stripe upgrade flow (UpgradeButton) + the
// Membership Subscription Terms consent checkbox. Pricing is DB-driven (provisional).
//
// Plan MANAGEMENT (cancel / resume / billing) stays at /settings/plan.

import * as React from 'react'
import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser, TIER_RANK, normalizeTier } from '@ilaunchify/auth'
import { CREATOR_PLAN_CODES, resolveCreatorFeeBps } from '@ilaunchify/plans'
import { Button } from '@ilaunchify/ui'
import { Sparkles, Crown, Check, X, ArrowRight } from 'lucide-react'
import { UpgradeButton } from '../settings/plan/PlanActionButtons'
import { PlansSavingsCalculator, type CalcTier } from './PlansSavingsCalculator'
import { marketingUrl } from '@/lib/marketing-url'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'iLaunchify Plans — iLaunchify' }

type TierKey = 'maker' | 'builder' | 'agency'

// Fee percentages are NOT in this const: the '__FEE__' highlight token and the
// per-card fee badge are substituted at render from FeeRule via
// resolveCreatorFeeBps (Pavel 2026-07-21 — admin edits must propagate, never
// hardcode a rate in copy).
const TIERS: ReadonlyArray<{
  key: TierKey
  planCode: string
  name: string
  tagline: string
  recommended?: boolean
  highlights: { included: boolean; label: string }[]
}> = [
  {
    key: 'maker',
    planCode: CREATOR_PLAN_CODES.maker,
    name: 'Maker',
    tagline: 'Test ideas, pay only when you produce.',
    highlights: [
      { included: true, label: '__FEE__' },
      { included: true, label: 'Unlimited products & label drafts' },
      { included: true, label: 'Marketplace + partner matching' },
      { included: true, label: '1 brand kit' },
      { included: false, label: 'Print-ready Studio export' },
      { included: false, label: 'Priority support' },
    ],
  },
  {
    key: 'builder',
    planCode: CREATOR_PLAN_CODES.builder,
    name: 'Builder',
    tagline: 'For creators running real production.',
    recommended: true,
    highlights: [
      { included: true, label: '__FEE__' },
      { included: true, label: 'Print-ready Design Studio export' },
      { included: true, label: 'Priority human support' },
      { included: true, label: 'Up to 3 brand kits' },
      { included: true, label: 'Volume pricing on production' },
      { included: false, label: 'Custom domain storefronts' },
    ],
  },
  {
    key: 'agency',
    planCode: CREATOR_PLAN_CODES.agency,
    name: 'Agency',
    tagline: 'Multi-brand teams & influencer agencies.',
    highlights: [
      { included: true, label: '__FEE__' },
      { included: true, label: 'Unlimited brand kits & workspace' },
      { included: true, label: 'Custom domain storefronts' },
      { included: true, label: 'Dedicated launch partner' },
      { included: true, label: 'Everything in Builder' },
    ],
  },
] as const

const COMPARISON: Array<{ section: string; rows: Array<{ label: string; cells: [React.ReactNode, React.ReactNode, React.ReactNode] }> }> = [
  {
    section: 'Production economics',
    rows: [
      // Live rates substituted at render (buildComparison) from FeeRule —
      // never hardcode fee percentages in copy (Pavel 2026-07-21).
      { label: 'Administrative fee on production', cells: ['__FEE_MAKER__', '__FEE_BUILDER__', '__FEE_AGENCY__'] },
      { label: 'Volume pricing on runs', cells: [false, true, true] },
    ],
  },
  {
    section: 'Catalog & brands',
    rows: [
      { label: 'Products & label drafts', cells: ['Unlimited', 'Unlimited', 'Unlimited'] },
      { label: 'Brand kits', cells: ['1', '3', 'Unlimited'] },
      { label: 'Custom domain storefronts', cells: [false, false, true] },
    ],
  },
  {
    section: 'Studio & support',
    rows: [
      { label: 'Print-ready Studio export', cells: [false, true, true] },
      { label: 'Human support', cells: ['Standard', 'Priority', 'Dedicated partner'] },
    ],
  },
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
]

export default async function PlansPage() {
  const user = await requireUser()

  const [profile, plans, makerFee, builderFee, agencyFee] = await Promise.all([
    prisma.creatorProfile.findUnique({
      where: { userId: user.id },
      select: { subscriptionTier: true },
    }),
    prisma.subscriptionPlan.findMany({
      where: { code: { in: [CREATOR_PLAN_CODES.maker, CREATOR_PLAN_CODES.builder, CREATOR_PLAN_CODES.agency] } },
      select: { code: true, monthlyPriceCents: true },
    }),
    // LIVE administrative-fee rates from FeeRule (SSOT, admin-editable).
    resolveCreatorFeeBps('maker'),
    resolveCreatorFeeBps('builder'),
    resolveCreatorFeeBps('agency'),
  ])

  const priceByCode = new Map(plans.map((p) => [p.code, p.monthlyPriceCents]))
  const currentTier = normalizeTier(profile?.subscriptionTier) as TierKey

  const feeBpsByTier: Record<TierKey, number> = {
    maker: makerFee.feeBps,
    builder: builderFee.feeBps,
    agency: agencyFee.feeBps,
  }
  const pct = (bps: number) => {
    const p = bps / 100
    return Number.isInteger(p) ? String(p) : p.toFixed(1)
  }
  // Per-tier substitution for the '__FEE__' highlight token.
  const feeHighlightByTier: Record<TierKey, string> = {
    maker: `${pct(feeBpsByTier.maker)}% administrative fee on production`,
    builder: `${pct(feeBpsByTier.builder)}% administrative fee instead of ${pct(feeBpsByTier.maker)}%`,
    agency: `${pct(feeBpsByTier.agency)}% administrative fee, our best rate`,
  }
  // COMPARISON cell tokens → live rates.
  const substituteFeeCell = (cell: React.ReactNode): React.ReactNode =>
    cell === '__FEE_MAKER__'
      ? `${pct(feeBpsByTier.maker)}%`
      : cell === '__FEE_BUILDER__'
        ? `${pct(feeBpsByTier.builder)}%`
        : cell === '__FEE_AGENCY__'
          ? `${pct(feeBpsByTier.agency)}%`
          : cell

  const calcTiers: CalcTier[] = TIERS.map((t) => ({
    key: t.key,
    name: t.name,
    feePct: feeBpsByTier[t.key] / 10_000,
    monthlyCents: priceByCode.get(t.planCode) ?? 0,
  }))

  return (
    <div className="space-y-16 pb-4">
      {/* HERO — true full-bleed banner: breaks out of the max-w-6xl account
          wrapper to span the whole content area (margin-left: calc(50% - 50vw)
          + width: 100vw), clipped by the main's overflow-x-clip so it never
          spills under the sidebar. Crisp pink grid pattern fading out. */}
      <section
        className="relative -mt-6 overflow-hidden border-b border-ink-100 bg-white px-6 pb-10 pt-11 text-center"
        style={{ marginLeft: 'calc(50% - 50vw)', marginRight: 'calc(50% - 50vw)', width: '100vw' }}
      >
        {/* graph-paper grid, pink-tinted, fading radially from the top */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(#FFD0E0 1px, transparent 1px), linear-gradient(90deg, #FFD0E0 1px, transparent 1px)',
            backgroundSize: '38px 38px',
            opacity: 0.6,
            maskImage: 'radial-gradient(110% 92% at 50% -6%, #000 28%, transparent 74%)',
            WebkitMaskImage: 'radial-gradient(110% 92% at 50% -6%, #000 28%, transparent 74%)',
          }}
        />

        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700">iLaunchify Plans</p>
          <h1 className="mx-auto mt-2 font-display text-3xl font-extrabold leading-[1.05] tracking-[-0.03em] text-ink-900 sm:text-4xl md:text-5xl md:whitespace-nowrap">
            Plans that{' '}
            <span className="font-serif text-pink-500 italic font-medium tracking-[-0.02em]">pay for themselves.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-[74ch] text-[15px] leading-relaxed text-ink-700 sm:text-base">
            Every plan unlocks lower prices on production. The more you make, the more you save —
            most creators find a paid plan costs less than it saves.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-pill border border-ink-200 bg-white/80 px-3.5 py-1.5 text-[12px] font-medium text-ink-600 backdrop-blur-sm">
            Billed monthly · cancel anytime · you’re on{' '}
            <span className="font-semibold capitalize text-ink-900">{currentTier}</span> today
          </div>
        </div>
      </section>

      {/* SAVINGS CALCULATOR */}
      <section className="mx-auto max-w-3xl">
        <PlansSavingsCalculator tiers={calcTiers} currentTier={currentTier} />
      </section>

      {/* TIER CARDS */}
      <section className="mx-auto grid max-w-[1080px] grid-cols-1 gap-5 md:grid-cols-3">
        {TIERS.map((t) => {
          const price = priceByCode.get(t.planCode) ?? 0
          const isCurrent = currentTier === t.key
          const isUpgrade = TIER_RANK[t.key] > TIER_RANK[currentTier]
          return (
            <article
              key={t.key}
              className={
                'relative flex flex-col rounded-2xl border bg-white p-6 ' +
                (t.recommended
                  ? 'border-pink-500 shadow-[0_8px_30px_-8px_rgba(255,46,99,0.25)]'
                  : 'border-ink-200')
              }
            >
              {t.recommended && (
                <div className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-pill bg-pink-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                  <Sparkles strokeWidth={2.5} className="h-3 w-3" /> Most popular
                </div>
              )}

              <div className="mb-1.5 flex items-center gap-2">
                <h3 className="font-display text-[22px] font-bold tracking-[-0.015em] text-ink-900">{t.name}</h3>
                {t.key === 'agency' && <Crown strokeWidth={2.25} className="h-4 w-4 text-pink-500" />}
              </div>
              <p className="mb-5 min-h-[40px] text-[14px] leading-snug text-ink-600">{t.tagline}</p>

              <div className="mb-1 flex items-baseline gap-2 tabular-nums">
                <span className="font-display text-5xl font-extrabold tracking-[-0.025em] text-ink-900">
                  {price > 0 ? `$${Math.round(price / 100)}` : '$0'}
                </span>
                <span className="text-[14px] font-medium text-ink-500">{price > 0 ? '/ month' : 'forever'}</span>
              </div>
              <div className="mb-6 text-[12px] font-semibold text-pink-700">
                {pct(feeBpsByTier[t.key])}% administrative fee
              </div>

              {/* CTA */}
              <div className="mb-6">
                {isCurrent ? (
                  <Button asChild variant="secondary" size="md">
                    <Link href="/settings/plan">
                      Current plan · manage <ArrowRight strokeWidth={2.5} className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : isUpgrade && t.key !== 'maker' ? (
                  <UpgradeButton targetTier={t.key.toUpperCase() as 'BUILDER' | 'AGENCY'} label={`Upgrade to ${t.name}`} />
                ) : (
                  <Button asChild variant="secondary" size="md">
                    <Link href="/settings/plan">{t.key === 'maker' ? 'Included' : 'Manage in settings'}</Link>
                  </Button>
                )}
              </div>

              <ul className="mt-auto space-y-2.5">
                {t.highlights.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px]">
                    {f.included ? (
                      <Check strokeWidth={3} className="mt-0.5 h-4 w-4 flex-shrink-0 text-pink-500" />
                    ) : (
                      <X strokeWidth={2.5} className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-300" />
                    )}
                    <span className={f.included ? 'text-ink-900' : 'text-ink-400 line-through'}>
                      {f.label === '__FEE__' ? feeHighlightByTier[t.key] : f.label}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </section>

      {/* COMPARISON */}
      <section className="mx-auto max-w-[1080px]">
        <SectionHead eyebrow="Compare plans" lead="What’s" emphasis="in every plan." />
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-white">
                <tr className="border-b border-ink-200">
                  <th className="w-[40%] px-6 py-4 text-left text-[12px] font-bold uppercase tracking-[0.06em] text-ink-700">Feature</th>
                  <th className="px-4 py-4 text-center font-display text-[15px] font-bold text-ink-900">Maker</th>
                  <th className="bg-pink-50/40 px-4 py-4 text-center font-display text-[15px] font-bold text-pink-700">Builder</th>
                  <th className="px-4 py-4 text-center font-display text-[15px] font-bold text-ink-900">Agency</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((sec) => (
                  <React.Fragment key={sec.section}>
                    <tr>
                      <td colSpan={4} className="bg-ink-50/40 px-6 pb-3 pt-6 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
                        {sec.section}
                      </td>
                    </tr>
                    {sec.rows.map((row) => (
                      <tr key={row.label} className="border-b border-ink-100 last:border-0">
                        <td className="px-6 py-3 font-medium text-ink-900">{row.label}</td>
                        <CompareCell>{substituteFeeCell(row.cells[0])}</CompareCell>
                        <CompareCell highlight>{substituteFeeCell(row.cells[1])}</CompareCell>
                        <CompareCell>{substituteFeeCell(row.cells[2])}</CompareCell>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[820px]">
        <SectionHead eyebrow="Questions" lead="Common" emphasis="answers." />
        <div className="flex flex-col gap-3">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-xl border border-ink-200 bg-white transition-colors open:border-pink-300">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                <span className="font-display text-[16px] font-bold tracking-[-0.005em] text-ink-900">{item.q}</span>
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-pill border border-ink-300 text-[15px] font-light leading-none text-ink-500 transition-colors group-open:border-pink-500 group-open:bg-pink-500 group-open:text-white"
                >
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <div className="px-5 pb-5 text-[14px] leading-[1.6] text-ink-700">{item.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* DARK CTA */}
      <section data-surface="dark" className="overflow-hidden rounded-3xl bg-ink-900 text-center text-white">
        <div className="px-6 py-14">
          <h2 className="mx-auto max-w-[20ch] font-display text-3xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-4xl [&_em]:font-serif [&_em]:font-medium [&_em]:italic [&_em]:text-neon-500">
            Keep more of <em>every run.</em>
          </h2>
          <p className="mx-auto mt-4 max-w-[48ch] text-[15px] text-ink-300">
            Upgrade in a tap — prorated, cancellable anytime, and it pays for itself the moment your
            fee savings beat the subscription.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {currentTier !== 'agency' ? (
              <Button asChild variant="neon" size="lg">
                <Link href="/settings/plan">
                  Manage my plan <ArrowRight strokeWidth={2.5} className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button asChild variant="neon" size="lg">
                <Link href="/contact-sales">
                  Talk to our team <ArrowRight strokeWidth={2.5} className="h-4 w-4" />
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="lg" className="text-white hover:bg-white/10">
              <a href={marketingUrl('/marketplace')}>Browse the marketplace →</a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function SectionHead({ eyebrow, lead, emphasis }: { eyebrow: string; lead: string; emphasis: string }) {
  return (
    <div className="mb-8 text-center">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700">{eyebrow}</div>
      <h2 className="font-display text-3xl font-bold tracking-[-0.025em] text-ink-900 sm:text-4xl">
        {lead}{' '}
        <span className="font-serif text-pink-500 italic font-medium tracking-[-0.02em]">{emphasis}</span>
      </h2>
    </div>
  )
}

function CompareCell({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <td className={'px-4 py-3 text-center text-ink-700 ' + (highlight ? 'bg-pink-50/30' : '')}>
      {children === true ? (
        <Check strokeWidth={3} className="inline h-4 w-4 text-pink-500" />
      ) : children === false ? (
        <X strokeWidth={2.5} className="inline h-4 w-4 text-ink-300" />
      ) : (
        <span className="tabular-nums">{children}</span>
      )}
    </td>
  )
}
