// =============================================================================
// AI Packaging Generator — image-gen provider interface (AI_PACKAGING_GENERATOR §5/§13).
//
// One provider-agnostic seam so the field can churn without touching callers:
//   • raster panel art  → fal.ai FLUX.1 [dev] + ControlNet (mask-driven inpaint)
//   • vector type accent → Recraft (SVG output, in CREATIVE frames only)
//   • finalize           → upscaler (cheaper than native print-res generation)
//
// This file is types + a registry/status resolver only — NO network, NO SDK. The
// concrete fal/Recraft adapters land in P3 behind these interfaces; keys live in
// the Integrations registry (env-backed, never stored in the DB).
// =============================================================================

/** A produced image — either a URL (R2/provider) or inline bytes. */
export interface ImageRef {
  url?: string
  /** base64 (no data: prefix) when returned inline. */
  base64?: string
  width: number
  height: number
  /** 'raster' | 'vector' — vector comes back as SVG markup in `svg`. */
  kind: 'raster' | 'vector'
  svg?: string
}

export interface PanelGenRequest {
  prompt: string
  negativePrompt: string
  /** Keep-clear mask (white=paint, black=reserved) — PNG/SVG data or URL. */
  mask?: string
  widthPx: number
  heightPx: number
  /** Number of variations. */
  n: number
  /** Brand reference (logo/board) for IP-Adapter conditioning. */
  brandRefUrl?: string
  /** Palette hints (hex). */
  palette?: string[]
  seed?: number
}

export interface VectorTypeRequest {
  prompt: string
  palette?: string[]
  widthPx: number
  heightPx: number
}

export interface UpscaleRequest {
  image: ImageRef
  targetMegapixels: number
}

/** Reshape R3a (DESIGN_RESHAPE_CROSS_DIELINE): extend an image beyond its borders
 *  by per-side pixel amounts — the model paints a coherent scene extension.
 *  (fal contract: flux-2-pro/outpaint — image_url + expand_top/bottom/left/right.) */
export interface OutpaintRequest {
  /** Source image — URL or data URI. */
  imageUrl: string
  expandTop: number
  expandBottom: number
  expandLeft: number
  expandRight: number
}

/** The seam every adapter implements. Optional methods degrade gracefully. */
export interface ImageGenProvider {
  /** Stable id, e.g. 'fal-flux-controlnet'. */
  id: string
  generatePanels(req: PanelGenRequest): Promise<ImageRef[]>
  generateVectorType?(req: VectorTypeRequest): Promise<ImageRef>
  upscale?(req: UpscaleRequest): Promise<ImageRef>
  outpaint?(req: OutpaintRequest): Promise<ImageRef[]>
}

/** Which env keys each capability needs — surfaced by the Integrations registry. */
export const PROVIDER_ENV = {
  raster: 'FAL_KEY',
  vectorType: 'RECRAFT_API_KEY',
} as const

export interface ProviderStatus {
  /** Raster (fal) configured? */
  rasterReady: boolean
  /** Vector type (Recraft) configured? */
  vectorTypeReady: boolean
  /** Generation is usable at all (raster is the floor). */
  ready: boolean
  missing: string[]
}

/**
 * Report capability readiness from env presence — no key VALUES, just configured/missing.
 * Pure: pass `process.env` (or any record). Generation needs raster at minimum.
 */
export function providerStatus(env: Record<string, string | undefined>): ProviderStatus {
  const rasterReady = !!env[PROVIDER_ENV.raster]
  const vectorTypeReady = !!env[PROVIDER_ENV.vectorType]
  const missing: string[] = []
  if (!rasterReady) missing.push(PROVIDER_ENV.raster)
  if (!vectorTypeReady) missing.push(PROVIDER_ENV.vectorType)
  return { rasterReady, vectorTypeReady, ready: rasterReady, missing }
}
