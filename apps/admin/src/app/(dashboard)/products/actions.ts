'use server'

// Admin product review queue actions.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §8 + #133.
//
// FSM (admin-driven side):
//   PENDING_REVIEW       -> PUBLISHED       (first publish; partner submitted DRAFT)
//                        -> NEEDS_CHANGES   (admin wants edits; creates ProductReviewItem rows)
//                        -> REJECTED        (terminal — partner must clone)
//   PENDING_EDIT_REVIEW  -> PUBLISHED       (apply pendingEditPayload to live row)
//                        -> NEEDS_CHANGES   (admin wants edits to the proposed payload)
//   NEEDS_CHANGES        -> PUBLISHED       (admin can short-circuit if items resolved)
//   PUBLISHED            -> PAUSED          (admin hides from marketplace; reversible)
//   PAUSED               -> PUBLISHED       (re-list)

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import type { ProductTemplateStatus } from '@prisma/client'

type Result =
  | { ok: true }
  | { ok: false; error: string }

// -----------------------------------------------------------------------------
// APPROVE — promote to PUBLISHED. If status was PENDING_EDIT_REVIEW, also
// apply the pendingEditPayload to the live ProductTemplate fields.
// -----------------------------------------------------------------------------

export async function approveProductTemplate(productTemplateId: string): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const tpl = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    select: {
      id: true,
      status: true,
      name: true,
      pendingEditPayload: true,
      manufacturerService: { select: { partner: { select: { userId: true, companyName: true } } } },
    },
  })
  if (!tpl) return { ok: false, error: 'Product not found.' }

  // Allowed sources for PUBLISHED
  if (
    tpl.status !== 'PENDING_REVIEW' &&
    tpl.status !== 'PENDING_EDIT_REVIEW' &&
    tpl.status !== 'NEEDS_CHANGES' &&
    tpl.status !== 'PAUSED' &&
    tpl.status !== 'UNDER_REVIEW'
  ) {
    return { ok: false, error: `Cannot publish from ${tpl.status}.` }
  }

  await prisma.$transaction(async (tx) => {
    // Apply pendingEditPayload if present + clear it. We treat the payload
    // as a Partial<ProductTemplate> with the same keys partner edits.
    const data: Record<string, unknown> = { status: 'PUBLISHED' }
    if (tpl.status === 'PENDING_EDIT_REVIEW' && tpl.pendingEditPayload) {
      const payload = tpl.pendingEditPayload as Record<string, unknown>
      // Whitelist what's applyable (defensive — partner code only writes these)
      const applyable = [
        'name',
        'description',
        'priceFloorCents',
        'unitCostCents',
        'allergenCrossContamination',
        'allergenManualOverrides',
        'customMeta',
        'nutrientOverrides',
        'ingredientGroups',
      ]
      for (const key of applyable) {
        if (key in payload) data[key] = payload[key]
      }
      data.pendingEditPayload = null
    }
    await tx.productTemplate.update({ where: { id: productTemplateId }, data })

    // Mark all open review items as resolved on a successful publish.
    await tx.productReviewItem.updateMany({
      where: { productTemplateId, resolved: false },
      data: { resolved: true, resolvedAt: new Date() },
    })
  })

  await logAuditAs(admin, {
    entityType: 'ProductTemplate',
    entityId: productTemplateId,
    action: 'PRODUCT_TEMPLATE_PUBLISH',
    fromValue: tpl.status,
    toValue: 'PUBLISHED',
    payload: {
      name: tpl.name,
      appliedPendingEdits: tpl.status === 'PENDING_EDIT_REVIEW',
    },
  })

  revalidatePath('/products')
  revalidatePath(`/products/${productTemplateId}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// REQUEST CHANGES — send back to partner with a checklist of items.
// Bumps status to NEEDS_CHANGES + creates ProductReviewItem rows.
// -----------------------------------------------------------------------------

export interface RequestChangesInput {
  productTemplateId: string
  items: Array<{ category: string; description: string }>
  generalNote?: string
}

export async function requestProductChanges(input: RequestChangesInput): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const tpl = await prisma.productTemplate.findUnique({
    where: { id: input.productTemplateId },
    select: { id: true, status: true, name: true },
  })
  if (!tpl) return { ok: false, error: 'Product not found.' }
  if (tpl.status !== 'PENDING_REVIEW' && tpl.status !== 'PENDING_EDIT_REVIEW') {
    return { ok: false, error: `Cannot request changes from ${tpl.status}.` }
  }
  if (input.items.length === 0) {
    return { ok: false, error: 'Add at least one checklist item describing what to fix.' }
  }

  await prisma.$transaction(async (tx) => {
    // Status flip back to NEEDS_CHANGES (or DRAFT for PENDING_EDIT_REVIEW
    // since live row keeps serving). For PENDING_EDIT_REVIEW we keep the
    // payload intact so partner sees their edits + can refine.
    await tx.productTemplate.update({
      where: { id: input.productTemplateId },
      data: { status: 'NEEDS_CHANGES' },
    })

    // Create one ProductReviewItem per checklist line
    await Promise.all(
      input.items.map((item) =>
        tx.productReviewItem.create({
          data: {
            productTemplateId: input.productTemplateId,
            category: item.category.trim() || 'other',
            description: item.description.trim(),
            createdById: admin.id,
          },
        }),
      ),
    )

    // General note as a ProductNote (partner reads in their editor)
    if (input.generalNote && input.generalNote.trim()) {
      await tx.productNote.create({
        data: {
          productTemplateId: input.productTemplateId,
          authorId: admin.id,
          authorType: 'ADMIN',
          body: input.generalNote.trim(),
        },
      })
    }
  })

  await logAuditAs(admin, {
    entityType: 'ProductTemplate',
    entityId: input.productTemplateId,
    action: 'PRODUCT_TEMPLATE_REQUEST_CHANGES',
    fromValue: tpl.status,
    toValue: 'NEEDS_CHANGES',
    payload: { name: tpl.name, itemCount: input.items.length },
  })

  revalidatePath('/products')
  revalidatePath(`/products/${input.productTemplateId}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// REJECT — terminal. Partner must clone if they want to retry.
// -----------------------------------------------------------------------------

export async function rejectProductTemplate(input: {
  productTemplateId: string
  reason: string
}): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const tpl = await prisma.productTemplate.findUnique({
    where: { id: input.productTemplateId },
    select: { id: true, status: true, name: true },
  })
  if (!tpl) return { ok: false, error: 'Product not found.' }
  if (!['PENDING_REVIEW', 'PENDING_EDIT_REVIEW', 'NEEDS_CHANGES'].includes(tpl.status)) {
    return { ok: false, error: `Cannot reject from ${tpl.status}.` }
  }
  if (!input.reason.trim()) {
    return { ok: false, error: 'Rejection reason is required.' }
  }

  await prisma.$transaction(async (tx) => {
    await tx.productTemplate.update({
      where: { id: input.productTemplateId },
      data: { status: 'REJECTED' },
    })
    await tx.productNote.create({
      data: {
        productTemplateId: input.productTemplateId,
        authorId: admin.id,
        authorType: 'ADMIN',
        body: `REJECTED: ${input.reason.trim()}`,
      },
    })
  })

  await logAuditAs(admin, {
    entityType: 'ProductTemplate',
    entityId: input.productTemplateId,
    action: 'PRODUCT_TEMPLATE_REJECT',
    fromValue: tpl.status,
    toValue: 'REJECTED',
    payload: { name: tpl.name, reason: input.reason.trim() },
  })

  revalidatePath('/products')
  revalidatePath(`/products/${input.productTemplateId}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// PAUSE / RESUME — hide from marketplace without rejecting.
// -----------------------------------------------------------------------------

export async function setProductPaused(
  productTemplateId: string,
  to: 'PAUSED' | 'PUBLISHED',
): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const tpl = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    select: { id: true, status: true, name: true },
  })
  if (!tpl) return { ok: false, error: 'Product not found.' }

  const allowed =
    (to === 'PAUSED' && tpl.status === 'PUBLISHED') ||
    (to === 'PUBLISHED' && tpl.status === 'PAUSED')
  if (!allowed) {
    return { ok: false, error: `Cannot transition ${tpl.status} -> ${to}.` }
  }

  await prisma.productTemplate.update({
    where: { id: productTemplateId },
    data: { status: to },
  })

  await logAuditAs(admin, {
    entityType: 'ProductTemplate',
    entityId: productTemplateId,
    action: to === 'PAUSED' ? 'PRODUCT_TEMPLATE_PAUSE' : 'PRODUCT_TEMPLATE_REACTIVATE',
    fromValue: tpl.status,
    toValue: to,
    payload: { name: tpl.name },
  })

  revalidatePath('/products')
  revalidatePath(`/products/${productTemplateId}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// POST NOTE — admin adds a message to the partner-visible thread.
// -----------------------------------------------------------------------------

export async function postProductNote(input: {
  productTemplateId: string
  body: string
}): Promise<Result> {
  const admin = await requireRole('ADMIN')
  if (!input.body.trim()) return { ok: false, error: 'Note body is required.' }

  const tpl = await prisma.productTemplate.findUnique({
    where: { id: input.productTemplateId },
    select: { id: true },
  })
  if (!tpl) return { ok: false, error: 'Product not found.' }

  await prisma.productNote.create({
    data: {
      productTemplateId: input.productTemplateId,
      authorId: admin.id,
      authorType: 'ADMIN',
      body: input.body.trim(),
    },
  })

  revalidatePath(`/products/${input.productTemplateId}`)
  return { ok: true }
}
