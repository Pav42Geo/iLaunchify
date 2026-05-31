import { prisma } from '@ilaunchify/db'
import { requireUser, normalizeTier } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
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
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan</CardTitle>
          <CardDescription>
            {tier === 'maker'
              ? 'Upgrade to unlock Subscribe & save, print-ready Design Studio export, and priority support.'
              : pendingCancel
                ? `You're on ${tierLabel} but the plan is scheduled to cancel at the end of the period.`
                : `You're on the ${tierLabel} plan — manage billing or switch tiers any time.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            Current tier: <span className="font-medium">{tierLabel}</span>
          </p>
          <Link
            href="/settings/plan"
            className="mt-3 inline-block text-sm text-brand-primary underline"
          >
            {tier === 'maker' ? 'See upgrade options →' : 'Manage plan →'}
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payouts (Stripe Connect)</CardTitle>
          <CardDescription>
            {dbUser?.stripeAccountStatus === 'ACTIVE'
              ? 'Payouts enabled — Stripe will deposit your share after each consumer order ships and the returns window passes.'
              : 'Set up payouts before publishing your first product.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            Status: <span className="font-medium">{dbUser?.stripeAccountStatus ?? 'NONE'}</span>
          </p>
          <Link href="/settings/payouts" className="mt-3 inline-block text-sm text-brand-primary underline">
            {dbUser?.stripeAccountStatus === 'ACTIVE' ? 'Open Stripe dashboard' : 'Connect payouts →'}
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
