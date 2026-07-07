// Gray background for the entire marketplace surface.
//
// All routes under /marketplace inherit the design-system "gray"
// surface token (--bg-canvas: --ink-50 #F8F8F9 — the mood-board
// marketplace gray), which makes the white product cards + nutrition
// panels pop instead of disappearing into the page. Per design system:
// data-surface="gray" switches the --bg-canvas variable on this subtree
// only; everything else (home, /business, /pricing, etc.) keeps its own
// surface. (Switched from "cream" per Pavel 2026-06-25.)
//
// Also hosts the FavoritesProvider (docs/FAVORITES_MANAGEMENT.md §11) so every
// ProductCard heart under /marketplace wires to real per-creator favoriting
// without threading props through each call site. The save action + the
// creator's already-favorited set are injected here, once.

import type { ReactNode } from 'react'
import { FavoritesProvider } from '@ilaunchify/ui'
import { toggleFavoriteFromMarketplace, getAllFavoritedTemplateIds } from './favorites-actions'

export default async function MarketplaceLayout({
  children,
}: {
  children: ReactNode
}) {
  const favoritedIds = await getAllFavoritedTemplateIds()

  return (
    <div
      data-surface="gray"
      className="min-h-screen bg-[var(--bg-canvas)]"
    >
      <FavoritesProvider saveAction={toggleFavoriteFromMarketplace} initialFavoritedIds={favoritedIds}>
        {children}
      </FavoritesProvider>
    </div>
  )
}
