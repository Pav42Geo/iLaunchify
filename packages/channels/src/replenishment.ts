// =============================================================================
// Replenishment intelligence (CHANNEL_MANAGEMENT_SPEC §3.5a, Phase C6) — pure.
//
// Classic reorder-point science with iLaunchify's two ground-truth advantages:
// leadDays comes from the REAL per-flavor lead engine (not a merchant guess) and
// onOrder from in-flight production orders (not hand-entry). Everything here is
// deterministic math — persistence, jobs, and notifications live in server code.
//
//   velocity      units/day, recent-weighted blend of 7- and 30-day sales
//   reorderPoint  velocity × leadDays + safetyStock(days-based V1)
//   daysOfCover   available / velocity
//   suggestedQty  target cover − available − onOrder, MOQ/pack-rounded
//   alert ladder  HEALTHY → LOW → CRITICAL → STOCKOUT (state, not spam)
// =============================================================================

export interface VelocityInput {
  /** Units sold in the trailing 7 days. */
  unitsLast7: number
  /** Units sold in the trailing 30 days (includes the last 7). */
  unitsLast30: number
}

/** Recent-weighted daily velocity: 60% trailing-7 rate + 40% trailing-30 rate.
 *  Responsive to spikes without whiplash; never negative. */
export function blendedVelocity(input: VelocityInput): number {
  const v7 = Math.max(0, input.unitsLast7) / 7
  const v30 = Math.max(0, input.unitsLast30) / 30
  return 0.6 * v7 + 0.4 * v30
}

export interface ReorderPointInput {
  velocityPerDay: number
  /** REAL production lead time (effectiveProductLead) + admin processing buffer. */
  leadDays: number
  /** V1 safety stock as days of cover (admin default, creator override). */
  safetyDays: number
}

export function reorderPoint(input: ReorderPointInput): number {
  const v = Math.max(0, input.velocityPerDay)
  return Math.ceil(v * Math.max(0, input.leadDays) + v * Math.max(0, input.safetyDays))
}

/** Days the available stock lasts at current velocity. Infinity when nothing sells. */
export function daysOfCover(available: number, velocityPerDay: number): number {
  if (velocityPerDay <= 0) return Infinity
  return Math.max(0, available) / velocityPerDay
}

/** Projected date available stock hits zero (null when it never does). */
export function projectedStockoutDate(available: number, velocityPerDay: number, from: Date): Date | null {
  const cover = daysOfCover(available, velocityPerDay)
  if (!Number.isFinite(cover)) return null
  return new Date(from.getTime() + cover * 24 * 60 * 60 * 1000)
}

/** Latest day a reorder still arrives before stockout (stockout − leadDays).
 *  In the past ⇒ the gap is already unavoidable (CRITICAL). */
export function reorderByDate(stockoutDate: Date, leadDays: number): Date {
  return new Date(stockoutDate.getTime() - Math.max(0, leadDays) * 24 * 60 * 60 * 1000)
}

export interface SuggestedQtyInput {
  /** Stock target after the reorder arrives (industry sweet spot 30–60; default 45). */
  targetDaysOfCover: number
  velocityPerDay: number
  available: number
  /** Units already in-flight in production orders (ground truth). */
  onOrder: number
  /** Manufacturer minimum order quantity, if any. */
  moq?: number | null
  /** Round UP to multiples of this (case/pack size), if any. */
  packSize?: number | null
}

/** Suggested reorder quantity. 0 = no reorder needed (covered by stock+pipeline). */
export function suggestedReorderQty(input: SuggestedQtyInput): number {
  const raw = Math.ceil(
    Math.max(0, input.targetDaysOfCover) * Math.max(0, input.velocityPerDay) -
      Math.max(0, input.available) -
      Math.max(0, input.onOrder),
  )
  if (raw <= 0) return 0
  let qty = raw
  if (input.moq && input.moq > qty) qty = input.moq
  if (input.packSize && input.packSize > 0) qty = Math.ceil(qty / input.packSize) * input.packSize
  return qty
}

// --- Alert ladder --------------------------------------------------------------

export type StockAlertState = 'HEALTHY' | 'LOW' | 'CRITICAL' | 'STOCKOUT'

export interface AlertInput {
  available: number
  velocityPerDay: number
  reorderPoint: number
  leadDays: number
}

/** Severity ladder (spec §3.5a):
 *  STOCKOUT  available ≤ 0
 *  CRITICAL  cover < leadDays — a reorder placed TODAY still leaves a gap
 *  LOW       available ≤ reorderPoint — reorder now to stay ahead
 *  HEALTHY   otherwise (including anything with zero velocity and stock on hand) */
export function stockAlertState(input: AlertInput): StockAlertState {
  if (input.available <= 0) return 'STOCKOUT'
  if (input.velocityPerDay <= 0) return 'HEALTHY'
  if (daysOfCover(input.available, input.velocityPerDay) < input.leadDays) return 'CRITICAL'
  if (input.available <= input.reorderPoint) return 'LOW'
  return 'HEALTHY'
}

const SEVERITY: Record<StockAlertState, number> = { HEALTHY: 0, LOW: 1, CRITICAL: 2, STOCKOUT: 3 }

/** One notification per STATE TRANSITION (never per recompute). Escalations always
 *  notify; recovery back to HEALTHY notifies once (peace of mind); lateral no-ops don't. */
export function shouldNotify(prev: StockAlertState, next: StockAlertState): boolean {
  if (prev === next) return false
  if (SEVERITY[next] > SEVERITY[prev]) return true
  return next === 'HEALTHY'
}
