'use client'

// Co-Creation Studio topbar sublabel — partner side (mirrors the creator
// app's CoCreationTopbarSlots; demo .sublabel). Shown on the Opportunity
// Pool + collaboration-room routes only. The partner topbar's center portal
// (gb-topbar-center) is untouched.

import { usePathname } from 'next/navigation'

function isCoCreationPath(pathname: string | null): boolean {
  if (!pathname) return false
  return pathname.startsWith('/opportunities') || pathname.startsWith('/rooms')
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
