'use server'

// createSampleOrder — places a pre-production SAMPLE order (Pavel 2026-06-10).
//
// Attachment model (LOCKED): the creator must already own a Product (under their
// brand, created from a catalog template). The action takes that productId,
// resolves the partner's ProductSampleOption for the chosen kind, RE-QUOTES the
// price server-side (never trusts the client), enforces the abuse cap, creates a
// SAMPLE Order that BYPASSES the production MOQ, and hands off to Stripe Checkout.
//
// On payment, the @ilaunchify/payments webhook (onPaymentSucceeded) branches on
// orderType=SAMPLE → mints the SampleCredit + skips the production dispatch graph.
//
// New Order columns (orderType / sampleKind) + ProductSampleOption are cast-guarded
// until the sample-policy migration lands on the client.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { createCheckoutSession } from '@ilaunchify/payments'
import { logAuditAs } from '@ilaunchify/audit'
import { quoteSample, type SampleSelection, type SampleOption } from '@ilaunchify/orders'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

// V1 simplifications (Pavel can revisit): flat sample shipping, no platform fee on
// the sample itself (it's a conversion tool — the fee/credit play happens on the
// first production order), 30-day abuse window.
const SAMPLE_FLAT_SHIPPING_CENTS = 995
const SAMPLE_PLATFORM_FEE_CENTS = 0
const SAMPLE_ABUSE_WINDOW_DAYS = 30

export interface SampleShipTo {
  contactName: string
  contactPhone?: string | null
  addressLine1: string
  addressLine2?: string | null
  city: string
  state?: string | null
  postalCode: string
  country?: string
}

export interface CreateSampleOrderInput {
  kind: 'UNBRANDED' | 'BRANDED'
  selection: SampleSelection
  shipTo: SampleShipTo
}

export async function createSampleOrder(
  productId: string,
  input: CreateSampleOrderInput,
): Promise<Result<{ checkoutUrl: string; orderId: string }>> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'Only creators can order samples.' }

  // --- 1. Owned product + its catalog template -------------------------------
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    include: { brand: true },
  })
  if (!product) return { ok: false, error: 'Product not found.' }
  const productTemplateId = product.productTemplateId
  if (!productTemplateId) {
    return { ok: false, error: "This product isn't linked to a catalog template, so samples aren't available." }
  }

  // --- 2. The partner's sample option for this kind + the flavor pool ---------
  const tpl = await (prisma as unknown as {
    productTemplate: {
      findUnique: (a: unknown) => Promise<{
        manufacturerServiceId: string | null
        flavorPresets: Array<{ name: string }>
        sampleOptions: Array<{
          kind: 'UNBRANDED' | 'BRANDED'
          enabled: boolean
          perFlavorCents: number | null
          samplerSetCents: number | null
          sampleMoq: number
          maxUnitsPerFlavor: number | null
          leadTimeDays: number
          creditTowardFirstOrder: boolean
          creditCapCents: number | null
          maxPerCreatorPerPeriod: number | null
        }>
      } | null>
    }
  }).productTemplate
    .findUnique({
      where: { id: productTemplateId },
      select: {
        manufacturerServiceId: true,
        flavorPresets: { orderBy: { sortOrder: 'asc' }, select: { name: true } },
        sampleOptions: {
          where: { kind: input.kind },
          select: {
            kind: true, enabled: true, perFlavorCents: true, samplerSetCents: true, sampleMoq: true,
            maxUnitsPerFlavor: true, leadTimeDays: true, creditTowardFirstOrder: true, creditCapCents: true,
            maxPerCreatorPerPeriod: true,
          },
        },
      },
    })
    .catch(() => null)

  const opt = tpl?.sampleOptions?.[0]
  if (!opt || !opt.enabled) {
    return { ok: false, error: `${input.kind === 'BRANDED' ? 'Branded' : 'Unbranded'} samples aren't offered for this product.` }
  }

  const flavorNames = (tpl?.flavorPresets ?? []).map((f) => f.name).filter((n): n is string => !!n && n.trim().length > 0)
  const isMultiFlavor = flavorNames.length > 1

  // --- 3. Re-quote server-side (authoritative price) -------------------------
  const sampleOption: SampleOption = {
    kind: opt.kind,
    perFlavorCents: opt.perFlavorCents,
    samplerSetCents: opt.samplerSetCents,
    sampleMoq: opt.sampleMoq,
    maxUnitsPerFlavor: opt.maxUnitsPerFlavor,
    leadTimeDays: opt.leadTimeDays,
    creditTowardFirstOrder: opt.creditTowardFirstOrder,
    creditCapCents: opt.creditCapCents,
  }
  const quote = quoteSample(sampleOption, input.selection, isMultiFlavor)
  if (quote.errors.length) return { ok: false, error: quote.errors[0]! }
  if (quote.subtotalCents <= 0) return { ok: false, error: 'Sample total must be greater than zero.' }

  // --- 4. Abuse cap — sample orders per creator per template per window -------
  if (opt.maxPerCreatorPerPeriod != null) {
    const since = new Date(Date.now() - SAMPLE_ABUSE_WINDOW_DAYS * 86_400_000)
    const prior = await (prisma as unknown as {
      order: { count: (a: unknown) => Promise<number> }
    }).order
      .count({
        where: {
          creatorUserId: user.id,
          orderType: 'SAMPLE',
          createdAt: { gte: since },
          items: { some: { product: { productTemplateId } } },
        } as never,
      })
      .catch(() => 0)
    if (prior >= opt.maxPerCreatorPerPeriod) {
      return { ok: false, error: `You've reached the sample limit for this product (${opt.maxPerCreatorPerPeriod} per ${SAMPLE_ABUSE_WINDOW_DAYS} days).` }
    }
  }

  // --- 5. Ship-to (a sample ships to the creator) ----------------------------
  const s = input.shipTo
  if (!s?.contactName?.trim() || !s.addressLine1?.trim() || !s.city?.trim() || !s.postalCode?.trim()) {
    return { ok: false, error: 'Enter a complete shipping address.' }
  }

  const shippingCents = SAMPLE_FLAT_SHIPPING_CENTS
  const platformFeeCents = SAMPLE_PLATFORM_FEE_CENTS
  const totalCents = quote.subtotalCents + shippingCents + platformFeeCents

  // --- 6. Create the SAMPLE order (+ item). No MOQ check by design. -----------
  const order = await (prisma as unknown as {
    order: { create: (a: unknown) => Promise<{ id: string }> }
  }).order.create({
    data: {
      brandId: product.brandId,
      creatorUserId: user.id,
      status: 'PENDING_PAYMENT',
      orderType: 'SAMPLE',
      sampleKind: input.kind,
      subtotalCents: quote.subtotalCents,
      shippingCents,
      taxCents: 0,
      totalCents,
      manufacturerServiceId: tpl?.manufacturerServiceId ?? null,
      shipToType: 'CREATOR_ADDRESS',
      shipToContactName: s.contactName.trim(),
      shipToContactPhone: s.contactPhone ?? null,
      shipToAddressLine1: s.addressLine1.trim(),
      shipToAddressLine2: s.addressLine2 ?? null,
      shipToCity: s.city.trim(),
      shipToState: s.state ?? null,
      shipToPostalCode: s.postalCode.trim(),
      shipToCountry: s.country?.trim() || 'US',
      internalNotes: `SAMPLE · ${input.kind} · ${quote.unitCount} unit(s) · ${input.selection.mode}`,
      items: {
        create: {
          productId: product.id,
          quantity: quote.unitCount,
          unitPriceCents: Math.round(quote.subtotalCents / Math.max(1, quote.unitCount)),
          totalCents: quote.subtotalCents,
        },
      },
    } as never,
  })

  await logAuditAs(user, {
    entityType: 'Order',
    entityId: order.id,
    action: 'SAMPLE_ORDER_CREATED',
    toValue: 'PENDING_PAYMENT',
    payload: {
      brandId: product.brandId,
      productId: product.id,
      productTemplateId,
      kind: input.kind,
      unitCount: quote.unitCount,
      subtotalCents: quote.subtotalCents,
      totalCents,
      creditableCents: quote.creditableCents,
    },
  })

  // --- 7. Stripe Checkout Session — the webhook mints the credit on PAID ------
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const successUrl = `${baseUrl}/products/${product.id}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${baseUrl}/products/${product.id}`

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
          productName: `${product.name} — ${input.kind === 'BRANDED' ? 'Branded' : 'Unbranded'} sample (×${quote.unitCount})`,
          unitAmountCents: totalCents,
          quantity: 1,
        },
      ],
      applicationFeeCents: platformFeeCents,
    })
  } catch (err) {
    await (prisma as unknown as { order: { update: (a: unknown) => Promise<unknown> } }).order
      .update({ where: { id: order.id }, data: { status: 'CANCELLED', internalNotes: `Sample Stripe error: ${(err as Error).message}` } as never })
      .catch(() => {/* ignore */})
    return { ok: false, error: `Couldn't reach Stripe. Detail: ${(err as Error).message}` }
  }

  if (!session.url) return { ok: false, error: 'Stripe did not return a checkout URL.' }
  return { ok: true, data: { checkoutUrl: session.url, orderId: order.id } }
}
