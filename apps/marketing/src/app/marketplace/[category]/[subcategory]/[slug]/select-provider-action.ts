'use server'

// "Select this provider" (PRINT_PROVIDER_SELECTION §4, PS-3 step 1).
// Template-scoped, creator-scoped: the pick becomes the creator's default
// printer for products built from this template, consumed by findRouting
// step 0 at checkout (hard-filter validated there — the pin is a preference,
// never a bypass). Audited.
//
// CAST-GUARDED until db:generate adds ProductPrintSelection (this action +
// the checkout lookup — de-cast post-migration).

import { prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { getMarketingSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

type Result = { ok: true; selected: boolean } | { ok: false; error: string }

function selectionDb() {
  return prisma as unknown as {
    productPrintSelection: {
      upsert: (a: unknown) => Promise<{ id: string }>
      findUnique: (a: unknown) => Promise<{ id: string; partnerServiceId: string } | null>
      delete: (a: unknown) => Promise<unknown>
    }
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

  const existing = await selectionDb().productPrintSelection.findUnique({
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
    await selectionDb().productPrintSelection.delete({ where: { id: existing.id } })
    await logAuditAs(user, {
      entityType: 'ProductPrintSelection',
      entityId: existing.id,
      action: 'PRINT_PROVIDER_DESELECTED',
      payload: { productTemplateId: template.id, partnerServiceId: input.partnerServiceId },
    })
    revalidatePath(`/marketplace`)
    return { ok: true, selected: false }
  }

  const row = await selectionDb().productPrintSelection.upsert({
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
    const row = await selectionDb().productPrintSelection.findUnique({
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
