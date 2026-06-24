// Golden self-test for the AI compositor / structure-lock. Run via:
//   tsc --module commonjs ... aiComposite.test.ts && node aiComposite.test.js
import {
  classifyFrames,
  reservedZoneLabels,
  presentFrameKinds,
  buildPanelMaskSvg,
  compositeDesignSvg,
} from './aiComposite'
import { type FrameLayout } from './frames'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}

// A primary panel with: a hero imagery (CREATIVE), a logo (CREATIVE),
// the Nutrition Facts panel + ingredients (RECIPE = reserved), SoI (IDENTITY = reserved).
const layout: FrameLayout = {
  version: 1,
  frames: [
    { id: 'hero', kind: 'IMAGERY', box: { x: 0.05, y: 0.05, w: 0.9, h: 0.4 }, required: false, source: 'PLATFORM' },
    { id: 'logo', kind: 'LOGO', box: { x: 0.35, y: 0.5, w: 0.3, h: 0.12 }, required: false, source: 'PLATFORM' },
    { id: 'nf', kind: 'NUTRITION_FACTS', box: { x: 0.05, y: 0.65, w: 0.4, h: 0.3 }, required: true, source: 'PLATFORM' },
    { id: 'ing', kind: 'INGREDIENTS', box: { x: 0.5, y: 0.65, w: 0.45, h: 0.2 }, required: true, source: 'PLATFORM' },
    { id: 'soi', kind: 'STATEMENT_OF_IDENTITY', box: { x: 0.05, y: 0.5, w: 0.25, h: 0.1 }, required: true, source: 'PLATFORM' },
  ],
}
const surface = { widthMm: 100, heightMm: 150 }

export function runAiCompositeSelfTest(): void {
  // 1. Classification: CREATIVE-scope = paintable, all else reserved.
  const { creative, reserved } = classifyFrames(layout)
  assert(creative.map((f) => f.id).sort().join(',') === 'hero,logo', 'creative = hero+logo')
  assert(reserved.map((f) => f.id).sort().join(',') === 'ing,nf,soi', 'reserved = nf+ing+soi')

  // 2. Reserved zone labels (deduped, human) feed the negative prompt.
  const labels = reservedZoneLabels(layout)
  assert(labels.length === 3, 'three reserved labels')
  assert(labels.every((l) => typeof l === 'string' && l.length > 0), 'labels non-empty')

  // 3. presentFrameKinds → compliance bridge input.
  const kinds = presentFrameKinds(layout)
  for (const k of ['NUTRITION_FACTS', 'INGREDIENTS', 'STATEMENT_OF_IDENTITY']) {
    assert(kinds.includes(k as never), `present kinds includes ${k}`)
  }

  // 4. Mask: white bg + one black keep-clear rect per reserved frame (3), none for creative.
  const mask = buildPanelMaskSvg(layout, surface)
  const blackRects = (mask.match(/fill="#000000"/g) ?? []).length
  assert(blackRects === 3, `mask has 3 black keep-clear rects (got ${blackRects})`)
  assert(mask.includes('fill="#FFFFFF"'), 'mask has white paintable bg')
  assert(mask.includes('viewBox="0 0 100 150"'), 'mask sized to surface mm')

  // 5. Composite placeholders: AI ART tiles for CREATIVE, dashed truth boxes for reserved.
  const ph = compositeDesignSvg({ layout, surface })
  assert((ph.match(/AI ART/g) ?? []).length === 2, 'two AI ART placeholder tiles')
  assert(ph.includes('stroke-dasharray'), 'reserved drawn as dashed keep-clear')
  assert(ph.includes('aiArtHatch'), 'hatch pattern defined')

  // 6. Composite with real art for one CREATIVE frame → <image>, the other stays placeholder.
  const real = compositeDesignSvg({ layout, surface, artByFrameId: { hero: 'https://cdn/x.png' } })
  assert(real.includes('<image') && real.includes('https://cdn/x.png'), 'real art rendered as image')
  assert((real.match(/AI ART/g) ?? []).length === 1, 'only logo remains placeholder')

  // 7. Composite with a real truth fragment for the NF frame → wrapped sub-svg, not dashed box.
  const truth = compositeDesignSvg({
    layout,
    surface,
    reservedRender: (f) => (f.id === 'nf' ? '<rect width="100%" height="100%" fill="#fff"/><text>NF</text>' : null),
  })
  assert(truth.includes('>NF<'), 'real truth fragment injected')

  console.log('AiComposite golden: PASS')
}

runAiCompositeSelfTest()
