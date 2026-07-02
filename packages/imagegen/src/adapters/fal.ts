// =============================================================================
// fal.ai adapter — FLUX.1 raster panels + upscale (AI_PACKAGING_GENERATOR §13).
//
// Implements the raster half of ImageGenProvider over fal's synchronous REST
// endpoint (`https://fal.run/<model>`, header `Authorization: Key <FAL_KEY>`). No
// SDK — plain fetch, so the package stays dependency-free. Model paths are
// configurable: the default is FLUX.1[dev]; a ControlNet/inpaint model path is used
// when a keep-clear mask is supplied so structure (die-line + reserved zones) is
// locked. The key comes from the Integrations registry (env), never the DB.
//
// Contract (fal docs): POST JSON { prompt, image_size, num_images, seed, ... } →
// { images: [{ url, width, height, content_type }] }.
// =============================================================================

import type { ImageGenProvider, ImageRef, PanelGenRequest, UpscaleRequest } from '../provider'

export interface FalConfig {
  apiKey: string
  /** Base host; override for self-host/proxy. */
  baseUrl?: string
  /** Text-to-image model when no mask is present. */
  model?: string
  /** Structure-locked model used when a mask is present (ControlNet / inpaint). */
  controlnetModel?: string
  /** Upscale model path. */
  upscaleModel?: string
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

const DEFAULTS = {
  baseUrl: 'https://fal.run',
  model: 'fal-ai/flux/dev',
  controlnetModel: 'fal-ai/flux-control-lora-canny',
  upscaleModel: 'fal-ai/clarity-upscaler',
}

/** Nearest fal `image_size` keyword for an aspect ratio (fal accepts these or {width,height}). */
function imageSize(widthPx: number, heightPx: number): { width: number; height: number } {
  return { width: Math.max(256, Math.round(widthPx)), height: Math.max(256, Math.round(heightPx)) }
}

interface FalImagesResponse {
  images?: Array<{ url?: string; width?: number; height?: number; content_type?: string }>
  image?: { url?: string; width?: number; height?: number }
}

async function callFal(cfg: Required<Pick<FalConfig, 'apiKey' | 'baseUrl' | 'fetchImpl'>>, model: string, body: unknown): Promise<FalImagesResponse> {
  const res = await cfg.fetchImpl(`${cfg.baseUrl}/${model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`fal ${model} ${res.status}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as FalImagesResponse
}

function toRefs(resp: FalImagesResponse, fallbackW: number, fallbackH: number): ImageRef[] {
  const imgs = resp.images ?? (resp.image ? [resp.image] : [])
  return imgs
    .filter((i) => i.url)
    .map((i) => ({ kind: 'raster' as const, url: i.url, width: i.width ?? fallbackW, height: i.height ?? fallbackH }))
}

export function createFalProvider(config: FalConfig): ImageGenProvider {
  const cfg = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULTS.baseUrl,
    model: config.model ?? DEFAULTS.model,
    controlnetModel: config.controlnetModel ?? DEFAULTS.controlnetModel,
    upscaleModel: config.upscaleModel ?? DEFAULTS.upscaleModel,
    fetchImpl: config.fetchImpl ?? fetch,
  }
  return {
    id: 'fal-flux',
    async generatePanels(req: PanelGenRequest): Promise<ImageRef[]> {
      const size = imageSize(req.widthPx, req.heightPx)
      const usesMask = !!req.mask
      const body: Record<string, unknown> = {
        prompt: req.prompt,
        image_size: size,
        num_images: Math.max(1, req.n),
        enable_safety_checker: true,
        output_format: 'png',
        ...(req.seed !== undefined ? { seed: req.seed } : {}),
        ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
        // Structure lock + brand conditioning when supported by the chosen model.
        // flux-control-lora-canny requires `control_lora_image_url` (422 "Field
        // required" otherwise — 2026-07-01); the legacy field names ride along for
        // other control/inpaint model paths.
        ...(usesMask ? { control_lora_image_url: req.mask, control_image_url: req.mask, image_url: req.mask } : {}),
        ...(req.brandRefUrl ? { ip_adapter_image_url: req.brandRefUrl } : {}),
      }
      const resp = await callFal(cfg, usesMask ? cfg.controlnetModel : cfg.model, body)
      return toRefs(resp, size.width, size.height)
    },
    async upscale(req: UpscaleRequest): Promise<ImageRef> {
      const src = req.image.url
      if (!src) return req.image // nothing to upscale without a URL; caller keeps the draft
      const resp = await callFal(cfg, cfg.upscaleModel, { image_url: src })
      const out = toRefs(resp, req.image.width, req.image.height)[0]
      return out ?? req.image
    },
  }
}
