'use server'

// Creator production-order flow.
//
// Flow:
//   1. createProductionOrder() validates ownership + gates + computes cost
//   2. Creates Order row in PENDING_PAYMENT with ship-to info
//   3. Creates a Stripe Checkout Session (mode=payment) for the creator
//   4. Returns the Stripe URL → client redirects browser to Stripe
//
// On payment success, the existing webhook handler in @ilaunchify/payments
// flips Order → PAID, creates Charge row, calls createDispatches().

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { findRouting, estimateDispatchCosts } from '@ilaunchify/orders'
import { createCheckoutSession } from '@ilaunchify/payments'
import { logAuditAs } from '@ilaunchify/audit'
import { z } from 'zod'

const Schema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1).max(100_000),
  shipToType: z.enum(['CREATOR_ADDRESS', 'WAREHOUSE_PARTNER']),
  shipToPartnerServiceId: z.string().nullable(),
  shipToContactName: z.string().min(1).max(100),
  shipToContactPhone: z.string().max(30).optional(),
  shipToAddressLine1: z.string().min(1).max(200),
  shipToAddressLine2: z.string().max(200).optional(),
  shipToCity: z.string().min(1).max(100),
  shipToState: z.string().max(50).optional(),
  shipToPostalCode: z.string().min(1).max(20),
  shipToCountry: z.string().min(2).max(2),
})

export type CreateOrderResult =
  | { ok: true; checkoutUrl: string; orderId: string }
  | { ok: false; error: string }

// Platform fee: 5% of production subtotal (will move to PlatformFeeConfig table later)
const PLATFORM_FEE_BPS = 500 // 5.00%

export async function createProductionOrder(
  input: z.infer<typeof Schema>,
): Promise<CreateOrderResult> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') {
    return { ok: false, error: 'Only creators can place production orders' }
  }
  const parsed = Schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0].message }
  }
  const v = parsed.data

  // 1. Load + verify product ownership
  const product = await prisma.product.findFirst({
    where: { id: v.productId, brand: { creatorProfile: { userId: user.id } } },
    include: {
      brand: true,
      template: { include: { dieCutTemplate: true } },
      recipe: { include: { complianceChecks: { orderBy: { createdAt: 'desc' }, take: 1 } } },
    },
  })
  if (!product) return { ok: false, error: 'Product not found' }

  // 2. Gate on compliance pass (no shipping unsafe goods)
  const lastCheck = product.recipe?.complianceChecks[0]
  if (!lastCheck || lastCheck.outcome === 'FAILED') {
    return { ok: false, error: 'Resolve compliance violations before ordering production' }
  }

  // 3. If shipping to a warehouse partner, verify it's a valid ACTIVE WAREHOUSE service
  if (v.shipToType === 'WAREHOUSE_PARTNER') {
    if (!v.shipToPartnerServiceId) {
      return { ok: false, error: 'Pick a warehouse partner' }
    }
    const warehouse = await prisma.partnerService.findFirst({
      where: {
        id: v.shipToPartnerServiceId,
        type: 'WAREHOUSE',
        status: 'ACTIVE',
        partner: { status: 'ACTIVE' },
      },
    })
    if (!warehouse) {
      return { ok: false, error: 'Selected warehouse partner is not available' }
    }
  }

  // 4. Find routing (manufacturer + print partner) for this product + quantity
  const routing = await findRouting({
    productId: product.id,
    quantity: v.quantity,
    templateId: product.templateId,
  })
  if (!routing.ok) {
    return { ok: false, error: routing.message }
  }

  // 5. Cost calculation — production cost basis is what we'd ultimately transfer
  //    to the partners (V1 uses estimateDispatchCosts; V1.5+ pulls real cost-per-unit
  //    from the partner profile).
  const referenceUnitPrice = product.priceCents > 0 ? product.priceCents : 1000 // $10 fallback
  const costs = estimateDispatchCosts({
    productId: product.id,
    quantity: v.quantity,
    unitPriceCents: referenceUnitPrice,
  })
  const subtotalCents = costs.manufacturerCostCents + costs.printProviderCostCents
  const applicationFeeCents = Math.floor(subtotalCents * (PLATFORM_FEE_BPS / 10000))
  const totalCents = subtotalCents + applicationFeeCents

  if (subtotalCents <= 0) {
    return {
      ok: false,
      error: 'Cost calculation came out to zero. Set a reference unit price on the product first.',
    }
  }

  // 6. Create Order in PENDING_PAYMENT + OrderItem snapshot
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        brandId: product.brandId,
        creatorUserId: user.id,
        status: 'PENDING_PAYMENT',
        subtotalCents,
        shippingCents: 0,
        taxCents: 0,
        totalCents,
        manufacturerServiceId: routing.manufacturingServiceId,
        printProviderServiceId: routing.labelPrintingServiceId,
        shipToType: v.shipToType,
        shipToPartnerServiceId:
          v.shipToType === 'WAREHOUSE_PARTNER' ? v.shipToPartnerServiceId : null,
        shipToContactName: v.shipToContactName,
        shipToContactPhone: v.shipToContactPhone ?? null,
        shipToAddressLine1: v.shipToAddressLine1,
        shipToAddressLine2: v.shipToAddressLine2 ?? null,
        shipToCity: v.shipToCity,
        shipToState: v.shipToState ?? null,
        shipToPostalCode: v.shipToPostalCode,
        shipToCountry: v.shipToCountry,
      },
    })
    await tx.orderItem.create({
      data: {
        orderId: created.id,
        productId: product.id,
        quantity: v.quantity,
        unitPriceCents: Math.round(subtotalCents / v.quantity),
        totalCents: subtotalCents,
      },
    })
    return created
  })

  // 7. Audit log
  await logAuditAs(user, {
    entityType: 'Order',
    entityId: order.id,
    action: 'ORDER_CREATED',
    toValue: 'PENDING_PAYMENT',
    payload: {
      brandId: product.brandId,
      productId: product.id,
      quantity: v.quantity,
      subtotalCents,
      totalCents,
      shipToType: v.shipToType,
    },
  })

  // 8. Build absolute success/cancel URLs (Next.js base URL from env or fallback)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const successUrl = `${baseUrl}/products/${product.id}/order/success?session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${baseUrl}/products/${product.id}/order`

  // 9. Create Stripe Checkout Session
  let session
  try {
    session = await createCheckoutSession({
      orderId: order.id,
      brandId: product.brandId,
      creatorId: user.id,
      brandName: product.brand.name,
      successUrl,
      cancelUrl,
      customerEmail: user.email,
      lineItems: [
        {
          productName: `${product.name} (production order × ${v.quantity})`,
          unitAmountCents: totalCents,
          quantity: 1, // we already multiplied by quantity into totalCents
        },
      ],
      applicationFeeCents,
    })
  } catch (err) {
    // Clean up the PENDING order if Stripe fails
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', internalNotes: `Stripe Checkout failed: ${(err as Error).message}` },
    })
    return {
      ok: false,
      error: `Couldn't reach Stripe. Check your STRIPE_SECRET_KEY env. Detail: ${(err as Error).message}`,
    }
  }

  if (!session.url) {
    return { ok: false, error: 'Stripe did not return a checkout URL' }
  }

  return { ok: true, checkoutUrl: session.url, orderId: order.id }
}
