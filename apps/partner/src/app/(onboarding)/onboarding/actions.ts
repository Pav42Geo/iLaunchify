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
  // What categories of products they make (free-form for V1; could be enum later)
  productCategories: string[]
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
// SECTION 2/3/4 placeholders — to be implemented in Phase 2
// -----------------------------------------------------------------------------

export async function getOnboardingState() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return null
  }

  return await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      services: { select: { id: true, type: true, status: true } },
      marketsCert: { select: { marketId: true, status: true } },
      primaryRegion: { select: { id: true, name: true, code: true, marketId: true } },
    },
  })
}
