// Gray background for the entire marketplace surface.
//
// All routes under /marketplace inherit the design-system "gray"
// surface token (--bg-canvas: --ink-50 #F8F8F9 — the mood-board
// marketplace gray), which makes the white product cards + nutrition
// panels pop instead of disappearing into the page. Per design system:
// data-surface="gray" switches the --bg-canvas variable on this subtree
// only; everything else (home, /business, /pricing, etc.) keeps its own
// surface. (Switched from "cream" per Pavel 2026-06-25.)

import type { ReactNode } from 'react'

export default function MarketplaceLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div
      data-surface="gray"
      className="min-h-screen bg-[var(--bg-canvas)]"
    >
      {children}
    </div>
  )
}
