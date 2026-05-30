// Cream background for the niche-landing SEO surface.
//
// Niche pages (/launch/[niche]) are the SEO-driven funnel into the
// marketplace, so they should feel like the same shop — same cream
// canvas as /marketplace. Per design system: data-surface="cream"
// switches --bg-canvas to var(--cream) on this subtree only.

import type { ReactNode } from 'react'

export default function LaunchLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-surface="cream"
      className="min-h-screen bg-[var(--bg-canvas)]"
    >
      {children}
    </div>
  )
}
