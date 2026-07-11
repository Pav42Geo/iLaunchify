'use client'

// Facebook-style center nav cluster for the partner top bar.
//
// Mirrors apps/admin AdminCenterNav (large graphic-grey icons, pink active
// underline). Home + Marketplace show for every partner; the third tab —
// "Customize Your Product" → /opportunities (the Co-Creation Opportunity Pool)
// — only renders when this partner is eligible to see the pool (poolEligible,
// resolved in the dashboard layout from the co-creation settings + role).
//
// Hidden while the guided product builder is active (body.gb-active) so it
// doesn't collide with the builder's centered Save controls.

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

export function PartnerCenterNav({ poolEligible = false }: { poolEligible?: boolean }) {
  const pathname = usePathname() ?? ''

  const tabs: TabDef[] = [
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
    ...(poolEligible
      ? ([
          {
            // Partners don't customize their own product — they answer creator
            // briefs. Tooltip reflects the pool they're browsing.
            key: 'cocreation',
            label: 'Co-Creation Opportunities',
            href: '/opportunities',
            external: false,
            isActive: (p: string) => isCoCreationPath(p),
            Icon: Wand2,
          },
        ] as TabDef[])
      : []),
  ]

  return (
    <nav
      aria-label="Primary"
      className="hidden md:flex items-center gap-1 [body.gb-active_&]:hidden"
    >
      {tabs.map((tab) => {
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
