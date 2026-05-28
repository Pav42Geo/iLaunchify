import * as React from 'react'
import Link from 'next/link'
import { Check, X, ArrowRight } from 'lucide-react'
import { Button } from '@ilaunchify/ui'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { PricingCards } from '@/components/PricingCards'

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
  searchParams: Promise<{ as?: string }>
}) {
  const { as } = await searchParams
  const isAuthenticated = as === 'user'
  const demoUser = isAuthenticated
    ? {
        name: 'Alex Chen',
        email: 'alex@kindredwellness.co',
        tier: 'maker' as const,
        activeBrandName: 'Kindred Wellness',
      }
    : null

  return (
    <>
      <MarketplaceHeader user={demoUser} hasUnreadNotifications={false} />

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
            Free to start. No card required. Production-order fees drop as you
            grow — from 15% on Maker down to 9% on Agency.
          </p>
        </div>

        <PricingCards />

        {/* "First sample" perk pip */}
        <div className="mt-12 max-w-[640px] mx-auto bg-cream border border-ink-200 rounded-xl p-5 flex items-start gap-3">
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
              50% off your first sample order — up to 3 products × 3 units. Stacks
              with every tier, including the free Maker plan.
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON TABLE */}
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
            <thead className="bg-cream">
              <tr className="border-b border-ink-200">
                <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500 w-[34%]">
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
                      className="px-6 pt-7 pb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500 bg-ink-50/40"
                    >
                      {section.label}
                    </td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={row.label} className="border-b border-ink-100 last:border-b-0">
                      <td className="px-6 py-3 text-ink-900 font-medium">{row.label}</td>
                      <Cell>{row.maker}</Cell>
                      <Cell highlight>{row.builder}</Cell>
                      <Cell>{row.agency}</Cell>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
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
                {q.answer}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* DARK CTA */}
      <section data-surface="dark" className="bg-ink-900 text-white">
        <div className="max-w-[1200px] mx-auto px-6 py-20 text-center">
          <h2 className="font-display text-4xl sm:text-5xl font-extrabold leading-[1] tracking-[-0.03em] mb-5 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-neon-500">
            Start free. <em>Pay nothing</em> until you ship.
          </h2>
          <p className="text-ink-300 text-lg max-w-[52ch] mx-auto mb-9">
            Maker is free forever. Builder + Agency only charge when your launch
            is paying for itself.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="neon" size="lg">
              <Link href="/signup/creator">
                Start free
                <ArrowRight strokeWidth={2.5} className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="text-white hover:bg-white/10">
              <Link href="/marketplace">Browse the marketplace →</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="max-w-[1200px] mx-auto px-6 py-10 flex flex-wrap items-center justify-between gap-4 text-[13px] text-ink-500">
        <Link href="/" className="flex items-center gap-[7px]">
          <span className="w-[22px] h-[22px] rounded-md bg-pink-500" />
          <span className="font-display text-[15px] font-extrabold tracking-[-0.04em] text-ink-900">
            iLaunchify
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/marketplace" className="hover:text-ink-900">
            Marketplace
          </Link>
          <Link href="/pricing" className="hover:text-ink-900">
            Pricing
          </Link>
          <Link href="/business" className="hover:text-ink-900">
            For partners
          </Link>
          <span>© 2026 iLaunchify</span>
        </div>
      </footer>
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
    label: 'Production economics',
    rows: [
      { label: 'Production-order fee', maker: '15%', builder: '12%', agency: '9%' },
      {
        label: 'Routing priority',
        maker: 'Standard',
        builder: 'Priority',
        agency: 'First-look',
      },
      {
        label: 'Premier-partner access',
        maker: false,
        builder: false,
        agency: true,
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
    label: 'AI + compliance',
    rows: [
      {
        label: 'AI label design',
        maker: 'Basic',
        builder: 'Custom suggestions',
        agency: 'Premium + custom',
      },
      {
        label: 'AI formulation help',
        maker: false,
        builder: 'Read-only',
        agency: 'Full editor',
      },
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
      'Builder is for creators scaling past one SKU. Agency adds Premier-partner access, full bulk pricing visibility, free samples credited against your main order, and a dedicated account manager. Most creators graduate to Agency around 5+ active SKUs or when they take on a second brand.',
  },
  {
    question: 'Is the marketplace free to browse?',
    answer:
      'Yes, anyone can browse templates and view detail pages. You only need an account to start customizing a label, order a sample, or place a production run.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'All major credit cards via Stripe. Production orders also support ACH for Builder and Agency plans. We never charge you for a production run until every assigned partner confirms they accept the order.',
  },
  {
    question: 'Can I switch between monthly and annual?',
    answer:
      'Yes. Switching to annual gives you 2 months free immediately and prorates your current month. Switching back to monthly takes effect at your next renewal.',
  },
]
