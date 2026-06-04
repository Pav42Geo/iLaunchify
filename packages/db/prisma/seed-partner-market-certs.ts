// Seed — market certifications for manufacturing partners.
//
// B4 partner-matching scoring reads PartnerMarketCert to score the cert
// dimension (does a candidate hold an active certification for the order's
// target market?). The table shipped empty, so that dimension had no data.
// This certifies each manufacturing partner for their HOME-COUNTRY market
// (V1: US) — additive + correct (not fabricating partners, just recording the
// market each real seed partner is set up to serve).
//
// Idempotent (upsert by composite id). Broader cross-border coverage (e.g. US
// partners also certified for CA) is a demo-data decision left for a deliberate
// marketplace-fixtures pass.

import { PrismaClient } from '@prisma/client'

export async function seedPartnerMarketCerts(prisma: PrismaClient): Promise<void> {
  const markets = await prisma.market.findMany({ select: { id: true, code: true } })
  const marketByCode = new Map(markets.map((m) => [m.code, m.id]))

  const mfgServices = await prisma.partnerService.findMany({
    where: { type: 'MANUFACTURING' },
    select: { partner: { select: { id: true, country: true } } },
    distinct: ['partnerId'],
  })

  const now = new Date()
  let n = 0
  for (const { partner } of mfgServices) {
    const marketId = marketByCode.get(partner.country)
    if (!marketId) continue
    await prisma.partnerMarketCert.upsert({
      where: { partnerId_marketId: { partnerId: partner.id, marketId } },
      create: { partnerId: partner.id, marketId, certifiedAt: now, status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    })
    n++
  }
  // eslint-disable-next-line no-console
  console.log(`  ✓ Seeded ${n} partner-market certification(s)`)
}

// Standalone run: `tsx prisma/seed-partner-market-certs.ts`
if (process.argv[1]?.endsWith('seed-partner-market-certs.ts')) {
  const prisma = new PrismaClient()
  seedPartnerMarketCerts(prisma)
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
