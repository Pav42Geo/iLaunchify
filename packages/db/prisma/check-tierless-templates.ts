// DIAGNOSTIC (task #16, 2026-07-16): is buildSamplePricingRows reachable for a
// REAL, purchasable template?
//
// THE QUESTION. getPricingTierRows falls back to buildSamplePricingRows() when a
// ProductTemplate has zero ProductTemplatePricingTier rows. That function invents
// the whole volume curve (base x 2.5/1.85/1.65/1.5/1.35/1.2/1.05) from hardcoded
// multipliers WE chose. Meanwhile placeOrder now resolves goods from the tiers, and
// gets null for such a template, so it falls back to the catalog buildup (~54c/unit).
//
// So for a tier-less template: PDP quotes priceFloor x 1.35 x qty, the till bills
// 54c x qty. That is the same 86-90% hole Blocker 2 just closed, reopened one level
// up. I could not settle reachability from the sandbox (the Prisma engine will not
// load there), and NO publish gate requires tiers, so this asks the DB.
//
// RUN:
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/check-tierless-templates.ts
//
// READ-ONLY. Writes nothing. Safe to delete after it answers the question.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Transcribed verbatim from packages/ui/src/components/pricing-tier-data.ts.
// If that changes, this diagnostic is lying: it is a copy on purpose, because the
// point is to measure what the PDP would ACTUALLY show today.
const SYNTHETIC_MULTIPLIERS: Record<string, number> = {
  '50-99': 1.85,
  '100-249': 1.65,
  '250-499': 1.5,
  '500-999': 1.35,
  '1000-2499': 1.2,
  '2500+': 1.05,
}
const BUILDUP_UNIT_CENTS = 8 + 4 + 42 // label anchor + substrate + packaging
const FEE_BPS = 1500 // Maker
const withFee = (c: number) => c + Math.round((c * FEE_BPS) / 10_000)
const usd = (c: number) => `$${(c / 100).toFixed(2)}`

async function main() {
  const templates = await prisma.productTemplate.findMany({
    select: {
      slug: true,
      name: true,
      status: true,
      priceFloorCents: true,
      _count: { select: { pricingTiers: true } },
    },
    orderBy: { slug: 'asc' },
  })

  const byStatus = new Map<string, number>()
  for (const t of templates) byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1)

  console.log(`\nProductTemplate rows: ${templates.length}`)
  for (const [s, n] of [...byStatus].sort()) console.log(`   ${s}: ${n}`)

  const tierless = templates.filter((t) => t._count.pricingTiers === 0)
  const publishedTierless = tierless.filter((t) => t.status === 'PUBLISHED')

  console.log(`\nTier-less templates (any status): ${tierless.length}`)
  console.log(`Tier-less AND PUBLISHED:          ${publishedTierless.length}   <-- THE ANSWER`)

  if (publishedTierless.length === 0) {
    console.log(`
VERDICT: task #16 is THEORETICAL today. No published template quotes an invented
curve. The fix is then cheap insurance, not a fire: hard-gate publish on
pricingTiers.length > 0 so it STAYS theoretical, and delete buildSamplePricingRows
from the real path.
`)
  } else {
    console.log(`
VERDICT: task #16 is LIVE. These templates quote a curve nobody authored, against a
charge that bills the ~54c buildup. Per-template, at 500 units, Maker tier:
`)
    console.log('  quoted      charged     uncollected   slug')
    for (const t of publishedTierless) {
      const base = t.priceFloorCents / 100
      const syntheticUnitCents = Math.round(base * SYNTHETIC_MULTIPLIERS['500-999']! * 100)
      const quoted = withFee(syntheticUnitCents * 500)
      const charged = withFee(BUILDUP_UNIT_CENTS * 500)
      const pct = quoted > 0 ? ((1 - charged / quoted) * 100).toFixed(1) : '0.0'
      console.log(
        `  ${usd(quoted).padStart(10)}  ${usd(charged).padStart(10)}  ${(pct + '%').padStart(11)}   ${t.slug}`,
      )
    }
    console.log(`
Every row above is a product a creator can buy today at ~1/8th of the price we
showed them.
`)
  }

  // The inverse check: templates WITH tiers are the ones Blocker 2 just fixed.
  const tiered = templates.filter((t) => t._count.pricingTiers > 0 && t.status === 'PUBLISHED')
  console.log(`Published templates WITH partner-authored tiers (Blocker 2 covers these): ${tiered.length}`)
}

main()
  .catch((e) => {
    console.error('\nFAILED:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
