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
    return () => {
      canvas.off('object:modified', refresh)
      canvas.off('object:moving', startInteract)
      canvas.off('object:scaling', startInteract)
      canvas.off('object:rotating', startInteract)
      canvas.off('mouse:up', endInteract)
      canvas.off('after:render', refresh)
    }
  }, [canvas])

  // Hide while editing text in place — would obscure the caret.
  const isEditing = !!(active as { isEditing?: boolean }).isEditing
  if (isEditing) return null

  const pos = computeChromePosition(active, canvasContainer)
  if (!pos) return null

  const locked = isLocked(active)

  // While interacting (drag / scale / rotate) we keep the layout slot but
  // visually hide so the chrome doesn't lag behind the gesture.
  const visibility = interacting ? 'opacity-0 pointer-events-none' : 'opacity-100'

  const bottom = computeBottomPosition(active, canvasContainer)
  // Hidden while locked — a locked object can't be moved or rotated.
  const showHandles = !!bottom && !locked

  // --- Rotate handle: drag around the object center to spin it -------------
  const onRotateDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!canvas || locked) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const c = objectScreenCenter(active, canvasContainer)
    if (!c) return
    rotateRef.current = {
      cx: c.cx,
      cy: c.cy,
      startPointer: Math.atan2(e.clientY - c.cy, e.clientX - c.cx),
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
    </>
  )
}

/**
 * Translate the active object's bounding rect (canvas coords) into
 * viewport-space coords for the floating chrome.
 *
 * The chrome wants to sit centered horizontally above the object, with a
 * small gap. We anchor at the top-center of the object's bounding rect
 * and add a fixed pixel gap.
 */
function computeChromePosition(
  obj: FabricObject,
  container: HTMLElement | null,
): { left: number; top: number } | null {
  if (!container) return null
  const rect = obj.getBoundingRect()
  const containerRect = container.getBoundingClientRect()
  // rect.left / rect.top are in canvas-element coordinates; the canvas
  // element fills the container, so we add the container's viewport offset.
  return {
    left: containerRect.left + rect.left + rect.width / 2,
    top: containerRect.top + rect.top - 10,
  }
}

/** Bottom-center of the object's bounding rect, in viewport coords, with a gap —
 *  anchor for the rotate + move handles. */
function computeBottomPosition(
  obj: FabricObject,
  container: HTMLElement | null,
): { left: number; top: number } | null {
  if (!container) return null
  const rect = obj.getBoundingRect()
  const c = container.getBoundingClientRect()
  return {
    left: c.left + rect.left + rect.width / 2,
    top: c.top + rect.top + rect.height + 14,
  }
}

/** Center of the object's bounding rect, in viewport coords (the rotation pivot
 *  for centered rotation). */
function objectScreenCenter(
  obj: FabricObject,
  container: HTMLElement | null,
): { cx: number; cy: number } | null {
  if (!container) return null
  const rect = obj.getBoundingRect()
  const c = container.getBoundingClientRect()
  return {
    cx: c.left + rect.left + rect.width / 2,
    cy: c.top + rect.top + rect.height / 2,
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
