/**
 * Golden checks for the pack-aware variety-pack engine (docs/VARIETY_PACK_MODEL.md).
 * Self-contained (no `vitest` import — matches template-match.test.ts so the ui
 * package typechecks without a vitest dep). Run directly:
 *   npx tsc --module commonjs --target es2020 --outDir /tmp/pm \
 *     packages/ui/src/lib/pack-model.ts packages/ui/src/lib/pack-model.test.ts
 *   node /tmp/pm/pack-model.test.js
 * Also executed by scripts/run-vitest-suites.mjs.
 */
import {
  evenFill,
  composePack,
  packPriceCents,
  orderTotalCents,
  orderTotalUnits,
  packSummary,
  type FlavorRules,
  type PoolFlavor,
  type PackSlot,
} from './pack-model'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1
    console.error('  ✗ ' + msg)
  } else {
    console.log('  ✓ ' + msg)
  }
}
function eq<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

const EVEN: FlavorRules = { minFlavorsPerPack: 1, maxFlavorsPerPack: 3, fillRule: 'EVEN_AUTO' }
const CHOOSE: FlavorRules = { minFlavorsPerPack: 1, maxFlavorsPerPack: 3, fillRule: 'CREATOR_CHOOSES' }
const ids = (n: string[]) => n.map((flavorPresetId) => ({ flavorPresetId }))

// --- evenFill ---
assert(eq(evenFill(24, 3), [8, 8, 8]), 'evenFill 24/3 → 8,8,8')
assert(eq(evenFill(10, 3), [4, 3, 3]), 'evenFill 10/3 → 4,3,3 (remainder front-loaded)')
assert(eq(evenFill(18, 4), [5, 5, 4, 4]), 'evenFill 18/4 → 5,5,4,4')
assert(eq(evenFill(24, 1), [24]), 'evenFill 24/1 → 24')
assert(eq(evenFill(24, 0), []), 'evenFill n=0 → []')

// --- composePack EVEN_AUTO ---
const c24 = composePack({ unitsPerPack: 24 }, ids(['a', 'b', 'c']), EVEN)
assert(c24.ok && eq(c24.slots.map((s) => s.units), [8, 8, 8]) && c24.totalUnits === 24, '24-pack, 3 flavors → 8/8/8, ok')
assert(c24.distinctCount === 3, '24-pack distinct count = 3')
const c10 = composePack({ unitsPerPack: 10 }, ids(['a', 'b', 'c']), EVEN)
assert(c10.ok && eq(c10.slots.map((s) => s.units), [4, 3, 3]), '10-pack, 3 flavors → 4/3/3')
const c3 = composePack({ unitsPerPack: 3 }, ids(['a', 'b']), EVEN)
assert(c3.ok && eq(c3.slots.map((s) => s.units), [2, 1]) && c3.totalUnits === 3, '3-pack, 2 flavors → 2/1 (one repeats)')

// --- constraints ---
assert(composePack({ unitsPerPack: 24 }, [], EVEN).errors.some((e) => e.code === 'EMPTY'), 'empty → EMPTY')
assert(
  composePack({ unitsPerPack: 24 }, ids(['a']), { minFlavorsPerPack: 2, maxFlavorsPerPack: 3, fillRule: 'EVEN_AUTO' }).errors.some((e) => e.code === 'TOO_FEW_FLAVORS'),
  'below min → TOO_FEW_FLAVORS',
)
assert(composePack({ unitsPerPack: 24 }, ids(['a', 'b', 'c', 'd']), EVEN).errors.some((e) => e.code === 'TOO_MANY_FLAVORS'), 'above max → TOO_MANY_FLAVORS')
assert(composePack({ unitsPerPack: 24 }, ids(['a', 'a']), EVEN).errors.some((e) => e.code === 'DUPLICATE'), 'duplicate → DUPLICATE')
assert(
  composePack({ unitsPerPack: 2 }, ids(['a', 'b', 'c']), { minFlavorsPerPack: 1, maxFlavorsPerPack: 10, fillRule: 'EVEN_AUTO' }).errors.some((e) => e.code === 'TOO_MANY_FOR_PACK'),
  'distinct > units → TOO_MANY_FOR_PACK',
)

// --- CREATOR_CHOOSES ---
const cc = composePack({ unitsPerPack: 3 }, [{ flavorPresetId: 'a', units: 2 }, { flavorPresetId: 'b', units: 1 }], CHOOSE)
assert(cc.ok && eq(cc.slots.map((s) => s.units), [2, 1]), 'CREATOR_CHOOSES 3-pack [2,1] → ok')
assert(
  composePack({ unitsPerPack: 3 }, [{ flavorPresetId: 'a', units: 1 }, { flavorPresetId: 'b', units: 1 }], CHOOSE).errors.some((e) => e.code === 'UNITS_MISMATCH'),
  'CREATOR_CHOOSES counts ≠ capacity → UNITS_MISMATCH',
)
assert(
  composePack({ unitsPerPack: 3 }, [{ flavorPresetId: 'a', units: 3 }, { flavorPresetId: 'b', units: 0 }], CHOOSE).errors.some((e) => e.code === 'NON_POSITIVE'),
  'CREATOR_CHOOSES zero-unit pick → NON_POSITIVE',
)

// --- pricing ---
const pool: PoolFlavor[] = [
  { flavorPresetId: 'a', unitPriceCents: 180 },
  { flavorPresetId: 'b', unitPriceCents: 200 },
]
const slots: PackSlot[] = [{ flavorPresetId: 'a', units: 2 }, { flavorPresetId: 'b', units: 1 }]
assert(packPriceCents('PER_FLAVOR', {}, slots, pool) === 560, 'PER_FLAVOR pack price = 2×180 + 1×200 = 560')
assert(packPriceCents('PER_PACK', { pricePerPackCents: 1200 }, slots, pool) === 1200, 'PER_PACK uses flat per-size price = 1200')
assert(orderTotalCents(560, 10) === 5600, 'order total 560 × 10 packs = 5600')
assert(orderTotalCents(1200, 10) === 12000, 'order total 1200 × 10 packs = 12000')
assert(orderTotalUnits(24, 10) === 240, 'order total units 24 × 10 = 240')

// --- summary ---
assert(packSummary(3, 24, 10) === '3 flavors in a 24-pack · 10 packs = 240 units', 'summary 3/24/10')
assert(packSummary(1, 6, 1, '6-pack box') === '1 flavor in a 6-pack box · 1 pack = 6 units', 'summary singular + custom label')

console.log(failures === 0 ? '\nALL PACK-MODEL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
if (failures > 0) process.exit(1)
