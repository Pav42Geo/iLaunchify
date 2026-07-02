/**
 * Golden checks for the bulk inventory ledger math
 * (docs/CHANNEL_MANAGEMENT_SPEC.md gate #2). Self-contained assert harness.
 */
import { applyLedgerEntry, availableToSell, canReserve, replayLedger, type PoolState } from './inventory'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1
    console.error('  ✗ ' + msg)
  } else {
    console.log('  ✓ ' + msg)
  }
}

const empty: PoolState = { onHand: 0, reserved: 0 }

// --- delivery + availability ---
{
  const r = applyLedgerEntry(empty, 'DELIVERY_RECEIVED', 100)
  assert(r.ok && r.next.onHand === 100 && r.next.reserved === 0, 'delivery adds on-hand')
  assert(r.ok && availableToSell(r.next) === 100, 'available = onHand − reserved')
}

// --- reservation lifecycle ---
{
  const pool: PoolState = { onHand: 10, reserved: 0 }
  const res = applyLedgerEntry(pool, 'RESERVATION', 3)
  assert(res.ok && res.next.reserved === 3 && res.next.onHand === 10, 'reservation moves reserved only')
  assert(res.ok && availableToSell(res.next) === 7, 'reservation shrinks available')
  const sale = res.ok ? applyLedgerEntry(res.next, 'CHANNEL_SALE', 3) : res
  assert(sale.ok && sale.next.onHand === 7 && sale.next.reserved === 0, 'sale consumes on-hand AND reservation')
}
{
  const pool: PoolState = { onHand: 10, reserved: 4 }
  const rel = applyLedgerEntry(pool, 'RELEASE', 4)
  assert(rel.ok && rel.next.reserved === 0 && rel.next.onHand === 10, 'release returns reserved to available')
}

// --- oversell guards ---
assert(!canReserve({ onHand: 5, reserved: 3 }, 3), 'cannot reserve past available (2 left)')
assert(canReserve({ onHand: 5, reserved: 3 }, 2), 'can reserve exactly the remainder')
{
  const r = applyLedgerEntry({ onHand: 5, reserved: 3 }, 'RESERVATION', 3)
  assert(!r.ok, 'over-reservation rejected with reason')
}
{
  const r = applyLedgerEntry({ onHand: 2, reserved: 1 }, 'CHANNEL_SALE', 2)
  assert(!r.ok, 'sale beyond reservation rejected')
}
{
  const r = applyLedgerEntry({ onHand: 3, reserved: 0 }, 'RELEASE', 1)
  assert(!r.ok, 'release with nothing reserved rejected')
}

// --- adjustments ---
{
  const up = applyLedgerEntry({ onHand: 5, reserved: 2 }, 'ADJUSTMENT', 5)
  assert(up.ok && up.next.onHand === 10, 'positive adjustment raises on-hand')
  const down = applyLedgerEntry({ onHand: 5, reserved: 2 }, 'ADJUSTMENT', -3)
  assert(down.ok && down.next.onHand === 2, 'negative adjustment lowers on-hand')
  const past = applyLedgerEntry({ onHand: 5, reserved: 2 }, 'ADJUSTMENT', -4)
  assert(!past.ok, 'adjustment below reserved rejected')
  const neg = applyLedgerEntry({ onHand: 2, reserved: 0 }, 'ADJUSTMENT', -5)
  assert(!neg.ok, 'adjustment below zero rejected')
}

// --- validation ---
assert(!applyLedgerEntry(empty, 'DELIVERY_RECEIVED', 0).ok, 'zero quantity rejected (non-adjustment)')
assert(!applyLedgerEntry(empty, 'DELIVERY_RECEIVED', 1.5).ok, 'fractional quantity rejected')

// --- ledger replay (reconciliation) ---
{
  const { state, violations } = replayLedger([
    { kind: 'DELIVERY_RECEIVED', quantity: 50 },
    { kind: 'RESERVATION', quantity: 10 },
    { kind: 'CHANNEL_SALE', quantity: 10 },
    { kind: 'RESERVATION', quantity: 45 }, // violates: only 40 available
    { kind: 'ADJUSTMENT', quantity: -5 },
  ])
  assert(state.onHand === 35 && state.reserved === 0, 'replay derives final pool state')
  assert(violations.length === 1 && violations[0]!.index === 3, 'replay reports the violating entry')
}

if (failures > 0) {
  console.error(`\n${failures} inventory golden(s) FAILED`)
  process.exit(1)
} else {
  console.log('\nAll inventory goldens pass.')
}
