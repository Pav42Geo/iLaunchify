/**
 * @ilaunchify/packaging-3d — channel-compliant export presets + main-image guardrail (G7.1).
 *
 * The differentiator: no mainstream tool bakes true per-marketplace compliance
 * presets (Canva/Printful give social sizes + generic high-res). We know the
 * creator's connected channels, so we can emit a compliant image set per channel
 * AND flag which renders are legal as the *main* slot.
 *
 * Specs are from docs/MOCKUP_LIBRARY_UX_RESEARCH.md §4 (each with a `verified`
 * flag: true = fetched verbatim from the official page; false = login-gated /
 * indexed / consensus → re-verify in a seller session before treating as binding).
 * Pure data + logic; no DB/DOM/network. Byte sizes are exact (not MB-rounded).
 */

import { MOCKUP_ASSET_KINDS, type MockupAssetKind } from './types'

const MB = 1024 * 1024

export const EXPORT_CHANNELS = ['shopify', 'amazon', 'etsy', 'tiktok', 'walmart', 'google', 'meta'] as const
export type ExportChannel = (typeof EXPORT_CHANNELS)[number]

/** Background rule for the main/product image. */
export type BackgroundRule = 'WHITE_REQUIRED' | 'WHITE_OR_TRANSPARENT' | 'ANY'

export interface ChannelImageSpec {
  channel: ExportChannel
  /** Square when true (1:1); false = flexible/other aspect allowed. */
  square: boolean
  /** Recommended export size on the long edge (px). */
  recommendedLongEdgePx: number
  /** Minimum long edge the channel accepts / needs for zoom (px). */
  minLongEdgePx: number
  /** Hard max long edge (px), if the channel caps it. */
  maxLongEdgePx?: number
  background: BackgroundRule
  /** Accepted file formats (lowercase, no dot). First = preferred. */
  formats: string[]
  /** Max file size in bytes. */
  maxBytes: number
  /** True when the FIRST/main image must be a plain product-only shot (no scene/props). */
  mainImageProductOnly: boolean
  /** Transparency allowed in uploaded files? (Etsy renders transparency black.) */
  allowsTransparency: boolean
  /** false = spec is login-gated/consensus, re-verify before locking. */
  verified: boolean
  note?: string
}

/** Per-channel image specs (research §4). Numbers are exact where the official page was fetched. */
export const CHANNEL_IMAGE_SPECS: Record<ExportChannel, ChannelImageSpec> = {
  shopify: {
    channel: 'shopify',
    square: true,
    recommendedLongEdgePx: 2048,
    minLongEdgePx: 800,
    maxLongEdgePx: 5000,
    background: 'ANY',
    formats: ['png', 'jpeg', 'webp', 'heic', 'gif'],
    maxBytes: 20 * MB,
    mainImageProductOnly: false,
    allowsTransparency: true,
    verified: true,
    note: 'No background rule — merchant/theme choice; square recommended, >800px for zoom.',
  },
  amazon: {
    channel: 'amazon',
    square: true,
    recommendedLongEdgePx: 1600,
    minLongEdgePx: 1000,
    maxLongEdgePx: 10000,
    background: 'WHITE_REQUIRED',
    formats: ['jpeg', 'tiff', 'png', 'gif'],
    maxBytes: 10 * MB,
    mainImageProductOnly: true,
    allowsTransparency: false,
    verified: false,
    note: 'Main image: pure white RGB 255, product ≥85% frame, no text/props. Login-gated — verify on Seller Central.',
  },
  etsy: {
    channel: 'etsy',
    square: false,
    recommendedLongEdgePx: 2000,
    minLongEdgePx: 635,
    background: 'ANY',
    formats: ['jpg', 'png', 'gif', 'heic', 'svg'],
    maxBytes: 1 * MB,
    mainImageProductOnly: false,
    allowsTransparency: false,
    verified: true,
    note: 'First photo landscape/square; keep files <1MB; transparency renders black.',
  },
  tiktok: {
    channel: 'tiktok',
    square: true,
    recommendedLongEdgePx: 800,
    minLongEdgePx: 600,
    background: 'WHITE_REQUIRED',
    formats: ['jpeg', 'png'],
    maxBytes: 5 * MB,
    mainImageProductOnly: true,
    allowsTransparency: false,
    verified: false,
    note: 'Main image clean white background. Login-gated — verify in Seller Center.',
  },
  walmart: {
    channel: 'walmart',
    square: true,
    recommendedLongEdgePx: 2200,
    minLongEdgePx: 1500,
    background: 'WHITE_REQUIRED',
    formats: ['jpeg', 'png', 'bmp'],
    maxBytes: 5 * MB,
    mainImageProductOnly: true,
    allowsTransparency: false,
    verified: true,
    note: 'Seamless white RGB 255; no watermarks/logos; stock photos not allowed.',
  },
  google: {
    channel: 'google',
    square: false,
    recommendedLongEdgePx: 1500,
    minLongEdgePx: 500,
    maxLongEdgePx: 8000,
    background: 'WHITE_OR_TRANSPARENT',
    formats: ['jpeg', 'webp', 'png', 'gif', 'bmp', 'tiff'],
    maxBytes: 16 * MB,
    mainImageProductOnly: false,
    allowsTransparency: true,
    verified: true,
    note: 'White or transparent bg; product 75–90% of frame; AI images must retain IPTC DigitalSourceType. Min→500px by 2027.',
  },
  meta: {
    channel: 'meta',
    square: true,
    recommendedLongEdgePx: 1024,
    minLongEdgePx: 500,
    background: 'ANY',
    formats: ['jpeg', 'png'],
    maxBytes: 8 * MB,
    mainImageProductOnly: false,
    allowsTransparency: false,
    verified: false,
    note: 'White backdrop recommended; no overlay text/CTAs. Indexed spec — verify in Commerce Manager.',
  },
}

export function isExportChannel(v: unknown): v is ExportChannel {
  return typeof v === 'string' && (EXPORT_CHANNELS as readonly string[]).includes(v)
}

export function getChannelImageSpec(channel: ExportChannel): ChannelImageSpec {
  return CHANNEL_IMAGE_SPECS[channel]
}

// ── Main-image legality guardrail ────────────────────────────────────────────

/** A clean studio render is the only always-legal main-image candidate. */
export function isCleanStudioRender(kind: MockupAssetKind): boolean {
  return kind === 'STANDARD_RENDER'
}

export interface MainImageEligibility {
  eligible: boolean
  reason?: string
}

/**
 * Can a mockup of `kind` sit in the channel's FIRST/main image slot? On
 * Amazon/TikTok/Walmart the main must be a plain product-only shot, so a
 * lifestyle/scene/AI render is supplementary-only there. Elsewhere any kind may lead.
 */
export function mainImageEligibility(channel: ExportChannel, kind: MockupAssetKind): MainImageEligibility {
  const spec = CHANNEL_IMAGE_SPECS[channel]
  if (spec.mainImageProductOnly && !isCleanStudioRender(kind)) {
    return {
      eligible: false,
      reason: `${channel} requires a plain product-only main image; ${kind} is supplementary-only.`,
    }
  }
  return { eligible: true }
}

export interface RenderCandidate {
  id: string
  kind: MockupAssetKind
}

/**
 * Pick the main-image render for a channel from the creator's selected mockups.
 * Prefers a clean STANDARD_RENDER (legal everywhere); otherwise, where the channel
 * allows a lifestyle lead, the first eligible candidate. Null when nothing qualifies
 * (→ the publish flow should steer the creator to generate/select a studio render).
 */
export function pickPrimaryRender(channel: ExportChannel, candidates: RenderCandidate[]): string | null {
  const studio = candidates.find((c) => isCleanStudioRender(c.kind))
  if (studio) return studio.id
  const firstEligible = candidates.find((c) => mainImageEligibility(channel, c.kind).eligible)
  return firstEligible?.id ?? null
}

// ── Concrete export target ───────────────────────────────────────────────────

export interface ExportTarget {
  channel: ExportChannel
  widthPx: number
  heightPx: number
  background: BackgroundRule
  /** Preferred output format for this channel. */
  format: string
  maxBytes: number
  allowsTransparency: boolean
}

/**
 * The concrete pixel target to render/resize a mockup to for a channel. Square
 * channels get recommendedLongEdge². Flexible channels default to a square at the
 * recommended long edge (safe on every layout); callers may override for a
 * landscape hero where the channel allows it.
 */
export function exportTargetFor(channel: ExportChannel): ExportTarget {
  const spec = CHANNEL_IMAGE_SPECS[channel]
  const edge = spec.recommendedLongEdgePx
  return {
    channel,
    widthPx: edge,
    heightPx: edge,
    background: spec.background,
    format: spec.formats[0] ?? 'png',
    maxBytes: spec.maxBytes,
    allowsTransparency: spec.allowsTransparency,
  }
}

/** Export targets for many channels at once (the creator's connected set). */
export function exportPlan(channels: ExportChannel[]): ExportTarget[] {
  return channels.map(exportTargetFor)
}
