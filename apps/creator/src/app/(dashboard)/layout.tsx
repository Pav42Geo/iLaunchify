// Creator dashboard layout — wraps every authenticated creator page with
// the sidebar, topbar, and the Launch Checklist drawer system.
//
// The drawer is the V1 onboarding UX (per Pavel decision 2026-05-25). Loads
// the creator's checklist progress server-side once per request, passes it
// into the LaunchChecklistProvider that the sidebar trigger + drawer read.
//
// Auto-open behavior: the very first time a creator hits any dashboard page,
// we set shouldAutoOpen=true so the drawer renders open. The provider stamps
// onboardingProgress.checklistOpenedAt server-side on mount so subsequent
// visits leave the drawer closed (creator can re-open from the sidebar).

import { requireRole } from '@ilaunchify/auth'
import { DashboardSidebar } from '@/components/nav/DashboardSidebar'
import { DashboardTopbar } from '@/components/nav/DashboardTopbar'
import { LaunchChecklistDrawer } from '@/components/checklist/LaunchChecklistDrawer'
import {
  LaunchChecklistProvider,
  type ChecklistSnapshot,
  type StripeStatus,
} from '@/components/checklist/LaunchChecklistProvider'
import { getCreatorChecklistState } from './_actions/checklist-actions'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['CREATOR', 'ADMIN'])
  const state = await getCreatorChecklistState()

  // Hydrate the snapshot from CreatorProfile.onboardingProgress JSON +
  // related rows (Stripe status, completion timestamps). Admin users
  // don't have CreatorProfile rows — render a no-op snapshot so the
  // provider still works (drawer effectively never opens for admin).
  const progress = (state?.onboardingProgress as Record<string, unknown> | null) ?? {}
  const declaredMarketIds = Array.isArray(progress.declaredTargetMarketIds)
    ? (progress.declaredTargetMarketIds as string[])
    : []

  const snapshot: ChecklistSnapshot = {
    step1: {
      targetMarketIds: declaredMarketIds,
      audienceSizeBand: state?.audienceSizeBand ?? null,
      completedAt:
        typeof progress.step1CompletedAt === 'string' ? progress.step1CompletedAt : null,
    },
    step2: {
      stripeAccountStatus: (state?.user?.stripeAccountStatus ?? 'NONE') as StripeStatus,
    },
    step3CompletedAt:
      typeof progress.step3CompletedAt === 'string' ? progress.step3CompletedAt : null,
    step4CompletedAt:
      typeof progress.step4CompletedAt === 'string' ? progress.step4CompletedAt : null,
    step5CompletedAt:
      typeof progress.step5CompletedAt === 'string' ? progress.step5CompletedAt : null,
  }

  const shouldAutoOpen =
    user.role === 'CREATOR' &&
    !!state &&
    typeof progress.checklistOpenedAt !== 'string'

  return (
    <LaunchChecklistProvider initialSnapshot={snapshot} meta={{ shouldAutoOpen }}>
      <div className="flex min-h-screen">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col">
          <DashboardTopbar user={user} />
          <main className="flex-1 overflow-y-auto bg-zinc-50 p-6">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
      <LaunchChecklistDrawer />
    </LaunchChecklistProvider>
  )
}
