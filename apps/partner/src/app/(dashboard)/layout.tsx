// Partner dashboard layout.
// Per docs/PARTNER_ONBOARDING.md §7 — routes partners through the right surface
// based on the 10-state Partner.status FSM:
//
//   First-visit (no welcomeSeen flag) → /onboarding/welcome
//   LEAD / DRAFT / INVITED / IN_PROGRESS    → /onboarding (4-section accordion)
//   IDENTITY_PENDING_REVIEW / OPS_PENDING_REVIEW
//     / IDENTITY_VERIFIED / OPERATIONALLY_CONFIGURED → /onboarding/status
//   ACTIVE / INTEGRATION_ENHANCED → full dashboard
//   PAUSED / SUSPENDED / TERMINATED → restricted shell with a status banner
//
// Status comes through each request from the DB so there's no stale-cache
// problem when admin flips the partner. Welcome detection uses a JSON flag
// in Partner.onboardingProgress so we don't show it twice.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { PartnerSidebar } from '@/components/nav/PartnerSidebar'
import { PartnerTopbar } from '@/components/nav/PartnerTopbar'

// Statuses where the partner is mid-onboarding (form not yet submitted).
const PRE_SUBMIT_STATUSES = new Set([
  'LEAD',
  'DRAFT',
  'INVITED',
  'IN_PROGRESS',
])

// Statuses where partner has submitted but admin hasn't fully approved.
// IDENTITY_VERIFIED + OPERATIONALLY_CONFIGURED are intermediate "approved a
// layer but not yet ACTIVE" steps — we keep them on the status page so they
// can see progress without prematurely accessing dashboard features that
// depend on full activation.
const POST_SUBMIT_STATUSES = new Set([
  'IDENTITY_PENDING_REVIEW',
  'IDENTITY_VERIFIED',
  'OPS_PENDING_REVIEW',
  'OPERATIONALLY_CONFIGURED',
  'UNDER_REVIEW', // legacy enum value
])

export default async function PartnerDashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (user.role !== 'PARTNER') redirect('/login?error=unauthorized')

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, status: true, companyName: true, onboardingProgress: true },
  })

  if (!partner) redirect('/onboarding')

  // Where are we now? We use the pathname to avoid loops — if the partner
  // is already on /onboarding/welcome or /onboarding/status, the layout
  // wouldn't render anyway (those routes live outside (dashboard)/), but
  // we keep the conditional clean here for clarity.
  const progress = (partner.onboardingProgress as Record<string, unknown> | null) ?? {}
  const welcomeSeen = progress.welcomeSeen === true

  // First-visit detection: pre-submit + haven't seen Welcome yet
  if (PRE_SUBMIT_STATUSES.has(partner.status) && !welcomeSeen) {
    redirect('/onboarding/welcome')
  }

  // Pre-submit → onboarding accordion
  if (PRE_SUBMIT_STATUSES.has(partner.status)) {
    redirect('/onboarding')
  }

  // Post-submit but not yet ACTIVE → status page
  if (POST_SUBMIT_STATUSES.has(partner.status)) {
    // Use the request path to avoid infinite redirects when the status page
    // links here on activation. headers() is async in Next 15.
    const hdrs = await headers()
    const pathname = hdrs.get('x-pathname') ?? hdrs.get('x-invoke-path') ?? ''
    // Only redirect if not already on the status page (defensive — the
    // status page lives outside (dashboard)/ so this branch is mostly a
    // safety net for direct /dashboard hits).
    if (!pathname.startsWith('/onboarding/status')) {
      redirect('/onboarding/status')
    }
  }

  // Restricted-shell states keep the user on the dashboard route group but
  // with a stripped-down sidebar (My Application + Help). ACTIVE +
  // INTEGRATION_ENHANCED get the full nav.
  const restricted = !['ACTIVE', 'INTEGRATION_ENHANCED'].includes(partner.status)

  return (
    <div className="flex min-h-screen flex-col">
      <PartnerTopbar user={user} companyName={partner.companyName} />
      <div className="flex flex-1">
        <PartnerSidebar status={partner.status} restricted={restricted} />
        <main className="flex-1 overflow-y-auto bg-zinc-50 p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
