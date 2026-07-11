'use client'

// Co-Creation Studio topbar mode (Pavel 2026-07-10, demo .sublabel):
// on co-creation routes the header shows "| Co-Creation Studio" after the
// logo — hairline divider, same font/size as the prototype (12px regular,
// ink-500) — and the marketplace search bar is hidden. Everywhere else the
// topbar is unchanged. Route detection is client-side (the topbar itself is
// a server component rendered once by the layout).

import { usePathname } from 'next/navigation'
import { MarketplaceSearchLauncher } from './MarketplaceSearchLauncher'

/** True on any creator Co-Creation Studio route (brief builder, briefs index,
 *  collaboration rooms). Exported so the sidebar + header icon nav share one
 *  definition of "we're inside the tool". */
export function isCoCreationPath(pathname: string | null): boolean {
  if (!pathname) return false
  return (
    pathname.startsWith('/products/new/brief') ||
    pathname.startsWith('/briefs') ||
    pathname.startsWith('/rooms')
  )
}

/** Demo `.sublabel`: divider + label beside the logo, co-creation routes only. */
export function CoCreationSublabel() {
  const pathname = usePathname()
  if (!isCoCreationPath(pathname)) return null
  return (
    <span className="ml-s-1 border-l border-ink-200 pl-s-3 text-ui-caption text-ink-500">
      Co-Creation Studio
    </span>
  )
}

/** Search launcher everywhere EXCEPT co-creation routes. */
export function CreatorTopbarCenter() {
  const pathname = usePathname()
  if (isCoCreationPath(pathname)) return null
  return <MarketplaceSearchLauncher />
}
