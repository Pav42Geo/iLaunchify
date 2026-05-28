'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, X, Crown, ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@ilaunchify/ui'
import { creatorUrl } from '@/lib/app-urls'

/**
 * PricingCards — three-tier card row + monthly/annual toggle for the public
 * /pricing page. Pulls tier definitions from PLATFORM_SPEC.md §"Creator
 * subscription tiers".
 *
 * Annual = 2 months free (per spec line 93: "annual = 2 months free,
 * equivalent to ~17% discount"). When billing is annual, the displayed
 * monthly price = (annualPrice / 12).
 */

type Billing = 'monthly' | 'annual'

interface Tier {
  id: 'maker' | 'builder' | 'agency'
  name: string
  tagline: string
  monthly: number | 'free'
  /** Annual price (full year). Falls back to monthly * 10 if not provided. */
  annual: number | 'free'
  productionFee: string
  /** Marked the recommended tier — gets the pink glow + "Most popular" pip. */
  recommended?: boolean
  /** 4-6 headline features for the card body. */
  highlights: { included: boolean; label: string }[]
  cta: string
}

const TIERS: Tier[] = [
  {
    id: 'maker',
    name: 'Maker',
    tagline: 'Launch your first brand for free.',
    monthly: 'free',
    annual: 'free',
    productionFee: '15% production-order fee',
    highlights: [
      { included: true, label: 'Unlimited products' },
      { included: true, label: '1 brand profile' },
      { included: true, label: 'Standard routing queue' },
      { included: true, label: 'Basic AI label templates' },
      { included: false, label: 'Premier production partners' },
      { included: false, label: 'Bulk pricing visibility' },
    ],
    cta: 'Start free',
  },
  {
    id: 'builder',
    name: 'Builder',
    tagline: 'Scale to a multi-SKU brand.',
    monthly: 79,
    annual: 790, // 2 months free vs $79 × 12
    productionFee: '12% production-order fee',
    recommended: true,
    highlights: [
      { included: true, label: 'Unlimited products' },
      { included: true, label: '3 brand profiles' },
      { included: true, label: 'Priority routing queue' },
      { included: true, label: 'Custom AI label suggestions' },
      { included: true, label: 'Order trend analytics' },
      { included: true, label: 'Advanced compliance check' },
    ],
    cta: 'Start 14-day trial',
  },
  {
    id: 'agency',
    name: 'Agency',
    tagline: 'Run multiple brands at scale.',
    monthly: 249,
    annual: 2490,
    productionFee: '9% production-order fee',
    highlights: [
      { included: true, label: 'Unlimited products + brands' },
      { included: true, label: 'First-look routing position' },
      { included: true, label: 'Premier-partner access' },
      { included: true, label: 'Bulk volume pricing visibility' },
      { included: true, label: 'Free sample + main-order credit' },
      { included: true, label: 'Dedicated account manager' },
    ],
    cta: 'Talk to sales',
  },
]

export function PricingCards() {
  const [billing, setBilling] = React.useState<Billing>('annual')

  return (
    <div>
      <div className="flex items-center justify-center mb-12">
        <div className="inline-flex items-center bg-ink-100 rounded-pill p-1.5 border border-ink-200">
          <button
            type="button"
            onClick={() => setBilling('monthly')}
            className={
              'px-7 h-12 rounded-pill text-[14px] font-bold tracking-[-0.005em] transition-all duration-base ease-out-quart cursor-pointer ' +
              (billing === 'monthly'
                ? 'bg-ink-900 text-white shadow-md'
                : 'text-ink-700 hover:text-ink-900')
            }
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling('annual')}
            className={
              'px-7 h-12 rounded-pill text-[14px] font-bold tracking-[-0.005em] transition-all duration-base ease-out-quart cursor-pointer flex items-center gap-2 ' +
              (billing === 'annual'
                ? 'bg-ink-900 text-white shadow-md'
                : 'text-ink-700 hover:text-ink-900')
            }
          >
            Annual
            <span
              className={
                'text-[10px] font-extrabold uppercase tracking-[0.07em] px-2 py-1 rounded-pill leading-none ' +
                (billing === 'annual'
                  ? 'bg-neon-500 text-ink-900'
                  : 'bg-pink-100 text-pink-700')
              }
            >
              2 mos free
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {TIERS.map((tier) => (
          <PricingCard key={tier.id} tier={tier} billing={billing} />
        ))}
      </div>
    </div>
  )
}

function PricingCard({ tier, billing }: { tier: Tier; billing: Billing }) {
  const isFree = tier.monthly === 'free'
  const displayedMonthly =
    isFree
      ? 0
      : billing === 'annual'
        ? Math.round(((tier.annual as number) / 12) * 100) / 100
        : (tier.monthly as number)

  const annualTotalNote =
    !isFree && billing === 'annual'
      ? `$${(tier.annual as number).toLocaleString()} billed annually`
      : null

  // Agency stays on this domain (lead form). Maker/Builder cross over to
  // apps/creator's signup with plan + billing carryover.
  const isCrossApp = tier.id !== 'agency'
  const ctaHref =
    tier.id === 'agency'
      ? '/contact-sales?plan=agency'
      : creatorUrl('/signup/creator', { plan: tier.id, billing })

  return (
    <div
      className={
        'relative rounded-2xl border p-6 flex flex-col ' +
        (tier.recommended
          ? 'border-pink-500 bg-white shadow-[0_8px_30px_-8px_rgba(255,46,99,0.25)]'
          : 'border-ink-200 bg-white')
      }
    >
      {tier.recommended && (
        <div className="absolute -top-3 left-6 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] bg-pink-500 text-white px-3 py-1 rounded-pill">
          <Sparkles strokeWidth={2.5} className="w-3 h-3" />
          Most popular
        </div>
      )}

      <div className="flex items-center gap-2 mb-1.5">
        <h3 className="font-display text-[22px] font-bold tracking-[-0.015em] text-ink-900">
          {tier.name}
        </h3>
        {tier.id === 'agency' && (
          <Crown strokeWidth={2.25} className="w-4 h-4 text-pink-500" />
        )}
      </div>
      <p className="text-[14px] text-ink-600 mb-5 leading-snug min-h-[40px]">
        {tier.tagline}
      </p>

      <div className="flex items-baseline gap-2 mb-1 tabular-nums">
        {isFree ? (
          <>
            <span className="font-display text-5xl font-extrabold tracking-[-0.025em] text-ink-900">
              $0
            </span>
            <span className="text-[14px] text-ink-500 font-medium">forever</span>
          </>
        ) : (
          <>
            <span className="font-display text-5xl font-extrabold tracking-[-0.025em] text-ink-900">
              ${displayedMonthly}
            </span>
            <span className="text-[14px] text-ink-500 font-medium">/ month</span>
          </>
        )}
      </div>
      <div className="text-[12px] text-ink-500 mb-1 min-h-[18px] tabular-nums">
        {annualTotalNote ?? ' '}
      </div>
      <div className="text-[12px] font-semibold text-pink-700 mb-6">
        {tier.productionFee}
      </div>

      <div className="mb-6">
        <Button
          asChild
          variant={tier.recommended ? 'primary' : 'secondary'}
          size="md"
        >
          {isCrossApp ? (
            <a href={ctaHref}>
              {tier.cta}
              <ArrowRight strokeWidth={2.5} className="w-4 h-4" />
            </a>
          ) : (
            <Link href={ctaHref}>
              {tier.cta}
              <ArrowRight strokeWidth={2.5} className="w-4 h-4" />
            </Link>
          )}
        </Button>
      </div>

      <ul className="space-y-2.5 mt-auto">
        {tier.highlights.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px]">
            {f.included ? (
              <Check
                strokeWidth={3}
                className="w-4 h-4 text-pink-500 flex-shrink-0 mt-0.5"
              />
            ) : (
              <X
                strokeWidth={2.5}
                className="w-4 h-4 text-ink-300 flex-shrink-0 mt-0.5"
              />
            )}
            <span className={f.included ? 'text-ink-900' : 'text-ink-400 line-through'}>
              {f.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
