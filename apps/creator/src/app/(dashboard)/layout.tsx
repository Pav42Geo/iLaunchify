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
import { getOutstandingLegalDocs } from '@ilaunchify/auth/server'
import { prisma, getCoCreationSettings } from '@ilaunchify/db'
import { LegalGate } from './LegalGate'
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

  // Legal re-acceptance gate (L3): block the app behind a blocking interstitial
  // when there are published, acceptance-required docs this creator hasn't
  // accepted at the current version. Inert until docs are published in admin.
  const outstandingLegal = await getOutstandingLegalDocs(user.id, user.role)
  if (outstandingLegal.length > 0) {
    return <LegalGate docs={outstandingLegal} />
  }

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

  // Co-creation kick-off switch (Pavel 2026-07-10): Briefs nav hides until
  // the admin opens the module — unless this creator already has briefs in
  // flight (never strand existing work behind a hidden door).
  const ccEnabled = (await getCoCreationSettings()).moduleEnabled
  const showBriefs =
    ccEnabled ||
    (await prisma.productBrief.count({ where: { creator: { userId: user.id } } })) > 0

  // First Collaboration Room visit (Pavel 2026-07-12): tracked per ACCOUNT on
  // onboardingProgress.roomFirstVisitAt (same JSON as the checklist stamps).
  // The sidebar force-folds on the first /rooms/* visit, then stamps via
  // maybeStampRoomFirstVisit. Non-creators (admin) never force-fold.
  const roomSeen =
    user.role !== 'CREATOR' || !state || typeof progress.roomFirstVisitAt === 'string'

  return (
    <LaunchChecklistProvider initialSnapshot={snapshot} meta={{ shouldAutoOpen }}>
      <div className="flex h-screen flex-col">
        <DashboardTopbar user={user} />
        <div className="flex min-h-0 flex-1">
          <DashboardSidebar showBriefs={showBriefs} roomSeen={roomSeen} />
          {/* overflow-x-clip lets a landing page's hero break full-bleed
              (margin-left: calc(50% - 50vw); width: 100vw) and get clipped to
              the content area instead of spilling under the sidebar.

              FULL-BLEED GRID (2026-07-10): main is a 3-column grid replacing
              the old p-6 + max-w-6xl wrapper — visually identical for every
              page (center column = min(72rem, 100% − 3rem), 1.5rem gutters,
              py-6). A page child marked data-full-bleed spans all columns and
              hugs the sidebar edge exactly, tracking its fold/unfold because
              main is the sidebar's flex sibling (co-creation stepper uses it). */}
          <main className="min-w-0 flex-1 overflow-x-clip overflow-y-auto bg-ink-50">
            {/* Grid lives on an inner block (NOT the scroll container itself)
                — grid/flex scroll containers drop bottom padding from the
                scrollable overflow in some engines, which cut off the page
                end. Scroll math stays classic; full-bleed still spans main. */}
            <div className="grid content-start grid-cols-[minmax(1.5rem,1fr)_minmax(0,72rem)_minmax(1.5rem,1fr)] py-6 [&>*:not([data-full-bleed])]:col-start-2">
              {children}
            </div>
          </main>
        </div>
      </div>
      <LaunchChecklistDrawer />
    </LaunchChecklistProvider>
  )
}
