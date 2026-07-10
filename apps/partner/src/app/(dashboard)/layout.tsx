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
import { prisma, isNominationEnabled } from '@ilaunchify/db'
import { getActingPartner } from '@/lib/partner-context'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { PartnerSidebar } from '@/components/nav/PartnerSidebar'
import { PartnerTopbar } from '@/components/nav/PartnerTopbar'
import { resolveActivationLimited } from '@/lib/activation-status'

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

  // P3 multi-seat: resolve the acting partner via membership (founder OR
  // teammate) — getPartnerAccess also lazily backfills the founder's
  // membership row, which the serviceOwnedBy() query fragments rely on.
  const acting = await getActingPartner(user.id)
  if (!acting) redirect('/onboarding')
  const { partner, access } = acting

  // Where are we now? We use the pathname to avoid loops — if the partner
  // is already on /onboarding/welcome or /onboarding/status, the layout
  // wouldn't render anyway (those routes live outside (dashboard)/), but
  // we keep the conditional clean here for clarity.
  const progress = (partner.onboardingProgress as Record<string, unknown> | null) ?? {}
  const welcomeSeen = progress.welcomeSeen === true

  // Resolve the request path once (set by middleware) for the status guard below.
  const hdrs = await headers()
  const pathname = hdrs.get('x-pathname') ?? hdrs.get('x-invoke-path') ?? ''

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

  // Role-skinned nav (docs/PARTNER_ROLE_ACCOUNTS.md §2) — the sidebar resolves
  // its items from the ServiceTypes THIS USER may work (admins/founders = all;
  // scoped members = their granted services only). Checked per-request so
  // admin-added services + membership changes show up without re-login.
  // Strings only across the RSC boundary (icons resolve in the client).
  const serviceTypes = restricted
    ? []
    : access.serviceIds.length > 0
      ? (
          await prisma.partnerService.findMany({
            where: { id: { in: access.serviceIds } },
            select: { type: true },
          })
        ).map((s) => s.type as string)
      : []

  // Co-partners nav (D7) shows only when nomination is enabled platform-wide.
  const showCoPartners = await isNominationEnabled()

  // ACTIVE but still finishing Activation Setup → show the limited "in-profile"
  // nav until every service is live (D8). Only computed for non-restricted
  // (ACTIVE) partners so restricted shells aren't charged the extra query, and
  // short-circuited via a sticky flag once complete so we don't re-run the
  // status queries on every subsequent page load.
  const activationLimited = restricted ? false : await resolveActivationLimited(partner)

  return (
    <div className="flex h-screen flex-col">
      {/* showMyApplication: the menu row only exists pre-activation (Pavel 2026-07-06). */}
      <PartnerTopbar
        user={user}
        companyName={partner.companyName}
        tier={partner.tier}
        showMyApplication={restricted}
      />
      <div className="flex min-h-0 flex-1">
        {/* The /products/new builder hides the sidebar + neutralizes this
            padding via a body.gb-active class (mount-scoped, so it reverts on
            navigation). data-* hooks let it target these without per-route
            layout logic — the shared layout doesn't re-run on client nav. */}
        <PartnerSidebar
          status={partner.status}
          restricted={restricted}
          serviceTypes={serviceTypes}
          showCoPartners={showCoPartners}
          isOrgAdmin={access.isAdmin}
          activationLimited={activationLimited}
        />
        {/* FULL-BLEED GRID (2026-07-10, mirrors the creator layout): main is a
            plain scroll block; the inner grid replaces p-6 + max-w-6xl —
            visually identical (center col = min(72rem, 100% − 3rem), py-6).
            A child marked data-full-bleed spans all columns (co-creation
            stepper). GuidedBuilder compat: its gb-active CSS zeroes the old
            padding/max-width via the data attributes (kept, now no-ops); the
            [body.gb-active_&] variants below reproduce its full-width
            takeover for the grid without touching GuidedBuilder (hot zone). */}
        <main data-partner-shell-main className="min-w-0 flex-1 overflow-x-clip overflow-y-auto bg-ink-50">
          <div
            data-partner-shell-content
            className="grid content-start grid-cols-[minmax(1.5rem,1fr)_minmax(0,72rem)_minmax(1.5rem,1fr)] py-6 [&>*:not([data-full-bleed])]:col-start-2 [body.gb-active_&]:grid-cols-[0_minmax(0,1fr)_0] [body.gb-active_&]:py-0"
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
