// Demo fixtures — a working multi-partner marketplace.
//
// The marketplace LOGIC (routing + B4 scoring + niche pages) shipped before the
// demo data that exercises it: only one manufacturer existed, neither had
// payouts enabled, no partner held a market cert, and no brand had a region or
// target market. This fixtures pass makes the demo real:
//
//   • TWO distinct ACTIVE manufacturers with payouts enabled, so B4 actually
//     RANKS candidates instead of having one trivial winner:
//       - Acme Foods       — boutique, US-CA, MOQ 500–5,000,  US-certified
//       - Cascade Botanicals — large-scale, US-OR, MOQ 1,000–50,000, US+CA
//     Different capacity bands + regions → routing picks differently depending
//     on order size + destination (proximity vs headroom trade-off).
//   • Sample brands get an operating region + target market(s), so routing can
//     pass real destination/market context into the scorer.
//
// Mutates seed entities by stable name; skips gracefully if a name is absent.
// Idempotent. Registered late in seed.ts (after partners + brands + markets).

import { PrismaClient } from '@prisma/client'

interface MfgFixture {
  companyName: string
  regionCode: string
  serviceStatus: 'ACTIVE'
  capabilities: Record<string, unknown>
  certMarketCodes: string[]
}

const MANUFACTURERS: MfgFixture[] = [
  {
    companyName: 'Acme Foods',
    regionCode: 'US-CA',
    serviceStatus: 'ACTIVE',
    capabilities: {
      type: 'MANUFACTURING',
      categories: ['SUPPLEMENT', 'FOOD', 'BEVERAGE_FUNCTIONAL'],
      certifications: ['FDA', 'GMP', 'USDA_ORGANIC', 'KOSHER'],
      containerFormats: ['BOTTLE', 'TUB', 'POUCH'],
      fillTypes: ['powder', 'capsule', 'liquid'],
      moqMin: 500,
      moqMax: 5000,
      leadTimeStockDays: 28,
      leadTimeCustomDays: 70,
    },
    certMarketCodes: ['US'],
  },
  {
    companyName: 'Cascade Botanicals',
    regionCode: 'US-OR',
    serviceStatus: 'ACTIVE',
    capabilities: {
      type: 'MANUFACTURING',
      categories: ['SUPPLEMENT', 'FOOD'],
      certifications: ['FDA', 'GMP', 'NSF'],
      containerFormats: ['BOTTLE', 'POUCH', 'STICK_PACK'],
      fillTypes: ['powder', 'capsule'],
      moqMin: 1000,
      moqMax: 50000,
      leadTimeStockDays: 21,
      leadTimeCustomDays: 60,
    },
    certMarketCodes: ['US', 'CA'],
  },
]

interface BrandFixture {
  name: string
  regionCode: string
  targetMarketCodes: { code: string; isPrimary: boolean }[]
}

const BRANDS: BrandFixture[] = [
  { name: 'Sample Brand', regionCode: 'US-CA', targetMarketCodes: [{ code: 'US', isPrimary: true }] },
  {
    name: 'Bestie',
    regionCode: 'US-NY',
    targetMarketCodes: [
      { code: 'US', isPrimary: true },
      { code: 'CA', isPrimary: false },
    ],
  },
]

export async function seedMarketplaceFixtures(prisma: PrismaClient): Promise<void> {
  const markets = new Map(
    (await prisma.market.findMany({ select: { id: true, code: true } })).map((m) => [m.code, m.id]),
  )
  const regions = new Map(
    (await prisma.region.findMany({ select: { id: true, code: true } })).map((r) => [r.code, r.id]),
  )
  const now = new Date()
  let mfgCount = 0
  let brandCount = 0

  // ---- Manufacturers ----
  for (const m of MANUFACTURERS) {
    const partner = await prisma.partner.findFirst({
      where: { companyName: m.companyName },
      select: { id: true, userId: true, services: { where: { type: 'MANUFACTURING' }, select: { id: true } } },
    })
    if (!partner) continue

    const regionId = regions.get(m.regionCode)
    await prisma.partner.update({
      where: { id: partner.id },
      // status ACTIVE so the routing gate (partner: { status: 'ACTIVE' }) admits
      // it — without this a manufacturer with an ACTIVE *service* still never
      // routes.
      data: { status: 'ACTIVE', ...(regionId ? { primaryRegionId: regionId } : {}) },
    })
    // Payouts enabled so the routing gate (stripeAccountStatus === 'ACTIVE') passes.
    await prisma.user.update({
      where: { id: partner.userId },
      data: { stripeAccountStatus: 'ACTIVE' },
    })
    const svc = partner.services[0]
    if (svc) {
      await prisma.partnerService.update({
        where: { id: svc.id },
        data: { status: m.serviceStatus, capabilities: m.capabilities as object },
      })
    }
    for (const code of m.certMarketCodes) {
      const marketId = markets.get(code)
      if (!marketId) continue
      await prisma.partnerMarketCert.upsert({
        where: { partnerId_marketId: { partnerId: partner.id, marketId } },
        create: { partnerId: partner.id, marketId, certifiedAt: now, status: 'ACTIVE' },
        update: { status: 'ACTIVE' },
      })
    }
    mfgCount++
  }

  // ---- Brands ----
  for (const b of BRANDS) {
    const brand = await prisma.brand.findFirst({ where: { name: b.name }, select: { id: true } })
    if (!brand) continue
    const regionId = regions.get(b.regionCode)
    if (regionId) {
      await prisma.brand.update({ where: { id: brand.id }, data: { operatingRegionId: regionId } })
    }
    for (const tm of b.targetMarketCodes) {
      const marketId = markets.get(tm.code)
      if (!marketId) continue
      await prisma.brandTargetMarket.upsert({
        where: { brandId_marketId: { brandId: brand.id, marketId } },
        create: { brandId: brand.id, marketId, isPrimary: tm.isPrimary },
        update: { isPrimary: tm.isPrimary },
      })
    }
    brandCount++
  }

  // eslint-disable-next-line no-console
  console.log(`  ✓ Marketplace fixtures: ${mfgCount} manufacturer(s) + ${brandCount} brand(s) wired`)
}

// Standalone run: `tsx prisma/seed-marketplace-fixtures.ts`
if (process.argv[1]?.endsWith('seed-marketplace-fixtures.ts')) {
  const prisma = new PrismaClient()
  seedMarketplaceFixtures(prisma)
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
