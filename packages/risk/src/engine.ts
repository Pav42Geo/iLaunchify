// The decision engine: severity → intended action → LADDER CAP by mode.
// Pure: config in, decision out. Persistence (RiskEvent) + side effects happen
// at the call site. Spec: docs/RISK_MANAGEMENT_CENTER.md §5.

import { CAPACITY_FORMULA_VERSION, assessCapacity } from './capacity'
import { resolveConfig } from './detectors'
import type {
  CapacityMonthInput,
  DetectorConfig,
  DetectorKey,
  RiskDecision,
  RiskDecisionAction,
  RiskMode,
  RiskSeverity,
  RiskSettings,
  RiskSnapshot,
} from './types'

const LADDER: Record<RiskMode, RiskDecisionAction> = {
  MONITOR: 'MONITOR_LOGGED',
  WARN: 'WARNED',
  GATE: 'GATED',
  ACT: 'ACTED',
}

const ACTION_RANK: Record<RiskDecisionAction, number> = {
  NONE: 0,
  MONITOR_LOGGED: 1,
  WARNED: 2,
  GATED: 3,
  ACTED: 4,
}

/** Cap what the detector wants at what its mode allows. */
export function capByMode(intended: RiskDecisionAction, mode: RiskMode): RiskDecisionAction {
  if (intended === 'NONE') return 'NONE'
  const ceiling = LADDER[mode]
  return ACTION_RANK[intended] <= ACTION_RANK[ceiling] ? intended : ceiling
}

function decision(
  detectorKey: DetectorKey,
  config: DetectorConfig,
  fired: boolean,
  severity: RiskSeverity,
  intended: RiskDecisionAction,
  reasons: string[],
  snapshot: RiskSnapshot,
): RiskDecision {
  return {
    detectorKey,
    fired,
    severity,
    uncappedAction: fired ? intended : 'NONE',
    action: fired ? capByMode(intended, config.mode) : 'NONE',
    reasons,
    snapshot,
  }
}

// ── CAPACITY_OVERCOMMIT (the M1 flagship) ────────────────────────────────────

export interface CapacityOvercommitEvent {
  orderUnits: number
  current: CapacityMonthInput
  futureMonths: { month: string; input: CapacityMonthInput }[]
  currentMonth?: string
}

export function evaluateCapacityOvercommit(
  event: CapacityOvercommitEvent,
  settings?: RiskSettings,
): RiskDecision & { assessment: ReturnType<typeof assessCapacity> } {
  const config = resolveConfig('CAPACITY_OVERCOMMIT', settings?.CAPACITY_OVERCOMMIT)
  const t = config.thresholds
  const warnPct = t.warnPct ?? 60
  const gatePct = t.gatePct ?? 85
  const blockPct = t.blockPct ?? 100
  const assessment = assessCapacity(
    event.orderUnits,
    event.current,
    event.futureMonths,
    { warnPct, gatePct, blockPct },
    event.currentMonth ?? 'current',
  )

  const fired = assessment.band !== 'GREEN'
  const severity: RiskSeverity =
    assessment.band === 'BLOCK' ? 'CRITICAL' : assessment.band === 'GATE' ? 'HIGH' : assessment.band === 'WARN' ? 'WARN' : 'INFO'
  // WARN band wants a warning; GATE and BLOCK both want a gate. There is no
  // ACT for this detector: manufacturing is owner-pinned — never auto re-route.
  const intended: RiskDecisionAction = assessment.band === 'WARN' ? 'WARNED' : fired ? 'GATED' : 'NONE'

  const reasons: string[] = []
  if (fired) {
    reasons.push(
      `order ${event.orderUnits} units vs headroom ${assessment.headroomUnits} ` +
        `(effective capacity ${assessment.effectiveCapacity} − committed ${event.current.committedUnits}) → ` +
        `${Number.isFinite(assessment.riskPct) ? Math.round(assessment.riskPct) : '∞'}% of headroom (band ${assessment.band})`,
    )
    if (assessment.splitProposal) {
      reasons.push(
        `split available: ${assessment.splitProposal.map((p) => `${p.units}@${p.month}`).join(' + ')}`,
      )
    } else if (assessment.band !== 'WARN') {
      reasons.push('no clean split within horizon — offer extended ETA or manual mediation')
    }
  }

  const snapshot: RiskSnapshot = {
    formulaVersion: CAPACITY_FORMULA_VERSION,
    inputs: {
      orderUnits: event.orderUnits,
      current: event.current,
      futureMonths: event.futureMonths,
    },
    thresholds: { warnPct, gatePct, blockPct },
    score: Number.isFinite(assessment.riskPct) ? Math.round(assessment.riskPct * 10) / 10 : 9999,
  }

  return { ...decision('CAPACITY_OVERCOMMIT', config, fired, severity, intended, reasons, snapshot), assessment }
}

// ── Generic ceiling/floor detectors (nightly cron feeds these) ───────────────

export function evaluateCeiling(
  key: DetectorKey,
  observedPct: number | null,
  thresholdKey: string,
  severityWhenFired: RiskSeverity,
  formulaVersion: string,
  settings?: RiskSettings,
  intended: RiskDecisionAction = 'WARNED',
): RiskDecision {
  const config = resolveConfig(key, settings?.[key])
  const ceiling = config.thresholds[thresholdKey]
  const fired = observedPct !== null && ceiling !== undefined && observedPct > ceiling
  const snapshot: RiskSnapshot = {
    formulaVersion,
    inputs: { observedPct },
    thresholds: config.thresholds,
    score: observedPct ?? 0,
  }
  const reasons = fired ? [`observed ${observedPct}% > ceiling ${ceiling}%`] : []
  return decision(key, config, fired, fired ? severityWhenFired : 'INFO', intended, reasons, snapshot)
}

export function evaluateFloor(
  key: DetectorKey,
  observedPct: number | null,
  warnFloorKey: string,
  highFloorKey: string,
  formulaVersion: string,
  settings?: RiskSettings,
): RiskDecision {
  const config = resolveConfig(key, settings?.[key])
  const warnFloor = config.thresholds[warnFloorKey]
  const highFloor = config.thresholds[highFloorKey]
  const belowHigh = observedPct !== null && highFloor !== undefined && observedPct < highFloor
  const belowWarn = observedPct !== null && warnFloor !== undefined && observedPct < warnFloor
  const fired = belowWarn || belowHigh
  const snapshot: RiskSnapshot = {
    formulaVersion,
    inputs: { observedPct },
    thresholds: config.thresholds,
    score: observedPct ?? 100,
  }
  const reasons = fired ? [`observed ${observedPct}% < floor ${belowHigh ? highFloor : warnFloor}%`] : []
  return decision(key, config, fired, belowHigh ? 'HIGH' : belowWarn ? 'WARN' : 'INFO', 'WARNED', reasons, snapshot)
}
