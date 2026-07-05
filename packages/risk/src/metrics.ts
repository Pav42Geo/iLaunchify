// R2/R4/R9 delivery + quality metrics. Pure math over DeliveryRecord[].
// Benchmark anchors (implementation plan §4): Amazon ODR <1%, LSR <4%, OTIF ≥95%.

import type { DeliveryRecord } from './types'

export const METRICS_FORMULA_VERSION = 'metrics-v1'

const MS_PER_DAY = 86_400_000

/** On-time-in-full: delivered by promise AND full quantity. 0–100. */
export function otifPct(records: DeliveryRecord[]): number | null {
  const done = records.filter((r) => r.deliveredAt !== null)
  if (done.length === 0) return null
  const ok = done.filter(
    (r) => r.deliveredAt!.getTime() <= r.promisedAt.getTime() && r.unitsDelivered >= r.unitsOrdered,
  )
  return (ok.length / done.length) * 100
}

/** Late shipment rate: shipped after the promised date. 0–100 (Amazon ceiling 4%). */
export function lateShipmentRatePct(records: DeliveryRecord[]): number | null {
  const shipped = records.filter((r) => r.shippedAt !== null)
  if (shipped.length === 0) return null
  const late = shipped.filter((r) => r.shippedAt!.getTime() > r.promisedAt.getTime())
  return (late.length / shipped.length) * 100
}

/** ODR-equivalent: defect-flagged (dispute/QC-fail/damaged) share of delivered. */
export function odrEquivPct(records: DeliveryRecord[]): number | null {
  const done = records.filter((r) => r.deliveredAt !== null)
  if (done.length === 0) return null
  return (done.filter((r) => r.defect).length / done.length) * 100
}

/**
 * Lead-time variance: P90 of (actual − promised) in days, floor 0.
 * A partner quoting 10d and taking 7–21 is riskier than one taking 9–11,
 * even at the same mean.
 */
export function leadTimeVarianceP90Days(records: DeliveryRecord[]): number | null {
  const lags = records
    .filter((r) => r.deliveredAt !== null)
    .map((r) => Math.max(0, (r.deliveredAt!.getTime() - r.promisedAt.getTime()) / MS_PER_DAY))
    .sort((a, b) => a - b)
  if (lags.length === 0) return null
  const idx = 0.9 * (lags.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const loV = lags[lo]
  const hiV = lags[hi]
  if (loV === undefined || hiV === undefined) return null
  return Math.round((loV + (hiV - loV) * (idx - lo)) * 10) / 10
}

// ── PRS (M3 — math lands now, wiring later) ──────────────────────────────────

export interface PrsComponents {
  otifPct: number | null // weight 30
  acceptRatePct: number | null // 15
  qualityPct: number | null // 20 (yield/QC/reprints/disputes composite)
  discrepancyCleanPct: number | null // 10 (100 − discrepancy rate)
  capacityHonestyPct: number | null // 10 (100 − declared-vs-demonstrated gap)
  leadTimeConsistencyPct: number | null // 10 (100 − normalized variance)
  /** 5-point penalty pool: active strikes + unresolved clawbacks. */
  penaltyPoints: number
}

export const PRS_WEIGHTS = {
  otifPct: 30,
  acceptRatePct: 15,
  qualityPct: 20,
  discrepancyCleanPct: 10,
  capacityHonestyPct: 10,
  leadTimeConsistencyPct: 10,
} as const

export const PRS_FORMULA_VERSION = 'prs-v1'

/**
 * 0–100 Partner Reliability Score. Missing components renormalize (same
 * pattern as PartnerMatchScore) — thin history is never punished. Callers give
 * brand-new partners a neutral 70 with a "thin history" badge when ALL
 * components are null.
 */
export function computePrs(c: PrsComponents): { score: number | null; usedWeights: Record<string, number> } {
  let weightSum = 0
  let acc = 0
  const used: Record<string, number> = {}
  for (const [key, weight] of Object.entries(PRS_WEIGHTS) as [keyof typeof PRS_WEIGHTS, number][]) {
    const v = c[key]
    if (v === null || v === undefined) continue
    weightSum += weight
    acc += Math.max(0, Math.min(100, v)) * weight
    used[key] = weight
  }
  if (weightSum === 0) return { score: null, usedWeights: {} }
  const base = acc / weightSum
  const score = Math.max(0, Math.min(100, base - Math.max(0, c.penaltyPoints)))
  return { score: Math.round(score * 10) / 10, usedWeights: used }
}

/** Amazon-AHR-style bands (implementation plan M3). */
export function prsBand(score: number): 'HEALTHY' | 'AT_RISK' | 'CRITICAL' {
  if (score >= 75) return 'HEALTHY'
  if (score >= 50) return 'AT_RISK'
  return 'CRITICAL'
}
