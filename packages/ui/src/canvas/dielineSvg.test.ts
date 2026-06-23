// Dependency-free self-check for the normalized die-line SVG generator. Like
// frames.test.ts, packages/ui has no test runner wired — import and call
// runDielineSvgSelfTest() from a node/tsx context. Node-verified during build.

import { dielineSvgFromSpec } from './dielineSvg'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`dielineSvg self-check failed: ${msg}`)
}

export function runDielineSvgSelfTest(): void {
  // Basic 80×120 trim with 3mm bleed → total 86×126, derived 3mm safe inset.
  const svg = dielineSvgFromSpec({ widthMm: 80, heightMm: 120, bleedMm: 3, safeAreaMm: 3 })

  assert(svg.startsWith('<svg'), 'returns an svg document')
  assert(svg.includes('width="86.00mm"') && svg.includes('height="126.00mm"'), 'total = trim + 2·bleed')
  assert(svg.includes('viewBox="0 0 86.00 126.00"'), 'viewBox matches total size')
  // White substrate covers full bleed area.
  assert(svg.includes('width="86.00" height="126.00" fill="#FFFFFF"'), 'white substrate background')
  // Trim line in cyan at the bleed inset (x=3,y=3,w=80,h=120).
  assert(svg.includes('x="3.00" y="3.00" width="80.00" height="120.00"') && svg.includes('#00AEEF'), 'cyan trim at bleed inset')
  // Safe area green, inset a further 3mm (x=6,y=6,w=74,h=114).
  assert(svg.includes('x="6.00" y="6.00" width="74.00" height="114.00"') && svg.includes('#34A853'), 'green safe area')
  // Bleed boundary is dashed gray.
  assert(svg.includes('#9AA0A6') && svg.includes('stroke-dasharray'), 'dashed bleed boundary')

  // Fold lines: valley = magenta, mountain = red, perforation = dashed orange.
  const folded = dielineSvgFromSpec({
    widthMm: 50,
    heightMm: 50,
    bleedMm: 2,
    foldLines: [
      { x1: 0, y1: 25, x2: 50, y2: 25, type: 'VALLEY' },
      { x1: 25, y1: 0, x2: 25, y2: 50, type: 'MOUNTAIN' },
      { x1: 0, y1: 10, x2: 50, y2: 10, type: 'PERFORATION' },
    ],
  })
  assert(folded.includes('#D6219B'), 'valley fold magenta')
  assert(folded.includes('#EA4335'), 'mountain fold red')
  assert(folded.includes('#F29900'), 'perforation orange')

  // Multi-surface: each surface trim is drawn + labelled.
  const multi = dielineSvgFromSpec({
    widthMm: 100,
    heightMm: 40,
    bleedMm: 3,
    surfaces: [
      { name: 'front', trimBox: { x: 3, y: 3, w: 48, h: 40 } },
      { name: 'back', trimBox: { x: 53, y: 3, w: 48, h: 40 } },
    ],
  })
  assert(multi.includes('>front<') && multi.includes('>back<'), 'surface labels rendered')

  // Degenerate input → minimal valid SVG, never throws.
  const empty = dielineSvgFromSpec({ widthMm: 0, heightMm: 0 })
  assert(empty.startsWith('<svg') && empty.includes('viewBox="0 0 1 1"'), 'degenerate → minimal svg')

  // XML-escapes surface names (no raw injection).
  const escaped = dielineSvgFromSpec({
    widthMm: 20,
    heightMm: 20,
    surfaces: [{ name: '<b>&"x"', trimBox: { x: 0, y: 0, w: 20, h: 20 } }],
  })
  assert(escaped.includes('&lt;b&gt;&amp;') && !escaped.includes('<b>&"x"'), 'surface name escaped')
}
