'use client'

// Client-side rasterizer for the photo-mockup composite (Mockup Slice 2 §3).
// Renders the flat artwork perspective-warped into the curated print-area quad
// over the base product photo, onto an offscreen canvas → PNG data URL.
// Deterministic (no AI). The whole repo renders client-side (PDF export, label
// download), so the canonical mockup render is produced here and uploaded as an
// Asset by saveDesignMockupRender — no server image library, no native dep.
//
// HTML canvas 2D has no native perspective transform, so we texture-map the
// artwork via TWO triangles (piecewise-affine): exact at the 4 corners and
// sub-pixel elsewhere for a near-planar label — which is exactly what a print
// area is. Mirrors the live matrix3d preview's geometry (lib/quadTransform.ts).

export interface Pt { x: number; y: number }

function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    if (crossOrigin) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

type Affine = [number, number, number, number, number, number]

/** Affine (a,b,c,d,e,f) mapping src triangle → dst triangle (canvas setTransform order). */
function affineFromTriangles(s: [Pt, Pt, Pt], d: [Pt, Pt, Pt]): Affine | null {
  const [s0, s1, s2] = s
  const [d0, d1, d2] = d
  const det = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y)
  if (!det) return null
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / det
  const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / det
  const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / det
  const d2y = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / det
  const e = d0.x - a * s0.x - c * s0.y
  const f = d0.y - b * s0.x - d2y * s0.y
  return [a, b, c, d2y, e, f]
}

function drawTexTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  s: [Pt, Pt, Pt],
  d: [Pt, Pt, Pt],
): void {
  const m = affineFromTriangles(s, d)
  if (!m) return
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(d[0].x, d[0].y)
  ctx.lineTo(d[1].x, d[1].y)
  ctx.lineTo(d[2].x, d[2].y)
  ctx.closePath()
  ctx.clip()
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5])
  ctx.drawImage(img, 0, 0)
  ctx.restore()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/**
 * Composite the artwork into the print-area quad over the base photo and return
 * a PNG data URL. Returns null on failure (image load error, CORS taint on
 * toDataURL, or a malformed quad) so callers can fall back to the flat artwork.
 */
export async function compositeMockup(opts: {
  baseImageUrl: string
  artworkDataUrl: string
  /** Print area, image-relative 0..1, order TL, TR, BR, BL. */
  quad: Pt[]
  /** Cap the output width for upload size / perf (default 1400px). */
  maxWidth?: number
}): Promise<string | null> {
  if (opts.quad.length !== 4) return null
  const [qa, qb, qc, qd] = opts.quad
  if (!qa || !qb || !qc || !qd) return null
  try {
    const [base, art] = await Promise.all([
      loadImage(opts.baseImageUrl, true),
      loadImage(opts.artworkDataUrl, false),
    ])
    const maxW = opts.maxWidth ?? 1400
    const scale = base.naturalWidth > maxW ? maxW / base.naturalWidth : 1
    const W = Math.max(1, Math.round(base.naturalWidth * scale))
    const H = Math.max(1, Math.round(base.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(base, 0, 0, W, H)

    const dst: [Pt, Pt, Pt, Pt] = [
      { x: qa.x * W, y: qa.y * H },
      { x: qb.x * W, y: qb.y * H },
      { x: qc.x * W, y: qc.y * H },
      { x: qd.x * W, y: qd.y * H },
    ]
    const aw = art.naturalWidth || 1
    const ah = art.naturalHeight || 1
    const src: [Pt, Pt, Pt, Pt] = [
      { x: 0, y: 0 },
      { x: aw, y: 0 },
      { x: aw, y: ah },
      { x: 0, y: ah },
    ]
    // TL,TR,BR then TL,BR,BL — the two halves of the quad.
    drawTexTriangle(ctx, art, [src[0], src[1], src[2]], [dst[0], dst[1], dst[2]])
    drawTexTriangle(ctx, art, [src[0], src[2], src[3]], [dst[0], dst[2], dst[3]])

    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}
