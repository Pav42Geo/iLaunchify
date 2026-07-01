// =============================================================================
// Recraft adapter — vector type / accent art (AI_PACKAGING_GENERATOR §13).
//
// Implements the vector half of ImageGenProvider. Recraft returns true SVG when
// style = 'vector_illustration', so in-frame type + accents stay crisp at print
// resolution (the truth layer is still rendered deterministically elsewhere; this
// only produces CREATIVE-frame vector art). Plain fetch, no SDK.
//
// Contract (Recraft docs): POST https://api.recraft.ai/v1/images/generate
//   Authorization: Bearer <RECRAFT_API_TOKEN>
//   { prompt, style, size, n } → { data: [{ url, image? }] }
// =============================================================================

import type { ImageGenProvider, ImageRef, VectorTypeRequest } from '../provider'

export interface RecraftConfig {
  apiKey: string
  baseUrl?: string
  /** Recraft style; 'vector_illustration' yields SVG. */
  style?: string
  fetchImpl?: typeof fetch
}

const DEFAULTS = { baseUrl: 'https://api.recraft.ai', style: 'vector_illustration' }

/** Recraft accepts a fixed set of `size` strings like "1024x1024"; snap to the nearest. */
function recraftSize(widthPx: number, heightPx: number): string {
  const r = widthPx / Math.max(1, heightPx)
  if (r > 1.2) return '1365x1024'
  if (r < 0.83) return '1024x1365'
  return '1024x1024'
}

interface RecraftResponse {
  data?: Array<{ url?: string; image?: string; b64_json?: string }>
}

export function createRecraftProvider(config: RecraftConfig): ImageGenProvider {
  const cfg = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULTS.baseUrl,
    style: config.style ?? DEFAULTS.style,
    fetchImpl: config.fetchImpl ?? fetch,
  }
  return {
    id: 'recraft-vector',
    // Raster is not this provider's job — resolveImageGenProvider composes it with fal.
    async generatePanels(): Promise<ImageRef[]> {
      return []
    },
    async generateVectorType(req: VectorTypeRequest): Promise<ImageRef> {
      const res = await cfg.fetchImpl(`${cfg.baseUrl}/v1/images/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: req.prompt, style: cfg.style, size: recraftSize(req.widthPx, req.heightPx), n: 1 }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`recraft ${res.status}: ${text.slice(0, 300)}`)
      }
      const json = (await res.json()) as RecraftResponse
      const first = json.data?.[0]
      return {
        kind: 'vector',
        width: req.widthPx,
        height: req.heightPx,
        url: first?.url,
        base64: first?.b64_json,
        svg: first?.image,
      }
    },
  }
}
