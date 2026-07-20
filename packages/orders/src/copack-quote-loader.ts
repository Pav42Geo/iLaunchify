// CP-3.1 — the I/O half of the co-pack quote (docs/COPACK_CP3_SHADOW_AND_CP6_PLAN §1.1).
// Loads a co-packing service's authored offering (CP-1 tables) and quotes a job
// through the pure engine. All the arithmetic lives in copack-quote.ts; this only
// does prisma.find + copackQuoteFromRows, so the maths is tested without a DB.
//
// SHADOW: nothing charges from this yet. CP-3.2 feeds the returned cents into
// composeProductionLines behind an OFF-by-default flag; CP-6 nets it at payout.

import { prisma } from '@ilaunchify/db'
import { copackQuoteFromRows, type CopackJob } from './copack-quote'

/**
 * The co-pack cost (cents) for a job on one co-packing service, or null when the
 * service has authored no lines (⇒ no co-pack line; treat as $0). `ok:false`
 * means lines exist but none can run this job, so the cost is 0.
 */
export async function loadCopackQuoteCents(args: {
  coPackerServiceId: string
  job: CopackJob
}): Promise<{ cents: number; ok: boolean } | null> {
  const [lines, operations, config] = await Promise.all([
    prisma.partnerCopackLine.findMany({
      where: { partnerServiceId: args.coPackerServiceId, status: 'ACTIVE' },
      select: {
        id: true,
        runSpeedUnitsPerHour: true,
        changeoverMinutes: true,
        lineRateCentsPerHour: true,
        minRunUnits: true,
        maxRunUnits: true,
        allergenClass: true,
        containerFormats: true,
        fillTypes: true,
        status: true,
      },
    }),
    prisma.partnerCopackOperation.findMany({
      where: { partnerServiceId: args.coPackerServiceId, status: 'ACTIVE' },
      select: { opType: true, pricingUnit: true, priceCents: true, status: true },
    }),
    prisma.partnerCopackConfig.findUnique({
      where: { partnerServiceId: args.coPackerServiceId },
      select: {
        changeoverFeeCents: true,
        minRunChargeCents: true,
        repeatRunDiscountBps: true,
        rushUpliftBps: true,
        minOrderValueCents: true,
      },
    }),
  ])

  const priced = copackQuoteFromRows({ lines, operations, config }, args.job)
  if (!priced) return null
  return { cents: priced.ok ? priced.totalCents : 0, ok: priced.ok }
}
