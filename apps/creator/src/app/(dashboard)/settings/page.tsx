import { prisma } from '@ilaunchify/db'
import { requireUser, normalizeTier } from '@ilaunchify/auth'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const user = await requireUser()
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeAccountId: true, stripeAccountStatus: true },
  })

  // V1.5-T5 — surface the creator's current plan on the settings
  // landing so the Plan card mirrors the Payouts card pattern.
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { subscriptionTier: true, tierCancelAtPeriodEnd: true },
  })
  const tier = normalizeTier(profile?.subscriptionTier)
  const tierLabel = tier[0]!.toUpperCase() + tier.slice(1)
  const pendingCancel = profile?.tierCancelAtPeriodEnd ?? false

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          Creator · Settings
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Settings
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Manage your plan, payouts, and account preferences.
        </p>
      </div>

      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="font-display text-[17px] font-semibold tracking-tight text-ink-900">
          Plan
        </h2>
        <p className="mt-1 text-[13px] text-ink-600">
          {tier === 'maker'
            ? 'Upgrade to unlock Subscribe & save, print-ready Design Studio export, and priority support.'
            : pendingCancel
              ? `You're on ${tierLabel} but the plan is scheduled to cancel at the end of the period.`
              : `You're on the ${tierLabel} plan — manage billing or switch tiers any time.`}
        </p>
        <p className="mt-3 text-[13px] text-ink-700">
          Current tier: <span className="font-semibold text-ink-900">{tierLabel}</span>
        </p>
        <Link
          href="/settings/plan"
          className="mt-3 inline-block text-[13px] font-semibold text-pink-700 hover:text-pink-800"
        >
          {tier === 'maker' ? 'See upgrade options →' : 'Manage plan →'}
        </Link>
      </section>

      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="font-display text-[17px] font-semibold tracking-tight text-ink-900">
          Payouts (Stripe Connect)
        </h2>
        <p className="mt-1 text-[13px] text-ink-600">
          {dbUser?.stripeAccountStatus === 'ACTIVE'
            ? 'Payouts enabled — Stripe will deposit your share after each consumer order ships and the returns window passes.'
            : 'Set up payouts before publishing your first product.'}
        </p>
        <p className="mt-3 text-[13px] text-ink-700">
          Status:{' '}
          <span className="font-semibold text-ink-900">
            {dbUser?.stripeAccountStatus ?? 'NONE'}
          </span>
        </p>
        <Link
          href="/settings/payouts"
          className="mt-3 inline-block text-[13px] font-semibold text-pink-700 hover:text-pink-800"
        >
          {dbUser?.stripeAccountStatus === 'ACTIVE' ? 'Open Stripe dashboard' : 'Connect payouts →'}
        </Link>
      </section>

      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="font-display text-[17px] font-semibold tracking-tight text-ink-900">
          Notifications
        </h2>
        <p className="mt-1 text-[13px] text-ink-600">
          Choose which order, partner, and support updates you receive — in-app and by email — and
          set quiet hours.
        </p>
        <Link
          href="/settings/notifications"
          className="mt-3 inline-block text-[13px] font-semibold text-pink-700 hover:text-pink-800"
        >
          Manage notifications →
        </Link>
      </section>
    </div>
  )
}
