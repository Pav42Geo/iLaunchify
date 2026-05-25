// Partner onboarding — 4-section accordion form.
// Per docs/PARTNER_ONBOARDING.md §7.4.
//
// Single scrollable page with 4 collapsible sections, all fully implemented
// in Phase 2 of the build:
//   1. Your business (markets, region, partner types)
//   2. Your company  (legal entity, contact, address, verification docs)
//   3. What you can do (capabilities — conditional per selected partner type)
//   4. Payment & contract (Stripe Connect + STANDARD_V1.0 acceptance)
//
// Legacy step pages at /onboarding/company, /service, /documents, /stripe,
// /review still exist for back-compat but the primary UX is now this accordion.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { OnboardingAccordion } from '@/components/onboarding/OnboardingAccordion'
import { capsFromJson } from '@/components/onboarding/sections/WhatYouCanDoSection'
import { getOnboardingState } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Set up your partner account — iLaunchify' }

export default async function OnboardingPage() {
  const user = await requireUser()

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      companyName: true,
      legalName: true,
      websiteUrl: true,
      contactPhone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      onboardingProgress: true,
    },
  })
  if (!partner) return null

  const state = await getOnboardingState()

  // Load Market + Region options for Section 1's pickers.
  // Markets: hide COMING_SOON so partners don't try to declare interest in CA before V1.1.
  // Regions: state-level only (METRO is V1.1+).
  // Standard contract: the ACTIVE STANDARD_V1.x row for Section 4's acceptance card.
  const [markets, regions, standardContract] = await Promise.all([
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
    prisma.contractTerms.findFirst({
      where: { status: 'ACTIVE', version: { startsWith: 'STANDARD_V' } },
      orderBy: { effectiveFrom: 'desc' },
      select: { id: true, version: true, name: true, description: true, status: true },
    }),
  ])

  // Hydrate Section 2 (Your company) — partner.* address fields, with empty strings for null.
  const initialCompany = {
    companyName: partner.companyName ?? '',
    legalName: partner.legalName ?? '',
    websiteUrl: partner.websiteUrl ?? '',
    contactPhone: partner.contactPhone ?? '',
    addressLine1: partner.addressLine1 ?? '',
    addressLine2: partner.addressLine2 ?? '',
    city: partner.city ?? '',
    state: partner.state ?? '',
    postalCode: partner.postalCode ?? '',
    country: partner.country ?? 'US',
  }

  // Hydrate Section 3 (What you can do) — capabilities JSON per service.
  const initialCaps = capsFromJson(state?.services ?? [])

  // Hydrate Section 4 (Payment & contract) — stripe status from User, contract
  // from PartnerCommercialTerms, signer name from onboardingProgress JSON.
  const progress = (partner.onboardingProgress as Record<string, unknown> | null) ?? {}
  const initialPayment = {
    stripeAccountStatus: (state?.user?.stripeAccountStatus ?? 'NONE') as
      | 'NONE'
      | 'PENDING'
      | 'ACTIVE'
      | 'RESTRICTED'
      | 'REJECTED',
    contract: standardContract
      ? {
          id: standardContract.id,
          version: standardContract.version,
          name: standardContract.name,
          description: standardContract.description,
        }
      : null,
    signedAt: state?.commercialTerms?.signedAt ?? null,
    signerName: (typeof progress.contractSignerName === 'string'
      ? progress.contractSignerName
      : '') as string,
  }

  return (
    <OnboardingAccordion
      companyName={partner.companyName}
      initialBusiness={{
        targetMarketIds: state?.marketsCert?.map((c) => c.marketId) ?? [],
        primaryRegionId: state?.primaryRegion?.id ?? null,
        serviceTypes: state?.services?.map((s) => s.type) ?? [],
      }}
      initialCompany={initialCompany}
      initialFiles={state?.files ?? []}
      initialCaps={initialCaps}
      initialPayment={initialPayment}
      markets={markets}
      regions={regions}
    />
  )
}
