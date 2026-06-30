/**
 * Golden checks for the per-flavor lead-time resolver (docs/PER_FLAVOR_RECIPES.md
 * §4). Self-contained (no `vitest` import — matches pack-model.test.ts so the ui
 * package typechecks without a vitest dep). Run directly:
 *   npx tsc --module commonjs --target es2020 --outDir /tmp/lead \
 *     packages/ui/src/lib/lead.ts packages/ui/src/lib/pack-composition.ts \
 *     packages/ui/src/lib/lead.test.ts
 *   node /tmp/lead/lead.test.js
 * Also executed by scripts/run-vitest-suites.mjs.
 */
import { effectiveFlavorLead, effectiveProductLead, leadConflictWarning } from './lead'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1
    console.error('  ✗ ' + msg)
  } else {
    console.log('  ✓ ' + msg)
  }
}

// --- effectiveFlavorLead: per-flavor override wins ---
assert(effectiveFlavorLead(8, 21) === 8, 'effectiveFlavorLead override 8 wins over standard 21')
assert(effectiveFlavorLead(25, 21) === 25, 'effectiveFlavorLead override above standard wins (25)')
assert(effectiveFlavorLead(null, 21) === 21, 'effectiveFlavorLead null → standard 21')
assert(effectiveFlavorLead(undefined, 21) === 21, 'effectiveFlavorLead undefined → standard 21')
assert(effectiveFlavorLead(0, 21) === 0, 'effectiveFlavorLead 0 honoured (not treated as missing)')

// --- effectiveProductLead: max across flavors + changeover ---
assert(effectiveProductLead(21, [], 2) === 21, 'effectiveProductLead no flavors → standard 21')
assert(effectiveProductLead(21, [null], 2) === 21, 'effectiveProductLead single null → standard 21, no changeover')
assert(effectiveProductLead(21, [null, null, null], 2) === 25, 'effectiveProductLead all-null ×3 → 21 + (3-1)*2 = 25')
assert(effectiveProductLead(21, [8, 19, 16], 2) === 23, 'effectiveProductLead max(8,19,16)=19 + (3-1)*2 = 23')
assert(effectiveProductLead(21, [8, 19, 16], 0) === 19, 'effectiveProductLead lower-than-standard 21 vs 8/19/16, no changeover → 19')
assert(effectiveProductLead(21, [null, 8], 2) === 23, 'effectiveProductLead un-overridden floors at standard: max(21,8)=21 + (2-1)*2 = 23')
assert(effectiveProductLead(21, [30], 2) === 30, 'effectiveProductLead single overridden flavor adds no changeover → 30')

// --- leadConflictWarning: soft non-blocking warn ---
assert(
  leadConflictWarning(21, [8, 19, 16]) ===
    'Standard lead (21d) exceeds every flavor (max 19d) — the product will quote 19d.',
  'leadConflictWarning triggers when all overridden AND standard > max override',
)
assert(leadConflictWarning(21, [null, 8, 16]) === null, 'leadConflictWarning null when a flavor is un-overridden')
assert(leadConflictWarning(21, [8, 21, 16]) === null, 'leadConflictWarning null when max override equals standard')
assert(leadConflictWarning(21, [8, 25, 16]) === null, 'leadConflictWarning null when max override exceeds standard')
assert(leadConflictWarning(21, []) === null, 'leadConflictWarning null with no flavors')

console.log(failures === 0 ? '\nALL LEAD CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
if (failures > 0) process.exit(1)
