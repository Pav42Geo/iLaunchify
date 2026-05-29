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

  return (
    <div
      className={`pointer-events-none fixed z-30 transition-opacity ${visibility}`}
      style={{ left: pos.left, top: pos.top, transform: 'translate(-50%, -100%)' }}
    >
      <div className="pointer-events-auto inline-flex items-center gap-0.5 rounded-md border border-ink-200 bg-white px-1 py-0.5 shadow-md">
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
        <div className="mx-0.5 h-4 w-px bg-ink-200" />
        <IconBtn
          ariaLabel="More actions"
          onClick={(e) => {
            // Anchor the menu to the More button position.
            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
            onShowMore(rect.left, rect.bottom + 4)
          }}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </IconBtn>
      </div>
    </div>
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
