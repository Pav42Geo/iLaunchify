/**
 * Golden checks for shuffleColorMap (§7.1 Shuffle). Pure — run via:
 *   npx tsc --module commonjs --target es2020 --moduleResolution node --strict \
 *     --outDir /tmp/rc packages/ui/src/color/*.ts
 *   node /tmp/rc/recolor.test.js
 */
import { shuffleColorMap } from './recolor'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1
    console.error('  ✗ ' + msg)
  } else {
    console.log('  ✓ ' + msg)
  }
}

const src = ['#aa0000', '#00bb00', '#0000cc']
const pal = ['#111111', '#222222', '#333333', '#444444']

// deterministic rng
let s = 0.1
const rng = () => {
  s = (s * 7 + 0.13) % 1
  return s
}

const m1 = shuffleColorMap(src, pal, { rng })
assert(Object.keys(m1).length === 3, 'maps all 3 source colors')
assert(Object.values(m1).every((v) => pal.includes(v)), 'every target comes from the palette')

// map keys are normalized (uppercase) by the engine
const m2 = shuffleColorMap(src, pal, { rng, locked: { '#aa0000': '#999999' } })
assert(m2['#AA0000'] === '#999999', 'locked source color preserved verbatim')
assert(pal.map((p) => p.toUpperCase()).includes(m2['#00BB00'] as string), 'unlocked colors still get palette targets')

assert(Object.keys(shuffleColorMap(src, [])).length === 0, 'empty palette → {}')

// palette cycles when fewer stops than source colors
const fourSrc = ['#aa0000', '#00bb00', '#0000cc', '#cccccc']
const two = shuffleColorMap(fourSrc, ['#000000', '#ffffff'], { rng })
assert(Object.keys(two).length === 4, 'palette cycles to cover all source colors')

console.log(failures === 0 ? '\nALL SHUFFLE CHECKS PASSED' : `\n${failures} FAILED`)
if (failures > 0) process.exit(1)
