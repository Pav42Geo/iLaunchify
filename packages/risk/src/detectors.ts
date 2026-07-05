// Detector catalog — default thresholds (implementation plan §4) + metadata.
// RiskSetting rows override these at runtime; seed-risk-settings.ts seeds them.

import type { DetectorConfig, DetectorKey } from './types'

export interface DetectorMeta {
  key: DetectorKey
  title: string
  /** Which event stream evaluates it. */
  trigger: 'CHECKOUT' | 'DISPATCH_FSM' | 'STRIPE_WEBHOOK' | 'PAYOUT_RELEASE' | 'ROUTING' | 'CRON_NIGHTLY' | 'CRON_HOURLY' | 'CRON_WEEKLY'
  defaults: DetectorConfig
  benchmark: string
}

export const DETECTORS: Record<DetectorKey, DetectorMeta> = {
  CAPACITY_OVERCOMMIT: {
    key: 'CAPACITY_OVERCOMMIT',
    title: 'Order exceeds partner capacity headroom',
    trigger: 'CHECKOUT',
    defaults: { mode: 'MONITOR', thresholds: { warnPct: 60, gatePct: 85, blockPct: 100 } },
    benchmark: 'Pavel scenario; vendor-assessment capacity criteria',
  },
  ODR_EQUIV_CEILING: {
    key: 'ODR_EQUIV_CEILING',
    title: 'Order-defect-rate equivalent above ceiling',
    trigger: 'CRON_NIGHTLY',
    defaults: { mode: 'MONITOR', thresholds: { ceilingPct: 1, windowDays: 90 } },
    benchmark: 'Amazon ODR <1%',
  },
  LATE_SHIP_RATE: {
    key: 'LATE_SHIP_RATE',
    title: 'Late shipment rate above ceiling',
    trigger: 'CRON_NIGHTLY',
    defaults: { mode: 'MONITOR', thresholds: { ceilingPct: 4, windowDays: 30 } },
    benchmark: 'Amazon LSR <4%',
  },
  OTIF_FLOOR: {
    key: 'OTIF_FLOOR',
    title: 'On-time-in-full below floor',
    trigger: 'CRON_NIGHTLY',
    defaults: { mode: 'MONITOR', thresholds: { warnFloorPct: 95, highFloorPct: 90, windowDays: 90 } },
    benchmark: 'Industry OTIF standard ≥95%',
  },
  ACCEPT_TIMEOUT_AT_RISK: {
    key: 'ACCEPT_TIMEOUT_AT_RISK',
    title: 'Dispatch accept window at risk',
    trigger: 'CRON_HOURLY',
    defaults: { mode: 'WARN', thresholds: { windowConsumedPct: 50 } },
    benchmark: 'Existing partner-ops sweep (thresholds now RiskSetting-tunable)',
  },
  CAPACITY_HONESTY_GAP: {
    key: 'CAPACITY_HONESTY_GAP',
    title: 'Demonstrated capacity far below declared',
    trigger: 'CRON_NIGHTLY',
    defaults: { mode: 'MONITOR', thresholds: { gapFloorPct: 60, minConsecutiveMonths: 2 } },
    benchmark: 'Alibaba third-party verification rationale; propose→admin-approve (2026-07-05)',
  },
  RADAR_ELEVATED: {
    key: 'RADAR_ELEVATED',
    title: 'Stripe Radar elevated/highest risk charge',
    trigger: 'STRIPE_WEBHOOK',
    defaults: { mode: 'WARN', thresholds: { reviewScore: 65, blockScore: 85, firstOrderUnitsFloor: 1000 } },
    benchmark: 'Stripe Radar risk_level elevated/highest',
  },
  ORDER_VELOCITY: {
    key: 'ORDER_VELOCITY',
    title: 'Order velocity anomaly on new account',
    trigger: 'CHECKOUT',
    defaults: { mode: 'MONITOR', thresholds: { maxOrdersPer24h: 3, newAccountDays: 14, firstOrderCentsFloor: 500_000 } },
    benchmark: 'Radar rules 101 velocity pattern',
  },
  CHARGEBACK_RATE: {
    key: 'CHARGEBACK_RATE',
    title: 'Creator chargeback rate above ceiling',
    trigger: 'CRON_NIGHTLY',
    defaults: { mode: 'MONITOR', thresholds: { ceilingPct: 0.75, windowDays: 90 } },
    benchmark: 'Card-network ~0.9% programs, margin below',
  },
  CLAWBACK_EXPOSURE: {
    key: 'CLAWBACK_EXPOSURE',
    title: 'Clawback exposure exceeds next payout',
    trigger: 'PAYOUT_RELEASE',
    defaults: { mode: 'MONITOR', thresholds: { exposureToPayoutRatio: 1 } },
    benchmark: 'Trade Assurance escrow posture; GATE after Stripe go-live',
  },
  CERT_EXPIRY_VOLUME: {
    key: 'CERT_EXPIRY_VOLUME',
    title: 'Expiring certs weighted by open dispatch volume',
    trigger: 'CRON_NIGHTLY',
    defaults: { mode: 'WARN', thresholds: { horizon1Days: 60, horizon2Days: 30, horizon3Days: 7 } },
    benchmark: 'Existing 60/30/7d sweep + volume weighting',
  },
  ROUTE_FRAGILITY: {
    key: 'ROUTE_FRAGILITY',
    title: 'Commodity-leg candidate pool too thin',
    trigger: 'ROUTING',
    defaults: { mode: 'MONITOR', thresholds: { minPoolSize: 2, rerouteBudgetRemaining: 1 } },
    benchmark: 'fc-scorer pool depth; single-source risk practice',
  },
  STORAGE_DWELL: {
    key: 'STORAGE_DWELL',
    title: 'Storage dwell approaching max / lot expiry',
    trigger: 'CRON_NIGHTLY',
    defaults: { mode: 'WARN', thresholds: { warnDwellPct: 60, highDwellPct: 80 } },
    benchmark: 'Existing release-SLA sweep; stricter for dated lots',
  },
  CONCENTRATION: {
    key: 'CONCENTRATION',
    title: 'Platform volume concentration on one partner',
    trigger: 'CRON_WEEKLY',
    defaults: { mode: 'MONITOR', thresholds: { maxPartnerSharePct: 35 } },
    benchmark: 'Single-source risk practice; V1 dashboard-only',
  },
}

export const ALL_DETECTOR_KEYS = Object.keys(DETECTORS) as DetectorKey[]

/** Merge admin overrides (RiskSetting) over catalog defaults. */
export function resolveConfig(key: DetectorKey, override?: Partial<DetectorConfig>): DetectorConfig {
  const d = DETECTORS[key].defaults
  return {
    mode: override?.mode ?? d.mode,
    thresholds: { ...d.thresholds, ...(override?.thresholds ?? {}) },
  }
}
