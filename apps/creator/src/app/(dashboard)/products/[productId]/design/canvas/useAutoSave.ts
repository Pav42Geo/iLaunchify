'use client'

import * as React from 'react'
import type { FabricCanvas } from '@ilaunchify/ui'
import { saveDesignJson } from './actions'

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export interface AutoSaveState {
  status: SaveStatus
  lastSavedAt: Date | null
  error: string | null
  /** Force a save right now (e.g. from a manual ⌘S handler). */
  saveNow: () => Promise<void>
}

interface Options {
  /** Debounce window — wait this long after last change before saving. Default 1500ms. */
  debounceMs?: number
}

/**
 * useAutoSave — debounced persistence of canvas state to DesignVersion.
 *
 * Subscribes to fabric's object:added/modified/removed (same event set as
 * useCanvasHistory but with longer debounce); after each change waits
 * `debounceMs` of quiet time, then serializes canvas.toJSON() and calls
 * the server action saveDesignJson.
 *
 * Also flushes on Page Hide / beforeunload so a quick close doesn't lose
 * the last edit; the in-flight promise blocks navigation just long enough
 * for the request to reach the server.
 */
export function useAutoSave(
  canvas: FabricCanvas | null,
  productId: string,
  opts: Options = {},
): AutoSaveState {
  const debounceMs = opts.debounceMs ?? 1500

  const [status, setStatus] = React.useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = React.useRef(false)
  const savingRef = React.useRef(false)
  const canvasRef = React.useRef<FabricCanvas | null>(null)
  canvasRef.current = canvas

  const flush = React.useCallback(async () => {
    if (!canvasRef.current || savingRef.current) return
    savingRef.current = true
    dirtyRef.current = false
    setStatus('saving')
    setError(null)
    try {
      const json = canvasRef.current.toJSON()
      const result = await saveDesignJson(productId, json)
      if (result.ok) {
        setLastSavedAt(new Date(result.savedAt))
        setStatus('saved')
      } else {
        setError(result.error)
        setStatus('error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setStatus('error')
    } finally {
      savingRef.current = false
      // If another change came in while we were saving, schedule another save.
      if (dirtyRef.current && canvasRef.current) {
        scheduleSave()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  const scheduleSave = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      flush()
    }, debounceMs)
  }, [flush, debounceMs])

  React.useEffect(() => {
    if (!canvas) return
    function onChange() {
      dirtyRef.current = true
      setStatus('dirty')
      scheduleSave()
    }
    canvas.on('object:added', onChange)
    canvas.on('object:modified', onChange)
    canvas.on('object:removed', onChange)
    return () => {
      canvas.off('object:added', onChange)
      canvas.off('object:modified', onChange)
      canvas.off('object:removed', onChange)
    }
  }, [canvas, scheduleSave])

  // Flush on page hide / unload so a quick close doesn't lose the last edit.
  React.useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current || savingRef.current) {
        // Setting returnValue triggers the browser confirm dialog in most browsers.
        e.preventDefault()
        e.returnValue = ''
      }
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden' && dirtyRef.current) {
        flush()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flush])

  // Tear down pending timer on unmount.
  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { status, lastSavedAt, error, saveNow: flush }
}
