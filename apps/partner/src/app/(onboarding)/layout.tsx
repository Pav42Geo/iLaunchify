import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { assertPartnerTransition } from '@ilaunchify/orders'
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

  // First time they log in — flip INVITED → IN_PROGRESS (Model A handshake edge,
  // guarded + audited). TODO: this write-in-render should move to a dedicated
  // server action; guarding it in place is the interim (2026-07-07).
  if (partner.status === 'INVITED') {
    assertPartnerTransition('INVITED', 'IN_PROGRESS')
    await prisma.partner.update({
      where: { id: partner.id },
      data: { status: 'IN_PROGRESS' },
    })
    await logAuditAs(user, {
      entityType: 'Partner',
      entityId: partner.id,
      action: 'PARTNER_ONBOARDING_STARTED',
      fromValue: 'INVITED',
      toValue: 'IN_PROGRESS',
      payload: { via: 'first-login' },
    })
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-ui-title">Welcome, {partner.companyName}</h1>
        <p className="mt-1 text-ui-body text-ink-500">
          Complete your partner profile. We&apos;ll review and activate within 1–2 business days.
        </p>
      </header>
      <OnboardingNav partnerStatus={partner.status} services={partner.services} />
      <div className="mt-6">{children}</div>
    </div>
  )
}
