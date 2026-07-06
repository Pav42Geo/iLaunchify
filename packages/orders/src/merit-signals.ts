// Manufacturer Merit — signal loaders (docs/MANUFACTURER_MERIT_ENGINE.md, MM-2).
// Reads ONLY data we already capture and assembles the `MeritSignals` the pure
// engine consumes. Prisma-backed (like print-coverage.ts); the scoring stays pure.
//
// V1 signal coverage (honest — nulls become "neutral", never a penalty):
//   craft            — PartnerService.ratingBayesian / ratingCount (denormalized)
//   acceptRate       — 1 − (declined + timed-out) / total dispatches
//   defectRatePer100 — ACTIVE PartnerStrikes per 100 completed orders (clean partner
//                      attribution; order-dispute attribution is an MM-2.1 refinement)
//   ordersCompleted  — completed PRODUCT dispatches (readyAt set)
//   productCount     — ProductTemplates on this manufacturer service
//   fulfilledUnits   — Σ PartnerCapacityLedger.completedUnits
//   monthsActive     — since the partner joined
//   cleanRecencyDays — days since the most recent ACTIVE strike
//   onTimeRate       — null in V1 (no promised-date field on OrderDispatch yet — follow-up)
//   gmvCents         — 0 in V1 (not weighted materially; wire later)

import { prisma } from '@ilaunchify/db'
import type { MeritSignals, MeritCohort } from './merit'

const DAY_MS = 24 * 60 * 60 * 1000
const COMPLETED_STATUSES = ['READY', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'] as const
const DECLINED_STATUSES = ['DECLINED', 'TIMED_OUT'] as const

export async function loadManufacturerMeritSignals(
  serviceId: string,
  now: Date = new Date(),
): Promise<MeritSignals | null> {
  const svc = await prisma.partnerService.findUnique({
    where: { id: serviceId },
    select: {
      ratingBayesian: true,
      ratingCount: true,
      partner: {
        select: {
          createdAt: true,
          strikes: { where: { status: 'ACTIVE' }, select: { createdAt: true } },
        },
      },
    },
  })
  if (!svc) return null

  const [totalDispatches, declined, completed, productCount, capacity] = await Promise.all([
    prisma.orderDispatch.count({ where: { partnerServiceId: serviceId, type: 'PRODUCT' } }),
    prisma.orderDispatch.count({
      where: { partnerServiceId: serviceId, type: 'PRODUCT', status: { in: [...DECLINED_STATUSES] } },
    }),
    prisma.orderDispatch.count({
      where: { partnerServiceId: serviceId, type: 'PRODUCT', readyAt: { not: null } },
    }),
    prisma.productTemplate.count({ where: { manufacturerServiceId: serviceId } }),
    prisma.partnerCapacityLedger.aggregate({
      where: { partnerServiceId: serviceId },
      _sum: { completedUnits: true },
    }),
  ])

  const acceptRate = totalDispatches > 0 ? 1 - declined / totalDispatches : null
  const activeStrikes = svc.partner?.strikes ?? []
  const defectRatePer100 = completed > 0 ? (activeStrikes.length / completed) * 100 : null

  const joined = svc.partner?.createdAt ?? now
  const monthsActive = Math.max(0, Math.floor((now.getTime() - joined.getTime()) / (30 * DAY_MS)))

  const lastStrike = activeStrikes
    .map((s) => s.createdAt.getTime())
    .sort((a, b) => b - a)[0]
  const cleanRecencyDays =
    lastStrike != null ? Math.floor((now.getTime() - lastStrike) / DAY_MS) : null

  return {
    ratingBayesian: svc.ratingBayesian != null ? Number(svc.ratingBayesian) : null,
    ratingCount: svc.ratingCount,
    onTimeRate: null, // V1 — no promised-date signal yet
    acceptRate,
    defectRatePer100,
    ordersCompleted: completed,
    monthsActive,
    productCount,
    fulfilledUnits: capacity._sum.completedUnits ?? 0,
    gmvCents: 0,
    cleanRecencyDays,
    inGrace: false, // set by the sweep against MeritPolicy.graceDays
  }
}

/**
 * Derive a GLOBAL peer cohort from the batch (means + median volume). V1 uses a
 * single cohort; per-category cohorts are an MM-2.1 refinement (the engine already
 * takes whatever cohort we pass). Neutral fallbacks keep an empty platform safe.
 */
export function deriveCohortFromSignals(all: readonly MeritSignals[]): MeritCohort {
  const nums = (pick: (s: MeritSignals) => number | null) =>
    all.map(pick).filter((x): x is number => x != null)
  const mean = (xs: number[], fallback: number) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback
  const median = (xs: number[], fallback: number) => {
    if (!xs.length) return fallback
    const s = [...xs].sort((a, b) => a - b)
    const mid = Math.floor(s.length / 2)
    return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
  }
  return {
    ratingBayesianMean: mean(nums((s) => s.ratingBayesian), 3.75),
    onTimeRateMean: mean(nums((s) => s.onTimeRate), 0.9),
    acceptRateMean: mean(nums((s) => s.acceptRate), 0.95),
    defectRatePer100Mean: mean(nums((s) => s.defectRatePer100), 3),
    ordersMedian: median(all.map((s) => s.ordersCompleted), 20),
  }
}
