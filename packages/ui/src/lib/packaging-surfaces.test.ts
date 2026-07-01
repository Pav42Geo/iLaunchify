/**
 * Golden checks for the packaging-surfaces resolver. Pure — run via:
 *   npx tsc --module commonjs --target es2020 --outDir /tmp/ps \
 *     packages/ui/src/lib/packaging-surfaces.ts packages/ui/src/lib/packaging-surfaces.test.ts
 *   node /tmp/ps/packaging-surfaces.test.js
 */
import {
  resolvePackagingSurfaces,
  serializePackagingSurfaces,
  decorableSurfaces,
  surfaceForDieline,
  unboundSurfaces,
} from './packaging-surfaces'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1
    console.error('  ✗ ' + msg)
  } else {
    console.log('  ✓ ' + msg)
  }
}
function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// --- junk → [] ---
assert(eq(resolvePackagingSurfaces(null), []), 'null → []')
assert(eq(resolvePackagingSurfaces({}), []), 'object → []')
assert(eq(resolvePackagingSurfaces([1, 'x', null]), []), 'junk array → []')

// --- legacy [{name, defaultBleedMm}] ---
const legacy = resolvePackagingSurfaces([{ name: 'Body wrap', defaultBleedMm: 3 }, { name: 'Lid top' }])
assert(legacy.length === 2, 'legacy → 2 surfaces')
assert(legacy[0]!.key === 'body-wrap' && legacy[0]!.label === 'Body wrap', 'legacy name → key + label')
assert(legacy[0]!.role === 'CONTAINER' && legacy[0]!.decorable === true, 'legacy defaults role/decorable')
assert(legacy[1]!.defaultBleedMm === 3, 'legacy missing bleed → default 3')

// --- enriched shape ---
const [s] = resolvePackagingSurfaces([
  {
    key: 'lid_top',
    label: 'Lid top',
    role: 'CLOSURE',
    surfacePurpose: 'info',
    part: 'lid',
    decorable: true,
    defaultBleedMm: 2,
    hotspot: { meshName: 'lid_top', uvRect: { x: 0, y: 0, w: 1, h: 1 }, anchor: { x: 0, y: 1.1, z: 0 } },
    dielineIds: ['dl_1', 'dl_2'],
    sortOrder: 5,
  },
])
assert(s!.role === 'CLOSURE' && s!.surfacePurpose === 'info' && s!.part === 'lid', 'enriched role/purpose/part')
assert(eq(s!.dielineIds, ['dl_1', 'dl_2']), 'enriched dielineIds')
assert(s!.hotspot?.meshName === 'lid_top', 'enriched hotspot meshName')
assert(eq(s!.hotspot?.uvRect, { x: 0, y: 0, w: 1, h: 1 }), 'enriched hotspot uvRect')

// --- legacy surfaceRole → surfacePurpose ---
assert(resolvePackagingSurfaces([{ name: 'Front', surfaceRole: 'pdp' }])[0]!.surfacePurpose === 'pdp', 'surfaceRole → surfacePurpose')

// --- de-dup keys + sort by sortOrder ---
const dup = resolvePackagingSurfaces([{ key: 'wrap', label: 'B', sortOrder: 2 }, { key: 'wrap', label: 'A', sortOrder: 1 }])
assert(eq(dup.map((x) => x.key), ['wrap-1', 'wrap']), 'duplicate keys disambiguated')
assert(eq(dup.map((x) => x.label), ['A', 'B']), 'sorted by sortOrder')

// --- round-trip ---
const base = resolvePackagingSurfaces([{ key: 'wrap', label: 'Body wrap', role: 'CONTAINER', surfacePurpose: 'pdp', decorable: true, defaultBleedMm: 3, dielineIds: ['dl_1'], sortOrder: 0 }])
assert(eq(resolvePackagingSurfaces(serializePackagingSurfaces(base)), base), 'serialize → resolve round-trips')

// --- helpers ---
const set = resolvePackagingSurfaces([
  { key: 'wrap', label: 'Wrap', decorable: true, dielineIds: ['dl_1'], sortOrder: 0 },
  { key: 'base', label: 'Base', decorable: false, dielineIds: [], sortOrder: 1 },
  { key: 'lid', label: 'Lid', decorable: true, dielineIds: [], sortOrder: 2 },
])
assert(eq(decorableSurfaces(set).map((x) => x.key), ['wrap', 'lid']), 'decorableSurfaces filters non-decorable')
assert(surfaceForDieline(set, 'dl_1')?.key === 'wrap', 'surfaceForDieline finds binding')
assert(surfaceForDieline(set, 'nope') === null, 'surfaceForDieline null when unbound')
assert(eq(unboundSurfaces(set).map((x) => x.key), ['lid']), 'unboundSurfaces = decorable + no die-line')

if (failures > 0) {
  console.error(`\n${failures} packaging-surfaces check(s) failed`)
  process.exit(1)
}
console.log('\nAll packaging-surfaces checks passed')
