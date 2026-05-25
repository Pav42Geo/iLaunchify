// Step 1 landing — "Tell us about you" (markets + audience).
// Deep-linked from the Launch Checklist drawer (item #1).
//
// Per docs/CREATOR_ONBOARDING.md. Step 1 is the only required step in the
// creator onboarding flow — markets selection drives label-rule selection,
// audience-size feeds fee/MOQ recommendations.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { ProfileForm } from './ProfileForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Profile — iLaunchify' }

export default async function ProfileSettingsPage() {
  const user = await requireUser()

  // Load creator profile + active markets for the picker. Markets with
  // COMING_SOON status are hidden (matches partner pattern).
  const [profile, markets] = await Promise.all([
    prisma.creatorProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        displayName: true,
        audienceSizeBand: true,
        onboardingProgress: true,
      },
    }),
    prisma.market.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, code: true, name: true, region: true },
      orderBy: { code: 'asc' },
    }),
  ])

  if (!profile) {
    return (
      <div className="rounded-md border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Your creator profile is missing — contact support.
      </div>
    )
  }

  const progress = (profile.onboardingProgress as Record<string, unknown> | null) ?? {}
  const initialMarketIds = Array.isArray(progress.declaredTargetMarketIds)
    ? (progress.declaredTargetMarketIds as string[])
    : []

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-wider text-zinc-500">
          Step 1 of 5
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Tell us about you</h1>
        <p className="mt-1 text-sm text-zinc-500">
          We use this to pick the right label-compliance rules for your products and to
          tailor partner recommendations.
        </p>
      </header>

      <ProfileForm
        displayName={profile.displayName}
        initialAudienceBand={profile.audienceSizeBand}
        initialMarketIds={initialMarketIds}
        markets={markets}
      />
    </div>
  )
}
