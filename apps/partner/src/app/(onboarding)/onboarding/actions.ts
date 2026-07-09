// Server actions for the 4-section onboarding accordion at /onboarding.
// Per docs/PARTNER_ONBOARDING.md §7.4.
//
// Save-on-blur pattern: every field auto-saves silently. These actions are
// called from client components when individual fields lose focus.

'use server'

import { requireUser } from '@ilaunchify/auth'
import { prisma, getNominationMismatches, StorageClass, SubstrateCategory, DieCutCategory } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { assertPartnerTransition } from '@ilaunchify/orders'
import type { ServiceType } from '@ilaunchify/db'
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

  // Warehouse storage classes are ALSO a typed, first-class column the FC
  // selector + scorer read (packages/orders/fc-selector, fc-scorer) as a HARD
  // eligibility filter. Mirror the picked StorageClass[] into it — validated
  // against the enum — so onboarding genuinely feeds routing, not just the JSON.
  const extraData: Record<string, unknown> = {}
  if (patch.type === 'WAREHOUSE') {
    const raw = (patch.capabilities as Record<string, unknown>).storageType
    const allowed = new Set<string>(Object.values(StorageClass))
    if (Array.isArray(raw)) {
      extraData.storageClasses = [
        ...new Set(raw.filter((x): x is string => typeof x === 'string' && allowed.has(x))),
      ]
    }
  }

  await prisma.partnerService.update({
    where: { id: service.id },
    data: { capabilities: merged as never, ...extraData },
  })

  // Printing → expand the picked SubstrateCategory / DieCutCategory into the
  // REAL typed rows the matching engine reads: PartnerServiceSubstrate (validated
  // at listing) + PartnerServiceDieCut (routing.ts dieCutSupport hard filter).
  // Both catalogs carry a `category`, so a category pick = "capable of every
  // active catalog row in it". ADDITIVE (skipDuplicates) — never deletes, so a
  // partner's per-row pricing/overrides set later in Activation are preserved.
  if (patch.type === 'LABEL_PRINTING') {
    const caps = patch.capabilities as Record<string, unknown>

    const subAllowed = new Set<string>(Object.values(SubstrateCategory))
    const subCats = Array.isArray(caps.substrates)
      ? caps.substrates.filter((x): x is string => typeof x === 'string' && subAllowed.has(x))
      : []
    if (subCats.length > 0) {
      const subs = await prisma.substrate.findMany({
        where: { status: 'ACTIVE', category: { in: subCats as never } },
        select: { id: true },
      })
      if (subs.length > 0) {
        await prisma.partnerServiceSubstrate.createMany({
          data: subs.map((s) => ({ partnerServiceId: service.id, substrateId: s.id })),
          skipDuplicates: true,
        })
      }
    }

    const dcAllowed = new Set<string>(Object.values(DieCutCategory))
    const dcCats = Array.isArray(caps.dieCuts)
      ? caps.dieCuts.filter((x): x is string => typeof x === 'string' && dcAllowed.has(x))
      : []
    if (dcCats.length > 0) {
      const templates = await prisma.dieCutTemplate.findMany({
        where: { category: { in: dcCats as never } },
        select: { id: true },
      })
      if (templates.length > 0) {
        await prisma.partnerServiceDieCut.createMany({
          data: templates.map((t) => ({ partnerServiceId: service.id, dieCutTemplateId: t.id })),
          skipDuplicates: true,
        })
      }
    }
  }

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

  // Stamp the OPERATIONAL_STANDARDS verification section so admin's queue
  // (5-section model per #159) picks it up for review.
  await prisma.partnerVerificationSection.upsert({
    where: { partnerId_type: { partnerId: partner.id, type: 'OPERATIONAL_STANDARDS' } },
    create: { partnerId: partner.id, type: 'OPERATIONAL_STANDARDS', status: 'PENDING' },
    update: { updatedAt: new Date() },
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
      companyName: true,
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
    assertPartnerTransition(partner.status, 'IDENTITY_PENDING_REVIEW')
    await prisma.partner.update({
      where: { id: partner.id },
      data: {
        status: 'IDENTITY_PENDING_REVIEW',
        statusChangedAt: new Date(),
        statusChangedById: user.id,
        statusChangeReason: 'Partner submitted onboarding for review',
      },
    })

    // AuditLog the lifecycle transition (the statusChanged* columns are a UI
    // trail, not the append-only audit record). 2026-07-06.
    await logAuditAs(user, {
      entityType: 'Partner',
      entityId: partner.id,
      action: 'PARTNER_SUBMIT_ONBOARDING',
      fromValue: partner.status,
      toValue: 'IDENTITY_PENDING_REVIEW',
      payload: { via: 'onboarding/submit' },
    })

    // Tell admins a partner finished onboarding and is ready for review. Best-effort,
    // lazy-imported (the dispatcher swallows its own errors). Only on real promotion,
    // so a no-op re-submit doesn't re-notify.
    try {
      const { dispatchNotification } = await import('@ilaunchify/notifications')
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
      await Promise.allSettled(
        admins.map((a) =>
          dispatchNotification({
            userId: a.id,
            event: 'PARTNER_SUBMITTED',
            data: { companyName: partner.companyName, partnerId: partner.id },
            audience: 'admin',
          }),
        ),
      )
    } catch {
      /* swallow — notifications are best-effort */
    }

    // D7 mismatch notice: if this partner was invited as a co-partner for a leg
    // they didn't set up, tell the inviting manufacturer (the nomination stays
    // pending — it never auto-pins without a live service). Best-effort.
    try {
      const mismatches = await getNominationMismatches(partner.id)
      if (mismatches.length > 0) {
        const legLabel: Record<string, string> = {
          LABEL_PRINTING: 'Packaging printing',
          COPACKING: 'Co-packing',
          MANUFACTURING: 'Manufacturing',
          WAREHOUSE: 'Fulfillment',
        }
        const { dispatchNotification } = await import('@ilaunchify/notifications')
        await Promise.allSettled(
          mismatches
            .filter((m) => m.inviterUserId)
            .map((m) =>
              dispatchNotification({
                userId: m.inviterUserId as string,
                event: 'NOMINATION_SERVICE_MISMATCH',
                audience: 'partner',
                data: {
                  coPartnerName: partner.companyName,
                  serviceLabel: legLabel[m.serviceType] ?? m.serviceType,
                },
              }),
            ),
        )
      }
    } catch {
      /* swallow — best-effort */
    }
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
// Insurance coverage amount — pairs with the General-Liability COI upload in
// Section 2. A hard, hard-to-fake scale/seriousness signal (~$5M CGL benchmark).
// Whole USD, stored in onboardingProgress (no schema); admin reads it next to
// the COI during verification.
// -----------------------------------------------------------------------------

export async function saveInsuranceCoverageUsd(usd: string) {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false as const }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, onboardingProgress: true },
  })
  if (!partner) return { ok: false as const }

  const clean = usd.replace(/[^0-9]/g, '') // digits only, whole USD
  const progress = (partner.onboardingProgress as Record<string, unknown> | null) ?? {}
  await prisma.partner.update({
    where: { id: partner.id },
    data: { onboardingProgress: { ...progress, insuranceCoverageUsd: clean } },
  })
  revalidatePath('/onboarding')
  return { ok: true as const }
}

// -----------------------------------------------------------------------------
// SECTION 3b — Certifications you hold (declaration)
// The unified CertificatePicker records which admin-library cert types the
// partner claims to hold. This is a DECLARATION only (no proof) — Activation's
// shared.certs step turns each into a real PartnerCertificateInstance with a PDF
// + expiry that admin verifies. Stored in onboardingProgress so it survives and
// pre-fills the activation claim checklist. Purpose: tells us what to expect,
// and feeds the routing cert gate once verified.
// -----------------------------------------------------------------------------

export async function saveDeclaredCerts(certTypeIds: string[]) {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false as const, error: 'NOT_A_PARTNER' as const }

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, onboardingProgress: true },
  })
  if (!partner) return { ok: false as const, error: 'PARTNER_NOT_FOUND' as const }

  // De-dupe + drop empties; validate against the live library so a stale/removed
  // id can never persist.
  const requested = [...new Set(certTypeIds.filter((id) => typeof id === 'string' && id.length > 0))]
  const valid =
    requested.length > 0
      ? (
          await prisma.certificateType.findMany({
            where: { id: { in: requested }, status: 'ACTIVE' },
            select: { id: true },
          })
        ).map((c) => c.id)
      : []

  const progress = (partner.onboardingProgress as Record<string, unknown> | null) ?? {}
  await prisma.partner.update({
    where: { id: partner.id },
    data: {
      onboardingProgress: {
        ...progress,
        declaredCertTypeIds: valid,
        declaredCertsUpdatedAt: new Date().toISOString(),
      },
    },
  })

  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: partner.id,
    action: 'PARTNER_DECLARE_CERTS',
    payload: { certTypeIds: valid, via: 'onboarding/capabilities' },
  })

  revalidatePath('/onboarding')
  return { ok: true as const, saved: valid }
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
