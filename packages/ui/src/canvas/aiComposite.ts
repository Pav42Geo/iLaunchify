// =============================================================================
// AI Packaging Generator — P1 structure-lock + compositor (AI_PACKAGING_GENERATOR §4).
//
// PURE SVG (no React, no Fabric, no window) — same family as dielineSvg.ts /
// dielineParse.ts. Two jobs:
//
//   1. buildPanelMaskSvg() — the STRUCTURE LOCK. From the die-line's frames it
//      builds the keep-clear mask the image model consumes: CREATIVE-scope frames
//      are paintable (white); every other scope (RECIPE/IDENTITY/MATERIAL/PRODUCT)
//      is a reserved truth-layer zone (black) the model must leave blank.
//
//   2. compositeDesignSvg() — the COMPOSITE. Places generated art into CREATIVE
//      frames and renders the TRUTH layer into reserved frames. Both default to
//      labelled placeholders, so this produces a real, viewable composite WITH NO
//      AI and NO recipe data yet — the P1 demo. P2/P3/P5 inject real art via
//      `artByFrameId` and real regulated SVG via `reservedRender`.
//
// The CREATIVE vs reserved boundary is FRAME_SCOPE from frames.ts — the same
// boundary the submit gate and the truth layer use. Nothing here is bespoke.
// =============================================================================

import { type Frame, type FrameKind, type FrameLayout, type NormBox, FRAME_SCOPE } from './frames'
import { KIND_LABEL } from './frame-presentation'

export interface SurfaceDims {
  widthMm: number
  heightMm: number
}

/** Frames on one surface (primary panel = surfaceId undefined on both sides). */
export function pickSurfaceFrames(layout: FrameLayout, surfaceId?: string): Frame[] {
  return layout.frames.filter((f) => (f.surfaceId ?? undefined) === (surfaceId ?? undefined))
}

/** Split a surface's frames into paintable (CREATIVE) vs reserved (everything else). */
export function classifyFrames(layout: FrameLayout, surfaceId?: string): { creative: Frame[]; reserved: Frame[] } {
  const creative: Frame[] = []
  const reserved: Frame[] = []
  for (const f of pickSurfaceFrames(layout, surfaceId)) {
    if (FRAME_SCOPE[f.kind] === 'CREATIVE') creative.push(f)
    else reserved.push(f)
  }
  return { creative, reserved }
}

/** Human labels of the reserved zones — feed to assemblePrompt's reserved arg. */
export function reservedZoneLabels(layout: FrameLayout, surfaceId?: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const f of classifyFrames(layout, surfaceId).reserved) {
    const label = KIND_LABEL[f.kind]
    if (label && !seen.has(label)) {
      seen.add(label)
      out.push(label)
    }
  }
  return out
}

/** FrameKinds present on a surface — the bridge input to the compliance gate (P2). */
export function presentFrameKinds(layout: FrameLayout, surfaceId?: string): FrameKind[] {
  const seen = new Set<FrameKind>()
  for (const f of pickSurfaceFrames(layout, surfaceId)) seen.add(f.kind)
  return [...seen]
}

const r2 = (v: number) => Math.round(v * 100) / 100

/** NormBox (0..1 of the trim) → mm rect on the surface. */
function boxToRect(b: NormBox, s: SurfaceDims): { x: number; y: number; w: number; h: number } {
  return { x: r2(b.x * s.widthMm), y: r2(b.y * s.heightMm), w: r2(b.w * s.widthMm), h: r2(b.h * s.heightMm) }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * The STRUCTURE LOCK mask: white = paintable, black = keep-clear (reserved).
 * Sized in mm to the surface so it co-registers with the die-line + generations.
 */
export function buildPanelMaskSvg(layout: FrameLayout, surface: SurfaceDims, surfaceId?: string): string {
  const W = Math.max(1, surface.widthMm)
  const H = Math.max(1, surface.heightMm)
  const { reserved } = classifyFrames(layout, surfaceId)
  const rects = reserved
    .map((f) => {
      const r = boxToRect(f.box, surface)
      return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#000000"/>`
    })
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(W)} ${r2(H)}">` +
    `<rect x="0" y="0" width="${r2(W)}" height="${r2(H)}" fill="#FFFFFF"/>` +
    rects +
    `</svg>`
  )
}

export interface CompositeInput {
  layout: FrameLayout
  surface: SurfaceDims
  surfaceId?: string
  /** Real generated art per CREATIVE frame id (data/URL). Missing → placeholder tile. */
  artByFrameId?: Record<string, string>
  /** Real truth-layer markup per reserved frame (e.g. nutrition SVG fragment). */
  reservedRender?: (frame: Frame) => string | null
  /** Optional die-line backdrop SVG inner markup (already in mm coords). */
  backdropInner?: string
}

/**
 * Composite the two layers onto the surface. With no art/reservedRender supplied,
 * it renders labelled placeholders — the dependency-free P1 preview.
 */
export function compositeDesignSvg(input: CompositeInput): string {
  const { layout, surface, surfaceId, artByFrameId, reservedRender, backdropInner } = input
  const W = Math.max(1, surface.widthMm)
  const H = Math.max(1, surface.heightMm)
  const { creative, reserved } = classifyFrames(layout, surfaceId)

  const parts: string[] = []
  parts.push(`<rect x="0" y="0" width="${r2(W)}" height="${r2(H)}" fill="#FFFFFF"/>`)
  if (backdropInner) parts.push(backdropInner)

  // CREATIVE frames — generated art, or a hatched placeholder tile.
  for (const f of creative) {
    const r = boxToRect(f.box, surface)
    const art = artByFrameId?.[f.id]
    if (art) {
      parts.push(`<image x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" href="${esc(art)}" preserveAspectRatio="xMidYMid slice"/>`)
    } else {
      parts.push(
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="url(#aiArtHatch)" stroke="#C9CDD4" stroke-width="0.3"/>` +
          `<text x="${r2(r.x + r.w / 2)}" y="${r2(r.y + r.h / 2)}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${r2(Math.min(r.w, r.h) * 0.12)}" fill="#6B7280">AI ART · ${esc(KIND_LABEL[f.kind] ?? f.kind)}</text>`,
      )
    }
  }

  // Reserved frames — real truth-layer markup, or a dashed keep-clear label.
  for (const f of reserved) {
    const r = boxToRect(f.box, surface)
    const inner = reservedRender ? reservedRender(f) : null
    if (inner) {
      parts.push(`<svg x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" viewBox="0 0 ${r.w} ${r.h}">${inner}</svg>`)
    } else {
      const label = f.pinnedContent?.text ?? KIND_LABEL[f.kind] ?? f.kind
      parts.push(
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#F8FAFC" stroke="#94A3B8" stroke-width="0.3" stroke-dasharray="1.5 1"/>` +
          `<text x="${r2(r.x + r.w / 2)}" y="${r2(r.y + r.h / 2)}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${r2(Math.min(r.w, r.h) * 0.1)}" fill="#475569">${esc(label)}</text>`,
      )
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(W)} ${r2(H)}">` +
    `<defs><pattern id="aiArtHatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="3" height="3" fill="#EEF2F7"/><line x1="0" y1="0" x2="0" y2="3" stroke="#DCE2EA" stroke-width="1"/></pattern></defs>` +
    parts.join('') +
    `</svg>`
  )
}
