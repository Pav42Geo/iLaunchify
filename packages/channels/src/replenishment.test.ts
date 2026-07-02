/**
 * Golden checks for the replenishment engine (CHANNEL_MANAGEMENT_SPEC §3.5a).
 * Self-contained assert harness — runs via tsc+node / scripts/run-vitest-suites.mjs.
 */
import {
  blendedVelocity,
  reorderPoint,
  daysOfCover,
  projectedStockoutDate,
  reorderByDate,
  suggestedReorderQty,
  stockAlertState,
  shouldNotify,
} from './replenishment'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1
    console.error('  ✗ ' + msg)
  } else {
    console.log('  ✓ ' + msg)
  }
}
function near(a: number, b: number, eps = 0.001): boolean {
  return Math.abs(a - b) <= eps
}

// --- velocity blend ---
assert(near(blendedVelocity({ unitsLast7: 14, unitsLast30: 60 }), 0.6 * 2 + 0.4 * 2), 'steady sales → steady velocity (2/day)')
assert(near(blendedVelocity({ unitsLast7: 28, unitsLast30: 60 }), 0.6 * 4 + 0.4 * 2), 'recent spike weighted 60%')
assert(blendedVelocity({ unitsLast7: 0, unitsLast30: 0 }) === 0, 'no sales → zero velocity')
assert(blendedVelocity({ unitsLast7: -5, unitsLast30: -10 }) === 0, 'negative inputs clamp to zero')

// --- reorder point ---
assert(reorderPoint({ velocityPerDay: 2, leadDays: 21, safetyDays: 7 }) === 56, 'ROP = 2×21 + 2×7 = 56')
assert(reorderPoint({ velocityPerDay: 0, leadDays: 21, safetyDays: 7 }) === 0, 'zero velocity → zero ROP')
assert(reorderPoint({ velocityPerDay: 1.5, leadDays: 10, safetyDays: 0 }) === 15, 'fractional velocity ceils')

// --- cover + dates ---
assert(near(daysOfCover(30, 2), 15), '30 units at 2/day → 15 days cover')
assert(daysOfCover(30, 0) === Infinity, 'zero velocity → infinite cover')
{
  const from = new Date('2026-07-02T00:00:00Z')
  const out = projectedStockoutDate(30, 2, from)!
  assert(out.toISOString().slice(0, 10) === '2026-07-17', 'stockout projected 15 days out')
  const by = reorderByDate(out, 21)
  assert(by.getTime() < from.getTime(), 'reorder-by in the past when lead > cover (gap unavoidable)')
  assert(projectedStockoutDate(30, 0, from) === null, 'no stockout date when nothing sells')
}

// --- suggested quantity ---
assert(
  suggestedReorderQty({ targetDaysOfCover: 45, velocityPerDay: 2, available: 30, onOrder: 0 }) === 60,
  'target 90 − 30 available = 60',
)
assert(
  suggestedReorderQty({ targetDaysOfCover: 45, velocityPerDay: 2, available: 30, onOrder: 50 }) === 10,
  'in-flight production reduces the suggestion (ground-truth onOrder)',
)
assert(
  suggestedReorderQty({ targetDaysOfCover: 45, velocityPerDay: 2, available: 30, onOrder: 100 }) === 0,
  'pipeline already covers the target → no reorder',
)
assert(
  suggestedReorderQty({ targetDaysOfCover: 45, velocityPerDay: 2, available: 30, onOrder: 0, moq: 100 }) === 100,
  'MOQ floors the suggestion',
)
assert(
  suggestedReorderQty({ targetDaysOfCover: 45, velocityPerDay: 2, available: 30, onOrder: 0, packSize: 24 }) === 72,
  'pack size rounds UP (60 → 72)',
)
assert(
  suggestedReorderQty({ targetDaysOfCover: 45, velocityPerDay: 2, available: 30, onOrder: 0, moq: 100, packSize: 24 }) === 120,
  'MOQ then pack rounding (100 → 120)',
)

// --- alert ladder ---
assert(stockAlertState({ available: 0, velocityPerDay: 2, reorderPoint: 56, leadDays: 21 }) === 'STOCKOUT', '0 available → STOCKOUT')
assert(stockAlertState({ available: 30, velocityPerDay: 2, reorderPoint: 56, leadDays: 21 }) === 'CRITICAL', '15d cover < 21d lead → CRITICAL')
assert(stockAlertState({ available: 50, velocityPerDay: 2, reorderPoint: 56, leadDays: 21 }) === 'LOW', 'above lead gap but ≤ ROP → LOW')
assert(stockAlertState({ available: 100, velocityPerDay: 2, reorderPoint: 56, leadDays: 21 }) === 'HEALTHY', 'above ROP → HEALTHY')
assert(stockAlertState({ available: 5, velocityPerDay: 0, reorderPoint: 0, leadDays: 21 }) === 'HEALTHY', 'no velocity + stock → HEALTHY (nothing to predict)')

// --- notification discipline (one per transition, escalations + recovery only) ---
assert(shouldNotify('HEALTHY', 'LOW'), 'HEALTHY→LOW notifies')
assert(shouldNotify('LOW', 'CRITICAL'), 'LOW→CRITICAL notifies')
assert(shouldNotify('CRITICAL', 'STOCKOUT'), 'CRITICAL→STOCKOUT notifies')
assert(shouldNotify('STOCKOUT', 'HEALTHY'), 'recovery to HEALTHY notifies once')
assert(!shouldNotify('LOW', 'LOW'), 'same state never re-notifies')
assert(!shouldNotify('CRITICAL', 'LOW'), 'partial de-escalation stays quiet')

if (failures > 0) {
  console.error(`\n${failures} replenishment golden(s) FAILED`)
  process.exit(1)
} else {
  console.log('\nAll replenishment goldens pass.')
}
