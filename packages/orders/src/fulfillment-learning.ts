// Adaptive Fulfillment Engine (AFE) P2 — the learned behavior layer.
// docs/FC_SELECTION_STRATEGY_BRIEF_2026-07-09.md §3, §5(P2).
//
// PURE + dependency-free (mirrors rotation.ts / fc-pool.ts). Callers persist the
// rolling `CreatorFulfillmentSignal` counters and the admin policy; this module
// only (a) classifies a single override event and (b) turns the accumulated
// signal into a BOUNDED, admin-capped weight lean on top of the declared
// preference tilt. Shadow-inert by default (policy.enabled defaults false) — the
// admin flips it on once they trust it, exactly like the merit / rotation engines.

import type { FcScoringWeights } from './fc-scorer'

export type FulfillmentLean = 'NONE' | 'SPEED' | 'COST'

/** Rolling per-creator counters (persisted on CreatorFulfillmentSignal). */
export interface LearnedFulfillmentSignal {
  /** Overrides where the creator picked a FARTHER FC than suggested (accepted a
   *  longer first leg → a COST/coverage-leaning revealed choice). */
  fartherCount: number
  /** Overrides where the creator picked a NEARER FC (SPEED-leaning). */
  nearerCount: number
}

/** Admin controls (OrderSettings). Kill switch + ceiling + confidence floor. */
export interface FulfillmentLearningPolicy {
  enabled: boolean
  /** Minimum classified override events before any adjustment applies. */
  minEvents: number
  /** Hard ceiling on the learned adjustment magnitude (% points). */
  maxAdjustmentPct: number
}

export interface LearnedAdjustment {
  lean: FulfillmentLean
  /** 0..maxAdjustmentPct — how strongly to tilt (0 = no effect). */
  adjustmentPct: number
}

/**
 * Classify one FC override at the moment the creator picks a specific center
 * instead of the suggestion. Distance (manufacturer→FC) is the V1 axis — same
 * proxy the scorer uses for cost until real freight quotes land. Missing
 * distances or a tie → NEUTRAL (recorded as neither, so it can't skew the lean).
 */
export function classifyFcOverride(
  suggestedDistanceMiles: number | null,
  pickedDistanceMiles: number | null,
): 'FARTHER' | 'NEARER' | 'NEUTRAL' {
  if (suggestedDistanceMiles == null || pickedDistanceMiles == null) return 'NEUTRAL'
  const delta = pickedDistanceMiles - suggestedDistanceMiles
  if (delta > 1) return 'FARTHER'
  if (delta < -1) return 'NEARER'
  return 'NEUTRAL'
}

/**
 * Turn the accumulated signal into a bounded lean. Deterministic + capped:
 * disabled / too-few events → no effect; otherwise lean = the dominant side and
 * magnitude = confidence (|farther − nearer| / total) scaled to the admin ceiling.
 */
export function learnedFulfillmentAdjustment(
  signal: LearnedFulfillmentSignal,
  policy: FulfillmentLearningPolicy,
): LearnedAdjustment {
  const total = signal.fartherCount + signal.nearerCount
  if (!policy.enabled || total < policy.minEvents || policy.maxAdjustmentPct <= 0) {
    return { lean: 'NONE', adjustmentPct: 0 }
  }
  const net = signal.fartherCount - signal.nearerCount
  if (net === 0) return { lean: 'NONE', adjustmentPct: 0 }
  const confidence = Math.abs(net) / total // 0..1
  const adjustmentPct = Math.round(confidence * policy.maxAdjustmentPct)
  if (adjustmentPct <= 0) return { lean: 'NONE', adjustmentPct: 0 }
  return { lean: net > 0 ? 'COST' : 'SPEED', adjustmentPct }
}

/**
 * Apply the learned lean ON TOP of the (already preference-tilted) weights. Same
 * shape as applyFulfillmentPreference but scaled by the learned magnitude — only
 * cost vs distance/SLA move; hard-filter/capacity/rotation weights are untouched,
 * so learning can never strand an order or beat a hard filter.
 */
export function applyLearnedFulfillmentSignal(
  base: FcScoringWeights,
  adj: LearnedAdjustment,
): FcScoringWeights {
  if (adj.lean === 'NONE' || adj.adjustmentPct <= 0) return base
  const up = 1 + adj.adjustmentPct / 100
  const down = 1 - adj.adjustmentPct / 200 // gentler on the opposite side
  const tilt =
    adj.lean === 'COST'
      ? { cost: up, distance: down, sla: down }
      : { cost: down, distance: up, sla: up }
  return {
    ...base,
    costWeightPct: base.costWeightPct * tilt.cost,
    distanceWeightPct: base.distanceWeightPct * tilt.distance,
    slaWeightPct: base.slaWeightPct * tilt.sla,
  }
}
