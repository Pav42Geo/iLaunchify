'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

/**
 * LandingNavDropdown — hover/focus-opening dropdown for "For creators" and
 * "For partners" in LandingHeader.
 *
 * Hover opens with a small delay to avoid flicker; clicking the trigger
 * navigates to the section root (handy on mobile where hover is absent and
 * a tap is the only interaction). Closes on outside-click and Escape.
 */

export interface LandingNavDropdownProps {
  label: string
  /** Trigger href — clicking the label navigates here (also acts as the
   * section landing page). */
  href: string
  items: { label: string; href: string; description?: string }[]
}

export function LandingNavDropdown({ label, href, items }: LandingNavDropdownProps) {
  const [open, setOpen] = React.useState(false)
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)

  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const closeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }

  React.useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
      onFocus={openNow}
      onBlur={closeSoon}
    >
      <Link
        href={href}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[14px] font-medium text-ink-700 hover:text-ink-900 transition-colors py-1"
      >
        {label}
        <ChevronDown
          strokeWidth={2}
          className={
            'w-3.5 h-3.5 text-ink-500 transition-transform duration-base ease-out-quart ' +
            (open ? 'rotate-180' : '')
          }
        />
      </Link>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full pt-3 z-50"
          onMouseEnter={openNow}
          onMouseLeave={closeSoon}
        >
          <div className="w-72 bg-white border border-ink-200 rounded-xl shadow-xl py-2 origin-top-left">
            {items.map((item) => {
              // Cross-origin URLs (apps/creator, apps/partner) get a raw
              // <a> so the browser does a hard nav instead of Next trying
              // to client-side route across origins.
              const isExternal =
                item.href.startsWith('http://') || item.href.startsWith('https://')
              const linkClass =
                'block px-4 py-2.5 hover:bg-ink-50 transition-colors group'
              const inner = (
                <>
                  <div className="text-[14px] font-semibold text-ink-900 group-hover:text-pink-700 transition-colors">
                    {item.label}
                  </div>
                  {item.description && (
                    <div className="text-[12px] text-ink-500 mt-0.5 leading-snug">
                      {item.description}
                    </div>
                  )}
                </>
              )
              return isExternal ? (
                <a key={item.href} href={item.href} role="menuitem" className={linkClass}>
                  {inner}
                </a>
              ) : (
                <Link key={item.href} href={item.href} role="menuitem" className={linkClass}>
                  {inner}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
