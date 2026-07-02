/**
 * Golden checks for the ChannelOrder FSM + readiness gates
 * (docs/CHANNEL_MANAGEMENT_SPEC.md §3.3 + §5 LOCKED decisions). Self-contained
 * assert harness (no vitest import) — run via tsc+node or scripts/run-vitest-suites.mjs.
 */
import { canTransition, isTerminal, evaluateReadiness, manualConfirmActive, variantKey, parseVariantKey } from './order-fsm'
import type { ReadinessInput } from './order-fsm'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1
    console.error('  ✗ ' + msg)
  } else {
    console.log('  ✓ ' + msg)
  }
}

// --- transitions ---
assert(canTransition('IMPORTED', 'MAPPED'), 'IMPORTED → MAPPED')
assert(canTransition('MAPPED', 'READY'), 'MAPPED → READY')
assert(canTransition('READY', 'ROUTED'), 'READY → ROUTED')
assert(canTransition('ROUTED', 'IN_FULFILLMENT'), 'ROUTED → IN_FULFILLMENT')
assert(canTransition('IN_FULFILLMENT', 'FULFILLED'), 'IN_FULFILLMENT → FULFILLED')
assert(canTransition('FULFILLED', 'CLOSED'), 'FULFILLED → CLOSED')
assert(!canTransition('IMPORTED', 'ROUTED'), 'no skipping IMPORTED → ROUTED')
assert(!canTransition('CLOSED', 'READY'), 'CLOSED is terminal')
assert(!canTransition('CANCELLED', 'MAPPED'), 'CANCELLED is terminal')
assert(canTransition('ON_HOLD', 'READY'), 'ON_HOLD recovers to READY')
assert(canTransition('NEEDS_ATTENTION', 'MAPPED'), 'NEEDS_ATTENTION recovers to MAPPED')
assert(isTerminal('CLOSED') && isTerminal('CANCELLED') && !isTerminal('READY'), 'terminal set = CLOSED + CANCELLED')

// --- readiness gates (LOCKED business rules) ---
const paidBase: ReadinessInput = {
  financialStatus: 'PAID',
  manualConfirmActive: false,
  withinSpendingCap: true,
  lines: [{ mapped: true, mode: 'ON_DEMAND', enablement: 'ENABLED', quantity: 1 }],
}

{
  const v = evaluateReadiness(paidBase)
  assert(v.next === 'READY' && v.holdForConfirm === false, 'paid + enabled on-demand → READY (auto)')
}
{
  const v = evaluateReadiness({ ...paidBase, manualConfirmActive: true })
  assert(v.next === 'READY' && v.holdForConfirm === true, 'manual-confirm holds at READY for approval')
}
{
  const v = evaluateReadiness({ ...paidBase, financialStatus: 'PENDING' })
  assert(v.next === 'NEEDS_ATTENTION', 'unpaid order → NEEDS_ATTENTION')
}
{
  const v = evaluateReadiness({ ...paidBase, lines: [{ mapped: false, mode: 'ON_DEMAND', quantity: 1 }] })
  assert(v.next === 'NEEDS_ATTENTION', 'unmapped line → NEEDS_ATTENTION')
}
{
  const v = evaluateReadiness({ ...paidBase, lines: [{ mapped: true, mode: 'ON_DEMAND', enablement: 'PARTNER_REVIEW', quantity: 1 }] })
  assert(v.next === 'ON_HOLD', 'on-demand without ENABLED enablement → ON_HOLD (gate #1)')
}
{
  const v = evaluateReadiness({ ...paidBase, lines: [{ mapped: true, mode: 'BULK', poolAvailable: 2, quantity: 5 }] })
  assert(v.next === 'NEEDS_ATTENTION', 'bulk beyond pool stock → NEEDS_ATTENTION (gate #2)')
}
{
  const v = evaluateReadiness({ ...paidBase, lines: [{ mapped: true, mode: 'BULK', poolAvailable: 5, quantity: 5 }] })
  assert(v.next === 'READY', 'bulk exactly covered by pool → READY')
}
{
  const v = evaluateReadiness({ ...paidBase, withinSpendingCap: false })
  assert(v.next === 'ON_HOLD', 'spending cap breach → ON_HOLD (decision #1)')
}
{
  // Severity order: data problems (unmapped) win over enablement holds.
  const v = evaluateReadiness({
    ...paidBase,
    withinSpendingCap: false,
    lines: [{ mapped: false, mode: 'ON_DEMAND', quantity: 1 }],
  })
  assert(v.next === 'NEEDS_ATTENTION', 'unmapped outranks cap breach')
}

// --- manual-confirm training wheels (decision #5: first 10 orders) ---
assert(manualConfirmActive(0, true) === true, 'order #1 always manual')
assert(manualConfirmActive(9, true) === true, 'order #10 still manual')
assert(manualConfirmActive(10, true) === false, 'order #11 auto once creator opted in')
assert(manualConfirmActive(10, false) === true, 'past training but setting=manual → manual')

// --- variant key round-trip ---
{
  const k = variantKey('prod-1', 'flav-2', '12pack')
  assert(k === 'prod-1:flav-2:12pack', 'variantKey composes')
  const p = parseVariantKey(k)!
  assert(p.productId === 'prod-1' && p.flavorPresetId === 'flav-2' && p.packKey === '12pack', 'parseVariantKey round-trips')
}
{
  const p = parseVariantKey(variantKey('prod-9'))!
  assert(p.flavorPresetId === null && p.packKey === null, 'base/unit sentinels parse to null')
  assert(parseVariantKey('garbage') === null, 'malformed key → null')
}

if (failures > 0) {
  console.error(`\n${failures} channel-order golden(s) FAILED`)
  process.exit(1)
} else {
  console.log('\nAll channel-order goldens pass.')
}
