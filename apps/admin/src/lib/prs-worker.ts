// Risk Center M3 — nightly Partner Reliability Score + capacity truth
// (docs/RISK_MANAGEMENT_CENTER.md §3, RISK_CENTER_IMPLEMENTATION_PLAN.md M3).
//
// Called from runPartnerOpsSweep (same nightly cron). One pass per
// PartnerService with dispatch activity in the last 180 days:
//   1. demonstratedUnits (P75 of delivered units per rolling-30d window,
//      windows after first delivery only) → PartnerCapacityLedger
//   2. PRS components from real dispatch history → computePrs (renormalizing
//      weights — thin history is never punished) → PartnerRiskFeature snapshot
//   3. Nightly detectors (OTIF_FLOOR, LATE_SHIP_RATE, ODR_EQUIV_CEILING,
//      CAPACITY_HONESTY_GAP) evaluated against RiskSetting thresholds; fired
//      events land in the Risk Inbox, deduped one-per-detector-per-service-per-day.
//
// V1 proxies (documented, refine when richer data lands):
//   - "in full" = no ReceivingDiscrepancy row on the dispatch
//   - qualityPct = 100 − ODR-equivalent (defect = QC fail / reprint / dispute /
//     damaged discrepancy); ProductionLot yield joins in V1.1
//   - leadTimeConsistencyPct = 100 − 10 pts per P90 late day
//
// Best-effort by contract: a failure here never breaks the other sweeps.

import { prisma } from '@ilaunchify/db'
import {
  computePrs,
  prsBand,
  otifPct,
  lateShipmentRatePct,
  odrEquivPct,
  leadTimeVarianceP90Days,
  demonstratedCapacityP75,
  capacityHonestyGap,
  evaluateCeiling,
  evaluateFloor,
  type DeliveryRecord,
  type DetectorKey,
  type RiskDecision,
  type RiskMode,
  type RiskSettings,
} from '@ilaunchify/risk'
import { monthKey, dispatchUnits } from '@ilaunchify/orders'

const MS_PER_DAY = 86_400_000
const HORIZON_DAYS = 180
const WINDOW_DAYS = 30
const PRS_WINDOW_DAYS = 90

export interface PrsSweepResult {
  capacityFeatureSnapshots: number
  nightlyDetectorEvents: number
}

async function loadRiskSettings(): Promise<RiskSettings> {
  try {
    const rows = await prisma.riskSetting.findMany()
    const out: RiskSettings = {}
    for (const r of rows) {
      out[r.detectorKey as DetectorKey] = {
        mode: r.mode as RiskMode,
        thresholds: (r.thresholdsJson ?? {}) as Record<string, number>,
      }
    }
    return out
  } catch {
    return {}
  }
}

/** One Risk Inbox row per detector/service/day — the sweep is idempotent. */
async function persistNightlyDecision(
  decision: RiskDecision,
  partnerServiceId: string,
  now: Date,
): Promise<boolean> {
  if (!decision.fired) return false
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const existing = await prisma.riskEvent.findFirst({
    where: {
      detectorKey: decision.detectorKey,
      entityType: 'PartnerService',
      entityId: partnerServiceId,
      createdAt: { gte: dayStart },
    },
    select: { id: true },
  })
  if (existing) return false
  await prisma.riskEvent.create({
    data: {
      detectorKey: decision.detectorKey,
      severity: decision.severity,
      entityType: 'PartnerService',
      entityId: partnerServiceId,
      decision: decision.action === 'NONE' ? 'MONITOR_LOGGED' : decision.action,
      scoreSnapshotJson: {
        ...decision.snapshot,
        reasons: decision.reasons,
        uncappedAction: decision.uncappedAction,
      } as unknown as object,
    },
  })
  return true
}

export async function runPrsSweep(now: Date = new Date()): Promise<PrsSweepResult> {
  const result: PrsSweepResult = { capacityFeatureSnapshots: 0, nightlyDetectorEvents: 0 }

  const horizonStart = new Date(now.getTime() - HORIZON_DAYS * MS_PER_DAY)
  const prsStart = new Date(now.getTime() - PRS_WINDOW_DAYS * MS_PER_DAY)
  const settings = await loadRiskSettings()

  // Every dispatch with activity in the horizon — one query, grouped in memory.
  const dispatches = await prisma.orderDispatch.findMany({
    where: { createdAt: { gte: horizonStart } },
    select: {
      id: true,
      orderId: true,
      partnerServiceId: true,
      status: true,
      createdAt: true,
      acceptDeadlineAt: true,
      proposedDeadlineAt: true,
      currentEtaAt: true,
      shippedAt: true,
      deliveredAt: true,
      qualityCheckFailedAt: true,
      reprintOfDispatchId: true,
      orderItem: { select: { quantity: true, packUnitsPerPack: true } },
      receivingDiscrepancies: { select: { id: true, damaged: true } },
    },
  })
  if (dispatches.length === 0) return result

  // Disputed orders (attributed to every partner on the order — V1 coarse).
  const disputedOrderIds = new Set(
    (
      await prisma.orderDispute.findMany({
        where: { createdAt: { gte: prsStart } },
        select: { orderId: true },
      })
    ).map((d) => d.orderId),
  )

  const byService = new Map<string, typeof dispatches>()
  for (const d of dispatches) {
    const list = byService.get(d.partnerServiceId) ?? []
    list.push(d)
    byService.set(d.partnerServiceId, list)
  }

  const currentMonth = monthKey(now)

  for (const [partnerServiceId, rows] of byService) {
    try {
      // ── capacity: demonstrated P75 over rolling windows ──────────────────
      const deliveredRows = rows.filter((r) => r.deliveredAt !== null)
      const firstDelivery = deliveredRows.reduce(
        (min, r) => (r.deliveredAt! < min ? r.deliveredAt! : min),
        now,
      )
      const windowSums: number[] = []
      for (let w = Math.floor(HORIZON_DAYS / WINDOW_DAYS); w >= 1; w--) {
        const start = new Date(now.getTime() - w * WINDOW_DAYS * MS_PER_DAY)
        const end = new Date(start.getTime() + WINDOW_DAYS * MS_PER_DAY)
        if (end.getTime() <= firstDelivery.getTime()) continue
        windowSums.push(
          deliveredRows.reduce(
            (sum, r) => (r.deliveredAt! >= start && r.deliveredAt! < end ? sum + dispatchUnits(r.orderItem) : sum),
            0,
          ),
        )
      }
      const demonstrated = demonstratedCapacityP75(windowSums)

      const svc = await prisma.partnerService.findUnique({
        where: { id: partnerServiceId },
        select: { partnerId: true },
      })
      if (!svc) continue
      const cap = await prisma.partnerOperationalCapability.findUnique({
        where: { partnerId: svc.partnerId },
        select: { monthlyCapacityUnits: true },
      })
      const declaredUnits = cap?.monthlyCapacityUnits ?? 0

      const ledgerRow = await prisma.partnerCapacityLedger.upsert({
        where: { partnerServiceId_month: { partnerServiceId, month: currentMonth } },
        create: { partnerServiceId, month: currentMonth, declaredUnits, demonstratedUnits: demonstrated },
        update: { demonstratedUnits: demonstrated },
      })

      // ── PRS components (90-day window) ────────────────────────────────────
      const prsRows = rows.filter((r) => r.createdAt >= prsStart)
      const records: DeliveryRecord[] = prsRows
        .filter((r) => r.shippedAt || r.deliveredAt)
        .map((r) => {
          const units = dispatchUnits(r.orderItem)
          const inFull = r.receivingDiscrepancies.length === 0
          return {
            promisedAt: r.currentEtaAt ?? r.proposedDeadlineAt ?? r.acceptDeadlineAt,
            shippedAt: r.shippedAt,
            deliveredAt: r.deliveredAt,
            unitsOrdered: units,
            unitsDelivered: inFull ? units : Math.max(0, units - 1), // V1 in-full proxy
            defect:
              r.qualityCheckFailedAt !== null ||
              r.reprintOfDispatchId !== null ||
              r.receivingDiscrepancies.some((x) => x.damaged) ||
              disputedOrderIds.has(r.orderId),
          }
        })

      const accepted = prsRows.filter((r) => !['PENDING_ACCEPT', 'DECLINED', 'TIMED_OUT'].includes(r.status)).length
      const rejected = prsRows.filter((r) => ['DECLINED', 'TIMED_OUT'].includes(r.status)).length
      const acceptRatePct = accepted + rejected > 0 ? (accepted / (accepted + rejected)) * 100 : null

      const otif = otifPct(records)
      const lsr = lateShipmentRatePct(records)
      const odr = odrEquivPct(records)
      const p90LateDays = leadTimeVarianceP90Days(records)

      const deliveredCount = records.filter((r) => r.deliveredAt !== null).length
      const discrepancyCount = prsRows.reduce((n, r) => n + r.receivingDiscrepancies.length, 0)
      const discrepancyCleanPct =
        deliveredCount > 0 ? Math.max(0, 100 - (discrepancyCount / deliveredCount) * 100) : null

      const capacityGapPct =
        demonstrated !== null && declaredUnits > 0
          ? Math.round((1 - demonstrated / declaredUnits) * 1000) / 10
          : null
      const capacityHonestyPct = capacityGapPct !== null ? Math.max(0, 100 - Math.max(0, capacityGapPct)) : null

      const [activeStrikes, clawbacks] = await Promise.all([
        prisma.partnerStrike.count({ where: { partnerId: svc.partnerId, status: 'ACTIVE' } }),
        prisma.partnerClawback.aggregate({
          where: { partnerId: svc.partnerId, remainingCents: { gt: 0 } },
          _sum: { remainingCents: true },
        }),
      ])
      const clawbackExposureCents = clawbacks._sum.remainingCents ?? 0
      const penaltyPoints = Math.min(5, activeStrikes * 2 + (clawbackExposureCents > 0 ? 1 : 0))

      const components = {
        otifPct: otif,
        acceptRatePct,
        qualityPct: odr !== null ? Math.max(0, 100 - odr) : null,
        discrepancyCleanPct,
        capacityHonestyPct,
        leadTimeConsistencyPct: p90LateDays !== null ? Math.max(0, 100 - p90LateDays * 10) : null,
        penaltyPoints,
      }
      const prs = computePrs(components)

      await prisma.partnerRiskFeature.create({
        data: {
          partnerServiceId,
          featuresJson: {
            formulaVersion: 'prs-v1',
            month: currentMonth,
            // capacity block
            declaredUnits,
            demonstratedUnits: demonstrated,
            committedUnits: ledgerRow.committedUnits,
            completedUnits: ledgerRow.completedUnits,
            capacityGapPct,
            windowSums,
            // raw metrics
            otif90d: otif,
            lateShipRate30d: lsr, // computed over the 90d record set in V1
            odrEquiv90d: odr,
            leadTimeP90LateDays: p90LateDays,
            acceptRate90d: acceptRatePct,
            discrepancyCount,
            deliveredCount,
            activeStrikes,
            clawbackExposureCents,
            // score
            prs: prs.score,
            prsBand: prs.score !== null ? prsBand(prs.score) : null,
            prsComponents: components,
            prsUsedWeights: prs.usedWeights,
          } as unknown as object,
        },
      })
      result.capacityFeatureSnapshots++

      // ── nightly detectors → Risk Inbox ────────────────────────────────────
      const decisions: RiskDecision[] = [
        evaluateFloor('OTIF_FLOOR', otif, 'warnFloorPct', 'highFloorPct', 'metrics-v1', settings),
        evaluateCeiling('LATE_SHIP_RATE', lsr, 'ceilingPct', 'HIGH', 'metrics-v1', settings),
        evaluateCeiling('ODR_EQUIV_CEILING', odr, 'ceilingPct', 'HIGH', 'metrics-v1', settings),
      ]

      // CAPACITY_HONESTY_GAP over the trailing ledger months (propose-only —
      // the corrected number goes to admin approval, never auto-applies).
      const honestyMonths = await prisma.partnerCapacityLedger.findMany({
        where: { partnerServiceId },
        orderBy: { month: 'asc' },
        take: 6,
        select: { declaredUnits: true, demonstratedUnits: true },
      })
      const honestyCfg = settings.CAPACITY_HONESTY_GAP?.thresholds ?? {}
      const honesty = capacityHonestyGap(honestyMonths, {
        gapFloorPct: honestyCfg.gapFloorPct ?? 60,
        minConsecutiveMonths: honestyCfg.minConsecutiveMonths ?? 2,
      })
      if (honesty.fired) {
        decisions.push({
          detectorKey: 'CAPACITY_HONESTY_GAP',
          fired: true,
          severity: 'HIGH',
          action: 'MONITOR_LOGGED',
          uncappedAction: 'WARNED',
          reasons: [
            `demonstrated capacity below ${honestyCfg.gapFloorPct ?? 60}% of declared for ${honesty.consecutiveMonths} consecutive months`,
            `proposed corrected declared capacity: ${honesty.proposedDeclaredUnits?.toLocaleString() ?? '—'} units/mo (admin approval required — never auto-applied)`,
          ],
          snapshot: {
            formulaVersion: 'capacity-v1',
            inputs: { months: honestyMonths, declaredUnits, demonstratedUnits: demonstrated },
            thresholds: { gapFloorPct: honestyCfg.gapFloorPct ?? 60, minConsecutiveMonths: honestyCfg.minConsecutiveMonths ?? 2 },
            score: capacityGapPct ?? 0,
          },
        })
      }

      for (const d of decisions) {
        if (await persistNightlyDecision(d, partnerServiceId, now)) result.nightlyDetectorEvents++
      }
    } catch {
      // per-service isolation — one bad service never blocks the rest
    }
  }

  return result
}
