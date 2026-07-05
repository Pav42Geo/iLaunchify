// R1 — Partner capacity risk (Pavel's 50k-into-35k scenario).
// Pure math. Spec: docs/RISK_MANAGEMENT_CENTER.md §2-R1 + §4.
// DECIDED 2026-07-05: gate offers SPLIT + EXTENDED-ETA only (no auto re-route —
// manufacturing is owner-pinned); declared-capacity corrections are
// system-proposed, admin-approved.

import type { CapacityAssessment, CapacityBand, CapacityMonthInput } from './types'

export const CAPACITY_FORMULA_VERSION = 'capacity-v1'

/** P75 of completed units across rolling windows — the "demonstrated" number. */
export function demonstratedCapacityP75(windowUnits: number[]): number | null {
  const xs = windowUnits.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b)
  if (xs.length < 2) return null // thin history → caller falls back to declared
  const idx = 0.75 * (xs.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const loV = xs[lo]
  const hiV = xs[hi]
  if (loV === undefined || hiV === undefined) return null
  return Math.round(loV + (hiV - loV) * (idx - lo))
}

/** min(declared, demonstrated), pro-rated for blackout days. */
export function effectiveCapacity(input: CapacityMonthInput): number {
  const base =
    input.demonstratedUnits === null
      ? input.declaredUnits
      : Math.min(input.declaredUnits, input.demonstratedUnits)
  const days = input.daysInMonth ?? 30
  const blackout = Math.min(input.blackoutDays ?? 0, days)
  return Math.max(0, Math.round(base * ((days - blackout) / days)))
}

export function classifyCapacityRisk(
  riskPct: number,
  thresholds: { warnPct: number; gatePct: number; blockPct: number },
): CapacityBand {
  if (riskPct > thresholds.blockPct) return 'BLOCK'
  if (riskPct > thresholds.gatePct) return 'GATE'
  if (riskPct > thresholds.warnPct) return 'WARN'
  return 'GREEN'
}

/**
 * Greedy earliest-first split across the current + future months' headroom.
 * Returns null when the order fits the first month or can never fit within
 * the given horizon (caller then offers extended-ETA / manual mediation).
 */
export function proposeSplit(
  orderUnits: number,
  monthlyHeadroom: { month: string; headroomUnits: number }[],
): { month: string; units: number }[] | null {
  const first = monthlyHeadroom[0]
  if (!first || orderUnits <= first.headroomUnits) return null
  let remaining = orderUnits
  const parts: { month: string; units: number }[] = []
  for (const m of monthlyHeadroom) {
    if (remaining <= 0) break
    const take = Math.min(remaining, Math.max(0, m.headroomUnits))
    if (take > 0) {
      parts.push({ month: m.month, units: take })
      remaining -= take
    }
  }
  return remaining <= 0 && parts.length > 1 ? parts : null
}

/** CapacityRiskPct = orderUnits / headroom, where headroom = effective − committed. */
export function assessCapacity(
  orderUnits: number,
  current: CapacityMonthInput,
  futureMonths: { month: string; input: CapacityMonthInput }[],
  thresholds: { warnPct: number; gatePct: number; blockPct: number },
  currentMonth = 'current',
): CapacityAssessment {
  const cap = effectiveCapacity(current)
  const headroom = Math.max(0, cap - current.committedUnits)
  const riskPct = headroom <= 0 ? Number.POSITIVE_INFINITY : (orderUnits / headroom) * 100
  const band = classifyCapacityRisk(riskPct, thresholds)
  const splitProposal =
    band === 'GATE' || band === 'BLOCK'
      ? proposeSplit(orderUnits, [
          { month: currentMonth, headroomUnits: headroom },
          ...futureMonths.map((f) => ({
            month: f.month,
            headroomUnits: Math.max(0, effectiveCapacity(f.input) - f.input.committedUnits),
          })),
        ])
      : null
  return { effectiveCapacity: cap, headroomUnits: headroom, riskPct, band, splitProposal }
}

/**
 * R6-detector companion (CAPACITY_HONESTY_GAP): true when demonstrated has been
 * below `gapFloorPct` of declared for `minConsecutiveMonths`. The caller then
 * PROPOSES a corrected declared number for admin one-click approval — never
 * auto-applies (DECIDED 2026-07-05).
 */
export function capacityHonestyGap(
  monthly: { declaredUnits: number; demonstratedUnits: number | null }[],
  thresholds: { gapFloorPct: number; minConsecutiveMonths: number },
): { fired: boolean; proposedDeclaredUnits: number | null; consecutiveMonths: number } {
  let streak = 0
  const demos: number[] = []
  for (const m of monthly) {
    const demonstrated = m.demonstratedUnits
    if (demonstrated === null || m.declaredUnits <= 0) {
      streak = 0
      continue
    }
    if ((demonstrated / m.declaredUnits) * 100 < thresholds.gapFloorPct) {
      streak += 1
      demos.push(demonstrated)
    } else {
      streak = 0
      demos.length = 0
    }
  }
  const fired = streak >= thresholds.minConsecutiveMonths
  const proposedDeclaredUnits = fired && demos.length > 0 ? Math.round(demos.reduce((a, b) => a + b, 0) / demos.length) : null
  return { fired, proposedDeclaredUnits, consecutiveMonths: streak }
}
