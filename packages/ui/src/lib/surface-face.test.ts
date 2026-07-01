// Self-contained test for surface-face binding — tsc + node assert (NO vitest; rollup's
// native binary can't run vitest in the sandbox). Mirrors packaging-surfaces.test.ts.
//   npx tsc --module commonjs --moduleResolution node --target es2020 \
//     --outDir /tmp/sf packages/ui/src/lib/surface-face.ts packages/ui/src/lib/surface-face.test.ts \
//     && node /tmp/sf/surface-face.test.js

import assert from 'node:assert'
import { preferredFace, assignSurfaceFaces } from './surface-face'

let n = 0
const ok = (name: string, fn: () => void) => {
  fn()
  n++
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${name}`)
}

// ---- preferredFace keyword rules ----
ok('front keywords', () => {
  assert.equal(preferredFace({ label: 'Front panel' }), 'front')
  assert.equal(preferredFace({ label: 'PDP' }), 'front')
})
ok('back keywords', () => {
  assert.equal(preferredFace({ label: 'Back' }), 'back')
  assert.equal(preferredFace({ label: 'Nutrition info' }), 'back')
  assert.equal(preferredFace({ label: 'Ingredients' }), 'back')
})
ok('top keywords', () => {
  assert.equal(preferredFace({ label: 'Lid' }), 'top')
  assert.equal(preferredFace({ part: 'cap' }), 'top')
  assert.equal(preferredFace({ label: 'Neck label' }), 'top')
})
ok('bottom keyword', () => assert.equal(preferredFace({ label: 'Base' }), 'bottom'))
ok('left/right keywords', () => {
  assert.equal(preferredFace({ label: 'Left side' }), 'left')
  assert.equal(preferredFace({ label: 'Right side' }), 'right')
})
ok('unmatched → null', () => {
  assert.equal(preferredFace({ label: 'Wrap' }), null)
  assert.equal(preferredFace({}), null)
})
ok('role/part contribute', () => {
  assert.equal(preferredFace({ role: 'CLOSURE' }), 'top') // closure → top
})

// ---- assignSurfaceFaces: distinct, keyword-first, order-independent ----
ok('assigns by keyword regardless of order', () => {
  const out = assignSurfaceFaces([{ label: 'Back' }, { label: 'Front' }, { label: 'Lid' }])
  assert.deepEqual(out, ['back', 'front', 'top'])
})
ok('never repeats a face (collision → next free)', () => {
  const out = assignSurfaceFaces([{ label: 'Front' }, { label: 'Front again' }])
  assert.equal(out[0], 'front')
  assert.notEqual(out[1], 'front')
  assert.equal(new Set(out).size, 2)
})
ok('unmatched surfaces fill in stable order', () => {
  const out = assignSurfaceFaces([{ label: 'Wrap' }, { label: 'Panel' }, { label: 'Sleeve' }])
  assert.deepEqual(out, ['front', 'back', 'top'])
})
ok('mixed matched + unmatched, all distinct', () => {
  const out = assignSurfaceFaces([{ label: 'Lid' }, { label: 'Wrap' }, { label: 'Back' }])
  // Lid→top, Back→back (keyword pass); Wrap fills next free = front.
  assert.deepEqual(out, ['top', 'front', 'back'])
})
ok('seventh surface has no free face', () => {
  const out = assignSurfaceFaces(Array.from({ length: 7 }, (_, i) => ({ label: `s${i}` })))
  assert.equal(out.filter(Boolean).length, 6)
  assert.equal(out[6], undefined)
})

// eslint-disable-next-line no-console
console.log(`\n${n} checks passed.`)
