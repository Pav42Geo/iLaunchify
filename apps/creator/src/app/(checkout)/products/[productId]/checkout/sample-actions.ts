'use server'

// createSampleOrder: places a pre-production SAMPLE order (Pavel 2026-06-10).
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

import { prisma, getSampleSettings } from '@ilaunchify/db'
import { requireUser, getCreatorTier } from '@ilaunchify/auth'
// PP-0d: the fee SSOT + the one pricer. A sample is not a different KIND of
// order, it is a small one, so it resolves the same tier rate as everything else.
import {
  resolveCreatorFeeBps,
  resolveCreatorFeeBounds,
  computeOrderPricing,
} from '@ilaunchify/plans'
import { createCheckoutSession } from '@ilaunchify/payments'
import { logAuditAs } from '@ilaunchify/audit'
import { quoteSample, createOrderWithNumber, resolveSamplePrintLeg, effectivePrintSourcing, type SampleSelection, type SampleOption } from '@ilaunchify/orders'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

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
  /** Required for BRANDED — the creator approves their not-for-resale artwork proof. */
  acknowledgedNotForResale?: boolean
}

export async function createSampleOrder(
  productId: string,
  input: CreateSampleOrderInput,
): Promise<Result<{ checkoutUrl: string; orderId: string }>> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'Only creators can order samples.' }

  // Admin-tunable sample policy (shipping, fee, abuse window, branded gating).
  const settings = await getSampleSettings()

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

  // Branded produces the creator's actual artwork: require the not-for-resale
  // acknowledgment server-side (the client gates too, but this is the real gate).
  if (input.kind === 'BRANDED' && !input.acknowledgedNotForResale) {
    return { ok: false, error: 'Please confirm the not-for-resale acknowledgment to order a branded sample.' }
  }
  // Admin gate: when branded samples require an approved die-line and that flow
  // isn't live yet, block branded server-side.
  if (input.kind === 'BRANDED' && settings.brandedRequiresDieline) {
    return { ok: false, error: 'Branded samples require an approved die-line, which isn’t available for this product yet.' }
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

  // --- 4. Abuse cap: sample orders per creator per template per window -------
  if (opt.maxPerCreatorPerPeriod != null) {
    const since = new Date(Date.now() - settings.abuseWindowDays * 86_400_000)
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
      return { ok: false, error: `You've reached the sample limit for this product (${opt.maxPerCreatorPerPeriod} per ${settings.abuseWindowDays} days).` }
    }
  }

  // --- 5. Ship-to (a sample ships to the creator) ----------------------------
  const s = input.shipTo
  if (!s?.contactName?.trim() || !s.addressLine1?.trim() || !s.city?.trim() || !s.postalCode?.trim()) {
    return { ok: false, error: 'Enter a complete shipping address.' }
  }

  // PP-0d (Pavel 2026-07-16): "add tier rate for sample orders too, this is not
  // different than any other order."
  //
  // A sample now resolves the creator's SUBSCRIPTION-TIER rate (15/12/8) through
  // the same SSOT as every other charge, and prices through the same function.
  // Three things this retires:
  //   1. OrderSettings.samplePlatformFeeBps as the sample fee SOURCE. It was a
  //      THIRD fee table (alongside FeeRule and the evicted PlatformFeeConfig),
  //      it DEFAULTED TO 0, and it ignored creator tier entirely: an Agency
  //      creator paid the same sample fee as a Maker. Column kept, deprecated.
  //   2. Math.floor. Every other path rounds (creatorFeeCents), and the audit
  //      found exactly this floor-vs-round drift between surfaces.
  //   3. The hand-copied expression in SampleCheckout.tsx, which had to be kept
  //      in sync with this one by hand. Both now call creatorFeeCents.
  //
  // NOTE this is a real PRICE CHANGE, not a refactor: samples charged 0% by
  // default and now carry the tier rate. The sample is still paid IN FULL at
  // order time and still mints a SampleCredit toward the first production run
  // (that model already matched Pavel's "real sample prices which the creator
  // pays when he orders it" and is untouched).
  const shippingCents = settings.sampleFlatShippingCents
  const creatorTier = await getCreatorTier(user.id)
  const { feeBps } = await resolveCreatorFeeBps(creatorTier)
  const feeBounds = await resolveCreatorFeeBounds(creatorTier)
  const priced = computeOrderPricing({
    // The sample's production subtotal: partner-set, creator-paid, so it is the
    // fee base. Shipping rides outside it exactly as on a production order.
    production: [{ kind: 'PRODUCT', label: 'Sample', cents: quote.subtotalCents }],
    shippingCents,
    feeBps,
    feeBounds,
  })
  const platformFeeCents = priced.platformFeeCents
  const totalCents = priced.totalCents

  // --- 5b. SR-2.2: BRANDED sample print leg. A branded sample of an
  //         externally-printed product must exercise the EXACT printer who'd
  //         produce the bulk run (pinned pick → SAMPLE-context rotation among
  //         sampleCapable printers, sample-rejection exclusions applied).
  //         Null = manufacturer improvises (IN_HOUSE, or no printer resolvable)
  //        : recorded honestly in internalNotes.
  let samplePrintLeg: Awaited<ReturnType<typeof resolveSamplePrintLeg>> = null
  if (input.kind === 'BRANDED' && tpl?.manufacturerServiceId) {
    const mfr = await prisma.partnerService
      .findUnique({
        where: { id: tpl.manufacturerServiceId },
        select: { labelingMode: true },
      })
      .catch(() => null)
    if (mfr && effectivePrintSourcing(product, mfr) !== 'IN_HOUSE') {
      samplePrintLeg = await resolveSamplePrintLeg({
        productId: product.id,
        productTemplateId,
        creatorUserId: user.id,
      }).catch(() => null)
    }
  }

  // --- 6. Create the SAMPLE order (+ item). No MOQ check by design. -----------
  //         orderNumber stamped with a @unique P2002 retry (createOrderWithNumber).
  const order = await createOrderWithNumber((orderNumber) => (prisma as unknown as {
    order: { create: (a: unknown) => Promise<{ id: string }> }
  }).order.create({
    data: {
      orderNumber,
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
      // SR-2.2: the printer this branded sample exercises (verdict subject +
      // sticky-continuity anchor). Null = manufacturer improvises the label.
      printProviderServiceId: samplePrintLeg?.partnerServiceId ?? null,
      shipToType: 'CREATOR_ADDRESS',
      shipToContactName: s.contactName.trim(),
      shipToContactPhone: s.contactPhone ?? null,
      shipToAddressLine1: s.addressLine1.trim(),
      shipToAddressLine2: s.addressLine2 ?? null,
      shipToCity: s.city.trim(),
      shipToState: s.state ?? null,
      shipToPostalCode: s.postalCode.trim(),
      shipToCountry: s.country?.trim() || 'US',
      internalNotes: `SAMPLE · ${input.kind} · ${quote.unitCount} unit(s) · ${input.selection.mode}${input.kind === 'BRANDED' ? ' · not-for-resale ack' : ''}${
        samplePrintLeg
          ? ` · print leg: PartnerService ${samplePrintLeg.partnerServiceId} (${samplePrintLeg.pinned ? 'creator pin' : 'rotation'}) — ops coordinates the 1-unit label run (SR-2.2 V1)`
          : input.kind === 'BRANDED'
            ? ' · print leg: manufacturer improvises (in-house or no external printer resolvable)'
            : ''
      }`,
      items: {
        create: {
          productId: product.id,
          quantity: quote.unitCount,
          unitPriceCents: Math.round(quote.subtotalCents / Math.max(1, quote.unitCount)),
          totalCents: quote.subtotalCents,
        },
      },
    } as never,
  }))

  // SR-2.2: rotation picked the sample's printer: persist the decision.
  if (samplePrintLeg?.awardPayload) {
    await prisma.printAwardLog
      .create({
        data: {
          partnerServiceId: samplePrintLeg.partnerServiceId,
          orderId: order.id,
          decisionJson: samplePrintLeg.awardPayload as never,
        },
      })
      .catch(() => {/* best-effort */})
  }

  await logAuditAs(user, {
    entityType: 'Order',
    entityId: order.id,
    action: 'SAMPLE_ORDER_CREATED',
    toValue: 'PENDING_PAYMENT',
    payload: {
      brandId: product.brandId,
      productId: product.id,
      productTemplateId,
      orderNumber: (order as { orderNumber?: string | null }).orderNumber ?? null,
      kind: input.kind,
      unitCount: quote.unitCount,
      subtotalCents: quote.subtotalCents,
      totalCents,
      creditableCents: quote.creditableCents,
      acknowledgedNotForResale: input.kind === 'BRANDED' ? !!input.acknowledgedNotForResale : undefined,
    },
  })

  // --- 7. Stripe Checkout Session: the webhook mints the credit on PAID ------
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
