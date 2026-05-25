// Server actions for the 4-section onboarding accordion at /onboarding.
// Per docs/PARTNER_ONBOARDING.md §7.4.
//
// Save-on-blur pattern: every field auto-saves silently. These actions are
// called from client components when individual fields lose focus.

'use server'

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import type { ServiceType } from '@prisma/client'
import { revalidatePath } from 'next/cache'

// -----------------------------------------------------------------------------
// SECTION 1 — Your business
// -----------------------------------------------------------------------------

export type YourBusinessInput = {
  // Markets the partner serves into (Market.id[])
  targetMarketIds: string[]
  // Region the partner operates from (Region.id — typically a STATE_PROVINCE row)
  primaryRegionId: string | null
  // Multi-select partner types (creates PartnerService rows)
  serviceTypes: ServiceType[]
}

export async function saveYourBusinessSection(input: YourBusinessInput) {
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return { ok: false, error: 'NOT_A_PARTNER' as const }
  }

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return { ok: false, error: 'PARTNER_NOT_FOUND' as const }

  // Transaction: update Partner + sync PartnerService rows + sync BrandTargetMarket(s)
  // (Note: BrandTargetMarket is per-brand, not per-partner — for partners, we use
  // PartnerMarketCert instead to track which markets they serve. The MarketCert
  // verification flow is admin-driven; here we just record their declared interest.)
  await prisma.$transaction(async (tx) => {
    // 1. Update Partner with primaryRegionId
    await tx.partner.update({
      where: { id: partner.id },
      data: { primaryRegionId: input.primaryRegionId },
    })

    // 2. Sync PartnerService rows — create rows for newly-checked types,
    //    leave existing rows for still-checked types alone, mark unchecked as DRAFT
    //    (we don't delete; if partner unchecks then re-checks, we want to preserve
    //    capability data).
    const existingServices = await tx.partnerService.findMany({
      where: { partnerId: partner.id },
      select: { id: true, type: true },
    })
    const existingTypes = new Set(existingServices.map((s) => s.type))
    const desiredTypes = new Set(input.serviceTypes)

    // Create new
    for (const type of desiredTypes) {
      if (!existingTypes.has(type)) {
        await tx.partnerService.create({
          data: {
            partnerId: partner.id,
            type,
            // Stub capabilities — partner fills these in Section 3 ("What you can do")
            capabilities: { type, _stub: true },
            status: 'DRAFT',
          },
        })
      }
    }

    // Leave unchecked services alone (status stays whatever it was). Partner can
    // re-check them anytime. This is safer than deleting capability data.

    // 3. Store declared target markets in Partner.onboardingProgress JSON.
    //    PartnerMarketCert rows are created by ADMIN during verification (only
    //    ACTIVE status exists for verified relationships per the schema enum).
    //    Phase 2 of the onboarding build wires the admin verification flow that
    //    promotes declared-intent into PartnerMarketCert rows.
    const existing = await tx.partner.findUnique({
      where: { id: partner.id },
      select: { onboardingProgress: true },
    })
    const progress = (existing?.onboardingProgress as Record<string, unknown> | null) ?? {}
    await tx.partner.update({
      where: { id: partner.id },
      data: {
        onboardingProgress: {
          ...progress,
          declaredTargetMarketIds: input.targetMarketIds,
          businessSectionUpdatedAt: new Date().toISOString(),
        },
      },
    })
  })

  revalidatePath('/onboarding')
  revalidatePath('/dashboard')
  return { ok: true as const }
}

// -----------------------------------------------------------------------------
// SECTION 2 — Your company
// Captures legal entity + contact + address. Document uploads themselves go
// through the existing FileUploadSlot → uploadPartnerDocument() flow in
// /onboarding/documents/actions.ts (writes PartnerFile rows +
// PartnerVerificationSection BUSINESS row). This action only handles the
// editable text fields.
// -----------------------------------------------------------------------------

export type YourCompanyInput = {
  companyName: string
  legalName: string
  websiteUrl: string
  contactPhone: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
}

export async function saveYourCompanySection(input: YourCompanyInput) {
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return { ok: false, error: 'NOT_A_PARTNER' as const }
  }

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return { ok: false, error: 'PARTNER_NOT_FOUND' as const }

  // Lightweight validation — required fields can't be blank, optional ones
  // can be empty strings (we normalise to null below).
  if (!input.companyName.trim() || !input.legalName.trim()) {
    return { ok: false, error: 'NAME_REQUIRED' as const }
  }

  await prisma.partner.update({
    where: { id: partner.id },
    data: {
      companyName: input.companyName.trim(),
      legalName: input.legalName.trim(),
      websiteUrl: input.websiteUrl.trim() || null,
      contactPhone: input.contactPhone.trim() || null,
      addressLine1: input.addressLine1.trim() || null,
      addressLine2: input.addressLine2.trim() || null,
      city: input.city.trim() || null,
      state: input.state.trim() || null,
      postalCode: input.postalCode.trim() || null,
      country: input.country.trim() || 'US',
    },
  })

  // Stamp the BUSINESS verification section so admin sees this partner has
  // edited their company info (status stays PENDING until admin acts).
  await prisma.partnerVerificationSection.upsert({
    where: { partnerId_type: { partnerId: partner.id, type: 'BUSINESS' } },
    create: { partnerId: partner.id, type: 'BUSINESS', status: 'PENDING' },
    update: { updatedAt: new Date() },
  })

  revalidatePath('/onboarding')
  return { ok: true as const }
}

// -----------------------------------------------------------------------------
// SECTION 3 — What you can do
//
// Conditional capability blocks per selected ServiceType. We update the
// `capabilities` JSON on each PartnerService row (one per type). Schema
// validation is light at V1 — we use a duck-typed shape per type:
//
//   MANUFACTURING: { productTypes, productionSpecs, moqUnitsTypical, leadTimeDaysMin, leadTimeDaysMax }
//   COPACKING:     { packagingFormats, moqUnitsTypical, leadTimeDaysMin, leadTimeDaysMax }
//   LABEL_PRINTING:{ substrates, colorModes, dieCuts, leadTimeDaysMin, leadTimeDaysMax }
//   WAREHOUSE:     { storageType, palletCapacity, pickPackPerOrderCents }
//
// We don't promote any row to ACTIVE here — admin verification (#159) does
// that. The DRAFT status set in saveYourBusinessSection persists.
// -----------------------------------------------------------------------------

export type CapabilityPatch = { type: ServiceType; capabilities: Record<string, unknown> }

export async function saveServiceCapabilities(patch: CapabilityPatch) {
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return { ok: false, error: 'NOT_A_PARTNER' as const }
  }

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return { ok: false, error: 'PARTNER_NOT_FOUND' as const }

  // The PartnerService row must already exist — created by Section 1 when the
  // partner checked this service type.
  const service = await prisma.partnerService.findUnique({
    where: { partnerId_type: { partnerId: partner.id, type: patch.type } },
    select: { id: true, capabilities: true },
  })
  if (!service) {
    return { ok: false, error: 'SERVICE_TYPE_NOT_SELECTED' as const }
  }

  // Merge with existing capabilities so we don't blow away other keys.
  const existing = (service.capabilities ?? {}) as Record<string, unknown>
  const merged = { ...existing, ...patch.capabilities, type: patch.type, _stub: undefined }

  await prisma.partnerService.update({
    where: { id: service.id },
    data: { capabilities: merged as never },
  })

  // Stamp the FACILITY verification section.
  await prisma.partnerVerificationSection.upsert({
    where: { partnerId_type: { partnerId: partner.id, type: 'FACILITY' } },
    create: { partnerId: partner.id, type: 'FACILITY', status: 'PENDING' },
    update: { updatedAt: new Date() },
  })

  revalidatePath('/onboarding')
  return { ok: true as const }
}

// -----------------------------------------------------------------------------
// SECTION 4 — Payment & contract
//
// V1: every partner accepts the platform-wide STANDARD_V1.0 contract. No
// per-partner negotiation. The acceptance is recorded on PartnerCommercialTerms.
// Stripe Connect onboarding still happens via the existing flow at
// /onboarding/stripe — we just surface its status here and link out.
// -----------------------------------------------------------------------------

export type AcceptContractInput = {
  contractTermsId: string
  signerName: string // typed full legal name, for the audit trail
}

export async function acceptStandardContract(input: AcceptContractInput) {
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return { ok: false, error: 'NOT_A_PARTNER' as const }
  }
  if (!input.signerName.trim()) {
    return { ok: false, error: 'SIGNER_REQUIRED' as const }
  }

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return { ok: false, error: 'PARTNER_NOT_FOUND' as const }

  // Verify the contract row exists and is ACTIVE.
  const contract = await prisma.contractTerms.findUnique({
    where: { id: input.contractTermsId },
    select: { id: true, status: true },
  })
  if (!contract || contract.status !== 'ACTIVE') {
    return { ok: false, error: 'CONTRACT_NOT_ACTIVE' as const }
  }

  // Upsert PartnerCommercialTerms with sign-off info.
  await prisma.partnerCommercialTerms.upsert({
    where: { partnerId: partner.id },
    create: {
      partnerId: partner.id,
      contractTermsId: contract.id,
      signedAt: new Date(),
      signedById: user.id,
    },
    update: {
      contractTermsId: contract.id,
      signedAt: new Date(),
      signedById: user.id,
    },
  })

  // Stash signer name on Partner.onboardingProgress for the audit trail —
  // human-readable record of who typed their name into the acceptance box.
  const existing = await prisma.partner.findUnique({
    where: { id: partner.id },
    select: { onboardingProgress: true },
  })
  const progress = (existing?.onboardingProgress as Record<string, unknown> | null) ?? {}
  await prisma.partner.update({
    where: { id: partner.id },
    data: {
      onboardingProgress: {
        ...progress,
        contractSignerName: input.signerName.trim(),
        contractSignedAt: new Date().toISOString(),
      },
    },
  })

  revalidatePath('/onboarding')
  return { ok: true as const }
}

// -----------------------------------------------------------------------------
// Submit for review — promotes partner from DRAFT → IDENTITY_PENDING_REVIEW
// when all 4 sections have content. Admin verification queue picks up from
// there (#94 already shipped).
// -----------------------------------------------------------------------------

export async function submitForReview() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return { ok: false, error: 'NOT_A_PARTNER' as const }
  }

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      status: true,
      legalName: true,
      addressLine1: true,
      services: { select: { id: true } },
      commercialTerms: { select: { signedAt: true } },
      files: {
        where: { sectionType: 'BUSINESS' },
        select: { kind: true },
      },
    },
  })
  if (!partner) return { ok: false, error: 'PARTNER_NOT_FOUND' as const }

  // Gate: all 4 sections need content.
  const hasBusiness = partner.services.length > 0
  const hasCompany =
    !!partner.legalName &&
    !!partner.addressLine1 &&
    partner.files.some((f) => f.kind === 'BUSINESS_LICENSE') &&
    partner.files.some((f) => f.kind === 'INSURANCE')
  const hasCommercial = !!partner.commercialTerms?.signedAt

  const missing: string[] = []
  if (!hasBusiness) missing.push('Your business — pick at least one partner type')
  if (!hasCompany) missing.push('Your company — legal info + business license + insurance')
  if (!hasCommercial) missing.push('Payment & contract — sign the partner agreement')

  if (missing.length > 0) {
    return { ok: false, error: 'INCOMPLETE' as const, missing }
  }

  // Promote — only from DRAFT / LEAD / IN_PROGRESS. Already-submitted partners
  // are a no-op (their existing section status is preserved).
  if (['DRAFT', 'LEAD', 'IN_PROGRESS', 'INVITED'].includes(partner.status)) {
    await prisma.partner.update({
      where: { id: partner.id },
      data: {
        status: 'IDENTITY_PENDING_REVIEW',
        statusChangedAt: new Date(),
        statusChangedById: user.id,
        statusChangeReason: 'Partner submitted onboarding for review',
      },
    })
  }

  revalidatePath('/onboarding')
  revalidatePath('/dashboard')
  return { ok: true as const }
}

// -----------------------------------------------------------------------------
// Welcome — stamp the "welcomeSeen" flag in Partner.onboardingProgress so
// subsequent dashboard visits skip the welcome screen and go straight to
// /onboarding (or /onboarding/status, depending on FSM state).
// -----------------------------------------------------------------------------

export async function markWelcomeSeen() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false as const }

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, onboardingProgress: true },
  })
  if (!partner) return { ok: false as const }

  const progress = (partner.onboardingProgress as Record<string, unknown> | null) ?? {}
  if (progress.welcomeSeen === true) return { ok: true as const }

  await prisma.partner.update({
    where: { id: partner.id },
    data: {
      onboardingProgress: { ...progress, welcomeSeen: true, welcomeSeenAt: new Date().toISOString() },
    },
  })

  revalidatePath('/dashboard')
  return { ok: true as const }
}

// -----------------------------------------------------------------------------
// Loader — single source of truth for the accordion's initial state.
// -----------------------------------------------------------------------------

export async function getOnboardingState() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return null
  }

  return await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      services: {
        select: { id: true, type: true, status: true, capabilities: true },
      },
      marketsCert: { select: { marketId: true, status: true } },
      primaryRegion: { select: { id: true, name: true, code: true, marketId: true } },
      commercialTerms: {
        select: {
          contractTermsId: true,
          signedAt: true,
          signedById: true,
          stripeConnectAccountId: true,
          contractTerms: {
            select: { id: true, version: true, name: true, description: true, status: true },
          },
        },
      },
      files: {
        where: { sectionType: 'BUSINESS' },
        select: {
          id: true,
          kind: true,
          originalFilename: true,
          sizeBytes: true,
          uploadedAt: true,
        },
        orderBy: { uploadedAt: 'desc' },
      },
      user: {
        select: { stripeAccountId: true, stripeAccountStatus: true },
      },
    },
  })
}
