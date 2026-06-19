'use client'

// Live die-line frame compliance — runs the SAME pure gate the server checkout
// uses (checkFrameCompliance), but sourced from the LIVE Fabric canvas instead
// of the saved design JSON. Here object boxes come from getBoundingRect(), which
// is exact (Fabric resolves origin/scale/angle), so bounds checking carries no
// false-positive risk — unlike reverse-engineering boxes off serialized JSON.
//
// This is the right home for bounds: the creator sees "X extends outside the
// safe area" live while dragging, and the server gate stays presence+freshness.

import {
  frameKindFromCanvasRole,
  checkFrameCompliance,
  type FabricCanvas,
  type FrameLayout,
  type ComplianceContext,
  type ComplianceReport,
  type PlacedObject,
  type NormBox,
  type FrameKind,
} from '@ilaunchify/ui'

/** Trim geometry needed to map scene px ↔ frame-normalized space. */
export interface FrameDims {
  widthMm: number
  heightMm: number
  bleedMm: number
  basePxPerMm: number
}

interface BBox { left: number; top: number; width: number; height: number }

/**
 * Invert the shell's NormBox→px mapping used by FrameGuides / the snap effect:
 *   fx = (bleedMm + box.x * widthMm) * basePxPerMm
 * so:
 *   box.x = (left / basePxPerMm - bleedMm) / widthMm
 * The bbox is in scene px (getBoundingRect, pre-viewport) — the same space the
 * objects are positioned in (mm × basePxPerMm) — so the round-trip is exact.
 */
function bboxToNormBox(r: BBox, d: FrameDims): NormBox {
  return {
    x: (r.left / d.basePxPerMm - d.bleedMm) / d.widthMm,
    y: (r.top / d.basePxPerMm - d.bleedMm) / d.heightMm,
    w: r.width / d.basePxPerMm / d.widthMm,
    h: r.height / d.basePxPerMm / d.heightMm,
  }
}

type Tagged = {
  customType?: string
  customRole?: string
  visible?: boolean
  recipeHash?: string | null
  getBoundingRect: () => BBox
}

/** Collect role-tagged canvas objects as PlacedObjects in frame-normalized space. */
export function placedFramesFromCanvas(
  canvas: FabricCanvas,
  dims: FrameDims,
  currentRecipeHash: string | null,
): PlacedObject[] {
  const placed: PlacedObject[] = []
  for (const o of canvas.getObjects()) {
    const oo = o as unknown as Tagged
    const kind = frameKindFromCanvasRole(oo.customType, oo.customRole)
    if (!kind) continue
    // An UN-stamped recipe object inherits the current hash → reads fresh,
    // matching the server gate so the Studio and checkout never disagree.
    const recipeHash = oo.recipeHash ?? currentRecipeHash
    placed.push({ kind, visible: oo.visible !== false, box: bboxToNormBox(oo.getBoundingRect(), dims), recipeHash })
  }
  return placed
}

/**
 * Run the die-line frame gate against the live canvas. Returns null when there
 * is no die-line layout / context / dims (no frames to check).
 */
export function runFrameComplianceFromCanvas(
  canvas: FabricCanvas | null,
  layout: FrameLayout | null | undefined,
  ctx: ComplianceContext | null | undefined,
  dims: FrameDims | null | undefined,
): ComplianceReport | null {
  if (!canvas || !layout || !ctx || !dims) return null
  const placed = placedFramesFromCanvas(canvas, dims, ctx.currentRecipeHash ?? null)
  return checkFrameCompliance(layout, placed, ctx)
}

/** Select the first visible canvas object that satisfies a given frame kind. */
export function selectObjectForKind(canvas: FabricCanvas | null, kind: FrameKind): void {
  if (!canvas) return
  for (const o of canvas.getObjects()) {
    const oo = o as unknown as { customType?: string; customRole?: string; visible?: boolean }
    if (oo.visible === false) continue
    if (frameKindFromCanvasRole(oo.customType, oo.customRole) === kind) {
      canvas.setActiveObject(o)
      canvas.requestRenderAll()
      return
    }
  }
}
