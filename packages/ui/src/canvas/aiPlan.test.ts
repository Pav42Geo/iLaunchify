// Golden self-test for planGeneration (P2 orchestration). Run via:
//   tsc --module commonjs ... aiPlan.test.ts && node aiPlan.test.js
import { planGeneration } from './aiPlan'
import { type FrameLayout } from './frames'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}

const layout: FrameLayout = {
  version: 1,
  frames: [
    { id: 'hero', kind: 'IMAGERY', box: { x: 0.05, y: 0.05, w: 0.9, h: 0.4 }, required: false, source: 'PLATFORM' },
    { id: 'nf', kind: 'NUTRITION_FACTS', box: { x: 0.05, y: 0.65, w: 0.4, h: 0.3 }, required: true, source: 'PLATFORM' },
    { id: 'soi', kind: 'STATEMENT_OF_IDENTITY', box: { x: 0.05, y: 0.5, w: 0.25, h: 0.1 }, required: true, source: 'PLATFORM' },
    { id: 'netq', kind: 'NET_QUANTITY', box: { x: 0.7, y: 0.9, w: 0.2, h: 0.06 }, required: true, source: 'PLATFORM' },
  ],
}

export function runAiPlanSelfTest(): void {
  const plan = planGeneration({
    productDescriptor: 'box of stroopwafel cookies',
    brandName: 'Mood Cookies',
    styleTags: ['Warm', 'Minimal'],
    brandPalette: ['#FF2E63'],
    substrateLabel: 'kraft carton',
    layout,
    surface: { widthMm: 100, heightMm: 150 },
    domain: 'FOOD',
  })

  // 1. Prompt assembled with subject; negative names the reserved zones from frames.
  assert(plan.prompt.includes('box of stroopwafel cookies'), 'prompt has subject')
  assert(plan.negativePrompt.includes('Nutrition Facts panel') || /Nutrition Facts/.test(plan.negativePrompt), 'neg names NF zone')
  assert(plan.reservedLabels.length === 3, 'three reserved labels (NF+SoI+NetQty)')

  // 2. Mask: one keep-clear rect per reserved frame (3), white bg.
  assert((plan.maskSvg.match(/fill="#000000"/g) ?? []).length === 3, 'mask = 3 keep-clear rects')

  // 3. Preview: the one CREATIVE frame gets a placeholder tile.
  assert((plan.previewSvg.match(/AI ART/g) ?? []).length === 1, 'one AI ART placeholder')

  // 4. Compliance reflects the frames: NF+SoI+NetQty present, but ingredients/allergens/
  //    manufacturer missing → incomplete, gates export.
  assert(!plan.compliance.complete, 'incomplete — missing ingredients/allergens/manufacturer')
  assert(plan.compliance.missingRequired.some((e) => e.kind === 'INGREDIENTS'), 'flags missing ingredients')
  assert(plan.compliance.satisfiedRequired.some((e) => e.kind === 'NUTRITION_FACTS'), 'NF counted satisfied via bridge')

  // 5. Add the missing frames → complete.
  const full = planGeneration({
    productDescriptor: 'box of cookies',
    layout: { version: 1, frames: [
      ...layout.frames,
      { id: 'ing', kind: 'INGREDIENTS', box: { x: 0.5, y: 0.65, w: 0.4, h: 0.2 }, required: true, source: 'PLATFORM' },
      { id: 'alg', kind: 'ALLERGENS', box: { x: 0.5, y: 0.86, w: 0.4, h: 0.08 }, required: true, source: 'PLATFORM' },
      { id: 'mfr', kind: 'MANUFACTURER', box: { x: 0.05, y: 0.92, w: 0.5, h: 0.06 }, required: true, source: 'PLATFORM' },
    ] },
    surface: { widthMm: 100, heightMm: 150 },
    domain: 'FOOD',
  })
  assert(full.compliance.complete && full.compliance.coverageScore === 1, 'all required frames → compliant, export-ready')

  // 6. Determinism.
  const again = planGeneration({ productDescriptor: 'box of stroopwafel cookies', brandName: 'Mood Cookies', styleTags: ['Warm', 'Minimal'], brandPalette: ['#FF2E63'], substrateLabel: 'kraft carton', layout, surface: { widthMm: 100, heightMm: 150 }, domain: 'FOOD' })
  assert(again.prompt === plan.prompt && again.maskSvg === plan.maskSvg, 'deterministic plan')

  console.log('AiPlan golden: PASS')
}

runAiPlanSelfTest()
