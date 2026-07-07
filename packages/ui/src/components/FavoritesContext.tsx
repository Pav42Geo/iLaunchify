'use client'

// FavoritesContext — lets any ProductCard wire its heart to real favoriting
// without threading props through every call site (docs/FAVORITES_MANAGEMENT.md
// §11). The consuming app wraps a subtree (e.g. the marketplace) in
// <FavoritesProvider>, passing a server action + the set of already-favorited
// template ids. ProductCard reads the context via useCardFavorite(templateId).
//
// Backward compatible: with no provider present, useCardFavorite reports
// `enabled: false` and ProductCard falls back to its own favorited/onFavorite
// props. The ui package stays app-agnostic — the save action is injected, never
// imported here.

import * as React from 'react'

export type FavoritesSaveResult = {
  ok: boolean
  saved?: boolean
  reason?: string
  loginUrl?: string
}

export type FavoritesSaveAction = (input: { templateId: string }) => Promise<FavoritesSaveResult>

interface FavoritesContextValue {
  favorited: Set<string>
  pending: Set<string>
  toggle: (templateId: string) => void
}

const FavoritesContext = React.createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({
  saveAction,
  initialFavoritedIds = [],
  children,
}: {
  saveAction: FavoritesSaveAction
  initialFavoritedIds?: string[]
  children: React.ReactNode
}) {
  const [favorited, setFavorited] = React.useState<Set<string>>(() => new Set(initialFavoritedIds))
  const [pending, setPending] = React.useState<Set<string>>(() => new Set())

  const toggle = React.useCallback(
    (templateId: string) => {
      if (!templateId) return
      const wasSaved = favorited.has(templateId)

      // Optimistic flip.
      setFavorited((prev) => {
        const next = new Set(prev)
        if (wasSaved) next.delete(templateId)
        else next.add(templateId)
        return next
      })
      setPending((prev) => new Set(prev).add(templateId))

      void saveAction({ templateId })
        .then((res) => {
          if (res.ok) {
            setFavorited((prev) => {
              const next = new Set(prev)
              if (res.saved) next.add(templateId)
              else next.delete(templateId)
              return next
            })
          } else if (res.reason === 'GUEST' && res.loginUrl) {
            window.location.href = res.loginUrl
          } else {
            // Revert on error.
            setFavorited((prev) => {
              const next = new Set(prev)
              if (wasSaved) next.add(templateId)
              else next.delete(templateId)
              return next
            })
          }
        })
        .catch(() => {
          setFavorited((prev) => {
            const next = new Set(prev)
            if (wasSaved) next.add(templateId)
            else next.delete(templateId)
            return next
          })
        })
        .finally(() => {
          setPending((prev) => {
            const next = new Set(prev)
            next.delete(templateId)
            return next
          })
        })
    },
    [favorited, saveAction],
  )

  const value = React.useMemo<FavoritesContextValue>(
    () => ({ favorited, pending, toggle }),
    [favorited, pending, toggle],
  )

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

/**
 * Per-card hook. Returns `enabled: false` when there's no provider or no
 * templateId (fixture cards) so ProductCard falls back to its own props.
 */
export function useCardFavorite(templateId?: string): {
  enabled: boolean
  saved: boolean
  pending: boolean
  toggle: () => void
} {
  const ctx = React.useContext(FavoritesContext)
  if (!ctx || !templateId) {
    return { enabled: false, saved: false, pending: false, toggle: () => {} }
  }
  return {
    enabled: true,
    saved: ctx.favorited.has(templateId),
    pending: ctx.pending.has(templateId),
    toggle: () => ctx.toggle(templateId),
  }
}
