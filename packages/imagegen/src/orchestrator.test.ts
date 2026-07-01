/**
 * Golden checks for the generation orchestrator + provider resolution. Pure — run via:
 *   npx tsc --module commonjs --target es2020 --outDir /tmp/og \
 *     packages/imagegen/src/metering.ts packages/imagegen/src/provider.ts \
 *     packages/imagegen/src/adapters/stub.ts packages/imagegen/src/adapters/fal.ts \
 *     packages/imagegen/src/adapters/recraft.ts packages/imagegen/src/resolve.ts \
 *     packages/imagegen/src/orchestrator.ts packages/imagegen/src/orchestrator.test.ts
 *   node /tmp/og/orchestrator.test.js
 */
import { tierLimits } from './metering'
import { resolveImageGenProvider } from './resolve'
import { runDraftGeneration, runFinalizeGeneration } from './orchestrator'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1
    console.error('  ✗ ' + msg)
  } else {
    console.log('  ✓ ' + msg)
  }
}

async function main() {
  // Keyless env → fully stub, but still runs.
  const stubProv = resolveImageGenProvider({})
  assert(stubProv.fullyReal === false, 'no keys → not fullyReal')
  assert(stubProv.backing.raster === 'stub-deterministic', 'no FAL_KEY → raster is stub')

  // With both keys present → fully real backing (no network called here).
  const realProv = resolveImageGenProvider({ FAL_KEY: 'x', RECRAFT_API_KEY: 'y' })
  assert(realProv.fullyReal === true, 'both keys → fullyReal')
  assert(realProv.backing.raster === 'fal-flux' && realProv.backing.vectorType === 'recraft-vector', 'real backing ids')

  const builder = tierLimits('builder')

  // Draft within budget → 4 concepts + 1 cycle debit.
  const draft = await runDraftGeneration({
    provider: stubProv,
    limits: builder,
    usedCycles: 0,
    request: { prompt: 'bold cookie box', negativePrompt: '', widthPx: 1024, heightPx: 1024, n: 4 },
  })
  assert(draft.ok && draft.images.length === 4, 'draft returns 4 concepts')
  assert(draft.debit.draftCycles === 1, 'draft debits one cycle')
  assert(!!draft.images[0]!.svg, 'stub concept carries placeholder svg')

  // Draft over budget → blocked, no debit.
  const blocked = await runDraftGeneration({
    provider: stubProv,
    limits: builder,
    usedCycles: builder.draftCyclesPerPeriod,
    request: { prompt: 'x', negativePrompt: '', widthPx: 512, heightPx: 512, n: 1 },
  })
  assert(!blocked.ok && blocked.debit.draftCycles === 0, 'exhausted draft budget blocks with no debit')

  // Finalize within budget → upscaled + mp/bytes debit.
  const fin = await runFinalizeGeneration({
    provider: stubProv,
    limits: builder,
    usedMp: 0,
    usedBytes: 0,
    draft: { kind: 'raster', width: 1024, height: 1024, url: 'https://x/img.png' },
    widthMm: 100,
    heightMm: 150,
    dpi: 300,
  })
  assert(fin.ok && !!fin.image, 'finalize returns an image')
  assert(fin.debit.megapixels > 0 && fin.debit.bytes > 0, 'finalize debits mp + bytes')

  // A huge panel is CLAMPED to the tier's max single-render res, not rejected.
  const finClamped = await runFinalizeGeneration({
    provider: stubProv,
    limits: builder,
    usedMp: 0,
    usedBytes: 0,
    draft: { kind: 'raster', width: 1024, height: 1024, url: 'https://x/i.png' },
    widthMm: 1000,
    heightMm: 1000, // ~139 MP → clamps to builder.maxSingleRenderMp
    dpi: 300,
  })
  assert(finClamped.ok && finClamped.debit.megapixels === builder.maxSingleRenderMp, 'huge panel clamps to max single-render MP')

  // Period megapixel budget exhausted → blocked, no debit.
  const finBlocked = await runFinalizeGeneration({
    provider: stubProv,
    limits: builder,
    usedMp: builder.finalizeMpBudget,
    usedBytes: 0,
    draft: { kind: 'raster', width: 1024, height: 1024, url: 'https://x/i.png' },
    widthMm: 100,
    heightMm: 150,
    dpi: 300,
  })
  assert(!finBlocked.ok && finBlocked.debit.megapixels === 0, 'exhausted finalize budget blocks with no debit')

  console.log(failures === 0 ? '\nALL ORCHESTRATOR CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  if (failures > 0) process.exit(1)
}

void main()
