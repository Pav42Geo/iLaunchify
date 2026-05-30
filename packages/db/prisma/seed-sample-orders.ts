// Seeds 2 demo orders for sample-creator@ilaunchify.dev so the wide-card
// orders layout has something to render in dev.
//
// Idempotent: skips if either demo order already exists.
//
// Run: pnpm --filter @ilaunchify/db exec tsx prisma/seed-sample-orders.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const creator = await prisma.user.findUnique({
    where: { email: 'sample-creator@ilaunchify.dev' },
    include: { creatorProfile: { include: { brands: true } } },
  })
  if (!creator?.creatorProfile?.brands[0]) {
    throw new Error('Run the main seed first — sample-creator + sample-brand missing.')
  }
  const brand = creator.creatorProfile.brands[0]

  const market = await prisma.market.findUnique({ where: { code: 'US' } })
  if (!market) throw new Error('US market row missing — run seed-markets-regions.')

  // Pull any published template + its variant. If absent, we cannot make
  // a realistic order — abort with a helpful message.
  const template = await prisma.productTemplate.findFirst({
    where: { status: 'PUBLISHED', variants: { some: { isActive: true } } },
    include: { subcategory: { include: { category: true } }, variants: { where: { isActive: true }, take: 1 } },
  })
  if (!template || !template.variants[0]) {
    throw new Error('No PUBLISHED ProductTemplate with an active variant — run seed-catalog first.')
  }
  const variant = template.variants[0]

  // Need at least one partner service per role we want to seed.
  const mfgService = await prisma.partnerService.findFirst({
    where: { type: 'MANUFACTURING', status: 'ACTIVE' },
    include: { partner: true },
  })
  const labelService = await prisma.partnerService.findFirst({
    where: { type: 'LABEL_PRINTING', status: 'ACTIVE' },
    include: { partner: true },
  })
  const warehouseService = await prisma.partnerService.findFirst({
    where: { type: 'WAREHOUSE', status: 'ACTIVE' },
    include: { partner: true },
  })
  if (!mfgService || !labelService) {
    throw new Error('Need at least 1 ACTIVE MANUFACTURING + 1 ACTIVE LABEL_PRINTING PartnerService — run main seed.')
  }

  // Ensure we have one Product row for the demo brand.
  let product = await prisma.product.findFirst({
    where: { brandId: brand.id, productTemplateId: template.id },
  })
  if (!product) {
    product = await prisma.product.create({
      data: {
        brandId: brand.id,
        productTemplateId: template.id,
        variantId: variant.id,
        marketId: market.id,
        name: `${template.name}${variant.flavor ? ` — ${variant.flavor}` : ''}`,
        slug: 'demo-' + template.slug,
        category:
          template.subcategory.category.mainCategory === 'Supplements'
            ? 'SUPPLEMENT'
            : template.subcategory.category.mainCategory === 'Beverages'
              ? 'BEVERAGE_FUNCTIONAL'
              : 'FOOD',
        status: 'COMPLIANT',
      },
    })
  }

  // -------------------------------------------------------------------------
  // ORDER A — In production, with CHANGES_REQUESTED on the label dispatch
  // -------------------------------------------------------------------------
  const orderASlug = 'demo-order-in-production'
  const existingA = await prisma.order.findFirst({
    where: { brandId: brand.id, internalNotes: orderASlug },
  })
  if (!existingA) {
    const subtotalA = 248000 // $2,480 production basis
    const shippingA = 38000 // $380
    const taxA = 21420 // $214.20
    const platformFeeA = 13000 // $130
    const totalA = subtotalA + shippingA + taxA + platformFeeA
    const orderA = await prisma.order.create({
      data: {
        brandId: brand.id,
        creatorUserId: creator.id,
        internalNotes: orderASlug,
        status: 'IN_FULFILLMENT',
        aggregateApprovalStatus: 'CHANGES_REQUESTED',
        subtotalCents: subtotalA,
        shippingCents: shippingA,
        taxCents: taxA,
        totalCents: totalA,
        manufacturerServiceId: mfgService.id,
        printProviderServiceId: labelService.id,
        shipToType: warehouseService ? 'WAREHOUSE_PARTNER' : 'CREATOR_ADDRESS',
        shipToPartnerServiceId: warehouseService?.id,
        shipToContactName: 'Sample Creator',
        shipToAddressLine1: '123 Wild Roots Way',
        shipToCity: 'Columbus',
        shipToState: 'OH',
        shipToPostalCode: '43215',
        shipToCountry: 'US',
        paidAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
        items: {
          create: {
            productId: product.id,
            quantity: 500,
            unitPriceCents: 496,
            totalCents: 248000,
          },
        },
        dispatches: {
          create: [
            {
              type: 'PRODUCT',
              partnerServiceId: mfgService.id,
              status: 'PRODUCING',
              acceptDeadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              acceptedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
              productionStartedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              costCents: 180000,
              manifestVersion: 2,
              acceptedManifestVersion: 2,
            },
            {
              type: 'LABEL',
              partnerServiceId: labelService.id,
              status: 'CHANGES_REQUESTED',
              acceptDeadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              costCents: 68000,
              manifestVersion: 2,
              changeRequest: {
                flaggedFields: ['ingredients_statement'],
                partnerNote:
                  'Allergen statement font size is below FDA minimum on the back panel — please bump to ≥ 6pt and resubmit.',
                suggestedAlternatives: {},
                requestedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
              },
            },
            ...(warehouseService
              ? [
                  {
                    type: 'PRODUCT' as const,
                    partnerServiceId: warehouseService.id,
                    status: 'PENDING_ACCEPT' as const,
                    acceptDeadlineAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
                    costCents: 0,
                    manifestVersion: 2,
                  },
                ]
              : []),
          ],
        },
      },
    })
    console.log(`✓ Created order A (in production / changes requested): ${orderA.id}`)
  } else {
    console.log(`• Order A already exists: ${existingA.id}`)
  }

  // -------------------------------------------------------------------------
  // ORDER B — Delivered, with tracking number + warehouse origin
  // -------------------------------------------------------------------------
  const orderBSlug = 'demo-order-delivered'
  const existingB = await prisma.order.findFirst({
    where: { brandId: brand.id, internalNotes: orderBSlug },
  })
  if (!existingB) {
    const subtotalB = 122400
    const shippingB = 24000
    const taxB = 11400
    const platformFeeB = 4000
    const totalB = subtotalB + shippingB + taxB + platformFeeB
    const orderB = await prisma.order.create({
      data: {
        brandId: brand.id,
        creatorUserId: creator.id,
        internalNotes: orderBSlug,
        status: 'DELIVERED',
        aggregateApprovalStatus: 'FULLY_ACCEPTED',
        subtotalCents: subtotalB,
        shippingCents: shippingB,
        taxCents: taxB,
        totalCents: totalB,
        manufacturerServiceId: mfgService.id,
        printProviderServiceId: labelService.id,
        shipToType: warehouseService ? 'WAREHOUSE_PARTNER' : 'CREATOR_ADDRESS',
        shipToPartnerServiceId: warehouseService?.id,
        shipToContactName: 'Sample Creator',
        shipToAddressLine1: '123 Wild Roots Way',
        shipToCity: 'Columbus',
        shipToState: 'OH',
        shipToPostalCode: '43215',
        shipToCountry: 'US',
        paidAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        deliveredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        items: {
          create: {
            productId: product.id,
            quantity: 250,
            unitPriceCents: 490,
            totalCents: 122400,
          },
        },
        dispatches: {
          create: [
            {
              type: 'PRODUCT',
              partnerServiceId: mfgService.id,
              status: 'DELIVERED',
              acceptDeadlineAt: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000),
              acceptedAt: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000),
              productionStartedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
              readyAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
              shippedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
              trackingCarrier: 'UPS',
              trackingNumber: '1Z999AA10123456784',
              deliveredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
              costCents: 92400,
            },
            {
              type: 'LABEL',
              partnerServiceId: labelService.id,
              status: 'DELIVERED',
              acceptDeadlineAt: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000),
              acceptedAt: new Date(Date.now() - 27 * 24 * 60 * 60 * 1000),
              productionStartedAt: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000),
              readyAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
              shippedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
              deliveredAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
              costCents: 30000,
            },
          ],
        },
      },
    })
    console.log(`✓ Created order B (delivered): ${orderB.id}`)
  } else {
    console.log(`• Order B already exists: ${existingB.id}`)
  }

  console.log('\nDemo orders ready. Sign in as sample-creator@ilaunchify.dev and visit /orders.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
