'use client'

// Admin sidebar v3 — client renderer.
//
// Walks the sidebar-config tree and emits one of two visual shapes:
//   • SidebarLink     — a single Link row (used for items + leaf children)
//   • SidebarSection  — a collapsible group with header + indented children
//
// IMPORTANT: SIDEBAR_REGIONS is imported HERE (in the client component)
// rather than threaded as a prop from the parent server component. The
// config contains Lucide icon component references which cannot cross
// the server→client boundary in Next 15 / React 19 (Functions cannot be
// passed directly to Client Components). Only the `badges` payload —
// plain Record<string, number> — comes from the server.
//
// Active-state matching:
//   • Exact match for "/dashboard" so it doesn't wrongly highlight on
//     every subroute.
//   • startsWith for everything else (so /partners/abc lights up /partners).
//
// Design system locks the chrome:
//   • Aside is white with hairline border on the right.
//   • Region labels: tiny ink-400 caps with letter-spacing.
//   • Active row: pink-50 background + pink-700 text + pink left-bar accent.
//   • Hover row: ink-50 background, no jump.
//   • Focus ring: pink-500 ring-offset-1 (matches Button primitive).

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import type { LucideIcon } from 'lucide-react'
import { SidebarSection } from './SidebarSection'
import {
  SIDEBAR_REGIONS,
  type SidebarItem,
  type SidebarBadges,
} from './sidebar-config'

interface AdminSidebarTreeProps {
  badges: SidebarBadges
}

export function AdminSidebarTree({ badges }: AdminSidebarTreeProps) {
  const pathname = usePathname()
  const regions = SIDEBAR_REGIONS

  return (
    <aside
      aria-label="Admin navigation"
      className="hidden w-60 shrink-0 overflow-y-auto border-r border-ink-200 bg-white px-3 py-5 lg:block"
    >
      {regions.map((region, idx) => (
        <div key={region.id} className={cn(idx > 0 && 'mt-6 border-t border-ink-100 pt-5')}>
          <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
            {region.label}
          </div>
          <nav className="space-y-0.5">
            {region.items.map((item) => (
              <RenderItem
                key={itemKey(item)}
                item={item}
                pathname={pathname}
                badges={badges}
              />
            ))}
          </nav>
        </div>
      ))}
    </aside>
  )
}

// -----------------------------------------------------------------------------
// Item dispatcher
// -----------------------------------------------------------------------------

function RenderItem({
  item,
  pathname,
  badges,
}: {
  item: SidebarItem
  pathname: string
  badges: SidebarBadges
}) {
  if (item.kind === 'item') {
    return (
      <SidebarLink
        href={item.href}
        label={item.label}
        icon={item.icon}
        active={isActive(item.href, pathname)}
        badge={item.badgeKey ? badges[item.badgeKey] : undefined}
      />
    )
  }
  // section
  const total = item.children.reduce<number>((acc, c) => {
    if (c.kind !== 'item' || !c.badgeKey) return acc
    return acc + (badges[c.badgeKey] ?? 0)
  }, 0)
  return (
    <SidebarSection
      id={item.id}
      label={item.label}
      icon={item.icon}
      defaultOpen={item.defaultOpen ?? false}
      totalCount={total}
    >
      {item.children.map((c) => (
        <RenderItem key={itemKey(c)} item={c} pathname={pathname} badges={badges} />
      ))}
    </SidebarSection>
  )
}

// -----------------------------------------------------------------------------
// One nav row
// -----------------------------------------------------------------------------

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
  badge?: number
}) {
  const showBadge = typeof badge === 'number' && badge > 0
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px]',
        'transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        active
          ? 'bg-pink-50 font-semibold text-pink-700'
          : 'text-ink-700 hover:bg-ink-50 hover:text-ink-900',
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-pink-500"
        />
      )}
      <Icon
        aria-hidden="true"
        className={cn('h-4 w-4 shrink-0', active ? 'text-pink-600' : 'text-ink-400')}
      />
      <span className="flex-1 truncate">{label}</span>
      {showBadge && (
        <span
          aria-label={`${badge} pending`}
          className={cn(
            'inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums',
            active ? 'bg-pink-600 text-white' : 'bg-pink-100 text-pink-700',
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  )
}

// -----------------------------------------------------------------------------
// Active-state matcher
// -----------------------------------------------------------------------------

function isActive(href: string, pathname: string): boolean {
  // Strip the search param for matching (the inbox uses ?tab=new and similar).
  const [path] = href.split('?')
  // Exact-match for the dashboard root so nothing else under (dashboard) lights
  // it up. Every other entry uses startsWith so e.g. /partners/abc lights up
  // /partners.
  if (path === '/' || path === '/dashboard') return pathname === path
  return pathname === path || pathname.startsWith(path + '/')
}

function itemKey(item: SidebarItem): string {
  return item.kind === 'item' ? `i:${item.href}:${item.label}` : `s:${item.id}`
}
