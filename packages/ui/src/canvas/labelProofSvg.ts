// Label-proof SVG composer (co-creation §7 — Design Studio bridge).
//
// A creator who self-designs a label in the Studio places brand artwork on the
// maker's dieline. The platform artifact — the thing we store + the maker
// reviews — is a single NORMALIZED label SVG (mm units) stacked from three
// layers, back to front:
//
//   1. substrate — the maker's normalized dieline geometry (immutable; the same
//      artifact dielineSvgFromSpec emits / PackagingDieline.normalizedSvgKey).
//   2. brand     — the creator's artwork (logos, imagery, custom copy). This is
//      the ONLY layer the creator authors — the CREATIVE-scope frames.
//   3. regulated — deterministic vector for FDA/nutrition/identity panels. The
//      creator NEVER hand-edits these; they are platform-generated (see the
//      nutrition-panel generators + FrameScope RECIPE/IDENTITY/MATERIAL/PRODUCT)
//      and drawn last so brand artwork can never obscure regulated content.
//
// CONTRACT: every layer is INNER SVG markup already resolved to the shared mm
// coordinate space (same origin + scale as the substrate — full bleed area,
// 1 unit = 1 mm). Callers own the unit conversion (e.g. wrapping a Fabric
// px-space export in `<g transform="scale(mmPerPx)">`); use extractSvgInner()
// to unwrap a full <svg> document (like the stored normalizedSvg) into a
// fragment. This keeps the composer a pure, deterministic string builder —
// no DOM, no parsing of arbitrary coordinate systems, unit-verifiable.

export interface LabelProofLayers {
  /** Maker's normalized dieline geometry — inner SVG markup, mm space. Immutable substrate. */
  substrate: string
  /** Creator's brand-layer artwork — inner SVG markup, mm space. The only creator-authored layer. */
  brand: string
  /** Platform-generated regulated content (panels/identity) — inner SVG markup, mm space. */
  regulated?: string | null
}

export interface LabelProofDims {
  /** Full canvas width incl. bleed, in mm (matches the substrate viewBox width). */
  widthMm: number
  /** Full canvas height incl. bleed, in mm. */
  heightMm: number
}

function n(v: number): string {
  return Number.isFinite(v) ? v.toFixed(2) : '0'
}

/**
 * Extract the inner markup of a standalone `<svg>…</svg>` document, dropping the
 * outer `<svg>` wrapper. Used to fold the stored normalizedSvg (a full document,
 * already in mm space via dielineSvgFromSpec) into the substrate layer.
 * Returns '' when no `<svg>` element is present.
 */
export function extractSvgInner(svgDoc: string): string {
  const open = svgDoc.search(/<svg[\s>]/i)
  if (open < 0) return ''
  const gt = svgDoc.indexOf('>', open)
  if (gt < 0) return ''
  const close = svgDoc.lastIndexOf('</svg>')
  if (close < 0 || close < gt) return ''
  return svgDoc.slice(gt + 1, close).trim()
}

/**
 * Compose the normalized label-proof SVG from pre-normalized (mm-space) layers.
 * Returns a complete, standalone `<svg>` document string in mm units. Layers
 * are wrapped in `data-layer`-tagged groups so the viewer + audits can address
 * them (and so the regulated layer is provably drawn on top).
 *
 * Degenerate dims → a minimal valid SVG (never throws in a render path), same
 * convention as dielineSvgFromSpec.
 */
export function composeLabelProofSvg(layers: LabelProofLayers, dims: LabelProofDims): string {
  const w = Math.max(0, dims.widthMm)
  const h = Math.max(0, dims.heightMm)

  if (w <= 0 || h <= 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="1mm" height="1mm" viewBox="0 0 1 1"></svg>'
  }

  const parts: string[] = []
  // Back: maker's immutable dieline geometry.
  parts.push(`<g data-layer="substrate">${layers.substrate}</g>`)
  // Middle: the creator's brand artwork — the only creator-authored layer.
  parts.push(`<g data-layer="brand">${layers.brand}</g>`)
  // Front: deterministic regulated content, never obscured by brand artwork.
  if (layers.regulated && layers.regulated.trim().length > 0) {
    parts.push(`<g data-layer="regulated">${layers.regulated}</g>`)
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}mm" height="${n(h)}mm" ` +
    `viewBox="0 0 ${n(w)} ${n(h)}">` +
    parts.join('') +
    `</svg>`
  )
}
