'use client'

// Co-Creation Studio topbar sublabel — partner side (mirrors the creator
// app's CoCreationTopbarSlots; demo .sublabel). Shown on the Opportunity
// Pool + collaboration-room routes only. The partner topbar's center portal
// (gb-topbar-center) is untouched.

import { usePathname } from 'next/navigation'

/** True on any partner Co-Creation Studio route (opportunity pool, collaboration
 *  rooms). Exported so the sidebar + header icon nav share one definition. */
export function isCoCreationPath(pathname: string | null): boolean {
  if (!pathname) return false
  return (
    pathname.startsWith('/opportunities') ||
    pathname.startsWith('/rooms') ||
    // Messages hub lives INSIDE the studio (Pavel 2026-07-13): the sidebar
    // stays reduced to the tool nav — you leave via the Account menu only.
    pathname.startsWith('/messages')
  )
}

export function CoCreationSublabel() {
  const pathname = usePathname()
  if (!isCoCreationPath(pathname)) return null
  return (
    <span className="ml-s-1 border-l border-ink-200 pl-s-3 text-ui-caption text-ink-500">
      Co-Creation Studio
    </span>
  )
}
