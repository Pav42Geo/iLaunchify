'use client'

// Facebook-style center nav cluster for the creator top bar.
//
// Mirrors apps/admin AdminCenterNav (same "stylish graphic-grey icons with a
// pink active underline" look Pavel asked for). Three large tab-style icon
// buttons centered in the header:
//   - Home                    → /dashboard        (internal)
//   - Marketplace             → marketing /marketplace (different port — <a>)
//   - Customize Your Product  → /briefs            (Co-Creation Studio entry)
//
// The "Customize Your Product" tab is active across every co-creation route
// (brief builder, briefs index, rooms) via the shared isCoCreationPath. The
// Maker-tier gate lives on the "Post a brief" CTA (not here) — the icon always
// opens the tool's home so Makers can still browse their briefs.

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Store, Wand2 } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { marketingUrl } from '@/lib/marketing-url'
import { isCoCreationPath } from './CoCreationTopbarSlots'

interface TabDef {
  key: 'home' | 'marketplace' | 'cocreation'
  label: string
  href: string
  external: boolean
  isActive: (pathname: string) => boolean
  Icon: typeof Home
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
    href: marketingUrl('/marketplace'),
    external: true,
    isActive: () => false,
    Icon: Store,
  },
  {
    key: 'cocreation',
    label: 'Customize Your Product',
    href: '/briefs',
    external: false,
    isActive: (p) => isCoCreationPath(p),
    Icon: Wand2,
  },
]

export function CreatorCenterNav() {
  const pathname = usePathname() ?? ''

  return (
    <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
      {TABS.map((tab) => {
        const active = tab.isActive(pathname)
        const Icon = tab.Icon

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
            <span className="sr-only">{tab.label}</span>
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
            <a key={tab.key} href={tab.href} title={tab.label} className={className}>
              {inner}
            </a>
          )
        }

        return (
          <Link key={tab.key} href={tab.href} title={tab.label} className={className}>
            {inner}
          </Link>
        )
      })}
    </nav>
  )
}
