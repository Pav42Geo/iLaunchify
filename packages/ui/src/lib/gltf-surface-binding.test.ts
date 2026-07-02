// Self-contained test for glTF material→surface binding — tsc + node assert (NO vitest).
//   npx tsc --module commonjs --moduleResolution node --target es2020 --esModuleInterop \
//     --outDir /tmp/gsb packages/ui/src/lib/surface-face.ts \
//     packages/ui/src/lib/gltf-surface-binding.ts packages/ui/src/lib/gltf-surface-binding.test.ts \
//     && node /tmp/gsb/gltf-surface-binding.test.js

import assert from 'node:assert'
import { bindGltfMaterialsToSurfaces } from './gltf-surface-binding'

let n = 0
const ok = (name: string, fn: () => void) => {
  fn()
  n++
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${name}`)
}

const surfaces = [
  { key: 'wrap', label: 'Front wrap', part: 'body' },
  { key: 'lid', label: 'Lid', part: 'lid' },
  { key: 'back-panel', label: 'Nutrition back', part: 'body' },
]

ok('exact key match', () => {
  const out = bindGltfMaterialsToSurfaces(['wrap'], surfaces)
  assert.equal(out['wrap'], 'wrap')
})
ok('part substring match', () => {
  const out = bindGltfMaterialsToSurfaces(['lid_material'], surfaces)
  assert.equal(out['lid_material'], 'lid')
})
ok('label substring match', () => {
  const out = bindGltfMaterialsToSurfaces(['Front'], surfaces)
  assert.equal(out['Front'], 'wrap') // "front" ⊂ "front wrap"
})
ok('keyword face fallback (Cap → lid/top surface)', () => {
  const out = bindGltfMaterialsToSurfaces(['Cap'], surfaces)
  // "Cap" → top face; the Lid surface also resolves to top → bound.
  assert.equal(out['Cap'], 'lid')
})
ok('unmatched material → no binding', () => {
  const out = bindGltfMaterialsToSurfaces(['random_mesh_042'], surfaces)
  assert.equal(out['random_mesh_042'], undefined)
})
ok('multiple materials resolve independently', () => {
  const out = bindGltfMaterialsToSurfaces(['wrap', 'Lid', 'Nutrition'], surfaces)
  assert.equal(out['wrap'], 'wrap')
  assert.equal(out['Lid'], 'lid')
  assert.equal(out['Nutrition'], 'back-panel')
})
ok('empty / blank names ignored', () => {
  const out = bindGltfMaterialsToSurfaces(['', '  '], surfaces)
  assert.deepEqual(out, {})
})

// eslint-disable-next-line no-console
console.log(`\n${n} checks passed.`)
