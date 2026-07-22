import * as React from 'react'
import Link from 'next/link'
import { Check, X, ArrowRight } from 'lucide-react'
import { Button } from '@ilaunchify/ui'
import { LandingHeader } from '@/components/LandingHeader'
import { LandingFooter } from '@/components/LandingFooter'
import { Reveal } from '@/components/Reveal'
import { PricingCards, type PlanPricing, type TierId } from '@/components/PricingCards'
import { creatorUrl } from '@/lib/app-urls'
import { getMarketingSession, headerPropsFromSession } from '@/lib/session'
import { getCreatorFeePcts } from '@/lib/pricing'
import { prisma } from '@ilaunchify/db'
import { CREATOR_PLAN_CODES } from '@ilaunchify/plans'

/**
 * /pricing — public-facing tier comparison.
 *
 * Tier data tracks PLATFORM_SPEC.md §"Creator subscription tiers" (locked
 * 2026-05-19). Numbers shown here are public-facing approximations; the
 * authoritative source is the SubscriptionPlan DB rows admin can edit (see
 * spec §"Admin Subscription & Fee Manager module").
 *
 * Three sections:
 *   1. Hero + 3-card tier row with monthly/annual toggle (PricingCards client)
 *   2. Full comparison table (server-rendered)
 *   3. FAQ + final dark CTA
 *
 * Partner pricing lives at /business (separate audience, separate header).
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, never>>
}) {
  await searchParams
  const session = await getMarketingSession()
  const { user, brands, activeBrandId } = headerPropsFromSession(session)

  // LIVE money (Pavel 2026-07-21, option C phase 2): fee rates from FeeRule
  // and plan prices from SubscriptionPlan — this page carried hardcoded
  // $79/$249 + 15/12/8% that had drifted from what the app charges. Admin
  // edits in Tiers & Plans now propagate here with zero copy changes.
  const [feePcts, plans] = await Promise.all([
    getCreatorFeePcts(),
    prisma.subscriptionPlan.findMany({
      where: {
        code: {
          in: [
            CREATOR_PLAN_CODES.maker,
            CREATOR_PLAN_CODES.builder,
            CREATOR_PLAN_CODES.agency,
          ],
        },
      },
      select: { code: true, monthlyPriceCents: true, annualPriceCents: true },
    }),
  ])
  const planByCode = new Map(plans.map((p) => [p.code, p]))
  const fmtPct = (p: number) => (Number.isInteger(p) ? String(p) : p.toFixed(1))
  const planPricing = (tier: TierId): PlanPricing => {
    const codes = {
      maker: CREATOR_PLAN_CODES.maker,
      builder: CREATOR_PLAN_CODES.builder,
      agency: CREATOR_PLAN_CODES.agency,
    } as const
    const row = planByCode.get(codes[tier])
    const monthlyCents = row?.monthlyPriceCents ?? 0
    const annualCents = row?.annualPriceCents ?? monthlyCents * 10 // 2 months free
    return {
      monthly: monthlyCents > 0 ? monthlyCents / 100 : 'free',
      annual: monthlyCents > 0 ? annualCents / 100 : 'free',
      feeLabel: `${fmtPct(feePcts[tier])}% production-order fee`,
    }
  }
  const pricing: Record<TierId, PlanPricing> = {
    maker: planPricing('maker'),
    builder: planPricing('builder'),
    agency: planPricing('agency'),
  }
  // Substitute live rates into copy strings carrying __FEE_*__ tokens.
  const subFees = (s: string) =>
    s
      .replaceAll('__FEE_MAKER__', `${fmtPct(feePcts.maker)}%`)
      .replaceAll('__FEE_BUILDER__', `${fmtPct(feePcts.builder)}%`)
      .replaceAll('__FEE_AGENCY__', `${fmtPct(feePcts.agency)}%`)

  return (
    <>
      <LandingHeader
        user={user}
        brands={brands}
        activeBrandId={activeBrandId}
        hasUnreadNotifications={false}
      />

      {/* HERO + TIER CARDS */}
      <section className="max-w-[1200px] mx-auto px-6 pt-16 pb-12 sm:pt-20">
        <div className="text-center mb-12">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-3">
            Pricing
          </div>
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-extrabold leading-[0.95] tracking-[-0.035em] mb-5 max-w-[16ch] mx-auto">
            Pay less{' '}
            <span className="font-serif italic font-medium text-pink-500 tracking-[-0.025em]">
              as you scale.
            </span>
          </h1>
          <p className="text-lg text-ink-700 max-w-[58ch] mx-auto leading-[1.55]">
            Maker is free forever. Production-order fees drop with tier —{' '}
            {fmtPct(feePcts.maker)}% on Maker, {fmtPct(feePcts.builder)}% on
            Builder, {fmtPct(feePcts.agency)}% on Agency. No setup fees, no
            platform tax, no per-seat charges. You only pay when you place a
            real production run.
          </p>
        </div>

        {/* V1.5-T6 — logged-in creators see "Manage plan" / "Upgrade to
            Builder" CTAs that deep-link straight to /settings/plan in the
            creator app, bypassing /signup. Anonymous visitors still get
            the marketing /signup funnel. */}
        <PricingCards isLoggedIn={Boolean(session?.user)} pricing={pricing} />

        {/* "First sample" perk pip */}
        <div className="mt-12 max-w-[640px] mx-auto bg-white border border-ink-200 rounded-xl p-5 flex items-start gap-3">
          <span
            aria-hidden="true"
            className="w-9 h-9 rounded-pill bg-neon-500 flex items-center justify-center flex-shrink-0 text-lg"
          >
            🎁
          </span>
          <div>
            <div className="font-display text-[15px] font-bold tracking-[-0.005em] text-ink-900 mb-0.5">
              Every new creator gets a First Sample Discount
            </div>
            <div className="text-[13px] text-ink-600 leading-snug">
              50% off your first sample order — up to 3 products × 3 units (9 units
              total). Available on every tier, including the free Maker plan. Agency
              tier samples are free outright and credit against your first main order
              if placed within 30 days.
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON TABLE */}
      <Reveal>
      <section className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-2">
            Compare plans
          </div>
          <h2 className="font-display text-4xl font-bold tracking-[-0.025em]">
            What's{' '}
            <span className="font-serif italic font-medium text-pink-500 tracking-[-0.02em]">
              in every plan.
            </span>
          </h2>
        </div>

        <div className="border border-ink-200 rounded-2xl overflow-hidden bg-white">
          <table className="w-full text-[13px]">
            <thead className="bg-white">
              <tr className="border-b border-ink-200">
                <th className="text-left px-6 py-4 text-[12px] font-bold uppercase tracking-[0.06em] text-ink-700 w-[34%]">
                  Feature
                </th>
                <th className="text-center px-4 py-4 font-display text-[15px] font-bold text-ink-900">
                  Maker
                </th>
                <th className="text-center px-4 py-4 font-display text-[15px] font-bold text-pink-700 bg-pink-50/40">
                  Builder
                </th>
                <th className="text-center px-4 py-4 font-display text-[15px] font-bold text-ink-900">
                  Agency
                </th>
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section) => (
                <React.Fragment key={section.label}>
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 pt-7 pb-3 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700 bg-ink-50/40"
                    >
                      {section.label}
                    </td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={row.label} className="border-b border-ink-100 last:border-b-0">
                      <td className="px-6 py-3 text-ink-900 font-medium">{row.label}</td>
                      <Cell>{typeof row.maker === 'string' ? subFees(row.maker) : row.maker}</Cell>
                      <Cell highlight>{typeof row.builder === 'string' ? subFees(row.builder) : row.builder}</Cell>
                      <Cell>{typeof row.agency === 'string' ? subFees(row.agency) : row.agency}</Cell>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </Reveal>

      {/* FAQ */}
      <Reveal>
      <section className="max-w-[860px] mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-2">
            Questions
          </div>
          <h2 className="font-display text-4xl font-bold tracking-[-0.025em]">
            Common{' '}
            <span className="font-serif italic font-medium text-pink-500 tracking-[-0.02em]">
              answers.
            </span>
          </h2>
        </div>

        <div className="flex flex-col gap-3">
          {FAQ.map((q) => (
            <details
              key={q.question}
              className="group bg-white border border-ink-200 rounded-xl open:border-pink-300 transition-colors"
            >
              <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none">
                <span className="font-display text-[16px] font-bold tracking-[-0.005em] text-ink-900">
                  {q.question}
                </span>
                <span
                  aria-hidden="true"
                  className="w-7 h-7 rounded-pill border border-ink-300 flex items-center justify-center text-ink-500 group-open:bg-pink-500 group-open:border-pink-500 group-open:text-white transition-colors text-[15px] font-light leading-none flex-shrink-0"
                >
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <div className="px-5 pb-5 text-[14px] text-ink-700 leading-[1.6]">
                {subFees(q.answer)}
              </div>
            </details>
          ))}
        </div>
      </section>
      </Reveal>

      {/* DARK CTA */}
      <Reveal>
      <section data-surface="dark" className="bg-ink-900 text-white">
        <div className="max-w-[1200px] mx-auto px-6 py-20 text-center">
          <h2 className="font-display text-4xl sm:text-5xl font-extrabold leading-[1] tracking-[-0.03em] mb-5 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-neon-500">
            Start free. <em>Pay nothing</em> until your manifest clears.
          </h2>
          <p className="text-ink-300 text-lg max-w-[52ch] mx-auto mb-9">
            Maker is free forever. Builder and Agency monthly fees start when you
            upgrade. Production-order fees apply only to placed orders, captured only
            when every partner approves.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="neon" size="lg">
              <a href={creatorUrl('/signup')}>
                Start free
                <ArrowRight strokeWidth={2.5} className="w-4 h-4" />
              </a>
            </Button>
            <Button asChild variant="ghost" size="lg" className="text-white hover:bg-white/10">
              <Link href="/marketplace">Browse the marketplace →</Link>
            </Button>
          </div>
        </div>
      </section>
      </Reveal>

      <LandingFooter />
    </>
  )
}

/* ============ cells + data ============ */

function Cell({
  children,
  highlight,
}: {
  children: React.ReactNode
  highlight?: boolean
}) {
  return (
    <td
      className={
        'text-center px-4 py-3 text-ink-700 ' + (highlight ? 'bg-pink-50/30' : '')
      }
    >
      {children === true ? (
        <Check strokeWidth={3} className="w-4 h-4 text-pink-500 inline" />
      ) : children === false ? (
        <X strokeWidth={2.5} className="w-4 h-4 text-ink-300 inline" />
      ) : (
        <span className="tabular-nums">{children}</span>
      )}
    </td>
  )
}

interface ComparisonRow {
  label: string
  maker: React.ReactNode
  builder: React.ReactNode
  agency: React.ReactNode
}

interface ComparisonSection {
  label: string
  rows: ComparisonRow[]
}

const SECTIONS: ComparisonSection[] = [
  {
    label: 'Catalog + brands',
    rows: [
      { label: 'Active products', maker: 'Unlimited', builder: 'Unlimited', agency: 'Unlimited' },
      { label: 'Brand profiles', maker: '1', builder: '3', agency: 'Unlimited' },
      {
        label: 'Channel connections',
        maker: '1',
        builder: '3',
        agency: 'All 6',
      },
    ],
  },
  {
    // On-demand selling (docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md §4b.5,
    // Pavel 2026-07-21): open to EVERY tier including free Maker (channel spec
    // LOCKED decision). The tier ladder differentiates via the production-order
    // fee row below + the channel-connections row above; band selection by
    // rolling 30-day volume applies to all tiers.
    label: 'On-demand selling',
    rows: [
      {
        label: 'Made-to-order fulfillment (each sale produced per order, no inventory)',
        maker: true,
        builder: true,
        agency: true,
      },
      {
        label: 'Volume pricing bands by rolling 30-day sales',
        maker: true,
        builder: true,
        agency: true,
      },
    ],
  },
  {
    // Co-Creation Studio + Shared Design Workspace perks (Pavel 2026-07-13):
    // briefs = Builder+ (D-CC1); designer seats = Builder 2 / Agency 5, Maker
    // none (live numbers admin-tunable in Co-Creation Settings).
    label: 'Co-creation & design',
    rows: [
      {
        label: 'Post co-creation briefs to matched makers',
        maker: false,
        builder: true,
        agency: true,
      },
      {
        label: 'DIY label design on your maker’s die-line',
        maker: true,
        builder: true,
        agency: true,
      },
      {
        label: 'Invited-designer seats (shared workspace)',
        maker: '—',
        builder: '2',
        agency: '5',
      },
      { label: 'Design alternates per slot', maker: '2', builder: '5', agency: 'Unlimited' },
    ],
  },
  {
    label: 'Production economics',
    rows: [
      // Live rates substituted at render via subFees (never hardcode a rate).
      { label: 'Production-order fee', maker: '__FEE_MAKER__', builder: '__FEE_BUILDER__', agency: '__FEE_AGENCY__' },
      {
        label: 'Routing priority',
        maker: 'Standard',
        builder: 'Priority',
        agency: 'First-look',
      },
      {
        label: 'Bulk pricing visibility',
        maker: false,
        builder: false,
        agency: true,
      },
    ],
  },
  {
    label: 'Samples',
    rows: [
      {
        label: 'First-sample discount',
        maker: '50% off',
        builder: '50% off',
        agency: 'Free',
      },
      {
        label: 'Sample credited to main order',
        maker: false,
        builder: false,
        agency: true,
      },
    ],
  },
  {
    label: 'Compliance',
    rows: [
      {
        label: 'Compliance check',
        maker: 'Standard',
        builder: 'Advanced',
        agency: 'Pre-clearance',
      },
    ],
  },
  {
    label: 'Support',
    rows: [
      {
        label: 'Support SLA',
        maker: 'Email · 48h',
        builder: 'Email + chat · 24h',
        agency: 'Dedicated AM · 4h',
      },
      {
        label: 'Analytics',
        maker: false,
        builder: 'Order trends',
        agency: 'Forecasting',
      },
      {
        label: 'Co-marketing',
        maker: false,
        builder: false,
        agency: true,
      },
    ],
  },
]

const FAQ = [
  {
    question: 'When am I actually charged?',
    answer:
      'Subscription billing starts when you upgrade to Builder or Agency. Production-order fees are deducted at checkout — and that’s only when you place a real order. The Maker plan never costs anything.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. Cancel from Settings → Subscription. You stay on your current tier until the end of your billing period, then auto-downgrade to Maker. Any in-flight orders complete normally.',
  },
  {
    question: 'What’s the difference between Builder and Agency?',
    answer:
      'Builder is for creators scaling past one SKU — lower fee (__FEE_BUILDER__), priority routing, more brand profiles, sample discounts. Agency adds full bulk pricing visibility across all partner volume tiers, free first sample credited against your main order if placed within 30 days, a dedicated account manager with a 4-hour support SLA, and the lowest production-order fee (__FEE_AGENCY__). Most creators graduate to Agency when they take on a second brand or hit ~5 active SKUs.',
  },
  {
    question: 'Is the marketplace free to browse?',
    answer:
      'Yes, anyone can browse templates and view detail pages. You only need an account to start customizing a label, order a sample, or place a production run.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'All major credit cards via Stripe Checkout. Production orders also support ACH for Builder and Agency plans. Your card is authorized at checkout but only captured when every assigned partner approves the manifest — usually within 24–48 hours of order placement. If any partner declines, we re-route automatically; you’re not charged for a manifest that didn’t clear.',
  },
  {
    question: 'Can I switch between monthly and annual?',
    answer:
      'Yes. Switching to annual gives you 2 months free immediately and prorates your current month. Switching back to monthly takes effect at your next renewal.',
  },
]
