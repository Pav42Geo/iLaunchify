import { requireUser } from '@ilaunchify/auth'
import { prisma, getPublicBrandLogos, getLogoPlacement } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { assertPartnerTransition } from '@ilaunchify/orders'
import { Brand } from '@ilaunchify/ui'
import { redirect } from 'next/navigation'
import {
  OnboardingServicesProvider,
  HeaderServicePills,
} from '@/components/onboarding/OnboardingServices'
import { SiteFooterServer } from '@/components/SiteFooterServer'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (user.role !== 'PARTNER') redirect('/login?error=unauthorized')

  const [partner, logos, placement] = await Promise.all([
    prisma.partner.findUnique({ where: { userId: user.id }, include: { services: true } }),
    getPublicBrandLogos(),
    getLogoPlacement('businessHeader'),
  ])
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

  const initialServiceTypes = [...new Set(partner.services.map((s) => s.type))]

  return (
    <OnboardingServicesProvider initial={initialServiceTypes}>
    <div className="min-h-screen bg-ink-50">
      {/* Dark appbar — business-landing logo (on-dark full logo + neon sublabel),
          the Onboarding → Activation Setup journey stepper (prototype segmented
          control), and the partner's service pills. Full-width: logo hugs the
          left edge, services hug the right. */}
      <header className="sticky top-0 z-40 bg-ink-900 text-white">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Brand
            label="iLaunchify"
            sublabel={placement.sublabel ?? 'Business'}
            imageSrc={logos.fullDark}
            wordmarkClassName="text-white"
            sublabelClassName="text-neon-500"
          />
          <nav className="flex items-center gap-1 rounded-full bg-white/10 p-1">
            <span className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-300">
              Application
            </span>
            <span className="rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-900">
              Onboarding
            </span>
            <span className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-300">
              Activation Setup
            </span>
          </nav>

          <HeaderServicePills />
        </div>
      </header>

      {children}
      <SiteFooterServer />
    </div>
    </OnboardingServicesProvider>
  )
}
