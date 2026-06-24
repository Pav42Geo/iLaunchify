// Golden self-test for the metering engine. Run via:
//   tsc --module commonjs ... metering.test.ts && node metering.test.js
import {
  tierLimits,
  panelMegapixels,
  mmToPixels,
  quoteDraft,
  quoteFinalize,
  canStartDraft,
  canFinalize,
  canStore,
  estimateStoredTemplateBytes,
  DEFAULT_TIER_LIMITS,
} from './metering'
import { providerStatus, PROVIDER_ENV } from './provider'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}
function near(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) <= eps
}

export function runMeteringSelfTest(): void {
  // 1. mm→px at 300 DPI: 120mm = 1417.32 → ceil 1418px.
  assert(mmToPixels(120, 300) === 1418, `120mm@300dpi = 1418px (got ${mmToPixels(120, 300)})`)

  // 2. Panel MP: 120×180mm @300dpi ≈ 1417×2126 ≈ 3.01 MP → billed 4 (ceil).
  const mp = panelMegapixels(120, 180, 300)
  assert(near(mp.rawMp, 3.01, 0.05), `raw ≈3.01 MP (got ${mp.rawMp})`)
  assert(mp.billedMp === 4, `billed = 4 MP ceil (got ${mp.billedMp})`)

  // 3. Draft quote: 4 images × 1 MP × $0.075 = $0.30.
  const b = tierLimits('builder')
  const draft = quoteDraft(b)
  assert(draft.images === 4 && draft.megapixels === 4, 'draft = 4 images / 4 MP')
  assert(near(draft.usdCost, 0.3), `draft ≈ $0.30 (got ${draft.usdCost})`)

  // 4. Finalize caps at the tier max res. Builder max 6 MP; a big carton (300×400mm
  //    ≈ 16.6 MP) is capped to 6, and flagged.
  const small = quoteFinalize(120, 180, b)
  assert(small.megapixels === 4 && !small.cappedToMax, 'small panel finalizes at 4 MP, uncapped')
  const big = quoteFinalize(300, 400, b)
  assert(big.cappedToMax && big.megapixels === 6, `big carton capped to builder max 6 MP (got ${big.megapixels})`)
  // Agency allows up to 16 MP → a 250×350mm carton (~12.2 MP) is NOT capped.
  const a = tierLimits('agency')
  assert(!quoteFinalize(250, 350, a).cappedToMax, 'agency 16 MP cap fits a 250x350 carton')

  // 5. Budgets. Builder: 30 draft cycles, 36 MP finalize, 500 MB storage.
  assert(canStartDraft(29, b).ok && !canStartDraft(30, b).ok, 'draft cycle cap at 30')
  assert(canFinalize(30, 6, b).ok && !canFinalize(34, 6, b).ok, 'finalize MP budget gate at 36')
  const fiveHundredMb = 500 * 1024 * 1024
  assert(canStore(fiveHundredMb - 10 * 1024 * 1024, 5 * 1024 * 1024, b).ok, 'store fits under cap')
  assert(!canStore(fiveHundredMb, 1, b).ok, 'store blocked at cap')

  // 6. Maker is generation-free.
  const m = tierLimits('maker')
  assert(!canStartDraft(0, m).ok && m.storageBytes === 0, 'maker has no generation/storage')

  // 7. Quantity-vs-size tradeoff: same budget, many small OR few big.
  const labelMp = quoteFinalize(60, 90, b).megapixels // small label
  const cartonMp = quoteFinalize(200, 250, b).megapixels // capped big
  assert(labelMp < cartonMp, 'small label costs fewer MP than a big carton from the same budget')

  // 8. Stored bytes estimate is realistic (a 4 MP template ≈ ~14 MB).
  const bytes = estimateStoredTemplateBytes(4)
  assert(bytes > 13 * 1024 * 1024 && bytes < 15 * 1024 * 1024, `4 MP template ≈ 14 MB (got ${Math.round(bytes / 1024 / 1024)} MB)`)

  // 9. Tier overrides don't mutate the defaults.
  const tuned = tierLimits('builder', { finalizeMpBudget: 100 })
  assert(tuned.finalizeMpBudget === 100 && DEFAULT_TIER_LIMITS.builder.finalizeMpBudget === 36, 'override is non-mutating')

  // 10. Provider status from env presence only (no values).
  const none = providerStatus({})
  assert(!none.ready && none.missing.includes(PROVIDER_ENV.raster), 'no keys → not ready, raster missing')
  const ras = providerStatus({ [PROVIDER_ENV.raster]: 'x' })
  assert(ras.ready && !ras.vectorTypeReady, 'raster key → ready, vector still missing')

  console.log('Metering golden: PASS')
}

runMeteringSelfTest()
