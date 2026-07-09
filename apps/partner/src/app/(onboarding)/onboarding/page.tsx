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

import { prisma, getInvitationContext } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { OnboardingAccordion } from '@/components/onboarding/OnboardingAccordion'
import { capsFromJson } from '@/components/onboarding/sections/capabilities'
import { getOnboardingState } from './actions'

const LEG_LABEL: Record<string, string> = {
  LABEL_PRINTING: 'Label printing',
  COPACKING: 'Co-packing',
  MANUFACTURING: 'Manufacturing',
  WAREHOUSE: 'Fulfillment',
}

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

  // Invited co-partner? Show a banner explaining who invited them + for which
  // legs. The legs are already pre-selected below (their DRAFT services exist);
  // this just tells them why — they still complete standard onboarding.
  const invitation = await getInvitationContext(partner.id)

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

  const invitedLegLabels = invitation?.legs.map((l) => LEG_LABEL[l] ?? l) ?? []
  const currentTypes = new Set(state?.services?.map((s) => s.type) ?? [])
  const missingLegLabels =
    invitation?.legs.filter((l) => !currentTypes.has(l)).map((l) => LEG_LABEL[l] ?? l) ?? []

  const invitationBanner = invitation ? (
    <div className="mb-4 rounded-2xl border border-pink-200 bg-pink-50 px-5 py-4">
      <p className="text-[13px] font-semibold text-pink-800">
        {invitation.inviterName
          ? `${invitation.inviterName} invited you to iLaunchify`
          : 'You were invited to iLaunchify as a co-partner'}
        {invitedLegLabels.length > 0 && <> as a {invitedLegLabels.join(' & ')} partner.</>}
      </p>
      <p className="mt-1 text-[13px] text-pink-800/80">
        We’ve pre-selected {invitedLegLabels.length > 1 ? 'those services' : 'that service'} below.
        Complete your onboarding to start working together — you can also add other services you
        offer. You’ll go live for a service once you finish its setup.
      </p>
      {missingLegLabels.length > 0 && (
        <p className="mt-2 rounded-lg border border-warning-300 bg-warning-50 px-3 py-2 text-[12px] font-medium text-warning-800">
          ⚠ You were invited for {missingLegLabels.join(' & ')}, but{' '}
          {missingLegLabels.length > 1 ? 'those services aren’t' : 'that service isn’t'} in your
          selection. Add {missingLegLabels.length > 1 ? 'them' : 'it'} back under “Your business” to
          work with {invitation.inviterName ?? 'the manufacturer who invited you'}.
        </p>
      )}
    </div>
  ) : null

  return (
    <OnboardingAccordion
      companyName={partner.companyName}
      banner={invitationBanner}
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
