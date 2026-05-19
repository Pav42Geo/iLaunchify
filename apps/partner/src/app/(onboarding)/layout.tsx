import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { redirect } from 'next/navigation'
import { OnboardingNav } from '@/components/onboarding/OnboardingNav'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (user.role !== 'PARTNER') redirect('/login?error=unauthorized')

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: { services: true },
  })
  if (!partner) redirect('/login?error=unauthorized')

  // If they've completed onboarding, send them to the dashboard
  if (partner.status === 'ACTIVE') redirect('/dashboard')

  // First time they log in — flip INVITED → IN_PROGRESS
  if (partner.status === 'INVITED') {
    await prisma.partner.update({
      where: { id: partner.id },
      data: { status: 'IN_PROGRESS' },
    })
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Welcome, {partner.companyName}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Complete your partner profile. We&apos;ll review and activate within 1–2 business days.
        </p>
      </header>
      <OnboardingNav partnerStatus={partner.status} services={partner.services} />
      <div className="mt-6">{children}</div>
    </div>
  )
}
