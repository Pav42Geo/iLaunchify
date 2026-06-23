/**
 * Golden checks for the template matching engine. Pure — run via:
 *   npx tsc --module commonjs --target es2020 --outDir /tmp/tm \
 *     packages/ui/src/lib/template-match.ts packages/ui/src/lib/template-match.test.ts
 *   node /tmp/tm/template-match.test.js
 */
import {
  aspectBucketFor,
  matchTemplatesToProduct,
  type MatchableTemplate,
  type ProductComponentDieline,
} from './template-match'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1
    console.error('  ✗ ' + msg)
  } else {
    console.log('  ✓ ' + msg)
  }
}

// --- aspect buckets ---
assert(aspectBucketFor(200, 60) === 'WRAP', 'wide can wrap → WRAP')
assert(aspectBucketFor(120, 70) === 'PANEL_WIDE', '1.7:1 → PANEL_WIDE')
assert(aspectBucketFor(100, 100) === 'PANEL_SQUARE', 'square → PANEL_SQUARE')
assert(aspectBucketFor(60, 120) === 'PANEL_TALL', 'tall panel → PANEL_TALL')
assert(aspectBucketFor(20, 180) === 'LONG_STRIP', 'stick pack → LONG_STRIP')
assert(aspectBucketFor(null, 100) === null, 'missing width → null bucket')

// --- matching, grouped by component then primary style ---
const canComponent: ProductComponentDieline = {
  componentId: 'c-can',
  label: 'Can label',
  packagingTypeId: 'pt-can-355',
  containerCategory: 'CAN',
  widthMm: 200,
  heightMm: 60, // → WRAP
}
const cartonComponent: ProductComponentDieline = {
  componentId: 'c-carton',
  label: '6-pack carton',
  packagingTypeId: 'pt-carton-6',
  containerCategory: 'CARTON',
  widthMm: 180,
  heightMm: 120, // → PANEL_WIDE
}

const t = (over: Partial<MatchableTemplate>): MatchableTemplate => ({
  id: 'x',
  name: 'X',
  thumbnailUrl: null,
  isPremium: false,
  domain: 'FOOD',
  matchMode: 'SHAPE_FAMILY',
  packagingTypeId: null,
  targetContainerCategory: null,
  aspectBucket: null,
  primaryStyleId: null,
  primaryStyleLabel: null,
  ...over,
})

const templates: MatchableTemplate[] = [
  // exact can wrap, Bold style
  t({ id: 'exact-can', name: 'Exact Can', matchMode: 'EXACT', packagingTypeId: 'pt-can-355', primaryStyleId: 's-bold', primaryStyleLabel: 'Bold / Street' }),
  // shape-family CAN + WRAP, Bold style (premium)
  t({ id: 'fam-can', name: 'Family Can', isPremium: true, targetContainerCategory: 'CAN', aspectBucket: 'WRAP', primaryStyleId: 's-bold', primaryStyleLabel: 'Bold / Street' }),
  // shape-family CAN + WRAP, Minimal style
  t({ id: 'fam-can-min', name: 'Minimal Can', targetContainerCategory: 'CAN', aspectBucket: 'WRAP', primaryStyleId: 's-min', primaryStyleLabel: 'Modern-Minimal' }),
  // shape-family JAR — should NOT match a can
  t({ id: 'fam-jar', name: 'Jar', targetContainerCategory: 'JAR', aspectBucket: 'PANEL_SQUARE', primaryStyleId: 's-min', primaryStyleLabel: 'Modern-Minimal' }),
  // shape-family CARTON + PANEL_WIDE, no style → carton, Other group
  t({ id: 'fam-carton', name: 'Carton', targetContainerCategory: 'CARTON', aspectBucket: 'PANEL_WIDE' }),
  // wrong domain — dropped
  t({ id: 'pet-can', name: 'Pet Can', domain: 'PET_PRODUCT', targetContainerCategory: 'CAN', aspectBucket: 'WRAP' }),
]

const sections = matchTemplatesToProduct([canComponent, cartonComponent], 'FOOD', templates)

assert(sections.length === 2, 'one section per component')

const can = sections[0]!
assert(can.componentId === 'c-can' && can.aspectBucket === 'WRAP', 'can section bucket WRAP')
const canIds = can.groups.flatMap((g) => g.templates.map((x) => x.id))
assert(canIds.includes('exact-can') && canIds.includes('fam-can') && canIds.includes('fam-can-min'), 'can matches its 3 can templates')
assert(!canIds.includes('fam-jar'), 'jar excluded from can section')
assert(!canIds.includes('pet-can'), 'wrong-domain template dropped')

// Bold group: exact-can (exact) first, then fam-can (premium)
const bold = can.groups.find((g) => g.styleId === 's-bold')!
assert(bold.templates[0]!.id === 'exact-can', 'exact template sorts first in its style group')
assert(bold.templates[1]!.id === 'fam-can', 'premium family template second')

// groups sorted alphabetically by label (Bold / Street before Modern-Minimal)
assert(can.groups[0]!.styleLabel === 'Bold / Street', 'style groups alphabetical')

const carton = sections[1]!
const cartonIds = carton.groups.flatMap((g) => g.templates.map((x) => x.id))
assert(cartonIds.length === 1 && cartonIds[0] === 'fam-carton', 'carton matches only the carton template')
assert(carton.groups[0]!.styleId === null && carton.groups[0]!.styleLabel === 'Other', 'styleless template → Other group')

console.log(failures === 0 ? '\nALL TEMPLATE-MATCH CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
if (failures > 0) process.exit(1)
