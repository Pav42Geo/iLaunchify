'use client'

// ObjectActions — small floating action chrome that appears just above
// the selected object, matching the Canva pattern (DS-60d).
//
// Five buttons: Lock / Duplicate / Delete / More.
// "More" opens the same ObjectContextMenu the right-click uses, so the
// action surface stays consistent across input methods.
//
// Position is computed in screen-space from the object's bounding rect +
// the canvas wrapper offset. Re-runs on selection / modification / scaling
// / scroll so it tracks the object live.
//
// Hides:
//   - while the object is being edited as text (Fabric IText isEditing)
//   - while the object is being moved or scaled (movement/scaling event)

import * as React from 'react'
import {
  Lock,
  Unlock,
  CopyPlus,
  Trash2,
  MoreHorizontal,
  RotateCw,
  Move,
  Ratio,
} from 'lucide-react'
import {
  duplicateObject,
  removeObject,
  toggleLock,
  isLocked,
  type FabricCanvas,
  type FabricObject,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  active: FabricObject
  /** Anchor element used to translate fabric coords → viewport coords. */
  canvasContainer: HTMLElement | null
  /** Open the right-click-style context menu at the given viewport coords. */
  onShowMore: (x: number, y: number) => void
}

export function ObjectActions({ canvas, active, canvasContainer, onShowMore }: Props) {
  // Re-render tick driven by canvas events so position + lock-state stay live.
  const [, force] = React.useReducer((n: number) => n + 1, 0)
  const [interacting, setInteracting] = React.useState(false)
  const rotateRef = React.useRef<{ cx: number; cy: number; startPointer: number; startAngle: number } | null>(null)
  const moveRef = React.useRef<{ px: number; py: number; left: number; top: number; zoom: number } | null>(null)
  const edgeRef = React.useRef<{
    axis: 'x' | 'y'
    dir: number // +1 for right/bottom bars, -1 for left/top
    uniform: boolean // true → proportional centered enlarge (text/QR); false → 1-axis stretch
    px: number
    py: number
    sx: number
    sy: number
    bw: number
    bh: number
    center: unknown
    zoom: number
  } | null>(null)

  React.useEffect(() => {
    if (!canvas) return
    const refresh = () => force()
    const startInteract = () => setInteracting(true)
    const endInteract = () => {
      setInteracting(false)
      force()
    }
    canvas.on('object:modified', refresh)
    canvas.on('object:moving', startInteract)
    canvas.on('object:scaling', startInteract)
    canvas.on('object:rotating', startInteract)
    canvas.on('mouse:up', endInteract)
    // Reposition on viewport zoom + the inner-div scroll (canvas pan).
    canvas.on('after:render', refresh)
    // The overlay is positioned in PAGE coords, so it must also reposition when the
    // canvas is scrolled (mouse-wheel pan) or the window resizes — those don't fire
    // a Fabric event. Capture-phase catches scrolls in any nested container.
    window.addEventListener('scroll', refresh, true)
    window.addEventListener('resize', refresh)
    return () => {
      canvas.off('object:modified', refresh)
      canvas.off('object:moving', startInteract)
      canvas.off('object:scaling', startInteract)
      canvas.off('object:rotating', startInteract)
      canvas.off('mouse:up', endInteract)
      canvas.off('after:render', refresh)
      window.removeEventListener('scroll', refresh, true)
      window.removeEventListener('resize', refresh)
    }
  }, [canvas])

  // Hide while editing text in place — would obscure the caret.
  const isEditing = !!(active as { isEditing?: boolean }).isEditing
  if (isEditing) return null

  // Single zoom-aware screen rect for the object — every overlay (top bar, rotate/
  // move pills, edge bars) derives from this, so they track the object at any zoom.
  const sr = objScreenRect(active, canvasContainer, canvas)
  if (!sr) return null

  const locked = isLocked(active)

  // While interacting (drag / scale / rotate) we keep the layout slot but
  // visually hide so the chrome doesn't lag behind the gesture.
  const visibility = interacting ? 'opacity-0 pointer-events-none' : 'opacity-100'

  const pos = { left: sr.left + sr.width / 2, top: sr.top - 10 }
  const bottom = { left: sr.left + sr.width / 2, top: sr.top + sr.height + 14 }
  // Hidden while locked — a locked object can't be moved or rotated.
  const showHandles = !locked
  // Mid-edge bars on all four sides. Behavior depends on object type:
  //   - text / QR / barcode → `uniform`: drag enlarges the object PROPORTIONALLY,
  //     centered (no distortion — glyphs/codes keep their aspect).
  //   - everything else (vectors / shapes / photos) → single-axis stretch, centered.
  const edges = {
    left: { x: sr.left, y: sr.top + sr.height / 2 },
    right: { x: sr.left + sr.width, y: sr.top + sr.height / 2 },
    top: { x: sr.left + sr.width / 2, y: sr.top },
    bottom: { x: sr.left + sr.width / 2, y: sr.top + sr.height },
  }
  const objType = (active as { type?: string }).type
  const isText = objType === 'i-text' || objType === 'text' || objType === 'textbox'
  const objCustom = (active as { customType?: string }).customType
  const isCode = objCustom === 'qr-code' || objCustom === 'barcode' || objCustom === 'internal-sku'
  const uniform = isText || isCode
  const showEdges = showHandles

  // --- Rotate handle: drag around the object center to spin it -------------
  const onRotateDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!canvas || locked) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const r = objScreenRect(active, canvasContainer, canvas)
    if (!r) return
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    rotateRef.current = {
      cx,
      cy,
      startPointer: Math.atan2(e.clientY - cy, e.clientX - cx),
      startAngle: Number(active.angle) || 0,
    }
  }
  const onRotateMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = rotateRef.current
    if (!r || e.buttons !== 1) return
    const cur = Math.atan2(e.clientY - r.cy, e.clientX - r.cx)
    let deg = r.startAngle + ((cur - r.startPointer) * 180) / Math.PI
    if (e.shiftKey) deg = Math.round(deg / 15) * 15 // hold Shift to snap to 15°
    deg = ((deg % 360) + 360) % 360
    // rotate() honors centeredRotation (spins around the object center).
    ;(active as unknown as { rotate: (a: number) => void }).rotate(deg)
    active.setCoords?.()
    canvas?.requestRenderAll()
  }
  const onRotateUp = () => {
    if (!rotateRef.current) return
    rotateRef.current = null
    canvas?.fire('object:modified', { target: active })
    force()
  }
  // Double-click the rotate handle → snap the object back to straight (0°).
  const resetRotation = () => {
    if (!canvas) return
    rotateRef.current = null
    ;(active as unknown as { rotate: (a: number) => void }).rotate(0)
    active.setCoords?.()
    canvas.fire('object:modified', { target: active })
    canvas.requestRenderAll()
    force()
  }

  // --- Move handle: drag to reposition (handy for tiny / locked-axis art) ---
  const onMoveDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!canvas || locked) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    moveRef.current = {
      px: e.clientX,
      py: e.clientY,
      left: Number(active.left) || 0,
      top: Number(active.top) || 0,
      zoom: canvas.getZoom?.() || 1,
    }
  }
  const onMoveMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const m = moveRef.current
    if (!m || e.buttons !== 1) return
    active.set({ left: m.left + (e.clientX - m.px) / m.zoom, top: m.top + (e.clientY - m.py) / m.zoom })
    active.setCoords?.()
    canvas?.requestRenderAll()
  }
  const onMoveUp = () => {
    if (!moveRef.current) return
    moveRef.current = null
    canvas?.fire('object:modified', { target: active })
    force()
  }

  // --- Mid-edge bars: drag a border line to resize the box, CENTERED (both sides
  // move, object stays pinned). `uniform` objects (text / QR / barcode) enlarge
  // proportionally without distortion; everything else stretches on that one axis. ---
  const onEdgeDown =
    (side: 'l' | 'r' | 't' | 'b', uniform: boolean) => (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!canvas || locked) return
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      const o = active as unknown as { getCenterPoint: () => unknown }
      edgeRef.current = {
        axis: side === 'l' || side === 'r' ? 'x' : 'y',
        dir: side === 'r' || side === 'b' ? 1 : -1,
        uniform,
        px: e.clientX,
        py: e.clientY,
        sx: Number(active.scaleX) || 1,
        sy: Number(active.scaleY) || 1,
        bw: Number((active as { width?: number }).width) || 1,
        bh: Number((active as { height?: number }).height) || 1,
        center: o.getCenterPoint(),
        zoom: canvas.getZoom?.() || 1,
      }
    }
  const onEdgeMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const m = edgeRef.current
    if (!m || e.buttons !== 1) return
    const o = active as unknown as {
      set: (v: object) => void
      setPositionByOrigin: (p: unknown, ox: string, oy: string) => void
      setCoords?: () => void
    }
    // Outward edge movement in object px (positive = grow). ×2 since both sides move.
    if (m.axis === 'x') {
      const eff = ((e.clientX - m.px) / m.zoom) * m.dir
      const startW = m.bw * m.sx
      if (m.uniform) {
        const f = startW > 0 ? Math.max(0.05, (startW + 2 * eff) / startW) : 1
        o.set({ scaleX: m.sx * f, scaleY: m.sy * f })
      } else {
        o.set({ scaleX: Math.max(0.05, m.sx + (2 * eff) / m.bw) })
      }
    } else {
      const eff = ((e.clientY - m.py) / m.zoom) * m.dir
      const startH = m.bh * m.sy
      if (m.uniform) {
        const f = startH > 0 ? Math.max(0.05, (startH + 2 * eff) / startH) : 1
        o.set({ scaleX: m.sx * f, scaleY: m.sy * f })
      } else {
        o.set({ scaleY: Math.max(0.05, m.sy + (2 * eff) / m.bh) })
      }
    }
    o.setPositionByOrigin(m.center, 'center', 'center') // keep the object centered in place
    o.setCoords?.()
    canvas?.requestRenderAll()
  }
  const onEdgeUp = () => {
    if (!edgeRef.current) return
    edgeRef.current = null
    canvas?.fire('object:modified', { target: active })
    force()
  }

  // "Reset proportions" — show only when the object has been stretched out of
  // its natural aspect ratio (e.g. by a template or legacy non-uniform scale).
  const sx = Number((active as { scaleX?: number }).scaleX) || 1
  const sy = Number((active as { scaleY?: number }).scaleY) || 1
  const stretched = Math.abs(sx - sy) > 0.01 * Math.max(sx, sy, 1)
  // Subtle visual hint: when the object is rotated, tilt the rotate icon a little
  // (capped) + ring it, so it's obvious you can double-click to straighten.
  const rawAngle = ((Number((active as { angle?: number }).angle) || 0) % 360 + 360) % 360
  const signedAngle = rawAngle > 180 ? rawAngle - 360 : rawAngle
  const isRotated = Math.abs(signedAngle) > 0.5
  const iconTilt = Math.max(-22, Math.min(22, signedAngle))
  const resetProportions = () => {
    if (!canvas) return
    const g = Math.sqrt(sx * sy) || 1 // preserve area, restore square scaling
    const o = active as unknown as {
      getCenterPoint: () => unknown
      setPositionByOrigin: (p: unknown, ox: string, oy: string) => void
      set: (v: object) => void
      setCoords?: () => void
    }
    const c = o.getCenterPoint()
    o.set({ scaleX: g, scaleY: g })
    o.setPositionByOrigin(c, 'center', 'center')
    o.setCoords?.()
    canvas.fire('object:modified', { target: active })
    canvas.requestRenderAll()
    force()
  }

  return (
    <>
      <div
        className={`pointer-events-none fixed z-30 transition-opacity ${visibility}`}
        style={{ left: pos.left, top: pos.top, transform: 'translate(-50%, -100%)' }}
      >
        <div className="pointer-events-auto inline-flex items-center gap-0.5 rounded-md border border-ink-200 bg-white px-1 py-0.5 shadow-md" style={{ zoom: 1.2 }}>
          <IconBtn
            ariaLabel={locked ? 'Unlock' : 'Lock'}
            onClick={() => canvas && toggleLock(canvas, active)}
            tone={locked ? 'active' : 'default'}
          >
            {locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn
            ariaLabel="Duplicate"
            onClick={() => canvas && void duplicateObject(canvas, active)}
          >
            <CopyPlus className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            ariaLabel="Delete"
            onClick={() => canvas && removeObject(canvas, active)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
          {stretched && (
            <IconBtn ariaLabel="Reset proportions" onClick={resetProportions}>
              <Ratio className="h-3.5 w-3.5" />
            </IconBtn>
          )}
          <div className="mx-0.5 h-4 w-px bg-ink-200" />
          <IconBtn
            ariaLabel="More actions"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
              onShowMore(rect.left, rect.bottom + 4)
            }}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>

      {/* Canva-style rotate + move handles, anchored below the object. */}
      {showHandles && bottom && (
        <div
          className="pointer-events-none fixed z-30"
          style={{ left: bottom.left, top: bottom.top, transform: 'translate(-50%, 0)' }}
        >
          <div className="pointer-events-auto inline-flex items-center gap-2" style={{ zoom: 1.2 }}>
            <button
              type="button"
              aria-label="Rotate"
              title="Drag to rotate · Shift to snap · double-click to straighten"
              onPointerDown={onRotateDown}
              onPointerMove={onRotateMove}
              onPointerUp={onRotateUp}
              onDoubleClick={resetRotation}
              className={
                'flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-full bg-pink-600 text-white shadow-md transition-colors hover:bg-pink-500 active:cursor-grabbing ' +
                (isRotated ? 'ring-2 ring-pink-300' : '')
              }
            >
              <RotateCw
                className="h-4 w-4 transition-transform duration-150"
                style={isRotated ? { transform: `rotate(${iconTilt}deg)` } : undefined}
              />
            </button>
            <button
              type="button"
              aria-label="Move"
              title="Drag to move"
              onPointerDown={onMoveDown}
              onPointerMove={onMoveMove}
              onPointerUp={onMoveUp}
              className="flex h-8 w-8 cursor-move touch-none items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 shadow-md transition-colors hover:bg-ink-50"
            >
              <Move className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Mid-edge bars on all four sides — drag a border to resize the box, centered.
          Text/QR/barcode enlarge proportionally; vectors/photos stretch one axis. */}
      {showEdges && (
        <>
          {([
            ['l', edges.left, 'h-6 w-2 cursor-ew-resize'],
            ['r', edges.right, 'h-6 w-2 cursor-ew-resize'],
            ['t', edges.top, 'h-2 w-6 cursor-ns-resize'],
            ['b', edges.bottom, 'h-2 w-6 cursor-ns-resize'],
          ] as const).map(([side, pt, shape]) => (
            <div
              key={side}
              className={`pointer-events-none fixed z-30 ${visibility}`}
              style={{ left: pt.x, top: pt.y, transform: 'translate(-50%, -50%)' }}
            >
              <button
                type="button"
                aria-label="Resize"
                title={uniform ? 'Drag to resize (stays centered)' : 'Drag to stretch (stays centered)'}
                onPointerDown={onEdgeDown(side, uniform)}
                onPointerMove={onEdgeMove}
                onPointerUp={onEdgeUp}
                className={`pointer-events-auto block touch-none rounded-full border border-pink-500 bg-white shadow-sm ${shape}`}
              />
            </div>
          ))}
        </>
      )}
    </>
  )
}

/**
 * The object's bounding rect mapped to PAGE coordinates, zoom-aware.
 *
 * getBoundingRect() is in object/canvas space (no viewport transform), so we
 * apply the canvas viewport transform (zoom + pan) and add the canvas element's
 * page offset. Every floating overlay derives from this, so they track the
 * object precisely at any studio zoom level.
 */
function objScreenRect(
  obj: FabricObject,
  container: HTMLElement | null,
  canvas: FabricCanvas | null,
): { left: number; top: number; width: number; height: number } | null {
  if (!container) return null
  const r = obj.getBoundingRect()
  const c = container.getBoundingClientRect()
  const vpt = ((canvas as unknown as { viewportTransform?: number[] })?.viewportTransform) ?? [1, 0, 0, 1, 0, 0]
  const z = vpt[0] || 1
  const ex = vpt[4] || 0
  const ey = vpt[5] || 0
  return {
    left: c.left + r.left * z + ex,
    top: c.top + r.top * z + ey,
    width: r.width * z,
    height: r.height * z,
  }
}

function IconBtn({
  children,
  ariaLabel,
  onClick,
  tone = 'default',
}: {
  children: React.ReactNode
  ariaLabel: string
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  tone?: 'default' | 'active'
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
      className={
        'rounded p-1.5 transition-colors ' +
        (tone === 'active'
          ? 'bg-ink-900 text-white hover:bg-black'
          : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900')
      }
    >
      {children}
    </button>
  )
}
