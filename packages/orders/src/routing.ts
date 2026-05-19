// Order routing — finds matching partner services for a product.
//
// V1 algorithm: first matching ACTIVE service (deterministic, simple, debuggable).
// V1.5+ adds scoring (capacity headroom, partner rating, geographic proximity).
//
// Inputs to a routing decision:
//   - Product.category → must match a MANUFACTURING service's categories[]
//   - Order quantity → must fall within service's [moqMin, moqMax]
//   - Template.dieCutTemplateId → must be in PartnerServiceDieCut for LABEL_PRINTING
//
// Outputs: chosen manufacturing service + chosen label-printing service (or null
// if no match — order is flagged for admin manual routing).

import { prisma } from '@ilaunchify/db'

export interface RoutingResult {
  ok: true
  manufacturingServiceId: string
  manufacturingUserId: string
  labelPrintingServiceId: string
  labelPrintingUserId: string
}

export type RoutingFailure =
  | { ok: false; reason: 'NO_MANUFACTURER'; message: string }
  | { ok: false; reason: 'NO_PRINT_PROVIDER'; message: string }

/**
 * Find best-fit manufacturing + label-printing services for a given product order.
 * V1: first-match. V1.5+: scoring.
 */
export async function findRouting(params: {
  productId: string
  quantity: number
  templateId?: string | null
}): Promise<RoutingResult | RoutingFailure> {
  const product = await prisma.product.findUnique({
    where: { id: params.productId },
    include: {
      template: { include: { dieCutTemplate: true } },
    },
  })
  if (!product) {
    return { ok: false, reason: 'NO_MANUFACTURER', message: 'Product not found' }
  }

  // -------- Manufacturer --------
  const manufServices = await prisma.partnerService.findMany({
    where: {
      type: 'MANUFACTURING',
      status: 'ACTIVE',
      partner: { status: 'ACTIVE' },
    },
    include: { partner: { include: { user: true } } },
  })

  const manufacturer = manufServices.find((s) => {
    const caps = s.capabilities as Record<string, unknown>
    const categories = (caps.categories as string[] | undefined) ?? []
    const moqMin = (caps.moqMin as number | undefined) ?? 0
    const moqMax = (caps.moqMax as number | undefined) ?? Number.POSITIVE_INFINITY
    return (
      categories.includes(product.category) &&
      params.quantity >= moqMin &&
      params.quantity <= moqMax &&
      s.partner.user.stripeAccountStatus === 'ACTIVE'
    )
  })

  if (!manufacturer) {
    return {
      ok: false,
      reason: 'NO_MANUFACTURER',
      message: `No active manufacturer matches ${product.category} at qty ${params.quantity} with payouts enabled`,
    }
  }

  // -------- Print provider --------
  const dieCutTemplateId = product.template?.dieCutTemplateId
  if (!dieCutTemplateId) {
    return {
      ok: false,
      reason: 'NO_PRINT_PROVIDER',
      message: 'Product has no template / die-cut assigned',
    }
  }

  const printServices = await prisma.partnerService.findMany({
    where: {
      type: 'LABEL_PRINTING',
      status: 'ACTIVE',
      partner: { status: 'ACTIVE' },
      dieCutSupport: { some: { dieCutTemplateId } },
    },
    include: { partner: { include: { user: true } } },
  })

  const printProvider = printServices.find((s) => {
    const caps = s.capabilities as Record<string, unknown>
    const moqMin = (caps.moqMin as number | undefined) ?? 0
    return params.quantity >= moqMin && s.partner.user.stripeAccountStatus === 'ACTIVE'
  })

  if (!printProvider) {
    return {
      ok: false,
      reason: 'NO_PRINT_PROVIDER',
      message: `No active print provider supports the chosen die-cut at qty ${params.quantity}`,
    }
  }

  return {
    ok: true,
    manufacturingServiceId: manufacturer.id,
    manufacturingUserId: manufacturer.partner.userId,
    labelPrintingServiceId: printProvider.id,
    labelPrintingUserId: printProvider.partner.userId,
  }
}

/**
 * Estimate dispatch costs from the service's capabilities. V1 uses naive defaults;
 * V1.5+ pulls real cost-per-unit data from the partner profile.
 */
export function estimateDispatchCosts(params: {
  productId: string
  quantity: number
  unitPriceCents: number
}): { manufacturerCostCents: number; printProviderCostCents: number } {
  // V1 placeholder economics — manufacturer gets 30% of unit price, printer 8%
  const total = params.unitPriceCents * params.quantity
  return {
    manufacturerCostCents: Math.floor(total * 0.3),
    printProviderCostCents: Math.floor(total * 0.08),
  }
}

/**
 * Create the two OrderDispatch rows (PRODUCT + LABEL) for a paid order.
 * Called from the Stripe webhook after payment_intent.succeeded.
 */
export async function createDispatches(params: {
  orderId: string
  acceptWindowHours?: number
}): Promise<{ ok: true } | { ok: false; reason: string; message: string }> {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { items: { include: { product: true } } },
  })
  if (!order) return { ok: false, reason: 'NO_ORDER', message: 'Order not found' }
  if (order.status !== 'PAID') {
    return { ok: false, reason: 'WRONG_STATUS', message: `Order is ${order.status}, expected PAID` }
  }

  // V1 assumes one product per order. V1.5+: split orders with multiple products
  // into multiple sets of dispatches.
  const item = order.items[0]
  if (!item) return { ok: false, reason: 'NO_ITEMS', message: 'Order has no items' }

  const routing = await findRouting({
    productId: item.productId,
    quantity: item.quantity,
  })

  if (!routing.ok) {
    // Park the order on hold for admin manual routing
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'ON_HOLD', internalNotes: `Auto-routing failed: ${routing.message}` },
    })
    return routing
  }

  const costs = estimateDispatchCosts({
    productId: item.productId,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
  })

  const acceptDeadlineAt = new Date(
    Date.now() + (params.acceptWindowHours ?? 24) * 60 * 60 * 1000,
  )

  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.createMany({
      data: [
        {
          orderId: order.id,
          type: 'PRODUCT',
          partnerServiceId: routing.manufacturingServiceId,
          status: 'PENDING_ACCEPT',
          acceptDeadlineAt,
          costCents: costs.manufacturerCostCents,
        },
        {
          orderId: order.id,
          type: 'LABEL',
          partnerServiceId: routing.labelPrintingServiceId,
          status: 'PENDING_ACCEPT',
          acceptDeadlineAt,
          costCents: costs.printProviderCostCents,
        },
      ],
    })
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'ROUTING',
        manufacturerServiceId: routing.manufacturingServiceId,
        printProviderServiceId: routing.labelPrintingServiceId,
      },
    })
  })

  // Notify both partners that a new dispatch is waiting for them. Imported
  // lazily so the orders package doesn't take a hard dep on notifications
  // for callers that don't need it (cron jobs, tests, etc.).
  const { dispatchNotification } = await import('@ilaunchify/notifications')
  const brand = await prisma.brand.findUnique({
    where: { id: order.brandId },
    select: { name: true },
  })
  await Promise.allSettled([
    dispatchNotification({
      userId: routing.manufacturingUserId,
      event: 'DISPATCH_RECEIVED',
      data: { orderId: order.id, brandName: brand?.name, type: 'PRODUCT' },
      audience: 'partner',
    }),
    dispatchNotification({
      userId: routing.labelPrintingUserId,
      event: 'DISPATCH_RECEIVED',
      data: { orderId: order.id, brandName: brand?.name, type: 'LABEL' },
      audience: 'partner',
    }),
  ])

  return { ok: true }
}
