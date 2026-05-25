// Partner onboarding — 4-section accordion form.
// Per docs/PARTNER_ONBOARDING.md §7.4.
//
// Single scrollable page with 4 collapsible sections. Section 1 ("Your
// business") fully implemented in Phase 1 of build; Sections 2-4 are
// progressive stubs that will get fleshed out in Phase 2.
//
// Replaces the previous 5-step linear wizard (legacy step pages at
// /onboarding/company, /service, /documents, /stripe, /review still exist
// for back-compat but the primary UX is now this accordion).
//
// Auth + role check happens in the parent (onboarding) layout.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { OnboardingAccordion } from '@/components/onboarding/OnboardingAccordion'
import { getOnboardingState } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Set up your partner account — iLaunchify' }

export default async function OnboardingPage() {
  const user = await requireUser()

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, companyName: true },
  })
  if (!partner) return null

  const state = await getOnboardingState()

  // Load Market + Region options for Section 1's pickers.
  // Markets: hide COMING_SOON so partners don't try to declare interest in CA before V1.1.
  // Regions: state-level only (METRO is V1.1+).
  const [markets, regions] = await Promise.all([
    prisma.market.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, code: true, name: true, region: true },
      orderBy: { code: 'asc' },
    }),
    prisma.region.findMany({
      where: { kind: 'STATE_PROVINCE', isActive: true },
      select: { id: true, code: true, name: true, marketId: true, parentRegionId: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <OnboardingAccordion
      companyName={partner.companyName}
      initialState={{
        targetMarketIds: state?.marketsCert?.map((c) => c.marketId) ?? [],
        primaryRegionId: state?.primaryRegion?.id ?? null,
        serviceTypes: state?.services?.map((s) => s.type) ?? [],
      }}
      markets={markets}
      regions={regions}
    />
  )
}
