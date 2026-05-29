'use client'

import * as React from 'react'
import {
  selectAllObjects,
  objectsFromSelection,
  type FabricCanvas,
  type FabricObject,
} from '@ilaunchify/ui'

/**
 * useCanvasShortcuts — keyboard + interaction polish for the Design Studio.
 *
 *   Delete / Backspace → remove active object(s)
 *   Cmd/Ctrl + D       → duplicate active object(s) +20/+20 offset
 *   Cmd/Ctrl + A       → select all
 *   Arrow keys         → nudge active object 1px (Shift = 10px)
 *
 * Skips when an editable text object is in edit mode (so creators can
 * actually type inside an IText), or when focus is on an HTML input /
 * textarea — drawers would otherwise eat Delete/Backspace too.
 */
export function useCanvasShortcuts(canvas: FabricCanvas | null) {
  React.useEffect(() => {
    if (!canvas) return

    function isTextEditing(): boolean {
      if (!canvas) return false
      const obj = canvas.getActiveObject()
      if (!obj) return false
      const t = obj as unknown as { isEditing?: boolean }
      return !!t.isEditing
    }

    function isFocusInForm(): boolean {
      const el = document.activeElement as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable
      )
    }

    function onKey(e: KeyboardEvent) {
      if (!canvas) return
      if (isTextEditing() || isFocusInForm()) return

      const mod = e.metaKey || e.ctrlKey
      const active = canvas.getActiveObject() as FabricObject | null

      // Delete / Backspace → remove
      if ((e.key === 'Delete' || e.key === 'Backspace') && active) {
        e.preventDefault()
        removeActive(canvas)
        return
      }

      // Cmd/Ctrl + D → duplicate
      if (mod && (e.key === 'd' || e.key === 'D') && active) {
        e.preventDefault()
        duplicateActive(canvas, active)
        return
      }

      // Cmd/Ctrl + A → select all
      if (mod && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        selectAll(canvas)
        return
      }

      // Arrow keys → nudge
      if (active && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        nudge(canvas, active, e.key, step)
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canvas])
}

/* ============ canvas operations ============ */

export function removeActive(canvas: FabricCanvas) {
  const active = canvas.getActiveObject()
  if (!active) return
  for (const obj of objectsFromSelection(active as FabricObject)) {
    canvas.remove(obj)
  }
  canvas.discardActiveObject()
  canvas.requestRenderAll()
}

export async function duplicateActive(
  canvas: FabricCanvas,
  active: FabricObject,
) {
  try {
    const clone = await active.clone()
    clone.set({
      left: (active.left ?? 0) + 20,
      top: (active.top ?? 0) + 20,
    })
    canvas.add(clone)
    canvas.setActiveObject(clone)
    canvas.requestRenderAll()
  } catch (err) {
    console.warn('[canvas/shortcuts] duplicate failed:', err)
  }
}

export function selectAll(canvas: FabricCanvas) {
  selectAllObjects(canvas)
}

export function rotateActive(canvas: FabricCanvas, deltaDeg: number) {
  const active = canvas.getActiveObject()
  if (!active) return
  const current = active.angle ?? 0
  active.rotate((current + deltaDeg) % 360)
  canvas.fire('object:modified', { target: active })
  canvas.requestRenderAll()
}

export function resetRotation(canvas: FabricCanvas) {
  const active = canvas.getActiveObject()
  if (!active) return
  active.rotate(0)
  canvas.fire('object:modified', { target: active })
  canvas.requestRenderAll()
}

function nudge(
  canvas: FabricCanvas,
  active: FabricObject,
  key: string,
  step: number,
) {
  switch (key) {
    case 'ArrowUp':
      active.set('top', (active.top ?? 0) - step)
      break
    case 'ArrowDown':
      active.set('top', (active.top ?? 0) + step)
      break
    case 'ArrowLeft':
      active.set('left', (active.left ?? 0) - step)
      break
    case 'ArrowRight':
      active.set('left', (active.left ?? 0) + step)
      break
    default:
      return
  }
  active.setCoords()
  canvas.fire('object:modified', { target: active })
  canvas.requestRenderAll()
}
