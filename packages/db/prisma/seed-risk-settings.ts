// Risk Center M0 seed — 14 RiskSetting detector rows, all MONITOR (shadow mode).
//
// Source of truth: docs/RISK_CENTER_IMPLEMENTATION_PLAN.md §4 detector catalog.
// Thresholds mirror the defaults in packages/risk/src/detectors.ts; admin tunes
// them at /admin/risk → Detectors (M2). Promotion up the ladder (WARN/GATE/ACT)
// is an admin decision after measured false-positive rate — never a deploy.
//
// IDEMPOTENT — upserts by detectorKey and PRESERVES any admin-set mode and
// thresholds (only creates missing rows / fills missing threshold keys).
//
// Run: pnpm --filter @ilaunchify/db seed:risk

import { PrismaClient, RiskMode } from '@prisma/client'

const prisma = new PrismaClient()

const DETECTORS: { detectorKey: string; mode: RiskMode; thresholds: Record<string, number>; notes: string }[] = [
  { detectorKey: 'CAPACITY_OVERCOMMIT', mode: 'MONITOR', thresholds: { warnPct: 60, gatePct: 85, blockPct: 100 }, notes: 'M1 flagship. Promote MONITOR→WARN→GATE after 2–4 weeks of distribution data. Gate offers split + extended-ETA only (2026-07-05).' },
  { detectorKey: 'ODR_EQUIV_CEILING', mode: 'MONITOR', thresholds: { ceilingPct: 1, windowDays: 90 }, notes: 'Amazon ODR benchmark <1%. Defect = dispute + QC fail + damaged discrepancy.' },
  { detectorKey: 'LATE_SHIP_RATE', mode: 'MONITOR', thresholds: { ceilingPct: 4, windowDays: 30 }, notes: 'Amazon LSR benchmark <4%, vs currentEtaAt.' },
  { detectorKey: 'OTIF_FLOOR', mode: 'MONITOR', thresholds: { warnFloorPct: 95, highFloorPct: 90, windowDays: 90 }, notes: 'Industry OTIF standard ≥95%.' },
  { detectorKey: 'ACCEPT_TIMEOUT_AT_RISK', mode: 'WARN', thresholds: { windowConsumedPct: 50 }, notes: 'Already live in partner-ops cron — starts at WARN (grandfathered behavior), thresholds now tunable here.' },
  { detectorKey: 'CAPACITY_HONESTY_GAP', mode: 'MONITOR', thresholds: { gapFloorPct: 60, minConsecutiveMonths: 2 }, notes: 'System PROPOSES corrected declared capacity; admin one-click applies; partner notified + contest (2026-07-05). Never auto-applies.' },
  { detectorKey: 'RADAR_ELEVATED', mode: 'WARN', thresholds: { reviewScore: 65, blockScore: 85, firstOrderUnitsFloor: 1000 }, notes: 'Stripe Radar ingestion (M4). elevated + first order/large qty → review before ROUTING; highest → block.' },
  { detectorKey: 'ORDER_VELOCITY', mode: 'MONITOR', thresholds: { maxOrdersPer24h: 3, newAccountDays: 14, firstOrderCentsFloor: 500000 }, notes: 'Marketplace velocity rules Radar cannot see (M4).' },
  { detectorKey: 'CHARGEBACK_RATE', mode: 'MONITOR', thresholds: { ceilingPct: 0.75, windowDays: 90 }, notes: 'Margin below the ~0.9% card-network programs.' },
  { detectorKey: 'CLAWBACK_EXPOSURE', mode: 'MONITOR', thresholds: { exposureToPayoutRatio: 1 }, notes: 'GATE only after Stripe test-mode verification + RBAC refund fence (payments-readiness).' },
  { detectorKey: 'CERT_EXPIRY_VOLUME', mode: 'WARN', thresholds: { horizon1Days: 60, horizon2Days: 30, horizon3Days: 7 }, notes: 'Existing DOC_EXPIRY sweep + weighting by open dispatch units behind the cert. Compliance = hard-gate family.' },
  { detectorKey: 'ROUTE_FRAGILITY', mode: 'MONITOR', thresholds: { minPoolSize: 2, rerouteBudgetRemaining: 1 }, notes: 'Commodity legs only (manufacturing is owner-pinned). Pool=1 → partner-recruitment signal.' },
  { detectorKey: 'STORAGE_DWELL', mode: 'WARN', thresholds: { warnDwellPct: 60, highDwellPct: 80 }, notes: 'Existing release-SLA sweep territory; dated lots get stricter handling in the detector.' },
  { detectorKey: 'CONCENTRATION', mode: 'MONITOR', thresholds: { maxPartnerSharePct: 35 }, notes: 'Dashboard-only in V1 — informs partner recruitment; the V2 pooling moat reduces this risk class.' },
]

async function main() {
  let created = 0
  let updated = 0
  for (const d of DETECTORS) {
    const existing = await prisma.riskSetting.findUnique({ where: { detectorKey: d.detectorKey } })
    if (!existing) {
      await prisma.riskSetting.create({
        data: { detectorKey: d.detectorKey, mode: d.mode, thresholdsJson: d.thresholds, notes: d.notes },
      })
      created++
    } else {
      // Preserve admin-set mode + thresholds; only fill threshold keys that are missing.
      const current = (existing.thresholdsJson ?? {}) as Record<string, number>
      const merged = { ...d.thresholds, ...current }
      const needsUpdate = JSON.stringify(merged) !== JSON.stringify(current)
      if (needsUpdate) {
        await prisma.riskSetting.update({
          where: { detectorKey: d.detectorKey },
          data: { thresholdsJson: merged },
        })
        updated++
      }
    }
  }
  console.log(`RiskSetting seed: ${created} created, ${updated} threshold-backfilled, ${DETECTORS.length} total detectors.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
