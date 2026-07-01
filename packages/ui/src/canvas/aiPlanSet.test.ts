// Golden self-test for planGenerationSet (coordinated sets, §15). Run via alias harness.
import { planGenerationSet } from './aiPlan'
import { type FrameLayout } from './frames'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}

// A jar: front label (full truth layer) + circular top label (SoI only).
const front: FrameLayout = {
  version: 1,
  frames: [
    { id: 'f-hero', kind: 'IMAGERY', box: { x: 0.05, y: 0.05, w: 0.9, h: 0.4 }, required: false, source: 'PLATFORM' },
    { id: 'f-soi', kind: 'STATEMENT_OF_IDENTITY', box: { x: 0.05, y: 0.5, w: 0.5, h: 0.08 }, required: true, source: 'PLATFORM' },
    { id: 'f-nf', kind: 'NUTRITION_FACTS', box: { x: 0.05, y: 0.6, w: 0.4, h: 0.3 }, required: true, source: 'PLATFORM' },
    { id: 'f-ing', kind: 'INGREDIENTS', box: { x: 0.5, y: 0.6, w: 0.45, h: 0.15 }, required: true, source: 'PLATFORM' },
    { id: 'f-alg', kind: 'ALLERGENS', box: { x: 0.5, y: 0.78, w: 0.45, h: 0.06 }, required: true, source: 'PLATFORM' },
    { id: 'f-mfr', kind: 'MANUFACTURER', box: { x: 0.5, y: 0.86, w: 0.45, h: 0.06 }, required: true, source: 'PLATFORM' },
    { id: 'f-nq', kind: 'NET_QUANTITY', box: { x: 0.05, y: 0.9, w: 0.3, h: 0.06 }, required: true, source: 'PLATFORM' },
  ],
}
const top: FrameLayout = {
  version: 1,
  frames: [
    { id: 't-logo', kind: 'LOGO', box: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 }, required: false, source: 'PLATFORM' },
    { id: 't-soi', kind: 'STATEMENT_OF_IDENTITY', box: { x: 0.2, y: 0.72, w: 0.6, h: 0.1 }, required: true, source: 'PLATFORM' },
  ],
}

export function runAiPlanSetSelfTest(): void {
  const set = planGenerationSet(
    { productDescriptor: 'jar of almond butter', brandName: 'Nutty', domain: 'FOOD', styleTags: ['Warm'] },
    [
      { id: 'front', label: 'Front label', layout: front, surface: { widthMm: 90, heightMm: 60 } },
      { id: 'top', label: 'Top label', layout: top, surface: { widthMm: 70, heightMm: 70 } },
    ],
  )

  // 1. A plan per die-line + a single shared seed → they render as a family.
  assert(set.perDieline.length === 2, 'a plan per die-line')
  assert(typeof set.seed === 'string' && set.seed.length > 0, 'shared seed present')

  // 2. Each die-line's own prompt shares the same brief (brand + subject + tone).
  assert(set.perDieline.every((d) => d.plan.prompt.includes('jar of almond butter')), 'shared subject in every plan')
  assert(set.perDieline.every((d) => /Mood:/.test(d.plan.prompt)), 'domain tone in every plan')

  // 3. PACKAGE-LEVEL compliance: the union of front+top satisfies the pack, even
  //    though the top label alone is missing almost everything.
  assert(set.compliance.complete && set.compliance.coverageScore === 1, 'package-level union is compliant')

  // 4. Determinism.
  const again = planGenerationSet(
    { productDescriptor: 'jar of almond butter', brandName: 'Nutty', domain: 'FOOD', styleTags: ['Warm'] },
    [
      { id: 'front', label: 'Front label', layout: front, surface: { widthMm: 90, heightMm: 60 } },
      { id: 'top', label: 'Top label', layout: top, surface: { widthMm: 70, heightMm: 70 } },
    ],
  )
  assert(again.seed === set.seed, 'deterministic shared seed')

  console.log('AiPlanSet golden: PASS')
}

runAiPlanSetSelfTest()
