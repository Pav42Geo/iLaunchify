'use client'

// UpgradeOverlay (DS-73d) — appears when a Maker-tier creator clicks the
// gated EXPORT button. Slides down from just under the top header border
// and shows the three subscription tiers (Maker / Builder / Agency) so the
// creator can upgrade and unlock export.
//
// Behaviour:
//   * Fixed-positioned panel anchored to the top of the workspace area
//     (the layout below the 73px header). transform: translateY animates
//     from -100% to 0 on open, 0 to -100% on close.
//   * Click on the dim backdrop closes the overlay.
//   * Esc closes.
//   * "Upgrade" buttons send the creator to /pricing?tier=<key> — which
//     is the same pricing page the marketing site shows.
//
// Tier source-of-truth comes from @ilaunchify/ui's pricing-tier-data so
// the labels + ordering stay in sync with the marketing pricing page.

import * as React from 'react'
import { X, Sparkles, Zap, Crown, Check } from 'lucide-react'
import type { TierKey } from '@ilaunchify/ui'
// /pricing lives in apps/marketing (port 3010 in dev). Cross-app links
// must use marketingUrl(); plain <Link href="/pricing"> 404s here.
import { marketingUrl } from '@/lib/marketing-url'

interface Props {
  /** Currently-paying tier (drives the highlighted card + button states). */
  currentTier: TierKey
  /** Action that triggered the overlay — used in the headline copy. */
  blockedAction?: 'export' | 'preview' | 'other'
  /** Open/close. */
  open: boolean
  onClose: () => void
}

interface TierCard {
  key: TierKey
  icon: React.ComponentType<{ className?: string }>
  name: string
  price: string
  cadence: string
  tagline: string
  perks: string[]
  highlight?: boolean
}

const TIERS: TierCard[] = [
  {
    key: 'maker',
    icon: Sparkles,
    name: 'Maker',
    price: '$0',
    cadence: '/ month',
    tagline: 'For makers exploring an idea.',
    perks: [
      'Unlimited products',
      'Brand assets + canvas',
      'Auto-compliance scan',
      'No PDF export',
      'iLaunchify watermark on previews',
    ],
  },
  {
    key: 'builder',
    icon: Zap,
    name: 'Builder',
    price: '$29',
    cadence: '/ month',
    tagline: 'For creators ready to ship orders.',
    highlight: true,
    perks: [
      'Everything in Maker',
      'Print-ready PDF + PNG export',
      'Multi-channel push (Shopify, Etsy…)',
      'Custom domain storefront',
      'Volume pricing (~12% off catalog)',
    ],
  },
  {
    key: 'agency',
    icon: Crown,
    name: 'Agency',
    price: '$99',
    cadence: '/ month',
    tagline: 'For influencer agencies + teams.',
    perks: [
      'Everything in Builder',
      'Multi-brand workspace',
      'Team seats + roles',
      'Priority partner routing',
      'Volume pricing (~22% off catalog)',
    ],
  },
]

export function UpgradeOverlay({
  currentTier,
  blockedAction = 'export',
  open,
  onClose,
}: Props) {
  // Two-phase mount so the slide-in animation runs on open. When `open`
  // flips to true, we render the panel at translate-y-full FIRST, then
  // flip the local `animateIn` flag on the next frame so the CSS
  // transition can interpolate to translate-y-0. When `open` is false
  // we render nothing at all — that's what prevents the panel leaking
  // into the workspace (no measured height = no transform escape).
  const [animateIn, setAnimateIn] = React.useState(false)
  React.useEffect(() => {
    if (!open) {
      setAnimateIn(false)
      return
    }
    const id = requestAnimationFrame(() => setAnimateIn(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const headline =
    blockedAction === 'export'
      ? 'Exporting a print-ready PDF is a Builder feature.'
      : 'This feature is part of Builder + Agency.'

  return (
    <>
      {/* Backdrop — click to close. Sits below the header so the bar stays
          interactive throughout. */}
      <div
        onClick={onClose}
        className={
          'fixed inset-x-0 bottom-0 z-40 bg-black/40 transition-opacity duration-200 ' +
          (animateIn ? 'opacity-100' : 'opacity-0')
        }
        // Backdrop starts directly under the 73px header.
        style={{ top: 73 }}
      />

      {/* Panel — slides down from y=-100% to 0 anchored under the header. */}
      <div
        role="dialog"
        aria-modal="true"
        className={
          'fixed inset-x-0 z-50 transform border-b border-ink-200 bg-white shadow-2xl transition-transform duration-300 ease-out ' +
          (animateIn ? 'translate-y-0' : '-translate-y-full')
        }
        style={{ top: 73 }}
      >
        <div className="relative mx-auto max-w-6xl px-8 py-8">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            aria-label="Close upgrade prompt"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mb-6">
            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-pink-600">
              Upgrade required
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">
              {headline}
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              Pick a plan to unlock print-ready exports, channel push, and the
              volume pricing the brands you compete against are already getting.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {TIERS.map((t) => (
              <TierCardView key={t.key} tier={t} currentTier={currentTier} />
            ))}
          </div>

          <p className="mt-5 text-center text-[11px] text-ink-500">
            Volume pricing applies to every order, not just one. Cancel anytime
            inside Settings → Plan.
          </p>
        </div>
      </div>
    </>
  )
}

function TierCardView({
  tier,
  currentTier,
}: {
  tier: TierCard
  currentTier: TierKey
}) {
  const isCurrent = tier.key === currentTier
  const Icon = tier.icon
  return (
    <div
      className={
        'flex flex-col rounded-xl border p-5 transition-shadow ' +
        (tier.highlight
          ? 'border-pink-300 bg-gradient-to-br from-pink-50/80 to-white shadow-sm'
          : 'border-ink-200 bg-white')
      }
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={
            'inline-flex h-7 w-7 items-center justify-center rounded-md ' +
            (tier.highlight
              ? 'bg-pink-100 text-pink-700'
              : 'bg-ink-100 text-ink-700')
          }
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-base font-semibold text-ink-900">{tier.name}</h3>
        {tier.highlight && (
          <span className="ml-auto rounded-full bg-pink-500 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-white">
            Recommended
          </span>
        )}
        {isCurrent && (
          <span className="ml-auto rounded-full bg-ink-900 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-white">
            Current
          </span>
        )}
      </div>

      <div className="mb-3">
        <span className="text-3xl font-bold tracking-tight text-ink-900">
          {tier.price}
        </span>
        <span className="ml-1 text-xs text-ink-500">{tier.cadence}</span>
        <p className="mt-1 text-[12.5px] text-ink-600">{tier.tagline}</p>
      </div>

      <ul className="mb-5 space-y-1.5">
        {tier.perks.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[12.5px] text-ink-700">
            <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
            <span>{p}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <button
          type="button"
          disabled
          className="rounded-full bg-ink-100 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink-500"
        >
          Your current plan
        </button>
      ) : (
        <a
          href={marketingUrl(`/pricing?tier=${tier.key}`)}
          className={
            'rounded-full px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider transition-colors ' +
            (tier.highlight
              ? 'bg-pink-500 text-white hover:bg-pink-600'
              : 'bg-ink-900 text-white hover:bg-black')
          }
        >
          {tier.key === 'agency' ? 'Talk to sales' : `Upgrade to ${tier.name}`}
        </a>
      )}
    </div>
  )
}
