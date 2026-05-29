'use client'

// useObjectClipboard — internal copy/paste/cut state + Cmd+C/V/X bindings
// for the Design Studio (DS-60b).
//
// Lives outside the OS clipboard intentionally — the OS clipboard would
// be useful for cross-app pasting but exposes the Fabric serialization
// (a large JSON blob) to the user's clipboard, which surprises them when
// they paste in a chat window. Internal clipboard keeps it scoped to the
// editor.
//
// The clipboard stores a Fabric clone (not a reference) so the source can
// be safely deleted (cut) before paste. Paste re-clones from the stored
// clone so multiple pastes don't all share identity.

import * as React from 'react'
import type { FabricCanvas, FabricObject } from '@ilaunchify/ui'

export interface ObjectClipboard {
  copy: (obj: FabricObject) => Promise<void>
  cut: (obj: FabricObject) => Promise<void>
  paste: () => Promise<FabricObject | null>
  hasContents: () => boolean
}

export function useObjectClipboard(canvas: FabricCanvas | null): ObjectClipboard {
  // Clipboard slot — holds a clone we re-clone from on every paste.
  const slotRef = React.useRef<FabricObject | null>(null)

  const copy = React.useCallback(async (obj: FabricObject) => {
    try {
      slotRef.current = await obj.clone()
    } catch (err) {
      console.warn('[useObjectClipboard] copy failed:', err)
    }
  }, [])

  const cut = React.useCallback(
    async (obj: FabricObject) => {
      if (!canvas) return
      await copy(obj)
      canvas.remove(obj)
      canvas.discardActiveObject()
      canvas.requestRenderAll()
    },
    [canvas, copy],
  )

  const paste = React.useCallback(async (): Promise<FabricObject | null> => {
    if (!canvas) return null
    const slot = slotRef.current
    if (!slot) return null
    try {
      const clone = await slot.clone()
      // Offset slightly so the paste lands visibly next to the source —
      // matches duplicate behavior.
      clone.set({
        left: (clone.left ?? 0) + 20,
        top: (clone.top ?? 0) + 20,
      })
      canvas.add(clone)
      canvas.setActiveObject(clone)
      canvas.requestRenderAll()
      return clone
    } catch (err) {
      console.warn('[useObjectClipboard] paste failed:', err)
      return null
    }
  }, [canvas])

  const hasContents = React.useCallback(() => slotRef.current !== null, [])

  // Bind Cmd/Ctrl + C / V / X globally. Skip when focus is in a form
  // input (drawer text fields would otherwise paste fabric clones).
  React.useEffect(() => {
    if (!canvas) return

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

    function isTextEditing(): boolean {
      if (!canvas) return false
      const obj = canvas.getActiveObject()
      if (!obj) return false
      const t = obj as unknown as { isEditing?: boolean }
      return !!t.isEditing
    }

    function onKey(e: KeyboardEvent) {
      if (!canvas) return
      if (isFocusInForm() || isTextEditing()) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      const active = canvas.getActiveObject() as FabricObject | null
      if (key === 'c' && active) {
        e.preventDefault()
        void copy(active)
      } else if (key === 'x' && active) {
        e.preventDefault()
        void cut(active)
      } else if (key === 'v') {
        e.preventDefault()
        void paste()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canvas, copy, cut, paste])

  return { copy, cut, paste, hasContents }
}
