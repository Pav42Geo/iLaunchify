// PS-9-0: PartnerOfferingPriceCurve backfill (PRINT_PROVIDER_SELECTION §11.2/§11.7).
//
// WHY: MOQ is a property of the PRINT PROCESS, not the printer. A converter with
// digital + flexo serves a 100-unit job AND a 50,000-unit job from one shop, so the
// offering's scalar moq/maxRunQty/pricingTiers cannot express its real capability.
// Per-process run+price segments now live on PartnerOfferingPriceCurve (CIP4 PrintTalk
// 2.2 §4.1 shaped). This backfill seeds ONE curve per existing ACTIVE offering from its
// current scalars so nothing regresses on day one; partners then add their real
// per-process curves (a second row for flexo, etc.) in the offering editor.
//
// Mapping:
//   moq            -> baseQty                (the segment's minimum orderable qty)
//   pricingTiers[] -> one segment per tier   (piecewise curve, faithful to today's pricing)
//     baseQty             = max(tier.minQty, offering.moq)
//     basePriceCents      = baseQty * tier.pricePerUnitCents   (price AT baseQty)
//     incrementQty        = 1
//     incrementPriceCents = tier.pricePerUnitCents             (the marginal rate)
//     maxQty              = nextTier.minQty - 1, else offering.maxRunQty
//   printProcess   -> printProcess, defaulting to DIGITAL when undeclared (the
//                     permissive/low-MOQ assumption; it is also what an undeclared
//                     short-run shop almost always is). Logged so it can be reviewed.
//   no pricingTiers -> ONE segment with quoteRequired=true and zero prices: we honestly
//                     do not know their price curve, so the printer stays ELIGIBLE but
//                     the price is indicative and must be quoted (never auto-bound).
//
// DRY-RUN by default (prints what it would do). Writes only with --apply.
// Run AFTER `pnpm db:push` + `pnpm db:generate`, from repo root:
//   pnpm --filter @ilaunchify/db backfill:price-curves            # dry run
//   pnpm --filter @ilaunchify/db backfill:price-curves -- --apply # write
//
// Idempotent: an offering that already has ANY curve row is skipped entirely.

import { prisma } from '../src/index'

const APPLY = process.argv.includes('--apply')

interface PricingTier {
  minQty: number
  pricePerUnitCents: number
}

interface PlannedSegment {
  offeringId: string
  printProcess: string
  baseQty: number
  basePriceCents: number
  incrementQty: number
  incrementPriceCents: number
  maxQty: number | null
  quoteRequired: boolean
}

/** Cast-guarded until PartnerOfferingPriceCurve lands on the generated client. */
const curveModel = () =>
  (
    prisma as unknown as {
      partnerOfferingPriceCurve: {
        findMany: (a: unknown) => Promise<Array<{ offeringId: string }>>
        createMany: (a: unknown) => Promise<{ count: number }>
      }
    }
  ).partnerOfferingPriceCurve

function parseTiers(raw: unknown): PricingTier[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (t): t is PricingTier =>
        !!t &&
        typeof t === 'object' &&
        Number.isFinite((t as PricingTier).minQty) &&
        Number.isFinite((t as PricingTier).pricePerUnitCents),
    )
    .map((t) => ({ minQty: Math.max(0, Math.floor(t.minQty)), pricePerUnitCents: Math.max(0, Math.floor(t.pricePerUnitCents)) }))
    .sort((a, b) => a.minQty - b.minQty)
}

function planForOffering(o: {
  id: string
  moq: number
  maxRunQty: number | null
  printProcess: string | null
  pricingTiers: unknown
}): PlannedSegment[] {
  const process = o.printProcess ?? 'DIGITAL'
  const moq = Math.max(1, o.moq || 1)
  const tiers = parseTiers(o.pricingTiers)

  if (tiers.length === 0) {
    return [
      {
        offeringId: o.id,
        printProcess: process,
        baseQty: moq,
        basePriceCents: 0,
        incrementQty: 1,
        incrementPriceCents: 0,
        maxQty: o.maxRunQty ?? null,
        quoteRequired: true, // no known price curve -> eligible, but quote it
      },
    ]
  }

  const segments: PlannedSegment[] = []
  const seenBaseQty = new Set<number>()
  tiers.forEach((tier, i) => {
    const baseQty = Math.max(tier.minQty, moq)
    // Two tiers can collapse onto the same baseQty once moq raises the floor; the
    // unique key is (offeringId, printProcess, baseQty), so keep the first (cheapest
    // floor) and drop the duplicate rather than fail the insert.
    if (seenBaseQty.has(baseQty)) return
    const next = tiers[i + 1]
    const maxQty = next ? Math.max(baseQty, next.minQty - 1) : (o.maxRunQty ?? null)
    // Degenerate band (a tier entirely below moq, or a ceiling under the floor).
    if (maxQty !== null && maxQty < baseQty) return
    seenBaseQty.add(baseQty)
    segments.push({
      offeringId: o.id,
      printProcess: process,
      baseQty,
      basePriceCents: baseQty * tier.pricePerUnitCents,
      incrementQty: 1,
      incrementPriceCents: tier.pricePerUnitCents,
      maxQty,
      quoteRequired: false,
    })
  })
  return segments
}

async function main(): Promise<void> {
  const offerings = await prisma.partnerPackagingOffering.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      moq: true,
      maxRunQty: true,
      printProcess: true,
      pricingTiers: true,
      partnerService: { select: { partner: { select: { companyName: true } } } },
    },
  })

  // Idempotency: skip any offering that already has curves.
  const existing = await curveModel()
    .findMany({ select: { offeringId: true } })
    .catch(() => [] as Array<{ offeringId: string }>)
  const hasCurves = new Set(existing.map((c) => c.offeringId))

  const planned: PlannedSegment[] = []
  let skipped = 0
  let undeclaredProcess = 0

  for (const o of offerings) {
    if (hasCurves.has(o.id)) {
      skipped += 1
      continue
    }
    if (o.printProcess == null) undeclaredProcess += 1
    planned.push(
      ...planForOffering({
        id: o.id,
        moq: o.moq,
        maxRunQty: o.maxRunQty,
        printProcess: o.printProcess as string | null,
        pricingTiers: o.pricingTiers,
      }),
    )
  }

  const quoteOnly = planned.filter((s) => s.quoteRequired).length
  console.log(`ACTIVE offerings:            ${offerings.length}`)
  console.log(`  already have curves:       ${skipped} (skipped, idempotent)`)
  console.log(`  undeclared printProcess:   ${undeclaredProcess} (assumed DIGITAL: review)`)
  console.log(`planned curve segments:      ${planned.length}`)
  console.log(`  quoteRequired (no tiers):  ${quoteOnly}`)

  if (planned.length > 0) {
    console.log('\nsample (first 5):')
    for (const s of planned.slice(0, 5)) {
      const band = s.maxQty == null ? `${s.baseQty}+` : `${s.baseQty}-${s.maxQty}`
      console.log(
        `  ${s.printProcess.padEnd(11)} qty ${band.padEnd(14)} base ${(s.basePriceCents / 100).toFixed(2)} ` +
          `+ ${(s.incrementPriceCents / 100).toFixed(4)}/unit${s.quoteRequired ? '  [quote required]' : ''}`,
      )
    }
  }

  if (!APPLY) {
    console.log('\nDRY RUN: nothing written. Re-run with --apply to write.')
    return
  }
  if (planned.length === 0) {
    console.log('\nNothing to write.')
    return
  }

  const res = await curveModel().createMany({ data: planned, skipDuplicates: true })
  console.log(`\nWrote ${res.count} curve segment(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => void prisma.$disconnect())
