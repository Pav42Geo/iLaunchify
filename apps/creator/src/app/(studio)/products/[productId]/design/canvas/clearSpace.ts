// C8 — clear-space collision detection. A cert badge placed with a
// clearSpaceFactor (clear space = factor × mark height) must have a clear margin
// around it; nothing else may sit inside that zone. This is a NON-blocking flag
// surfaced in the compliance panel — the creator decides, we just warn.
//
// Pure + canvas-only (no React/server). Uses fabric getBoundingRect() for
// absolute bounding boxes, so it's correct regardless of rotation/scale.

import type { FabricCanvas, FabricObject } from '@ilaunchify/ui'

const CERT_BADGE_TYPE = 'cert-badge'

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface ClearSpaceViolation {
  certInstanceId: string
  /** How many other objects intrude into this badge's clear-space zone. */
  intruders: number
}

function customData(o: FabricObject): Record<string, unknown> | null {
  const d = (o as { customData?: unknown }).customData
  return d && typeof d === 'object' ? (d as Record<string, unknown>) : null
}

function boundingRect(o: FabricObject): Rect | null {
  const fn = (o as { getBoundingRect?: (abs?: boolean) => { left: number; top: number; width: number; height: number } })
    .getBoundingRect
  if (typeof fn !== 'function') return null
  const r = fn.call(o, true)
  return { left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height }
}

function intersects(a: Rect, b: Rect): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

function area(r: Rect): number {
  return Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top)
}

/**
 * Find cert badges whose clear-space zone is intruded upon. Background-scale
 * objects (≥80% of the canvas — a full-bleed fill or background image) are
 * ignored, as are the badge itself and its own required-co-text caption.
 */
export function findClearSpaceViolations(canvas: FabricCanvas): ClearSpaceViolation[] {
  const objects = canvas.getObjects()
  const canvasArea = canvas.getWidth() * canvas.getHeight()
  const out: ClearSpaceViolation[] = []

  for (const badge of objects) {
    if ((badge as { customType?: unknown }).customType !== CERT_BADGE_TYPE) continue
    const cd = customData(badge)
    const factor = typeof cd?.clearSpaceFactor === 'number' ? cd.clearSpaceFactor : 0
    const certInstanceId = typeof cd?.certInstanceId === 'string' ? cd.certInstanceId : null
    if (!factor || factor <= 0 || !certInstanceId) continue

    const br = boundingRect(badge)
    if (!br) continue
    const margin = factor * (br.bottom - br.top)
    const zone: Rect = {
      left: br.left - margin,
      top: br.top - margin,
      right: br.right + margin,
      bottom: br.bottom + margin,
    }

    let intruders = 0
    for (const o of objects) {
      if (o === badge) continue
      const ocd = customData(o)
      // The badge's own required co-text is part of the lockup — exempt it.
      if (ocd?.coTextFor === certInstanceId) continue
      const r = boundingRect(o)
      if (!r) continue
      // Skip background-scale objects (full-bleed fills / background images).
      if (area(r) >= 0.8 * canvasArea) continue
      if (intersects(r, zone)) intruders++
    }

    if (intruders > 0) out.push({ certInstanceId, intruders })
  }

  return out
}
