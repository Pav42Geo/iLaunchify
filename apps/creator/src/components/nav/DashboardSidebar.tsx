'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import {
  Home,
  Store,
  Package,
  ShoppingBag,
  Sparkles,
  Settings,
  LifeBuoy,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { LaunchChecklistTrigger } from '@/components/checklist/LaunchChecklistTrigger'
import { marketingUrl } from '@/lib/marketing-url'

// Marketplace is the only entry that lives on apps/marketing (port 3010
// in dev). We render it as a plain <a> so navigation triggers a real
// cross-origin load — the creator sidebar still highlights every other
// route via Next/Link.
const NAV: Array<{
  href: string
  label: string
  icon: typeof Home
  external?: boolean
}> = [
  { href: '/dashboard',                    label: 'Dashboard',   icon: Home },
  { href: marketingUrl('/marketplace'),    label: 'Marketplace', icon: Store, external: true },
  { href: '/products',                     label: 'Products',    icon: Package },
  { href: '/orders',                       label: 'Orders',      icon: ShoppingBag },
  { href: '/subscriptions',                label: 'Plans',       icon: Sparkles },
  { href: '/settings',                     label: 'Settings',    icon: Settings },
  { href: '/help',                         label: 'Help',        icon: LifeBuoy },
]

const STORAGE_KEY = 'ilf-creator-sidebar-collapsed'

export function DashboardSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Persist the fold state across navigations / refreshes. Reads on mount
  // (slight flash from the expanded default is acceptable for V1).
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1')
    } catch {
      /* localStorage unavailable — stay expanded */
    }
  }, [])

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <aside
      className={cn(
        'relative hidden shrink-0 border-r border-ink-200 bg-white p-3 transition-[width] duration-200 ease-out lg:block',
        collapsed ? 'w-[68px]' : 'w-56',
      )}
    >
      {/* Fold toggle — circular button straddling the right border (Printful-style) */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand' : 'Collapse'}
        className="absolute -right-3 top-5 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-500 shadow-sm transition-colors hover:border-ink-300 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      <nav className="space-y-1">
        {NAV.map(({ href, label, icon: Icon, external }) => {
          const active =
            !external &&
            (pathname === href || (href !== '/dashboard' && pathname.startsWith(href)))
          const className = cn(
            'flex items-center rounded-md text-sm transition-colors',
            collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
            active ? 'bg-ink-100 font-medium text-ink-900' : 'text-ink-600 hover:bg-ink-50',
          )
          const inner = (
            <>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!collapsed && <span>{label}</span>}
            </>
          )
          if (external) {
            return (
              <a key={label} href={href} className={className} title={collapsed ? label : undefined}>
                {inner}
              </a>
            )
          }
          return (
            <Link key={href} href={href} className={className} title={collapsed ? label : undefined}>
              {inner}
            </Link>
          )
        })}

        {/* Launch Checklist trigger — full form only when expanded (its label +
            count badge don't fit the icon rail). Lives inside the
            LaunchChecklistProvider context wrapped by (dashboard)/layout.tsx. */}
        {!collapsed && (
          <div className="mt-4 border-t border-ink-200 pt-4">
            <LaunchChecklistTrigger />
          </div>
        )}
      </nav>
    </aside>
  )
}
