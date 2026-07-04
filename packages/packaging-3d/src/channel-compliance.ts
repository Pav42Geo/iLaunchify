/**
 * @ilaunchify/packaging-3d — channel image compliance validator + normalization planner (G7.1b).
 *
 * `validateForChannel` gates the publish action: given the ACTUAL facts of a
 * rendered mockup vs a channel's `ChannelImageSpec`, it returns hard errors
 * (block publish) and warnings (auto-fixable). `normalizationPlan` returns the
 * ordered transform steps that would make the image compliant — a pure *description*
 * the app layer executes with an image lib (sharp/canvas); this module never
 * touches pixels. Pairs with channel-export.ts (targets) to make presets actionable.
 */

import { CHANNEL_IMAGE_SPECS, mainImageEligibility, type ExportChannel } from './channel-export'
import type { MockupAssetKind } from './types'

export type BackgroundColor = 'WHITE' | 'TRANSPARENT' | 'OTHER' | 'UNKNOWN'

/** The measured facts of a produced image (from the render / uploaded file). */
export interface MockupImageFacts {
  widthPx: number
  heightPx: number
  bytes: number
  /** lowercase, no dot: 'png' | 'jpeg' | … */
  format: string
  hasTransparency: boolean
  background: BackgroundColor
  kind: MockupAssetKind
  /** Will this image occupy the channel's FIRST/main slot? */
  isMain: boolean
}

export type IssueLevel = 'ERROR' | 'WARN'

export interface ComplianceIssue {
  level: IssueLevel
  code: string
  message: string
}

export interface ComplianceResult {
  ok: boolean // no ERROR-level issues
  issues: ComplianceIssue[]
}

const longEdge = (f: { widthPx: number; heightPx: number }) => Math.max(f.widthPx, f.heightPx)

/**
 * Validate a produced image against a channel's rules. ERRORs block publish;
 * WARNs are auto-fixable by `normalizationPlan` (padding, downscale, compress…).
 */
export function validateForChannel(channel: ExportChannel, facts: MockupImageFacts): ComplianceResult {
  const spec = CHANNEL_IMAGE_SPECS[channel]
  const issues: ComplianceIssue[] = []

  // Main-image legality (scene/AI can't lead on white-main channels).
  if (facts.isMain) {
    const elig = mainImageEligibility(channel, facts.kind)
    if (!elig.eligible) issues.push({ level: 'ERROR', code: 'MAIN_IMAGE_KIND', message: elig.reason ?? 'Ineligible main image.' })
  }

  // Format.
  if (!spec.formats.includes(facts.format.toLowerCase())) {
    issues.push({ level: 'ERROR', code: 'FORMAT', message: `${facts.format} not accepted; use ${spec.formats.join('/')}.` })
  }

  // Transparency (Etsy renders it black; white-main channels want opaque).
  if (facts.hasTransparency && !spec.allowsTransparency) {
    issues.push({ level: 'ERROR', code: 'TRANSPARENCY', message: `${channel} does not allow transparency — flatten onto a background.` })
  }

  // Minimum resolution — cannot invent pixels, so this is a hard error.
  if (longEdge(facts) < spec.minLongEdgePx) {
    issues.push({ level: 'ERROR', code: 'TOO_SMALL', message: `Long edge ${longEdge(facts)}px below ${spec.minLongEdgePx}px minimum — supply a higher-res source.` })
  }

  // Above max — downscalable → warn.
  if (spec.maxLongEdgePx && longEdge(facts) > spec.maxLongEdgePx) {
    issues.push({ level: 'WARN', code: 'TOO_LARGE', message: `Long edge ${longEdge(facts)}px exceeds ${spec.maxLongEdgePx}px — will downscale.` })
  }

  // Square requirement — paddable → warn.
  if (spec.square && facts.widthPx !== facts.heightPx) {
    issues.push({ level: 'WARN', code: 'NOT_SQUARE', message: `${channel} wants 1:1 — will pad to square.` })
  }

  // Background on the main slot.
  if (facts.isMain && spec.background === 'WHITE_REQUIRED' && facts.background !== 'WHITE') {
    const level: IssueLevel = facts.background === 'TRANSPARENT' || facts.background === 'UNKNOWN' ? 'WARN' : 'ERROR'
    issues.push({
      level,
      code: 'BACKGROUND',
      message: level === 'WARN' ? `${channel} main image needs a white background — will composite white.` : `${channel} main image must be pure white; background is ${facts.background}.`,
    })
  }

  // File size — compressible → warn (still flag hard if wildly over could need reformat).
  if (facts.bytes > spec.maxBytes) {
    issues.push({ level: 'WARN', code: 'TOO_HEAVY', message: `File ${facts.bytes}B exceeds ${spec.maxBytes}B — will compress/resize.` })
  }

  return { ok: !issues.some((i) => i.level === 'ERROR'), issues }
}

// ── Normalization plan ────────────────────────────────────────────────────────

export type NormalizationStep =
  | { op: 'FLATTEN_TRANSPARENCY'; background: 'WHITE' }
  | { op: 'ADD_WHITE_BACKGROUND' }
  | { op: 'PAD_TO_SQUARE' }
  | { op: 'DOWNSCALE'; toLongEdgePx: number }
  | { op: 'CONVERT_FORMAT'; to: string }
  | { op: 'COMPRESS'; maxBytes: number }
  | { op: 'CANNOT_FIX'; reason: string }

/**
 * The ordered transforms to make `facts` compliant for `channel`. Order matters:
 * fix colour/background first, then geometry (pad/scale), then format, then size.
 * `CANNOT_FIX` marks an unfixable state (below min resolution — needs a new source).
 * A pure description; the app executes it (sharp/canvas).
 */
export function normalizationPlan(channel: ExportChannel, facts: MockupImageFacts): NormalizationStep[] {
  const spec = CHANNEL_IMAGE_SPECS[channel]
  const steps: NormalizationStep[] = []

  // Below min resolution can't be transformed away.
  if (longEdge(facts) < spec.minLongEdgePx) {
    steps.push({ op: 'CANNOT_FIX', reason: `Long edge ${longEdge(facts)}px < ${spec.minLongEdgePx}px minimum; re-render at higher resolution.` })
  }

  // Colour / background.
  if (facts.hasTransparency && !spec.allowsTransparency) {
    steps.push({ op: 'FLATTEN_TRANSPARENCY', background: 'WHITE' })
  }
  if (facts.isMain && spec.background === 'WHITE_REQUIRED' && facts.background !== 'WHITE') {
    steps.push({ op: 'ADD_WHITE_BACKGROUND' })
  }

  // Geometry.
  if (spec.square && facts.widthPx !== facts.heightPx) {
    steps.push({ op: 'PAD_TO_SQUARE' })
  }
  if (spec.maxLongEdgePx && longEdge(facts) > spec.maxLongEdgePx) {
    steps.push({ op: 'DOWNSCALE', toLongEdgePx: spec.maxLongEdgePx })
  }

  // Format.
  if (!spec.formats.includes(facts.format.toLowerCase())) {
    steps.push({ op: 'CONVERT_FORMAT', to: spec.formats[0] ?? 'png' })
  }

  // Size (last — after any resize/reformat that already shrinks bytes).
  if (facts.bytes > spec.maxBytes) {
    steps.push({ op: 'COMPRESS', maxBytes: spec.maxBytes })
  }

  return steps
}
