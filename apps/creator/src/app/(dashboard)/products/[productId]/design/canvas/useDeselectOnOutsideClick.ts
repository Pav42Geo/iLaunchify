'use client'

// useDeselectOnOutsideClick (DS-73a) — when the creator clicks anywhere in
// the workspace that is NOT inside the canvas container (i.e., the dim grey
// `bg-ink-100` area around the die-line), clear Fabric's active selection.
//
// Fabric already handles clicks ON the canvas (it picks the topmost object
// or, if you click empty canvas, discards selection). The workspace area
// surrounding the canvas, however, is plain DOM — clicking there used to
// leave the previously-selected object highlighted.
//
// We hook the wrapping scroll element's mousedown and check whether the
// target lives inside the canvas container ref. If not → discardActiveObject.

import * as React from 'react'
import type { FabricCanvas } from '@ilaunchify/ui'

export function useDeselectOnOutsideClick(
  scrollEl: HTMLElement | null,
  canvasContainerEl: HTMLElement | null,
  canvas: FabricCanvas | null,
) {
  React.useEffect(() => {
    if (!scrollEl || !canvas) return

    function onMouseDown(e: MouseEvent) {
      if (!canvas) return
      const target = e.target as Node | null
      if (!target) return
      // Inside the canvas container → let Fabric handle it.
      if (canvasContainerEl && canvasContainerEl.contains(target)) return
      // Outside → discard the active selection.
      const active = canvas.getActiveObject()
      if (active) {
        canvas.discardActiveObject()
        canvas.requestRenderAll()
      }
    }

    scrollEl.addEventListener('mousedown', onMouseDown)
    return () => scrollEl.removeEventListener('mousedown', onMouseDown)
  }, [scrollEl, canvasContainerEl, canvas])
}
