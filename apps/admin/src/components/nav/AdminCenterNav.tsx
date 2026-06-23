'use client'

// Facebook-style center nav cluster for the admin top bar.
//
// Three large tab-style icon buttons sit in the middle of the header,
// active-aware via pathname:
//   - Home          → /dashboard          (admin's home, internal nav)
//   - Marketplace   → marketing /marketplace (different port — absolute URL)
//   - Design Studio → creator /studio with ?adminMode=1 (admin override; the
//                     full Admin Mode UX ships later — for now we just
//                     deep-link with the query flag so the Studio can
//                     pick it up when ready)
//
// Visual goals: Pavel asked for "Facebook-style icons — stylish graphic
// type gray icons". We use larger Lucide icons (h-7 w-7, stroke-[1.75])
// to read as illustrative rather than utility. Active state borrows the
// Facebook pattern: pink-500 (brand) underline + pink-500 icon stroke;
// inactive: ink-500 stroke with ink-100 hover background.
//
// The cluster is hidden below md so the topbar stays usable on narrow
// admin screens — admins can still reach everything via the sidebar.

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Store, Palette } from 'lucide-react'
import { cn } from '@ilaunchify/ui'

// Cross-app destinations. Dev defaults match the monorepo ports
// (creator/3000, partner/3002, admin/3003, marketing/3010). In production
// these come from env so we point at the real hostnames.
//
// We intentionally inline the URLs instead of importing a shared helper —
// no helper exists yet, and a single-purpose const keeps the component
// self-contained. If we add a real cross-app URL helper later we can
// migrate at that point.
const MARKETING_BASE = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3010'
const CREATOR_BASE = process.env.NEXT_PUBLIC_CREATOR_URL ?? 'http://localhost:3000'

interface TabDef {
  key: 'home' | 'marketplace' | 'studio'
  label: string
  href: string
  /** Whether the link points outside this app (uses <a> instead of <Link>). */
  external: boolean
  /** Match function on the current admin pathname (only meaningful for internal tabs). */
  isActive: (pathname: string) => boolean
  /** Lucide icon. Sized to 28px in render. */
  Icon: typeof Home
  /** When true, append "(Coming soon)" to the tooltip — Design Studio Admin Mode isn't built yet. */
  comingSoon?: boolean
}

const TABS: TabDef[] = [
  {
    key: 'home',
    label: 'Home',
    href: '/dashboard',
    external: false,
    isActive: (p) => p === '/dashboard' || p === '/',
    Icon: Home,
  },
  {
    key: 'marketplace',
    label: 'Marketplace',
    href: `${MARKETING_BASE}/marketplace`,
    external: true,
    isActive: () => false,
    Icon: Store,
  },
  {
    key: 'studio',
    label: 'Design Studio',
    // Opens the real creator Design Studio in admin template-author mode (Admin Mode
    // shipped 2026-06-23). Falls back to a blank surface if no die-cuts are seeded.
    href: `${CREATOR_BASE}/studio?adminMode=1`,
    external: true,
    isActive: () => false,
    Icon: Palette,
  },
]

export function AdminCenterNav() {
  const pathname = usePathname() ?? ''

  return (
    <nav
      aria-label="Admin quick navigation"
      className="hidden md:flex items-center gap-1"
    >
      {TABS.map((tab) => {
        const active = tab.isActive(pathname)
        const Icon = tab.Icon
        const tooltip = tab.comingSoon
          ? `${tab.label} (Admin Mode — coming soon)`
          : tab.label

        const inner = (
          <>
            <Icon
              className={cn(
                'h-7 w-7 transition-colors',
                active ? 'text-pink-600' : 'text-ink-500 group-hover:text-ink-700',
              )}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="sr-only">{tooltip}</span>
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-pink-500"
              />
            )}
          </>
        )

        const className = cn(
          'group relative inline-flex h-12 w-[112px] items-center justify-center rounded-xl transition-colors',
          'hover:bg-ink-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
          active && 'bg-pink-50/40',
        )

        if (tab.external) {
          return (
            <a
              key={tab.key}
              href={tab.href}
              target="_blank"
              rel="noopener noreferrer"
              title={tooltip}
              className={className}
            >
              {inner}
            </a>
          )
        }

        return (
          <Link key={tab.key} href={tab.href} title={tooltip} className={className}>
            {inner}
          </Link>
        )
      })}
    </nav>
  )
}
