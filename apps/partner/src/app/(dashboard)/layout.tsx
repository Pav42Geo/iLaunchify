// Partner dashboard layout.
// Renders one of two shells depending on partner status:
//   - DRAFT / INVITED → redirect to /onboarding (haven't completed wizard)
//   - IN_PROGRESS / UNDER_REVIEW / SUSPENDED → restricted shell (My Application + Help only)
//   - ACTIVE → full shell with all nav items
//
// Pattern is intentionally simple — no separate restricted layout, just one
// status prop that PartnerSidebar uses to filter its nav. Status comes through
// each request from the DB so there's no stale-cache problem when admin flips
// the partner.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { redirect } from 'next/navigation'
import { PartnerSidebar } from '@/components/nav/PartnerSidebar'
import { PartnerTopbar } from '@/components/nav/PartnerTopbar'

export default async function PartnerDashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (user.role !== 'PARTNER') redirect('/login?error=unauthorized')

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { status: true, companyName: true },
  })

  if (!partner) redirect('/onboarding')

  // Pre-onboarding states → wizard
  if (partner.status === 'DRAFT' || partner.status === 'INVITED') {
    redirect('/onboarding')
  }

  // Restricted-shell states keep the user on the dashboard route group but
  // with a stripped-down sidebar that only exposes My Application + Help.
  // ACTIVE gets the full nav.
  const restricted = partner.status !== 'ACTIVE'

  return (
    <div className="flex min-h-screen">
      <PartnerSidebar status={partner.status} restricted={restricted} />
      <div className="flex flex-1 flex-col">
        <PartnerTopbar user={user} companyName={partner.companyName} />
        <main className="flex-1 overflow-y-auto bg-zinc-50 p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
