// Smart alignment guides + spacing measurements (Canva-style).
//
// Pure geometry — no Fabric, no DOM — so it's unit-testable. The Stage feeds it
// screen-space bounding rects (already zoom-applied) for the moving object, the
// die-line trim frame, and every other object; it returns:
//   - dx / dy : the sticky snap offset to apply to the moving object (screen px)
//   - vLines / hLines : alignment guide positions to draw (screen coords)
//   - gaps : spacing segments (with measured distance + equal-spacing flag) to
//            draw as Canva-style distance pills.
//
// All inputs/outputs are in SCREEN pixels. `zoom` converts a screen distance to
// design pixels for the human-readable measurement label.

export interface SGRect {
  left: number
  top: number
  width: number
  height: number
}

export interface SGGap {
  axis: 'x' | 'y'
  /** Start coordinate along the axis (screen px). */
  a: number
  /** End coordinate along the axis (screen px). */
  b: number
  /** Perpendicular position to draw the segment at (screen px). */
  cross: number
  /** Measured gap in DESIGN px (screen ÷ zoom), for the label. */
  dist: number
  /** True when this gap is part of an equal-spacing (symmetry) match. */
  equal: boolean
}

export interface SGResult {
  dx: number
  dy: number
  vLines: number[]
  hLines: number[]
  gaps: SGGap[]
}

export interface SGOptions {
  /** Snap pull radius in screen px. Default 6. */
  threshold?: number
  /** Viewport zoom, to convert screen px → design px for labels. Default 1. */
  zoom?: number
}

const xEdges = (r: SGRect): number[] => [r.left, r.left + r.width / 2, r.left + r.width]
const yEdges = (r: SGRect): number[] => [r.top, r.top + r.height / 2, r.top + r.height]

/** Smallest signed delta that pulls one of `edges` onto one of `targets`, or null. */
function bestDelta(edges: number[], targets: number[], threshold: number): number | null {
  let best: number | null = null
  for (const e of edges) {
    for (const t of targets) {
      const d = t - e
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d
    }
  }
  return best
}

/** Target lines that coincide with a moving edge after shifting by `delta`. */
function activeLines(edges: number[], targets: number[], delta: number, eps = 0.5): number[] {
  const out = new Set<number>()
  for (const e of edges) {
    for (const t of targets) {
      if (Math.abs(e + delta - t) <= eps) out.add(Math.round(t * 100) / 100)
    }
  }
  return [...out]
}

const shift = (r: SGRect, dx: number, dy: number): SGRect => ({
  left: r.left + dx,
  top: r.top + dy,
  width: r.width,
  height: r.height,
})

const overlap1d = (a0: number, a1: number, b0: number, b1: number): boolean => a0 < b1 && b0 < a1

/**
 * Nearest neighbor gaps around `m` along one axis (only objects overlapping in the
 * perpendicular axis count). Returns the left/top gap and right/bottom gap.
 */
function neighborGaps(
  m: SGRect,
  others: SGRect[],
  axis: 'x' | 'y',
  zoom: number,
): { before: SGGap | null; after: SGGap | null } {
  const horiz = axis === 'x'
  const mStart = horiz ? m.left : m.top
  const mEnd = horiz ? m.left + m.width : m.top + m.height
  const mCross0 = horiz ? m.top : m.left
  const mCross1 = horiz ? m.top + m.height : m.left + m.width

  let before: { gap: number; edge: number; cross: number } | null = null
  let after: { gap: number; edge: number; cross: number } | null = null

  for (const o of others) {
    const oStart = horiz ? o.left : o.top
    const oEnd = horiz ? o.left + o.width : o.top + o.height
    const oCross0 = horiz ? o.top : o.left
    const oCross1 = horiz ? o.top + o.height : o.left + o.width
    if (!overlap1d(mCross0, mCross1, oCross0, oCross1)) continue
    const cross = (Math.max(mCross0, oCross0) + Math.min(mCross1, oCross1)) / 2
    if (oEnd <= mStart) {
      const gap = mStart - oEnd
      if (!before || gap < before.gap) before = { gap, edge: oEnd, cross }
    } else if (oStart >= mEnd) {
      const gap = oStart - mEnd
      if (!after || gap < after.gap) after = { gap, edge: oStart, cross }
    }
  }

  const toGap = (
    side: { gap: number; edge: number; cross: number } | null,
    isAfter: boolean,
  ): SGGap | null => {
    if (!side) return null
    const a = isAfter ? mEnd : side.edge
    const b = isAfter ? side.edge : mStart
    return { axis, a, b, cross: side.cross, dist: side.gap / zoom, equal: false }
  }

  return { before: toGap(before, false), after: toGap(after, true) }
}

export function computeSmartGuides(
  moving: SGRect,
  frame: SGRect | null,
  others: SGRect[],
  opts: SGOptions = {},
): SGResult {
  const threshold = opts.threshold ?? 6
  const zoom = opts.zoom ?? 1

  // Build alignment targets: the die-line frame edges + center, plus every other
  // object's edges + centers.
  const targetsX: number[] = []
  const targetsY: number[] = []
  if (frame) {
    targetsX.push(...xEdges(frame))
    targetsY.push(...yEdges(frame))
  }
  for (const o of others) {
    targetsX.push(...xEdges(o))
    targetsY.push(...yEdges(o))
  }

  let dx = bestDelta(xEdges(moving), targetsX, threshold) ?? 0
  let dy = bestDelta(yEdges(moving), targetsY, threshold) ?? 0

  let moved = shift(moving, dx, dy)

  // Equal-spacing (symmetry) snap: when not already edge-snapped on an axis and the
  // moving object sits between two neighbors with near-equal gaps, nudge it so the
  // two gaps match exactly — the "sticky" symmetry feel.
  const hx = neighborGaps(moved, others, 'x', zoom)
  if (dx === 0 && hx.before && hx.after) {
    const gl = hx.before.dist * zoom
    const gr = hx.after.dist * zoom
    if (Math.abs(gl - gr) <= threshold * 2) {
      dx += (gr - gl) / 2
      moved = shift(moving, dx, dy)
    }
  }
  const vy = neighborGaps(moved, others, 'y', zoom)
  if (dy === 0 && vy.before && vy.after) {
    const gt = vy.before.dist * zoom
    const gb = vy.after.dist * zoom
    if (Math.abs(gt - gb) <= threshold * 2) {
      dy += (gb - gt) / 2
      moved = shift(moving, dx, dy)
    }
  }

  const vLines = activeLines(xEdges(moving), targetsX, dx)
  const hLines = activeLines(yEdges(moving), targetsY, dy)

  // Re-measure gaps after the final snap, and flag equal pairs for symmetry pills.
  const gaps: SGGap[] = []
  const fx = neighborGaps(moved, others, 'x', zoom)
  const fy = neighborGaps(moved, others, 'y', zoom)
  for (const pair of [fx, fy]) {
    const equal =
      !!pair.before &&
      !!pair.after &&
      Math.abs(pair.before.dist - pair.after.dist) <= threshold / zoom
    if (pair.before) gaps.push({ ...pair.before, equal })
    if (pair.after) gaps.push({ ...pair.after, equal })
  }

  return { dx, dy, vLines, hLines, gaps }
}
