// FC end-to-end dry-run seed — Partner Role Accounts go-live checklist
// (docs/PARTNER_ROLE_ACCOUNTS.md §10 "end-to-end dry run per role" +
// docs/FC_DRY_RUN.md walkthrough).
//
// Creates (idempotently):
//   1. A dedicated ACTIVE Fulfillment Center partner: fc-dryrun@ilaunchify.dev
//      ("Dryrun Fulfillment Co", WAREHOUSE service, AMBIENT, PALLET_MONTH
//      rates, Columbus OH geo) — log in via /api/dev/login as this user.
//   2. One order in the exact FC inbound entry state: WAREHOUSE_PARTNER
//      ship-to, manufacturer dispatch SHIPPED with a DELIVERED ShipmentLeg
//      (palletCount 2) — appears in the FC's /inbound "Expected" queue AND
//      trips the INBOUND_DELIVERED_UNCONFIRMED sweep if left unconfirmed.
//
// Prereqs: main seed (sample-creator + Acme manufacturer) + a PUBLISHED
// ProductTemplate with an active variant (seed-catalog).
//
// Run: pnpm --filter @ilaunchify/db seed:fc-dryrun

import { randomBytes } from 'node:crypto'
import { PrismaClient, UserRole } from '@prisma/client'

const prisma = new PrismaClient()

const ORDER_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
function seedOrderNumber(date = new Date()): string {
  const yy = String(date.getUTCFullYear() % 100).padStart(2, '0')
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const ceiling = Math.floor(256 / ORDER_CODE_ALPHABET.length) * ORDER_CODE_ALPHABET.length
  let code = ''
  while (code.length < 5) {
    for (const b of randomBytes(8)) {
      if (code.length >= 5) break
      if (b >= ceiling) continue
      code += ORDER_CODE_ALPHABET[b % ORDER_CODE_ALPHABET.length]
    }
  }
  return `ILF-${yy}${mm}${dd}-${code}`
}

const DAY = 24 * 60 * 60 * 1000

async function main() {
  // ---------------------------------------------------------------------------
  // 1. Dry-run Fulfillment Center partner
  // ---------------------------------------------------------------------------
  const fcUser = await prisma.user.upsert({
    where: { email: 'fc-dryrun@ilaunchify.dev' },
    update: { role: UserRole.PARTNER },
    create: {
      email: 'fc-dryrun@ilaunchify.dev',
      name: 'Dryrun Fulfillment Co',
      role: UserRole.PARTNER,
      partner: {
        create: {
          companyName: 'Dryrun Fulfillment Co',
          legalName: 'Dryrun Fulfillment Company LLC',
          status: 'ACTIVE',
          country: 'US',
          city: 'Columbus',
          state: 'OH',
        },
      },
    },
  })
  const fcPartner = await prisma.partner.findUnique({ where: { userId: fcUser.id } })
  if (!fcPartner) throw new Error('FC partner row missing after upsert')
  if (fcPartner.status !== 'ACTIVE') {
    await prisma.partner.update({ where: { id: fcPartner.id }, data: { status: 'ACTIVE' } })
  }

  let fcService = await prisma.partnerService.findUnique({
    where: { partnerId_type: { partnerId: fcPartner.id, type: 'WAREHOUSE' } },
  })
  if (!fcService) {
    fcService = await prisma.partnerService.create({
      data: {
        partnerId: fcPartner.id,
        type: 'WAREHOUSE',
        status: 'ACTIVE',
        offersStorage: true,
        storageClasses: ['AMBIENT'],
        hazmatAccepted: [],
        fcCertifications: ['FDA_REGISTERED'],
        storageBillingUnit: 'PALLET_MONTH',
        storageRateCents: 2200, // $22/pallet/mo — industry-typical
        storageFreeGraceDays: 10,
        storageMinMonthlyCents: 2200,
        pickFeeCents: 250,
        packFeeCents: 150,
        canShipParcel: true,
        weeklyPalletCapacity: 40,
        facilityLat: 39.9612,
        facilityLng: -82.9988,
        capabilities: { note: 'FC dry-run seed facility' },
      } as Parameters<typeof prisma.partnerService.create>[0]['data'],
    })
    console.log('✓ Created Dryrun FC WAREHOUSE service')
  } else {
    console.log('• Dryrun FC service already exists')
  }

  // ---------------------------------------------------------------------------
  // 2. Inbound order in receiving-entry state
  // ---------------------------------------------------------------------------
  const creator = await prisma.user.findUnique({
    where: { email: 'sample-creator@ilaunchify.dev' },
    include: { creatorProfile: { include: { brands: true } } },
  })
  const brand = creator?.creatorProfile?.brands[0]
  if (!creator || !brand) throw new Error('Run the main seed first — sample-creator + brand missing.')

  const market = await prisma.market.findUnique({ where: { code: 'US' } })
  if (!market) throw new Error('US market row missing — run seed-markets-regions.')

  const template = await prisma.productTemplate.findFirst({
    where: { status: 'PUBLISHED', variants: { some: { isActive: true } } },
    include: { subcategory: { include: { category: true } }, variants: { where: { isActive: true }, take: 1 } },
  })
  const variant = template?.variants[0]
  if (!template || !variant) throw new Error('No PUBLISHED template with active variant — run seed-catalog.')

  const mfgService = await prisma.partnerService.findFirst({
    where: { type: 'MANUFACTURING', status: 'ACTIVE' },
  })
  if (!mfgService) throw new Error('Need an ACTIVE MANUFACTURING service — run main seed.')

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
        name: `${template.name} (FC dry run)`,
        slug: 'fc-dryrun-' + template.slug,
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

  const slug = 'demo-order-fc-inbound'
  const existing = await prisma.order.findFirst({
    where: { brandId: brand.id, internalNotes: slug },
  })
  if (existing) {
    console.log(`• FC inbound order already exists: ${existing.id}`)
  } else {
    const subtotal = 300000
    const order = await prisma.order.create({
      data: {
        orderNumber: seedOrderNumber(),
        brandId: brand.id,
        creatorUserId: creator.id,
        internalNotes: slug,
        status: 'IN_FULFILLMENT',
        aggregateApprovalStatus: 'FULLY_ACCEPTED',
        subtotalCents: subtotal,
        shippingCents: 42000,
        taxCents: 25200,
        totalCents: subtotal + 42000 + 25200,
        manufacturerServiceId: mfgService.id,
        shipToType: 'WAREHOUSE_PARTNER',
        shipToPartnerServiceId: fcService.id,
        shipToContactName: 'Dryrun Fulfillment Co — Receiving',
        shipToAddressLine1: '900 Distribution Dr',
        shipToCity: 'Columbus',
        shipToState: 'OH',
        shipToPostalCode: '43219',
        shipToCountry: 'US',
        paidAt: new Date(Date.now() - 14 * DAY),
        items: {
          create: {
            productId: product.id,
            quantity: 600,
            unitPriceCents: 500,
            totalCents: subtotal,
          },
        },
        dispatches: {
          create: [
            {
              type: 'PRODUCT',
              partnerServiceId: mfgService.id,
              status: 'SHIPPED',
              acceptDeadlineAt: new Date(Date.now() - 12 * DAY),
              acceptedAt: new Date(Date.now() - 12 * DAY),
              productionStartedAt: new Date(Date.now() - 10 * DAY),
              shippedAt: new Date(Date.now() - 2 * DAY),
              trackingCarrier: 'FedEx Freight',
              trackingNumber: 'DRYRUN-' + seedOrderNumber().slice(-5),
              costCents: 210000,
              manifestVersion: 1,
              acceptedManifestVersion: 1,
              shipmentLegs: {
                create: {
                  mode: 'LTL',
                  status: 'DELIVERED', // carrier says delivered — receipt UNCONFIRMED
                  carrierName: 'FedEx Freight',
                  serviceLevel: 'LTL_STANDARD',
                  palletCount: 2,
                  shippedAt: new Date(Date.now() - 2 * DAY),
                  deliveredAt: new Date(Date.now() - 1 * DAY),
                },
              },
            },
          ],
        },
      } as Parameters<typeof prisma.order.create>[0]['data'],
    })
    console.log(`✓ Created FC inbound order: ${order.id}`)
  }

  // ---------------------------------------------------------------------------
  // 3. Print job in proof-loop entry state (P2 D3 — first order for the
  //    creator×printer pair, dispatch ACCEPTED → proof required before READY).
  // ---------------------------------------------------------------------------
  const labelService = await prisma.partnerService.findFirst({
    where: { type: 'LABEL_PRINTING', status: 'ACTIVE' },
  })
  if (!labelService) {
    console.log('• No ACTIVE LABEL_PRINTING service — skipping proof-loop order (run main seed).')
  } else {
    const proofSlug = 'demo-order-proof-loop'
    const existingProof = await prisma.order.findFirst({
      where: { brandId: brand.id, internalNotes: proofSlug },
    })
    if (existingProof) {
      console.log(`• Proof-loop order already exists: ${existingProof.id}`)
    } else {
      const subtotalP = 96000
      const orderP = await prisma.order.create({
        data: {
          orderNumber: seedOrderNumber(),
          brandId: brand.id,
          creatorUserId: creator.id,
          internalNotes: proofSlug,
          status: 'IN_FULFILLMENT',
          aggregateApprovalStatus: 'FULLY_ACCEPTED',
          subtotalCents: subtotalP,
          shippingCents: 12000,
          taxCents: 8400,
          totalCents: subtotalP + 12000 + 8400,
          manufacturerServiceId: mfgService.id,
          printProviderServiceId: labelService.id,
          shipToType: 'CREATOR_ADDRESS',
          shipToContactName: 'Sample Creator',
          shipToAddressLine1: '123 Wild Roots Way',
          shipToCity: 'Columbus',
          shipToState: 'OH',
          shipToPostalCode: '43215',
          shipToCountry: 'US',
          paidAt: new Date(Date.now() - 3 * DAY),
          items: {
            create: { productId: product.id, quantity: 300, unitPriceCents: 320, totalCents: subtotalP },
          },
          dispatches: {
            create: [
              {
                type: 'LABEL',
                partnerServiceId: labelService.id,
                status: 'ACCEPTED', // proof upload unlocks; READY gated on approval (D3)
                acceptDeadlineAt: new Date(Date.now() - 2 * DAY),
                acceptedAt: new Date(Date.now() - 2 * DAY),
                costCents: 42000,
                manifestVersion: 1,
                acceptedManifestVersion: 1,
              },
            ],
          },
        } as Parameters<typeof prisma.order.create>[0]['data'],
      })
      console.log(`✓ Created proof-loop print order: ${orderP.id}`)
    }
  }

  console.log('\nDry run ready →')
  console.log('  1. Log in to the partner app (3002) as fc-dryrun@ilaunchify.dev (dev login)')
  console.log('  2. Follow docs/GO_LIVE_ACCEPTANCE.md (supersedes FC_DRY_RUN.md steps)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
