// =============================================================================
// AI Packaging Generator — output settings & presets (AI_PACKAGING_GENERATOR §16).
//
// PURE + deterministic. Governs the EXPORT knobs (format, DPI, colour profile,
// dieline marks, editability, watermark, variations, batch, white-label) with a
// three-layer model:
//   1. admin defines the ALLOWED set + defaults + presets per tier (AiGeneratorSettings),
//   2. the creator picks within that,
//   3. the tier gates the HARD caps.
//
// resolveOutputPolicy(tier, overrides?) → the effective allowed-set + defaults.
// clampOutput(requested, policy) → snaps any creator request DOWN to what's allowed,
// so nothing illegal can ever be exported. Never a network/DB/model call.
// =============================================================================

import { type CreatorBillingTier } from './metering'

export type OutputFormat = 'PNG' | 'PDF' | 'SVG' | 'AI' | 'GLB'
export type ColorProfile = 'RGB' | 'CMYK'

export interface OutputSettings {
  format: OutputFormat
  /** Print resolution in DPI (also clamped by the tier's megapixel cap in metering). */
  dpi: number
  colorProfile: ColorProfile
  /** Bleed + crop/registration marks on the exported die-line. */
  marks: boolean
  /** Flattened vs layered/vector-editable export. */
  layered: boolean
  /** iLaunchify watermark on the output. */
  watermark: boolean
  /** Draft variations per generation cycle. */
  variations: number
  /** Export a whole coordinated set / flavour series in one action. */
  batch: boolean
  /** No iLaunchify branding on the output (agency/white-label). */
  whiteLabel: boolean
}

/** The admin-governed policy for a tier: what's ALLOWED + the DEFAULTS. */
export interface OutputPolicy {
  allowedFormats: OutputFormat[]
  maxDpi: number
  allowCmyk: boolean
  allowLayered: boolean
  allowBatch: boolean
  allowWhiteLabel: boolean
  /** Watermark is forced on (true) for this tier regardless of request. */
  forceWatermark: boolean
  maxVariations: number
  /** The default settings a creator starts from. */
  defaults: OutputSettings
}

/** An admin-authored named bundle of settings, tier-gated. */
export interface OutputPreset {
  id: string
  label: string
  /** Lowest tier that may use this preset. */
  minTier: CreatorBillingTier
  settings: OutputSettings
}

const TIER_RANK: Record<CreatorBillingTier, number> = { maker: 0, builder: 1, agency: 2 }

// ---- default per-tier policies (admin tunes via AiGeneratorSettings) ----

const MAKER_POLICY: OutputPolicy = {
  allowedFormats: ['PNG'],
  maxDpi: 96,
  allowCmyk: false,
  allowLayered: false,
  allowBatch: false,
  allowWhiteLabel: false,
  forceWatermark: true,
  maxVariations: 2,
  defaults: { format: 'PNG', dpi: 96, colorProfile: 'RGB', marks: false, layered: false, watermark: true, variations: 2, batch: false, whiteLabel: false },
}
const BUILDER_POLICY: OutputPolicy = {
  allowedFormats: ['PDF', 'PNG'],
  maxDpi: 300,
  allowCmyk: true,
  allowLayered: false,
  allowBatch: false,
  allowWhiteLabel: false,
  forceWatermark: false,
  maxVariations: 4,
  defaults: { format: 'PDF', dpi: 300, colorProfile: 'CMYK', marks: true, layered: false, watermark: false, variations: 4, batch: false, whiteLabel: false },
}
const AGENCY_POLICY: OutputPolicy = {
  allowedFormats: ['PDF', 'AI', 'SVG', 'PNG', 'GLB'],
  maxDpi: 600,
  allowCmyk: true,
  allowLayered: true,
  allowBatch: true,
  allowWhiteLabel: true,
  forceWatermark: false,
  maxVariations: 6,
  defaults: { format: 'PDF', dpi: 300, colorProfile: 'CMYK', marks: true, layered: true, watermark: false, variations: 4, batch: true, whiteLabel: true },
}

export const DEFAULT_OUTPUT_POLICIES: Record<CreatorBillingTier, OutputPolicy> = {
  maker: MAKER_POLICY,
  builder: BUILDER_POLICY,
  agency: AGENCY_POLICY,
}

/** Effective output policy for a tier, with optional admin overrides merged in. */
export function resolveOutputPolicy(tier: CreatorBillingTier, overrides?: Partial<OutputPolicy>): OutputPolicy {
  const base = DEFAULT_OUTPUT_POLICIES[tier]
  const merged = overrides ? { ...base, ...overrides } : base
  return {
    ...merged,
    allowedFormats: [...(overrides?.allowedFormats ?? base.allowedFormats)],
    defaults: { ...base.defaults, ...(overrides?.defaults ?? {}) },
  }
}

/** Presets a tier may actually use (minTier ≤ tier). */
export function presetsForTier(tier: CreatorBillingTier, presets: ReadonlyArray<OutputPreset>): OutputPreset[] {
  return presets.filter((p) => TIER_RANK[p.minTier] <= TIER_RANK[tier])
}

export interface ClampResult {
  settings: OutputSettings
  /** Human notes for each value that was snapped down (nothing silently changed). */
  adjustments: string[]
}

/**
 * Snap a requested output DOWN to the tier policy — the hard guard. A creator can
 * never export above their caps; every downgrade is reported.
 */
export function clampOutput(requested: OutputSettings, policy: OutputPolicy): ClampResult {
  const adjustments: string[] = []
  const out: OutputSettings = { ...requested }

  if (!policy.allowedFormats.includes(out.format)) {
    adjustments.push(`format ${out.format} not allowed → ${policy.defaults.format}`)
    out.format = policy.defaults.format
  }
  if (out.dpi > policy.maxDpi) {
    adjustments.push(`dpi ${out.dpi} > max ${policy.maxDpi} → ${policy.maxDpi}`)
    out.dpi = policy.maxDpi
  }
  if (out.colorProfile === 'CMYK' && !policy.allowCmyk) {
    adjustments.push('CMYK not allowed → RGB')
    out.colorProfile = 'RGB'
  }
  if (out.layered && !policy.allowLayered) {
    adjustments.push('layered export not allowed → flattened')
    out.layered = false
  }
  if (out.batch && !policy.allowBatch) {
    adjustments.push('batch export not allowed → single')
    out.batch = false
  }
  if (out.whiteLabel && !policy.allowWhiteLabel) {
    adjustments.push('white-label not allowed → branded')
    out.whiteLabel = false
  }
  if (policy.forceWatermark && !out.watermark) {
    adjustments.push('watermark forced on for this tier')
    out.watermark = true
  }
  if (out.variations > policy.maxVariations) {
    adjustments.push(`variations ${out.variations} > max ${policy.maxVariations} → ${policy.maxVariations}`)
    out.variations = policy.maxVariations
  }
  if (out.variations < 1) out.variations = 1

  return { settings: out, adjustments }
}

/** Apply a preset then clamp — the "creator picks a preset" path. */
export function applyPreset(preset: OutputPreset, policy: OutputPolicy): ClampResult {
  return clampOutput(preset.settings, policy)
}
