// @ilaunchify/risk — core types. PURE package: no Prisma, no network, no env.
// All persistence + notification happens at the call site (server actions,
// partner-ops cron). Spec: docs/RISK_MANAGEMENT_CENTER.md §5–6,
// docs/RISK_CENTER_IMPLEMENTATION_PLAN.md §2–4.

/** Escalation-ladder rung a detector is allowed to reach (RiskSetting.mode). */
export type RiskMode = 'MONITOR' | 'WARN' | 'GATE' | 'ACT'

export type RiskSeverity = 'INFO' | 'WARN' | 'HIGH' | 'CRITICAL'

/** What the engine actually did — never exceeds the detector's mode. */
export type RiskDecisionAction = 'NONE' | 'MONITOR_LOGGED' | 'WARNED' | 'GATED' | 'ACTED'

/** The 14 v1 detectors (implementation plan §4). */
export type DetectorKey =
  | 'CAPACITY_OVERCOMMIT'
  | 'ODR_EQUIV_CEILING'
  | 'LATE_SHIP_RATE'
  | 'OTIF_FLOOR'
  | 'ACCEPT_TIMEOUT_AT_RISK'
  | 'CAPACITY_HONESTY_GAP'
  | 'RADAR_ELEVATED'
  | 'ORDER_VELOCITY'
  | 'CHARGEBACK_RATE'
  | 'CLAWBACK_EXPOSURE'
  | 'CERT_EXPIRY_VOLUME'
  | 'ROUTE_FRAGILITY'
  | 'STORAGE_DWELL'
  | 'CONCENTRATION'

/** Per-detector config, injected from RiskSetting rows at the call site. */
export interface DetectorConfig {
  mode: RiskMode
  /** Detector-specific thresholds; defaults in detectors.ts, admin-tunable. */
  thresholds: Record<string, number>
}

export type RiskSettings = Partial<Record<DetectorKey, DetectorConfig>>

/** Reproducible record of one detector evaluation (→ RiskEvent.scoreSnapshotJson). */
export interface RiskSnapshot {
  formulaVersion: string
  inputs: Record<string, unknown>
  thresholds: Record<string, number>
  score: number
}

export interface RiskDecision {
  detectorKey: DetectorKey
  fired: boolean
  severity: RiskSeverity
  /** Ladder-capped: a MONITOR-mode detector never returns more than MONITOR_LOGGED. */
  action: RiskDecisionAction
  /** What the detector WOULD have done at full ACT mode (calibration signal). */
  uncappedAction: RiskDecisionAction
  reasons: string[]
  snapshot: RiskSnapshot
}

// ── Capacity (R1) ────────────────────────────────────────────────────────────

export interface CapacityMonthInput {
  /** Snapshot of PartnerOperationalCapability.monthlyCapacityUnits. */
  declaredUnits: number
  /** P75 of completed rolling-30d windows; null when history is thin. */
  demonstratedUnits: number | null
  /** Σ open dispatch units already promised this month (PartnerCapacityLedger). */
  committedUnits: number
  /** Blackout days this month (PartnerBlackoutDate) — pro-rates capacity. */
  blackoutDays?: number
  daysInMonth?: number
}

export type CapacityBand = 'GREEN' | 'WARN' | 'GATE' | 'BLOCK'

export interface CapacityAssessment {
  effectiveCapacity: number
  headroomUnits: number
  riskPct: number
  band: CapacityBand
  /** Months → units the order could be split into (only when band ≥ GATE). */
  splitProposal: { month: string; units: number }[] | null
}

// ── Delivery metrics (R2/R4 — feeds detectors 2, 3, 4 and PRS) ──────────────

export interface DeliveryRecord {
  /** Promised date (currentEtaAt / proposedDeadlineAt). */
  promisedAt: Date
  shippedAt: Date | null
  deliveredAt: Date | null
  unitsOrdered: number
  unitsDelivered: number
  /** Defect flags for the ODR-equivalent: dispute, QC fail, damaged discrepancy. */
  defect: boolean
}
