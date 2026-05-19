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

  // Gate: must be ACTIVE to access the dashboard. Otherwise route to onboarding.
  if (!partner || partner.status !== 'ACTIVE') redirect('/onboarding')

  return (
    <div className="flex min-h-screen">
      <PartnerSidebar />
      <div className="flex flex-1 flex-col">
        <PartnerTopbar user={user} companyName={partner.companyName} />
        <main className="flex-1 overflow-y-auto bg-zinc-50 p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
