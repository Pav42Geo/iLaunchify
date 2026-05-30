// Cream background for the entire marketplace surface.
//
// All routes under /marketplace inherit the design-system "cream"
// surface token (--cream: #FBFAF7), which makes the white product
// cards + nutrition panels pop instead of disappearing into the
// page. Per design system: data-surface="cream" switches the
// --bg-canvas variable on this subtree only; everything else (home,
// /business, /pricing, etc.) keeps its own surface.

import type { ReactNode } from 'react'

export default function MarketplaceLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div
      data-surface="cream"
      className="min-h-screen bg-[var(--bg-canvas)]"
    >
      {children}
    </div>
  )
}
