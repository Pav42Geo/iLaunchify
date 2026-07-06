'use server'

// SR-2.2 — sample verdict actions (docs/SMART_ROTATION_ENGINE.md §2.6).
//
// The moment that closes the pick-cycle: the creator judges a DELIVERED
// sample's PRODUCT (manufacturer's craft) and PRINT/PACKAGING (printer's
// craft) separately. Approve print → the sample's printer becomes the pinned
// ProductPrintSelection (locked chain, what the sample was FOR). Reject print
// → ProductPrintExclusion (never auto-routed again for this product) + any
// stale pin at that printer clears + the switch list offers alternatives.
// Verdicts are editable until a production order books the chain.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

type Verdict = 'APPROVED' | 'REJECTED'

async function loadSampleOrder(orderId: string, userId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, creatorUserId: userId, orderType: 'SAMPLE' },
    select: {
      id: true,
      status: true,
      printProviderServiceId: true,
      items: {
        take: 1,
        select: { product: { select: { id: true, productTemplateId: true } } },
      },
    },
  })
}

export async function submitSampleVerdict(
  orderId: string,
  input: {
    productVerdict: Verdict | null
    printVerdict: Verdict | null
    notes?: string | null
  },
): Promise<Result<{ printRejected: boolean }>> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'Only creators can judge samples.' }

  const order = await loadSampleOrder(orderId, user.id)
  if (!order) return { ok: false, error: 'Sample order not found.' }
  const product = order.items[0]?.product
  if (!product) return { ok: false, error: 'Sample order has no product.' }

  // Editable until a production order books this product's chain.
  const produced = await prisma.order.count({
    where: {
      creatorUserId: user.id,
      orderType: 'PRODUCTION',
      status: { notIn: ['CANCELLED'] },
      items: { some: { productId: product.id } },
    },
  })
  if (produced > 0) {
    return { ok: false, error: 'A production order already booked — the verdict is locked.' }
  }

  const notes = input.notes?.trim() ? input.notes.trim().slice(0, 2000) : null
  const existing = await prisma.sampleVerdict.findUnique({ where: { orderId: order.id } })
  const verdict = await prisma.sampleVerdict.upsert({
    where: { orderId: order.id },
    create: {
      orderId: order.id,
      creatorUserId: user.id,
      productId: product.id,
      productVerdict: input.productVerdict,
      printVerdict: order.printProviderServiceId ? input.printVerdict : null,
      notes,
    },
    update: {
      productVerdict: input.productVerdict,
      printVerdict: order.printProviderServiceId ? input.printVerdict : null,
      notes,
    },
  })
  await logAuditAs(user, {
    entityType: 'SampleVerdict',
    entityId: verdict.id,
    action: existing ? 'SAMPLE_VERDICT_UPDATED' : 'SAMPLE_VERDICT_SUBMITTED',
    payload: {
      orderId: order.id,
      productId: product.id,
      productVerdict: input.productVerdict,
      printVerdict: input.printVerdict,
      printProviderServiceId: order.printProviderServiceId,
    },
  })

  const printer = order.printProviderServiceId
  let printRejected = false
  if (printer && input.printVerdict === 'APPROVED' && product.productTemplateId) {
    // Approved sample = locked chain: the sample's printer becomes the pin.
    await prisma.productPrintSelection.upsert({
      where: {
        creatorUserId_productTemplateId: {
          creatorUserId: user.id,
          productTemplateId: product.productTemplateId,
        },
      },
      create: {
        creatorUserId: user.id,
        productTemplateId: product.productTemplateId,
        partnerServiceId: printer,
      },
      update: { partnerServiceId: printer },
    })
    // A prior rejection of this printer is superseded by the fresh approval.
    await prisma.productPrintExclusion
      .deleteMany({
        where: { creatorUserId: user.id, productId: product.id, partnerServiceId: printer },
      })
      .catch(() => {/* none */})
    await logAuditAs(user, {
      entityType: 'ProductPrintSelection',
      entityId: product.productTemplateId,
      action: 'PRINT_PROVIDER_PINNED_BY_SAMPLE_APPROVAL',
      toValue: printer,
      payload: { orderId: order.id, productId: product.id },
    })
  }
  if (printer && input.printVerdict === 'REJECTED') {
    printRejected = true
    await prisma.productPrintExclusion
      .upsert({
        where: {
          creatorUserId_productId_partnerServiceId: {
            creatorUserId: user.id,
            productId: product.id,
            partnerServiceId: printer,
          },
        },
        create: {
          creatorUserId: user.id,
          productId: product.id,
          partnerServiceId: printer,
          reason: 'SAMPLE_REJECTED',
          sourceOrderId: order.id,
        },
        update: { reason: 'SAMPLE_REJECTED', sourceOrderId: order.id },
      })
      .catch(() => {/* keep verdict even if the exclusion write races */})
    // A stale pin at the rejected printer must not survive into checkout.
    if (product.productTemplateId) {
      await prisma.productPrintSelection
        .deleteMany({
          where: {
            creatorUserId: user.id,
            productTemplateId: product.productTemplateId,
            partnerServiceId: printer,
          },
        })
        .catch(() => {/* none */})
    }
    await logAuditAs(user, {
      entityType: 'ProductPrintExclusion',
      entityId: `${product.id}:${printer}`,
      action: 'PRINT_PROVIDER_EXCLUDED_BY_SAMPLE_REJECTION',
      payload: { orderId: order.id, productId: product.id, partnerServiceId: printer },
    })
  }

  revalidatePath(`/orders/${order.id}`)
  return { ok: true, data: { printRejected } }
}

export interface AlternativePrinter {
  partnerServiceId: string
  companyName: string
  ratingMean: number | null
  ratingCount: number
}

/** Eligible switch targets after a print rejection: sampleCapable ACTIVE
 *  printers, this creator's exclusions removed, Bayesian-ordered. */
export async function listAlternativePrinters(
  orderId: string,
): Promise<Result<AlternativePrinter[]>> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'NOT_A_CREATOR' }
  const order = await loadSampleOrder(orderId, user.id)
  const product = order?.items[0]?.product
  if (!order || !product) return { ok: false, error: 'Sample order not found.' }

  const exclusions = await prisma.productPrintExclusion.findMany({
    where: { creatorUserId: user.id, productId: product.id },
    select: { partnerServiceId: true },
  })
  const excludedIds = exclusions.map((e) => e.partnerServiceId)
  const now = new Date()
  const services = await prisma.partnerService.findMany({
    where: {
      type: 'LABEL_PRINTING',
      status: 'ACTIVE',
      sampleCapable: true,
      partner: { status: 'ACTIVE', user: { stripeAccountStatus: 'ACTIVE' } },
      packagingOfferings: { some: { status: 'ACTIVE' } },
      blackoutDates: { none: { startsOn: { lte: now }, endsOn: { gte: now } } },
      ...(excludedIds.length > 0 ? { id: { notIn: excludedIds } } : {}),
    },
    select: {
      id: true,
      ratingMean: true,
      ratingBayesian: true,
      ratingCount: true,
      partner: { select: { companyName: true } },
    },
    orderBy: { ratingBayesian: { sort: 'desc', nulls: 'last' } },
    take: 10,
  })
  return {
    ok: true,
    data: services.map((s) => ({
      partnerServiceId: s.id,
      companyName: s.partner.companyName,
      ratingMean: s.ratingMean === null ? null : Number(s.ratingMean),
      ratingCount: s.ratingCount,
    })),
  }
}

/** "Try this provider instead" — pins the chosen printer so the re-sample
 *  (and any later production order) binds to them. */
export async function switchPrintProvider(
  orderId: string,
  partnerServiceId: string,
): Promise<Result<{ companyName: string }>> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'NOT_A_CREATOR' }
  const order = await loadSampleOrder(orderId, user.id)
  const product = order?.items[0]?.product
  if (!order || !product?.productTemplateId) {
    return { ok: false, error: 'Sample order not found.' }
  }

  const excludedRow = await prisma.productPrintExclusion.findUnique({
    where: {
      creatorUserId_productId_partnerServiceId: {
        creatorUserId: user.id,
        productId: product.id,
        partnerServiceId,
      },
    },
  })
  if (excludedRow) return { ok: false, error: 'You already rejected this provider for this product.' }

  const now = new Date()
  const svc = await prisma.partnerService.findFirst({
    where: {
      id: partnerServiceId,
      type: 'LABEL_PRINTING',
      status: 'ACTIVE',
      sampleCapable: true,
      partner: { status: 'ACTIVE', user: { stripeAccountStatus: 'ACTIVE' } },
      blackoutDates: { none: { startsOn: { lte: now }, endsOn: { gte: now } } },
    },
    select: { id: true, partner: { select: { companyName: true } } },
  })
  if (!svc) return { ok: false, error: 'This provider is not currently available.' }

  const prev = await prisma.productPrintSelection.findUnique({
    where: {
      creatorUserId_productTemplateId: {
        creatorUserId: user.id,
        productTemplateId: product.productTemplateId,
      },
    },
    select: { partnerServiceId: true },
  })
  await prisma.productPrintSelection.upsert({
    where: {
      creatorUserId_productTemplateId: {
        creatorUserId: user.id,
        productTemplateId: product.productTemplateId,
      },
    },
    create: {
      creatorUserId: user.id,
      productTemplateId: product.productTemplateId,
      partnerServiceId: svc.id,
    },
    update: { partnerServiceId: svc.id },
  })
  await logAuditAs(user, {
    entityType: 'ProductPrintSelection',
    entityId: product.productTemplateId,
    action: 'PRINT_PROVIDER_SWITCHED_AFTER_SAMPLE',
    fromValue: prev?.partnerServiceId ?? null,
    toValue: svc.id,
    payload: { orderId: order.id, productId: product.id },
  })
  revalidatePath(`/orders/${order.id}`)
  return { ok: true, data: { companyName: svc.partner.companyName } }
}
