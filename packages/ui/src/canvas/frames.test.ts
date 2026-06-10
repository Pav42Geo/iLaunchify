// Dependency-free self-check for the frame resolution core. packages/ui has no
// test runner wired, so this is a plain module (no vitest import) — import and
// call runFrameSelfTest() from a node/tsx context, or port to vitest in an app
// package. The logic is also node-verified during the build.

import {
  resolveLayout,
  requiredFrames,
  resolveMaterialMarks,
  frameApplies,
  DEFAULT_FRAME_LAYOUT,
  FRAME_SCOPE,
  type MaterialSymbol,
  type Frame,
} from './frames'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`frames self-check failed: ${msg}`)
}
function eqArr(a: string[], b: string[], msg: string): void {
  assert(a.length === b.length && a.every((v, i) => v === b[i]), `${msg} — got [${a.join(',')}]`)
}

const lib: MaterialSymbol[] = [
  { id: 's1', slug: 'resin-1-pet', name: 'Resin #1 PET', family: 'RESIN_CODE', applicableSubstrates: [], applicableMaterials: ['pet'], applicableMarkets: ['US'], requirement: 'REQUIRED' },
  { id: 's2', slug: 'how2recycle', name: 'How2Recycle', family: 'RECYCLING_MARK', applicableSubstrates: [], applicableMaterials: [], applicableMarkets: ['US'], requirement: 'OPTIONAL' },
  { id: 's3', slug: 'glass-recycle', name: 'Glass recycling', family: 'RECYCLING_MARK', applicableSubstrates: [], applicableMaterials: ['glass'], applicableMarkets: ['US'], requirement: 'OPTIONAL' },
]
const families = ['RESIN_CODE', 'RECYCLING_MARK']
const plastic = { materialSlug: 'pet', marketCode: 'US', hasCerts: true, hasBarcode: false }
const glass = { materialSlug: 'glass', marketCode: 'US', hasCerts: false, hasBarcode: true }

export function runFrameSelfTest(): void {
  // One die-line, material-driven recycling marks.
  eqArr(resolveMaterialMarks(lib, families, plastic).map((s) => s.slug), ['resin-1-pet', 'how2recycle'], 'plastic marks')
  eqArr(resolveMaterialMarks(lib, families, glass).map((s) => s.slug), ['how2recycle', 'glass-recycle'], 'glass marks')

  // Empty applicability = all materials; market scoping excludes.
  eqArr(resolveMaterialMarks(lib, ['RECYCLING_MARK'], { materialSlug: 'aluminum', marketCode: 'US' }).map((s) => s.slug), ['how2recycle'], 'aluminum')
  assert(resolveMaterialMarks(lib, families, { materialSlug: 'pet', marketCode: 'CA' }).length === 0, 'market CA excludes')

  // Conditional frames.
  const p = resolveLayout(DEFAULT_FRAME_LAYOUT, plastic).map((r) => r.frame.kind)
  const g = resolveLayout(DEFAULT_FRAME_LAYOUT, glass).map((r) => r.frame.kind)
  assert(p.includes('CERTIFICATIONS') && !p.includes('BARCODE'), 'plastic certs not barcode')
  assert(g.includes('BARCODE') && !g.includes('CERTIFICATIONS'), 'glass barcode not certs')

  // Required = FDA/identity mandatory set.
  eqArr(
    requiredFrames(DEFAULT_FRAME_LAYOUT, plastic).map((r) => r.frame.kind),
    ['STATEMENT_OF_IDENTITY', 'NET_QUANTITY', 'NUTRITION_FACTS', 'INGREDIENTS', 'ALLERGENS', 'MANUFACTURER'],
    'required set',
  )

  // Scope + per-material applicability.
  assert(FRAME_SCOPE.NUTRITION_FACTS === 'RECIPE' && FRAME_SCOPE.RECYCLING_MARK === 'MATERIAL', 'scope map')
  const resinOnly: Frame = { id: 'x', kind: 'RECYCLING_MARK', box: { x: 0, y: 0, w: 0.1, h: 0.1 }, required: false, source: 'PARTNER', appliesTo: { materials: ['pet'] } }
  assert(frameApplies(resinOnly, plastic) && !frameApplies(resinOnly, glass), 'material-conditioned frame')
}
