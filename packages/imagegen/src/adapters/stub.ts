// =============================================================================
// Deterministic stub provider (AI_PACKAGING_GENERATOR §5/§13).
//
// A keyless ImageGenProvider so the whole draft → finalize pipeline runs end-to-end
// in dev, demos, and tests with NO network and NO API keys. It returns inline SVG
// placeholders sized to the request (raster requests come back as an SVG-in-`svg`
// tile; vector requests as a tiny SVG). Same input → same output.
// =============================================================================

import type { ImageGenProvider, ImageRef, PanelGenRequest, VectorTypeRequest, UpscaleRequest, OutpaintRequest } from '../provider'

/** djb2 → a stable pastel hex from any seed string, so stubs look varied but reproducible. */
function stubColor(seed: string): string {
  let h = 5381
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `hsl(${hue} 55% 78%)`
}

function placeholderSvg(w: number, h: number, label: string, seed: string): string {
  const fill = stubColor(seed)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${fill}"/>` +
    `<rect x="6" y="6" width="${Math.max(0, w - 12)}" height="${Math.max(0, h - 12)}" fill="none" stroke="#00000022" stroke-dasharray="8 6"/>` +
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${Math.max(10, Math.round(Math.min(w, h) / 16))}" fill="#00000066">${label}</text>` +
    `</svg>`
  )
}

/** A stub provider. `id` is stable so callers can detect they're on the placeholder path. */
export function createStubProvider(): ImageGenProvider {
  return {
    id: 'stub-deterministic',
    async generatePanels(req: PanelGenRequest): Promise<ImageRef[]> {
      const n = Math.max(1, req.n)
      return Array.from({ length: n }, (_, i) => ({
        kind: 'raster' as const,
        width: req.widthPx,
        height: req.heightPx,
        svg: placeholderSvg(req.widthPx, req.heightPx, `concept ${i + 1}`, `${req.prompt}:${req.seed ?? 0}:${i}`),
      }))
    },
    async generateVectorType(req: VectorTypeRequest): Promise<ImageRef> {
      return {
        kind: 'vector',
        width: req.widthPx,
        height: req.heightPx,
        svg: placeholderSvg(req.widthPx, req.heightPx, 'type', req.prompt),
      }
    },
    async outpaint(req: OutpaintRequest): Promise<ImageRef[]> {
      // Stub "outpaint": embed the source at a nominal 1000px base inside an SVG
      // canvas grown by the requested per-side amounts, extension zones tinted.
      // Deterministic + offline; real border synthesis is the fal leg.
      const BASE = 1000
      const w = BASE + Math.max(0, req.expandLeft) + Math.max(0, req.expandRight)
      const h = BASE + Math.max(0, req.expandTop) + Math.max(0, req.expandBottom)
      const fill = stubColor(req.imageUrl)
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        `<rect width="${w}" height="${h}" fill="${fill}"/>` +
        `<image href="${req.imageUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" x="${Math.max(0, req.expandLeft)}" y="${Math.max(0, req.expandTop)}" width="${BASE}" height="${BASE}" preserveAspectRatio="xMidYMid meet"/>` +
        `</svg>`
      return [{ kind: 'raster', width: w, height: h, svg }]
    },
    async upscale(req: UpscaleRequest): Promise<ImageRef> {
      // Stub "upscale" just re-reports the ref at the target megapixel dimensions.
      const ratio = req.image.width > 0 && req.image.height > 0 ? req.image.width / req.image.height : 1
      const targetPx = Math.max(1, req.targetMegapixels) * 1_000_000
      const h = Math.round(Math.sqrt(targetPx / ratio))
      const w = Math.round(h * ratio)
      return { ...req.image, width: w, height: h }
    },
  }
}
