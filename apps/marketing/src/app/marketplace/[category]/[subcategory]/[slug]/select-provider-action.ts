'use server'

// "Select this provider" (PRINT_PROVIDER_SELECTION §4, PS-3 step 1).
// Template-scoped, creator-scoped: the pick becomes the creator's default
// printer for products built from this template, consumed by findRouting
// step 0 at checkout (hard-filter validated there — the pin is a preference,
// never a bypass). Audited.

import { prisma, getActiveNominatedServiceId } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { getMarketingSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

type Result = { ok: true; selected: boolean } | { ok: false; error: string }

/**
 * D7 — does the product's MANUFACTURER own the print leg via an active nomination?
 * When they do, the creator cannot manually pick/switch the printer (the
 * manufacturer's co-partner takes the leg). Gated: false while nomination is dark.
 */
async function nominationOwnsPrintLeg(templateId: string): Promise<boolean> {
  const t = await prisma.productTemplate.findUnique({
    where: { id: templateId },
    select: { manufacturerServiceId: true },
  })
  if (!t?.manufacturerServiceId) return false
  const svc = await prisma.partnerService.findUnique({
    where: { id: t.manufacturerServiceId },
    select: { partnerId: true },
  })
  if (!svc) return false
  return (await getActiveNominatedServiceId(svc.partnerId, 'LABEL_PRINTING')) !== null
}

/** UI helper: is the print leg manufacturer-nominated for this template? (hide the switch) */
export async function isPrintLegNominated(templateSlug: string): Promise<boolean> {
  try {
    const t = await prisma.productTemplate.findUnique({
      where: { slug: templateSlug },
      select: { id: true },
    })
    if (!t) return false
    return await nominationOwnsPrintLeg(t.id)
  } catch {
    return false
  }
}

export async function selectPrintProvider(input: {
  templateSlug: string
  partnerServiceId: string
}): Promise<Result> {
  const session = await getMarketingSession()
  const user = session?.user
  if (!user?.id || user.role !== 'CREATOR') {
    return { ok: false, error: 'Sign in as a creator to pick a print provider' }
  }

  const template = await prisma.productTemplate.findUnique({
    where: { slug: input.templateSlug },
    select: { id: true },
  })
  if (!template) return { ok: false, error: 'Product not found' }

  // D7 — if the manufacturer has nominated a print co-partner for this product,
  // the creator cannot pick/switch the printer for that leg. Authoritative guard
  // (covers every caller); gated, so it never blocks while nomination is dark.
  if (await nominationOwnsPrintLeg(template.id)) {
    return {
      ok: false,
      error: 'The manufacturer of this product has assigned its own print partner for this leg.',
    }
  }

  // The pick must be a live printer — same ops gate the cards render behind.
  const now = new Date()
  const service = await prisma.partnerService.findFirst({
    where: {
      id: input.partnerServiceId,
      type: 'LABEL_PRINTING',
      status: 'ACTIVE',
      partner: { status: 'ACTIVE', user: { stripeAccountStatus: 'ACTIVE' } },
      packagingOfferings: { some: { status: 'ACTIVE' } },
      blackoutDates: { none: { startsOn: { lte: now }, endsOn: { gte: now } } },
    },
    select: { id: true },
  })
  if (!service) return { ok: false, error: 'This provider is not currently available' }

  const existing = await prisma.productPrintSelection.findUnique({
    where: {
      creatorUserId_productTemplateId: {
        creatorUserId: user.id,
        productTemplateId: template.id,
      },
    },
    select: { id: true, partnerServiceId: true },
  })

  // Clicking the already-selected provider DESELECTS (back to auto-routing).
  if (existing?.partnerServiceId === input.partnerServiceId) {
    await prisma.productPrintSelection.delete({ where: { id: existing.id } })
    await logAuditAs(user, {
      entityType: 'ProductPrintSelection',
      entityId: existing.id,
      action: 'PRINT_PROVIDER_DESELECTED',
      payload: { productTemplateId: template.id, partnerServiceId: input.partnerServiceId },
    })
    revalidatePath(`/marketplace`)
    return { ok: true, selected: false }
  }

  const row = await prisma.productPrintSelection.upsert({
    where: {
      creatorUserId_productTemplateId: {
        creatorUserId: user.id,
        productTemplateId: template.id,
      },
    },
    create: {
      creatorUserId: user.id,
      productTemplateId: template.id,
      partnerServiceId: input.partnerServiceId,
    },
    update: { partnerServiceId: input.partnerServiceId },
  })
  await logAuditAs(user, {
    entityType: 'ProductPrintSelection',
    entityId: row.id,
    action: existing ? 'PRINT_PROVIDER_CHANGED' : 'PRINT_PROVIDER_SELECTED',
    fromValue: existing?.partnerServiceId,
    toValue: input.partnerServiceId,
    payload: { productTemplateId: template.id },
  })
  revalidatePath(`/marketplace`)
  return { ok: true, selected: true }
}

/** The creator's current pick for this template (null when signed out / none). */
export async function getMyPrintSelection(templateSlug: string): Promise<string | null> {
  try {
    const session = await getMarketingSession()
    const user = session?.user
    if (!user?.id) return null
    const template = await prisma.productTemplate.findUnique({
      where: { slug: templateSlug },
      select: { id: true },
    })
    if (!template) return null
    const row = await prisma.productPrintSelection.findUnique({
      where: {
        creatorUserId_productTemplateId: {
          creatorUserId: user.id,
          productTemplateId: template.id,
        },
      },
      select: { id: true, partnerServiceId: true },
    })
    return row?.partnerServiceId ?? null
  } catch {
    return null
  }
}
