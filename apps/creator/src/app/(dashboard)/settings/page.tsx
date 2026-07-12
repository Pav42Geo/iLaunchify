import { prisma, getBillingProfile } from '@ilaunchify/db'
import { requireUser, normalizeTier } from '@ilaunchify/auth'
import Link from 'next/link'
import {
  ArrowRight,
  User as UserIcon,
  CreditCard,
  Wallet,
  Bell,
  MessageSquareHeart,
  Store,
  ShieldCheck,
  ReceiptText,
  Truck,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

type PillTone = 'good' | 'warn' | 'neutral' | 'brand'

const PILL_TONE: Record<PillTone, string> = {
  good: 'border-success-200 bg-success-50 text-success-800',
  warn: 'border-warning-200 bg-warning-50 text-warning-800',
  neutral: 'border-ink-200 bg-ink-100 text-ink-700',
  brand: 'border-pink-200 bg-pink-50 text-pink-700',
}

export default async function SettingsPage() {
  const user = await requireUser()

  const [dbUser, profile, billing] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, name: true, stripeAccountStatus: true },
    }),
    prisma.creatorProfile.findUnique({
      where: { userId: user.id },
      select: {
        displayName: true,
        audienceSizeBand: true,
        onboardingProgress: true,
        subscriptionTier: true,
        tierCancelAtPeriodEnd: true,
        fulfillmentPreference: true,
      },
    }),
    getBillingProfile(user.id),
  ])

  const tier = normalizeTier(profile?.subscriptionTier)
  const tierLabel = tier[0]!.toUpperCase() + tier.slice(1)
  const pendingCancel = profile?.tierCancelAtPeriodEnd ?? false

  const FULFILLMENT_PREF_LABEL: Record<string, string> = { BALANCED: 'Balanced', SPEED: 'Speed', COST: 'Cost' }
  const fulfillmentPrefLabel = FULFILLMENT_PREF_LABEL[profile?.fulfillmentPreference ?? 'BALANCED'] ?? 'Balanced'

  const progress = (profile?.onboardingProgress as Record<string, unknown> | null) ?? {}
  const marketIds = Array.isArray(progress.declaredTargetMarketIds)
    ? (progress.declaredTargetMarketIds as string[])
    : []
  const selectedChannel = typeof progress.selectedChannel === 'string' ? progress.selectedChannel : ''

  const profileComplete = Boolean(profile?.audienceSizeBand) && marketIds.length > 0
  const payoutActive = dbUser?.stripeAccountStatus === 'ACTIVE'
  const billingSet = Boolean(
    billing.billingContactName || billing.billingAddress || billing.taxId,
  )

  const displayName = profile?.displayName || dbUser?.name || 'Your account'
  const initial = displayName.trim().charAt(0).toUpperCase() || 'C'

  return (
    <div className="space-y-8">
      {/* Hero + account summary */}
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Creator · Settings
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Settings
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Manage your profile, plan, billing, payouts, and preferences in one place.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl border border-ink-200 bg-white/70 px-4 py-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-900 text-[15px] font-bold text-white">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-ink-900">{displayName}</div>
            <div className="truncate text-[12px] text-ink-500">{dbUser?.email}</div>
          </div>
          <span
            className={`ml-auto inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${PILL_TONE.brand}`}
          >
            {tierLabel} plan
          </span>
        </div>
      </div>

      {/* Account */}
      <Section title="Account">
        <SettingCard
          icon={<UserIcon className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Profile"
          href="/settings/profile"
          cta="Edit profile"
          description="Your display name, the markets you sell in, and audience size — drives label compliance and partner matching."
          pill={profileComplete ? { label: 'Complete', tone: 'good' } : { label: 'Needs info', tone: 'warn' }}
        />
      </Section>

      {/* Payments & plans */}
      <Section title="Payments & plans">
        <SettingCard
          icon={<ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Plan"
          href="/settings/plan"
          cta={tier === 'maker' ? 'See upgrade options' : 'Manage plan'}
          description={
            tier === 'maker'
              ? 'Upgrade to unlock Subscribe & save, print-ready Studio export, and priority support.'
              : pendingCancel
                ? `On ${tierLabel}, scheduled to cancel at period end.`
                : `You're on the ${tierLabel} plan — switch tiers any time.`
          }
          pill={
            pendingCancel
              ? { label: 'Cancels soon', tone: 'warn' }
              : { label: tierLabel, tone: 'brand' }
          }
        />
        <SettingCard
          icon={<CreditCard className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Billing"
          href="/settings/billing"
          cta="Manage billing details"
          description="Contact and tax details on your invoices. Card and bank numbers are held securely by our payment processor — never stored here."
          pill={billingSet ? { label: 'Set up', tone: 'good' } : { label: 'Not set', tone: 'neutral' }}
        />
        <SettingCard
          icon={<ReceiptText className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Orders & invoices"
          href="/settings/billing/invoices"
          cta="View order history"
          description="Your production order history, totals, and Stripe-hosted receipts in one billing-history view."
        />
        <SettingCard
          icon={<Wallet className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Payouts"
          href="/settings/payouts"
          cta={payoutActive ? 'Open Stripe dashboard' : 'Connect payouts'}
          description={
            payoutActive
              ? 'Payouts enabled — Stripe deposits your share after each order completes.'
              : 'Set up Stripe Connect to receive payouts. Bank details live in Stripe, never here.'
          }
          pill={
            payoutActive
              ? { label: 'Connected', tone: 'good' }
              : { label: dbUser?.stripeAccountStatus ?? 'Not connected', tone: 'neutral' }
          }
        />
      </Section>

      {/* Connections */}
      <Section title="Connections">
        <SettingCard
          icon={<Store className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Sales channels"
          href="/settings/channels"
          cta="Manage channel"
          description="Where customers buy your finished products (Shopify, Amazon, your own site). Helps us size shipping and packaging."
          pill={
            selectedChannel
              ? { label: 'Connected', tone: 'good' }
              : { label: 'Not set', tone: 'neutral' }
          }
        />
      </Section>

      {/* Preferences */}
      <Section title="Preferences">
        <SettingCard
          icon={<Truck className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Fulfillment preference"
          href="/settings/fulfillment"
          cta="Set preference"
          description="When bulk orders ship to a fulfillment center, we auto-pick the best-matched one. Choose whether to optimize for speed, cost, or a balance."
          pill={{ label: fulfillmentPrefLabel, tone: 'brand' }}
        />
        <SettingCard
          icon={<Bell className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Notifications"
          href="/settings/notifications"
          cta="Manage notifications"
          description="Choose which order, partner, and support updates you receive — in-app and by email — and set quiet hours."
        />
        <SettingCard
          icon={<MessageSquareHeart className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Give feedback"
          href="/settings/feedback"
          cta="Share feedback"
          description="Tell us what's working, what broke, or what we should build next. Always open — a human reads every one."
        />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-ink-700">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function SettingCard({
  icon,
  title,
  description,
  href,
  cta,
  pill,
}: {
  icon: React.ReactNode
  title: string
  description: string
  href: string
  cta: string
  pill?: { label: string; tone: PillTone }
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-ink-200 bg-white p-5 transition-colors hover:border-ink-300 hover:bg-ink-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-900 text-white">
          {icon}
        </span>
        <h3 className="font-display text-[16px] font-semibold tracking-tight text-ink-900">
          {title}
        </h3>
        {pill && (
          <span
            className={`ml-auto inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider ${PILL_TONE[pill.tone]}`}
          >
            {pill.label}
          </span>
        )}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-600">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-pink-700 group-hover:text-pink-800">
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  )
}
