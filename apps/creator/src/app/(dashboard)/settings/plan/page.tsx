// V1.5-T5 — creator self-serve tier upgrade page.
//
// Surface: /settings/plan (canonical URL — entry points in T6 deep-link
// here from /pricing, UpgradeOverlay, orders-detail support link, etc).
//
// Layout mirrors /subscriptions (G6.f) — cream header band, three
// equal-width tier cards stacked vertically on mobile, side-by-side on
// >sm. Each card knows three things about the current creator:
//
//   1. Is this their current plan?
//   2. Are they pending cancellation (only meaningful for current plan)?
//   3. Is this tier an upgrade vs downgrade (Pavel decision V1.5:
//      downgrade = cancel current sub, NOT a direct downgrade Checkout —
//      so the Maker card just renders explanatory copy when current
//      tier is Builder/Agency).
//
// Checkout success/cancel banners come from query params (Stripe sets
// those redirect URLs in V1.5-T3's createTierCheckoutSession).

import { prisma } from '@ilaunchify/db'
import { requireUser, TIER_RANK, normalizeTier } from '@ilaunchify/auth'
import {
  CREATOR_PLAN_CODES,
  CREATOR_FEATURES,
  type CreatorPlanCode,
} from '@ilaunchify/plans'
import Link from 'next/link'
import {
  Check,
  Sparkles,
  Crown,
  Rocket,
  AlertCircle,
  CalendarClock,
} from 'lucide-react'
import {
  UpgradeButton,
  CancelButton,
  ResumeButton,
} from './PlanActionButtons'

export const dynamic = 'force-dynamic'

// =============================================================================
// Static per-tier copy. Pricing + numeric limits come from the DB so
// admin /admin/tiers edits propagate; the copy here is editorial.
// =============================================================================

type TierMeta = {
  key: 'maker' | 'builder' | 'agency'
  planCode: CreatorPlanCode
  name: string
  tagline: string
  /** Color used for the accent band + price emphasis. */
  accent: { bg: string; fg: string; border: string }
  /** Icon component to render in the card header. */
  Icon: typeof Sparkles
  /** Editorial feature bullets — supplements DB-driven feature flags. */
  features: string[]
}

const TIER_META: readonly TierMeta[] = [
  {
    key: 'maker',
    planCode: CREATOR_PLAN_CODES.maker,
    name: 'Maker',
    tagline: 'Test ideas without commitment.',
    accent: { bg: '#F4F1EA', fg: '#3D3527', border: '#E5DDC8' },
    Icon: Sparkles,
    features: [
      'Unlimited products + label drafts',
      'Marketplace browse + partner matching',
      'Standard order routing + tracking',
      'Pay-as-you-go production fees',
      'DIY label design on your maker’s die-line',
    ],
  },
  {
    key: 'builder',
    planCode: CREATOR_PLAN_CODES.builder,
    name: 'Builder',
    tagline: 'For creators running real production.',
    accent: { bg: '#FFE7EF', fg: '#9D174D', border: '#FBCFE0' },
    Icon: Rocket,
    features: [
      'Everything in Maker, plus:',
      '12% platform fee — save 3% on every run',
      'Print-ready Design Studio export',
      'Post co-creation briefs to matched makers',
      '2 invited-designer seats (shared design workspace)',
      'Priority human support on every order',
      'Volume pricing on production runs',
    ],
  },
  {
    key: 'agency',
    planCode: CREATOR_PLAN_CODES.agency,
    name: 'Agency',
    tagline: 'Multi-brand teams + influencer agencies.',
    accent: { bg: '#FDF4DA', fg: '#854F0B', border: '#FACA75' },
    Icon: Crown,
    features: [
      'Everything in Builder, plus:',
      'Multi-brand workspace (unlimited brands)',
      'Custom domain storefronts',
      'Best-in-class fee rate on production',
      '5 invited-designer seats (shared design workspace)',
      'Dedicated launch partner + roadmap input',
    ],
  },
] as const

// =============================================================================
// Page
// =============================================================================

interface PageProps {
  searchParams: Promise<{
    checkout?: 'success' | 'cancelled'
    tier?: string
  }>
}

export default async function PlanPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const sp = await searchParams

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      subscriptionTier: true,
      stripeTierSubscriptionId: true,
      tierCurrentPeriodEnd: true,
      tierCancelAtPeriodEnd: true,
    },
  })

  // Pull all three creator plans in one query so we get DB-driven
  // pricing per tier (admin can change without redeploy).
  const plans = await prisma.subscriptionPlan.findMany({
    where: {
      code: {
        in: [
          CREATOR_PLAN_CODES.maker,
          CREATOR_PLAN_CODES.builder,
          CREATOR_PLAN_CODES.agency,
        ],
      },
    },
    include: { features: true },
  })
  const planByCode = new Map(plans.map((p) => [p.code, p]))

  const currentTier = normalizeTier(profile?.subscriptionTier)
  const pendingCancel = profile?.tierCancelAtPeriodEnd ?? false
  const periodEnd = profile?.tierCurrentPeriodEnd ?? null

  // V1 dunning grace state (cast-guarded — fields land after the migration).
  const dunning = await (
    prisma as unknown as {
      creatorProfile: {
        findUnique: (a: unknown) => Promise<{ tierGraceUntil: Date | null } | null>
      }
    }
  ).creatorProfile
    .findUnique({ where: { userId: user.id }, select: { tierGraceUntil: true } })
    .catch(() => null)
  const graceUntil = dunning?.tierGraceUntil ?? null

  return (
    <div className="space-y-6">
      {graceUntil && (
        <div className="rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3">
          <p className="text-[12.5px] leading-relaxed text-danger-900">
            <span className="font-semibold">Your last subscription payment failed.</span>{' '}
            Update your card by{' '}
            <span className="font-semibold">{graceUntil.toLocaleDateString()}</span> or your account
            will move to the free Maker plan. Use <span className="font-medium">Manage billing</span>{' '}
            below to update your payment method.
          </p>
        </div>
      )}

      <header className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
              Creator · Subscription
            </p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
              Your iLaunchify plan
            </h1>
            <p className="mt-1 max-w-xl text-[13px] text-ink-600">
              You&rsquo;re currently on{' '}
              <span className="font-semibold capitalize text-ink-900">
                {currentTier}
              </span>
              .{' '}
              {currentTier === 'maker'
                ? 'Upgrade to unlock Subscribe & save, print-ready export, and priority support.'
                : pendingCancel
                  ? 'Your plan is set to cancel at the end of the current period.'
                  : 'Manage your subscription below — switch tiers any time.'}
            </p>
          </div>
          <Link
            href="/subscriptions"
            className="inline-flex items-center rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-700 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Compare all plans
          </Link>
        </div>
      </header>

      {/* Checkout result banners */}
      {sp.checkout === 'success' && (
        <ResultBanner
          tone="success"
          icon={<Check className="h-4 w-4" />}
          title={`Welcome to ${sp.tier ? sp.tier[0]!.toUpperCase() + sp.tier.slice(1) : 'your new plan'}!`}
          message="Your subscription is active. The card below reflects your new tier — give it a moment if it still shows the old plan, then refresh."
        />
      )}
      {sp.checkout === 'cancelled' && (
        <ResultBanner
          tone="warning"
          icon={<AlertCircle className="h-4 w-4" />}
          title="Checkout cancelled"
          message="No charge was made. You can try again whenever you're ready."
        />
      )}

      {pendingCancel && periodEnd && (
        <ResultBanner
          tone="warning"
          icon={<CalendarClock className="h-4 w-4" />}
          title={`Plan cancels on ${formatDate(periodEnd)}`}
          message={`You'll keep ${currentTier[0]!.toUpperCase() + currentTier.slice(1)} benefits until then. Change your mind?`}
          slot={<ResumeButton />}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {TIER_META.map((meta) => {
          const plan = planByCode.get(meta.planCode)
          const isCurrent = currentTier === meta.key
          const tierRank = TIER_RANK[meta.key]
          const currentRank = TIER_RANK[currentTier]
          const isUpgrade = tierRank > currentRank
          const isDowngrade = tierRank < currentRank

          return (
            <TierCard
              key={meta.key}
              meta={meta}
              monthlyPriceCents={plan?.monthlyPriceCents ?? 0}
              description={plan?.description ?? null}
              isCurrent={isCurrent}
              isUpgrade={isUpgrade}
              isDowngrade={isDowngrade}
              pendingCancel={isCurrent && pendingCancel}
              periodEnd={isCurrent ? periodEnd : null}
              hasStripeSub={Boolean(profile?.stripeTierSubscriptionId)}
            />
          )
        })}
      </div>

      <FooterCallout />
    </div>
  )
}

// =============================================================================
// TierCard
// =============================================================================

interface TierCardProps {
  meta: TierMeta
  monthlyPriceCents: number
  description: string | null
  isCurrent: boolean
  isUpgrade: boolean
  isDowngrade: boolean
  pendingCancel: boolean
  periodEnd: Date | null
  /** False for admin-granted Builder/Agency (courtesy upgrade, no Stripe
      sub on file) — the self-serve cancel CTA is hidden for that state. */
  hasStripeSub: boolean
}

function TierCard({
  meta,
  monthlyPriceCents,
  description,
  isCurrent,
  isUpgrade,
  isDowngrade,
  pendingCancel,
  periodEnd,
  hasStripeSub,
}: TierCardProps) {
  const Icon = meta.Icon
  const price = monthlyPriceCents > 0 ? `$${(monthlyPriceCents / 100).toFixed(0)}` : 'Free'

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white transition ${
        isCurrent
          ? 'border-pink-300 shadow-[0_8px_24px_-12px_rgba(255,46,99,0.25)]'
          : 'border-ink-200'
      }`}
    >
      {/* Header band */}
      <header
        className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-5 py-3 text-[12px]"
        style={{
          background: meta.accent.bg,
          color: meta.accent.fg,
          borderBottomColor: meta.accent.border,
        }}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="font-display text-lg font-semibold leading-none">
          {meta.name}
        </span>
        {isCurrent && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider">
            <Check className="h-3 w-3" />
            Current
          </span>
        )}
      </header>

      {/* Price + tagline */}
      <div className="px-5 pt-4">
        <p className="text-[12px] text-ink-600">{meta.tagline}</p>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="font-display text-3xl font-bold tabular-nums text-ink-900">
            {price}
          </span>
          {monthlyPriceCents > 0 && (
            <span className="text-[12px] text-ink-500">/ month</span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-[11.5px] italic text-ink-500">
            {description}
          </p>
        )}
      </div>

      {/* Features */}
      <ul className="mt-4 space-y-1.5 px-5 text-[12.5px] text-ink-700">
        {meta.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check
              className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-success-600"
              aria-hidden="true"
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {/* CTA — state machine */}
      <div className="mt-5 border-t border-ink-100 px-5 py-4">
        {isCurrent ? (
          pendingCancel ? (
            <CurrentWithPendingCancel periodEnd={periodEnd} />
          ) : meta.key === 'maker' ? (
            <p className="text-center text-[11.5px] text-ink-500">
              You&rsquo;re on the free plan.
            </p>
          ) : hasStripeSub ? (
            <CancelButton
              tierName={meta.name}
              periodEndLabel={periodEnd ? formatDate(periodEnd) : null}
              loseFeatures={meta.features.filter(
                (f) => !f.endsWith('plus:'),
              )}
            />
          ) : (
            // Admin-granted tier (no Stripe sub) — self-serve cancel would
            // 404 against Stripe; route these through support instead.
            <p className="text-center text-[11.5px] leading-relaxed text-ink-500">
              Your plan is managed by iLaunchify.{' '}
              <Link
                href="/help/new"
                className="font-medium text-pink-700 underline hover:text-pink-800"
              >
                Contact support
              </Link>{' '}
              to make changes.
            </p>
          )
        ) : isUpgrade && meta.key !== 'maker' ? (
          <UpgradeButton
            targetTier={meta.key.toUpperCase() as 'BUILDER' | 'AGENCY'}
            label={`Upgrade to ${meta.name}`}
          />
        ) : isDowngrade && meta.key === 'maker' ? (
          <DowngradeExplainer />
        ) : isDowngrade ? (
          <DowngradeExplainer agency />
        ) : null}
      </div>
    </article>
  )
}

// =============================================================================
// Inline helpers
// =============================================================================

function CurrentWithPendingCancel({ periodEnd }: { periodEnd: Date | null }) {
  return (
    <div className="space-y-2 text-center">
      <p className="text-[11.5px] text-ink-700">
        Cancels on{' '}
        <span className="font-semibold">
          {periodEnd ? formatDate(periodEnd) : 'period end'}
        </span>
      </p>
      <ResumeButton />
    </div>
  )
}

function DowngradeExplainer({ agency = false }: { agency?: boolean }) {
  return (
    <p className="text-center text-[11.5px] leading-snug text-ink-500">
      {agency
        ? 'To switch from Agency to Builder, cancel your current subscription, then re-subscribe at the lower tier.'
        : 'Cancel your current subscription to drop back to Maker at the end of the billing period.'}
    </p>
  )
}

function ResultBanner({
  tone,
  icon,
  title,
  message,
  slot,
}: {
  tone: 'success' | 'warning'
  icon: React.ReactNode
  title: string
  message: string
  slot?: React.ReactNode
}) {
  const palette =
    tone === 'success'
      ? { bg: '#E1F5EE', border: '#9FE1CB', fg: '#085041' }
      : { bg: '#FAEEDA', border: '#FAC775', fg: '#854F0B' }

  return (
    <div
      className="flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-[12.5px]"
      style={{
        background: palette.bg,
        borderColor: palette.border,
        color: palette.fg,
      }}
      role="status"
    >
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 opacity-90">{message}</p>
      </div>
      {slot && <div className="flex-shrink-0">{slot}</div>}
    </div>
  )
}

function FooterCallout() {
  return (
    <aside className="rounded-xl border border-dashed border-ink-300 bg-ink-50/40 px-5 py-4 text-[12px] text-ink-600">
      <p className="font-semibold text-ink-900">Questions about pricing?</p>
      <p className="mt-1">
        Plans are billed monthly through Stripe and you can cancel any time —
        you&rsquo;ll keep your tier until the end of the current period. Need
        help picking?{' '}
        <Link
          href="/contact-sales"
          className="font-semibold text-pink-700 underline"
        >
          Talk to our team
        </Link>
        .
      </p>
    </aside>
  )
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Used to silence "unused export" warnings in the in-page rendering —
// CREATOR_FEATURES is the canonical home of the feature-code constants
// referenced in the marketing copy above, so importing it documents the
// dependency even if we don't gate on it directly here.
void CREATOR_FEATURES
