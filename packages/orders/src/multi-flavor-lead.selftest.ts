// Node self-test for resolveMultiFlavorLeadDays (no runner needed):
//   npx tsx packages/orders/src/multi-flavor-lead.selftest.ts
// Pure logic — exits non-zero on failure.

import { resolveMultiFlavorLeadDays } from './multi-flavor-lead'

let failures = 0
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++
    // eslint-disable-next-line no-console
    console.error(`✗ ${label}`)
  }
}

// Parallel (default) = the longest single flavor
check('parallel = max', resolveMultiFlavorLeadDays({ flavorBandDays: [14, 21, 18], sequential: false }) === 21)
// Sequential = sum
check('sequential = sum', resolveMultiFlavorLeadDays({ flavorBandDays: [14, 21, 18], sequential: true }) === 53)
// Single flavor: same either way
check('single parallel', resolveMultiFlavorLeadDays({ flavorBandDays: [30], sequential: false }) === 30)
check('single sequential', resolveMultiFlavorLeadDays({ flavorBandDays: [30], sequential: true }) === 30)
// Empty → 0
check('empty → 0', resolveMultiFlavorLeadDays({ flavorBandDays: [], sequential: true }) === 0)
// Junk values filtered (NaN / negative)
check('filters junk', resolveMultiFlavorLeadDays({ flavorBandDays: [NaN, -5, 14], sequential: false }) === 14)

if (failures > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
// eslint-disable-next-line no-console
console.log('✓ multi-flavor-lead: all checks passed')
