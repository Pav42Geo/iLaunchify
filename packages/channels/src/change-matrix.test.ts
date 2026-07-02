/**
 * Golden checks for the order-change stage-gate matrix (CHANNEL_MANAGEMENT_SPEC
 * §3.5c) — the matrix IS the policy, so every cell is pinned. Self-contained
 * assert harness.
 */
import { changeGate, availableChanges, routeChange, canTransitionChangeRequest } from './change-matrix'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1
    console.error('  ✗ ' + msg)
  } else {
    console.log('  ✓ ' + msg)
  }
}

// --- every matrix cell, pinned to the spec table ---
// QUANTITY
assert(changeGate('QUANTITY', 'PENDING_ACCEPT') === 'FREE', 'qty @ pending → FREE')
assert(changeGate('QUANTITY', 'ACCEPTED') === 'CONSENT', 'qty @ accepted → CONSENT')
assert(changeGate('QUANTITY', 'PRODUCING') === 'LOCKED', 'qty @ producing → LOCKED')
assert(changeGate('QUANTITY', 'READY') === 'LOCKED', 'qty @ ready → LOCKED')
assert(changeGate('QUANTITY', 'SHIPPED') === 'LOCKED', 'qty @ shipped → LOCKED')
// DESTINATION
assert(changeGate('DESTINATION', 'PENDING_ACCEPT') === 'FREE', 'dest @ pending → FREE')
assert(changeGate('DESTINATION', 'ACCEPTED') === 'FREE', 'dest @ accepted → FREE (manifest not cut)')
assert(changeGate('DESTINATION', 'PRODUCING') === 'CONSENT', 'dest @ producing → CONSENT (re-validate)')
assert(changeGate('DESTINATION', 'READY') === 'CONSENT', 'dest @ ready → CONSENT (re-rate)')
assert(changeGate('DESTINATION', 'SHIPPED') === 'REDIRECT', 'dest @ shipped → carrier REDIRECT')
// TIMING
assert(changeGate('TIMING', 'PENDING_ACCEPT') === 'FREE', 'timing @ pending → FREE')
assert(changeGate('TIMING', 'ACCEPTED') === 'FREE', 'timing @ accepted → FREE')
assert(changeGate('TIMING', 'PRODUCING') === 'CONSENT', 'timing @ producing → CONSENT')
assert(changeGate('TIMING', 'READY') === 'CONSENT', 'timing @ ready → CONSENT (hold-at-manufacturer)')
assert(changeGate('TIMING', 'SHIPPED') === 'LOCKED', 'timing @ shipped → LOCKED')
// DESIGN
assert(changeGate('DESIGN', 'PENDING_ACCEPT') === 'FREE', 'design @ pending → FREE')
assert(changeGate('DESIGN', 'ACCEPTED') === 'CONSENT', 'design @ accepted → CONSENT')
assert(changeGate('DESIGN', 'PRODUCING') === 'LOCKED', 'design @ producing → LOCKED')

// --- availableChanges drives the UI (never renders LOCKED) ---
{
  const pending = availableChanges('PENDING_ACCEPT')
  assert(pending.length === 4 && pending.every((c) => c.gate === 'FREE'), 'pending: all four changes, all FREE')
  const producing = availableChanges('PRODUCING')
  assert(
    producing.length === 2 && producing.every((c) => c.gate === 'CONSENT'),
    'producing: only destination + timing, both CONSENT',
  )
  const shipped = availableChanges('SHIPPED')
  assert(shipped.length === 1 && shipped[0]!.kind === 'DESTINATION' && shipped[0]!.gate === 'REDIRECT', 'shipped: redirect only')
}

// --- routing ---
{
  const apply = routeChange('DESTINATION', 'ACCEPTED')
  assert(apply.path === 'APPLY' && apply.revalidate, 'FREE routes to instant apply WITH re-validation')
  const request = routeChange('QUANTITY', 'ACCEPTED')
  assert(request.path === 'REQUEST', 'CONSENT routes to a change request')
  const qtyLocked = routeChange('QUANTITY', 'PRODUCING')
  assert(qtyLocked.path === 'REJECT' && qtyLocked.reason.includes('additional order'), 'locked qty explains "order more"')
  const redirect = routeChange('DESTINATION', 'SHIPPED')
  assert(redirect.path === 'REJECT' && redirect.reason.toLowerCase().includes('carrier'), 'shipped dest points at carrier redirect')
}

// --- 860/865 handshake lifecycle ---
assert(canTransitionChangeRequest('PROPOSED', 'ACCEPTED'), 'PROPOSED → ACCEPTED')
assert(canTransitionChangeRequest('PROPOSED', 'DECLINED'), 'PROPOSED → DECLINED')
assert(canTransitionChangeRequest('PROPOSED', 'WITHDRAWN'), 'creator can withdraw')
assert(canTransitionChangeRequest('ACCEPTED', 'APPLIED'), 'acceptance → apply is a separate audited step')
assert(!canTransitionChangeRequest('DECLINED', 'APPLIED'), 'declined never applies')
assert(!canTransitionChangeRequest('APPLIED', 'PROPOSED'), 'applied is terminal')
assert(!canTransitionChangeRequest('PROPOSED', 'APPLIED'), 'no apply without acceptance')

if (failures > 0) {
  console.error(`\n${failures} change-matrix golden(s) FAILED`)
  process.exit(1)
} else {
  console.log('\nAll change-matrix goldens pass.')
}
