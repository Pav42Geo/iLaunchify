// SR-2.2 — sample print-leg resolver (docs/SMART_ROTATION_ENGINE.md §2.6).
//
// Samples bypass production MOQ by design, so they can't reuse findRouting's
// commodity shop. This resolver binds the printer a BRANDED sample will
// exercise — the whole point of sampling an externally-printed product is
// evaluating the EXACT printer who'd produce the bulk run:
//
//   1. Creator's pinned pick (ProductPrintSelection), unless excluded/dead.
//   2. Rotation among sampleCapable ACTIVE printers with an ACTIVE offering,
//      exclusions applied, under the SAMPLE-context policy (falls back to
//      DEFAULT). Samples are the cheapest new-provider ramp — a failed sample
//      costs a jar, not a run — so admins typically set a HIGHER
//      newProviderSharePct on the SAMPLE row.
//   3. No external printer resolvable → null: the manufacturer improvises the
//      sample label (today's behavior), honestly recorded by the caller.
//
// V1 operational note: the binding + award log ship now (continuity + verdict
// need a subject); a dedicated sample print DISPATCH is a follow-up — ops
// coordinates the physical 1-unit label run manually meanwhile.

import { prisma } from '@ilaunchify/db'
import {
  selectRotatingProvider,
  buildRotationAwardPayload,
  type RotationCandidate,
} from './rotation'
import { loadRotationPolicy, policyInputOf } from './routing'

const NEW_BELOW_RATINGS = 3

export interface SamplePrintLeg {
  partnerServiceId: string
  partnerUserId: string
  /** PrintAwardLog payload when rotation (not the pin) decided. */
  awardPayload: Record<string, unknown> | null
  /** True when the creator's pin resolved the leg. */
  pinned: boolean
}

export async function resolveSamplePrintLeg(args: {
  productId: string
  productTemplateId: string | null
  creatorUserId: string
}): Promise<SamplePrintLeg | null> {
  const now = new Date()

  // Per-(creator, product) exclusions — rejected printers never re-enter.
  const exclusions = await prisma.productPrintExclusion
    .findMany({
      where: { creatorUserId: args.creatorUserId, productId: args.productId },
      select: { partnerServiceId: true },
    })
    .catch(() => [] as Array<{ partnerServiceId: string }>)
  const excluded = new Set(exclusions.map((e) => e.partnerServiceId))

  // 1 — the pinned pick, validated live (ops gate + not excluded).
  if (args.productTemplateId) {
    const pin = await prisma.productPrintSelection.findUnique({
      where: {
        creatorUserId_productTemplateId: {
          creatorUserId: args.creatorUserId,
          productTemplateId: args.productTemplateId,
        },
      },
      select: { partnerServiceId: true },
    })
    if (pin && !excluded.has(pin.partnerServiceId)) {
      const svc = await prisma.partnerService.findFirst({
        where: {
          id: pin.partnerServiceId,
          type: 'LABEL_PRINTING',
          status: 'ACTIVE',
          partner: { status: 'ACTIVE', user: { stripeAccountStatus: 'ACTIVE' } },
          blackoutDates: { none: { startsOn: { lte: now }, endsOn: { gte: now } } },
        },
        select: { id: true, partner: { select: { userId: true } } },
      })
      if (svc) {
        return {
          partnerServiceId: svc.id,
          partnerUserId: svc.partner.userId,
          awardPayload: null,
          pinned: true,
        }
      }
    }
  }

  // 2 — the sample pool: sampleCapable printers, ops-gated, exclusions out.
  const services = await prisma.partnerService.findMany({
    where: {
      type: 'LABEL_PRINTING',
      status: 'ACTIVE',
      sampleCapable: true,
      excludeFromAutoRotation: false,
      partner: { status: 'ACTIVE', user: { stripeAccountStatus: 'ACTIVE' } },
      packagingOfferings: { some: { status: 'ACTIVE' } },
      blackoutDates: { none: { startsOn: { lte: now }, endsOn: { gte: now } } },
      ...(excluded.size > 0 ? { id: { notIn: [...excluded] } } : {}),
    },
    select: {
      id: true,
      ratingBayesian: true,
      ratingCount: true,
      excludeFromAutoRotation: true,
      partner: { select: { userId: true } },
    },
  })
  if (services.length === 0) return null

  const policy = policyInputOf(await loadRotationPolicy('LABEL_PRINTING', 'SAMPLE'))
  const serviceIds = services.map((s) => s.id)
  const [awardAgg, openCounts] = await Promise.all([
    prisma.printAwardLog.groupBy({
      by: ['partnerServiceId'],
      where: { partnerServiceId: { in: serviceIds } },
      _max: { awardedAt: true },
    }),
    prisma.printAwardLog.groupBy({
      by: ['partnerServiceId'],
      where: {
        partnerServiceId: { in: serviceIds },
        awardedAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      _count: { _all: true },
    }),
  ])
  const lastBy = new Map(awardAgg.map((a) => [a.partnerServiceId, a._max.awardedAt]))
  const openBy = new Map(openCounts.map((a) => [a.partnerServiceId, a._count._all]))

  const candidates: RotationCandidate[] = services.map((s) => ({
    serviceId: s.id,
    ratingBayesian: s.ratingBayesian === null ? null : Number(s.ratingBayesian),
    ratingCount: s.ratingCount,
    isNew: s.ratingCount < NEW_BELOW_RATINGS,
    excludeFromAutoRotation: s.excludeFromAutoRotation,
    distanceMiles: null,
    openAwardCount: openBy.get(s.id) ?? 0,
    lastAwardedAt: lastBy.get(s.id) ?? null,
  }))

  const rolls = { roll: Math.random(), poolRoll: Math.random() }
  // No sticky here — the SAMPLE is where rotation is SUPPOSED to happen; the
  // verdict (approve) is what creates stickiness for production, not habit.
  // policy.enabled stays authoritative (admin's absolute control): engine off
  // → deterministic first candidate, still a valid sample printer.
  const decision = selectRotatingProvider(candidates, {
    policy: { ...policy, stickyReorders: false },
    previousProviderServiceId: null,
    ...rolls,
  })
  const winnerId = decision.winnerServiceId ?? services[0]!.id
  const winner = services.find((s) => s.id === winnerId) ?? services[0]!
  return {
    partnerServiceId: winner.id,
    partnerUserId: winner.partner.userId,
    awardPayload: buildRotationAwardPayload(decision, policy, rolls) as Record<string, unknown>,
    pinned: false,
  }
}
