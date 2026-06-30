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

// --- effectiveFlavorLead: GLOBAL standard is the floor; flavor can only raise ---
assert(effectiveFlavorLead(8, 21) === 21, 'effectiveFlavorLead override 8 below standard → floored at 21')
assert(effectiveFlavorLead(25, 21) === 25, 'effectiveFlavorLead override above standard raises (25)')
assert(effectiveFlavorLead(null, 21) === 21, 'effectiveFlavorLead null → standard 21')
assert(effectiveFlavorLead(undefined, 21) === 21, 'effectiveFlavorLead undefined → standard 21')
assert(effectiveFlavorLead(0, 21) === 21, 'effectiveFlavorLead 0 below standard → floored at 21')

// --- effectiveProductLead: max(standard, flavor leads) + changeover ---
assert(effectiveProductLead(21, [], 2) === 21, 'effectiveProductLead no flavors → standard 21')
assert(effectiveProductLead(21, [null], 2) === 21, 'effectiveProductLead single null → standard 21, no changeover')
assert(effectiveProductLead(21, [null, null, null], 2) === 25, 'effectiveProductLead all-null ×3 → 21 + (3-1)*2 = 25')
assert(effectiveProductLead(21, [8, 19, 16], 2) === 25, 'effectiveProductLead all below standard → floor 21 + (3-1)*2 = 25')
assert(effectiveProductLead(21, [8, 19, 16], 0) === 21, 'effectiveProductLead all below standard, no changeover → 21 (global floor)')
assert(effectiveProductLead(21, [8, 30, 16], 0) === 30, 'effectiveProductLead one flavor extends above standard → 30')
assert(effectiveProductLead(21, [null, 8], 2) === 23, 'effectiveProductLead floored at standard: max(21,8)=21 + (2-1)*2 = 23')
assert(effectiveProductLead(21, [30], 2) === 30, 'effectiveProductLead single flavor above standard adds no changeover → 30')

// --- leadConflictWarning: note flavors BELOW the global floor (ignored) ---
assert(
  leadConflictWarning(21, [8, 19, 16]) ===
    "3 flavors below the standard lead (21d) — the standard governs, so those values won't shorten production.",
  'leadConflictWarning lists all-below-standard flavors',
)
assert(
  leadConflictWarning(21, [8, 25, 16]) ===
    "2 flavors below the standard lead (21d) — the standard governs, so those values won't shorten production.",
  'leadConflictWarning counts only the below-standard flavors',
)
assert(
  leadConflictWarning(21, [8, 21, 25]) ===
    "1 flavor below the standard lead (21d) — the standard governs, so that value won't shorten production.",
  'leadConflictWarning singular for one below-standard flavor',
)
assert(leadConflictWarning(21, [null, 25, 21]) === null, 'leadConflictWarning null when no flavor is below standard')
assert(leadConflictWarning(21, []) === null, 'leadConflictWarning null with no flavors')

console.log(failures === 0 ? '\nALL LEAD CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
if (failures > 0) process.exit(1)
