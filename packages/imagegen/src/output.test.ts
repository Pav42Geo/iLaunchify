// Golden self-test for the output-policy engine. Run via:
//   tsc --module commonjs ... output.test.ts && node output.test.js
import {
  resolveOutputPolicy,
  presetsForTier,
  clampOutput,
  applyPreset,
  DEFAULT_OUTPUT_POLICIES,
  type OutputSettings,
  type OutputPreset,
} from './output'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}

const HIGH: OutputSettings = { format: 'AI', dpi: 600, colorProfile: 'CMYK', marks: true, layered: true, watermark: false, variations: 6, batch: true, whiteLabel: true }

export function runOutputSelfTest(): void {
  // 1. Default policies escalate with tier.
  assert(resolveOutputPolicy('maker').maxDpi === 96, 'maker capped at 96 dpi')
  assert(resolveOutputPolicy('builder').maxDpi === 300 && resolveOutputPolicy('builder').allowCmyk, 'builder = 300 dpi + CMYK')
  assert(resolveOutputPolicy('agency').allowLayered && resolveOutputPolicy('agency').allowWhiteLabel, 'agency = layered + white-label')

  // 2. Maker: an ambitious request is fully clamped (format, dpi, CMYK, layered,
  //    batch, white-label all downgraded; watermark forced on).
  const m = clampOutput(HIGH, resolveOutputPolicy('maker'))
  assert(m.settings.format === 'PNG', 'maker format → PNG')
  assert(m.settings.dpi === 96, 'maker dpi → 96')
  assert(m.settings.colorProfile === 'RGB', 'maker → RGB')
  assert(!m.settings.layered && !m.settings.batch && !m.settings.whiteLabel, 'maker strips layered/batch/white-label')
  assert(m.settings.watermark === true, 'maker watermark forced on')
  assert(m.adjustments.length >= 6, 'every downgrade reported')

  // 3. Builder: keeps CMYK + 300 dpi PDF, but layered/batch/white-label stripped,
  //    variations clamped to 4.
  const b = clampOutput(HIGH, resolveOutputPolicy('builder'))
  assert(b.settings.dpi === 300 && b.settings.colorProfile === 'CMYK', 'builder keeps 300/CMYK')
  assert(b.settings.format === 'PDF', 'AI not allowed for builder → PDF default')
  assert(!b.settings.layered && !b.settings.whiteLabel && b.settings.variations === 4, 'builder strips layered/white-label, clamps variations')

  // 4. Agency: the full request survives (only dpi>600 would clamp; 600 is the cap).
  const a = clampOutput(HIGH, resolveOutputPolicy('agency'))
  assert(a.settings.format === 'AI' && a.settings.layered && a.settings.whiteLabel && a.settings.batch, 'agency keeps AI/layered/white-label/batch')
  assert(a.adjustments.length === 0, 'agency: nothing clamped')

  // 5. Admin override loosens a tier (e.g. give builder layered export) — non-mutating.
  const tuned = resolveOutputPolicy('builder', { allowLayered: true })
  assert(tuned.allowLayered && !DEFAULT_OUTPUT_POLICIES.builder.allowLayered, 'override loosens without mutating default')

  // 6. Presets are tier-gated by minTier.
  const presets: OutputPreset[] = [
    { id: 'web', label: 'Web share PNG', minTier: 'maker', settings: { ...resolveOutputPolicy('maker').defaults } },
    { id: 'print', label: 'Print-ready CMYK PDF', minTier: 'builder', settings: { ...resolveOutputPolicy('builder').defaults } },
    { id: 'source', label: 'Editable AI source', minTier: 'agency', settings: { ...resolveOutputPolicy('agency').defaults, format: 'AI' } },
  ]
  assert(presetsForTier('maker', presets).length === 1, 'maker sees only web preset')
  assert(presetsForTier('builder', presets).map((p) => p.id).join(',') === 'web,print', 'builder sees web+print')
  assert(presetsForTier('agency', presets).length === 3, 'agency sees all presets')

  // 7. applyPreset clamps too: the agency "source" preset on a builder policy downgrades.
  const r = applyPreset(presets[2]!, resolveOutputPolicy('builder'))
  assert(r.settings.format !== 'AI', 'agency preset clamped to builder allowed formats')

  // 8. variations floor at 1.
  const zero = clampOutput({ ...HIGH, variations: 0 }, resolveOutputPolicy('agency'))
  assert(zero.settings.variations === 1, 'variations floored at 1')

  console.log('Output golden: PASS')
}

runOutputSelfTest()
