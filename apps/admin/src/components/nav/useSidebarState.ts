'use client'

// Admin sidebar v3 — open/closed state persistence.
//
// Per-section open state survives full page reloads via localStorage. SSR-
// safe: starts from the static defaultOpen from sidebar-config and rehydrates
// on first client render so the markup matches.

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'iLaunchify.admin.sidebar.v3'

type OpenMap = Record<string, boolean>

function readStorage(): OpenMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as OpenMap
  } catch {
    return {}
  }
}

function writeStorage(value: OpenMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* quota or private-mode — ignore */
  }
}

/**
 * Returns a stable `[isOpen, toggle]` interface for a given section id.
 *
 * `defaultOpen` from sidebar-config drives the initial SSR markup. Once the
 * client mounts, the value is overridden by what's in localStorage (if
 * present). That tiny flicker is fine for a power-user surface.
 */
export function useSidebarSection(id: string, defaultOpen: boolean) {
  const [open, setOpen] = useState<boolean>(defaultOpen)
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from storage on first client render.
  useEffect(() => {
    const stored = readStorage()
    if (Object.prototype.hasOwnProperty.call(stored, id)) {
      setOpen(Boolean(stored[id]))
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev
      const stored = readStorage()
      stored[id] = next
      writeStorage(stored)
      return next
    })
  }, [id])

  return [open, toggle, hydrated] as const
}
