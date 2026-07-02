/**
 * Stage 2 — carrier-service eligibility filter + fallback ordering (spec §6.2).
 * Consumes CarrierServiceRule rows (DB) + a ShipmentClassification. Pure.
 *
 * INVARIANTS (tested):
 *  - temp class is a HARD filter — a service without the shipment's storage
 *    class NEVER passes, whatever the price. No silent fallback across classes.
 *  - hazmat must be explicitly allowed; groundOnly shipments only match
 *    ground-capable rules.
 */

import type { CarrierServiceRuleRow, ShipmentClassification } from './types'

export interface SeasonalWindow {
  /** Weekdays the service accepts this shipment, 0=Sun…6=Sat. */
  frozenShipDays?: number[]
  /** Inclusive MM-DD window when meltables are PAUSED, e.g. { from: '04-15', to: '10-15' }. */
  meltablePause?: { from: string; to: string }
}

function mmdd(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${m}-${d}`
}

export function inMeltablePause(window: SeasonalWindow, shipDate: Date): boolean {
  const pause = window.meltablePause
  if (!pause) return false
  const now = mmdd(shipDate)
  // Window may wrap the year end; ours (Apr→Oct) doesn't, but handle both.
  return pause.from <= pause.to
    ? now >= pause.from && now <= pause.to
    : now >= pause.from || now <= pause.to
}

export interface EligibilityContext {
  meltable?: boolean
  plannedShipDate?: Date
}

/**
 * Returns the eligible rules sorted by priority (the fallback chain).
 * Empty array = no service can carry this shipment → escalate to ops.
 */
export function eligibleCarrierServices(
  rules: CarrierServiceRuleRow[],
  shipment: ShipmentClassification,
  ctx: EligibilityContext = {},
): CarrierServiceRuleRow[] {
  return rules
    .filter((rule) => {
      if (!rule.active) return false
      if (!rule.modes.includes(shipment.mode)) return false
      // HARD: temp class — never traded for cost.
      if (!rule.storageClasses.includes(shipment.storageClass)) return false
      // HARD: hazmat must be explicitly allowed (empty list = NONE only).
      if (shipment.hazmatClass !== 'NONE' && !rule.hazmatAllowed.includes(shipment.hazmatClass)) {
        return false
      }
      // Ground-only shipments need ground-capable services.
      if (shipment.groundOnly && !rule.groundOnly) return false
      if (rule.maxWeightLb !== null && shipment.totalWeightLb > rule.maxWeightLb) return false
      // SLA feasibility: the service must be able to meet the shipment's cap.
      if (
        shipment.maxTransitDays !== null &&
        (rule.maxTransitDays === null || rule.maxTransitDays > shipment.maxTransitDays)
      ) {
        return false
      }
      // Seasonal windows
      const window = (rule.seasonalWindowJson ?? {}) as SeasonalWindow
      if (ctx.plannedShipDate) {
        if (ctx.meltable && inMeltablePause(window, ctx.plannedShipDate)) return false
        const dayRule = window.frozenShipDays ?? shipment.allowedShipDays
        if (
          shipment.storageClass === 'FROZEN' &&
          shipment.mode === 'PARCEL' &&
          dayRule &&
          !dayRule.includes(ctx.plannedShipDate.getDay())
        ) {
          return false
        }
      }
      return true
    })
    .sort((a, b) => a.priority - b.priority)
}
