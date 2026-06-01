'use client'

// Admin sidebar — FLAT TOP-LEVEL LINKS (Pavel 2026-06-01).
//
// Pivot from the drill-in model: each top-level category in the locked tree
// is now a Link to its own landing-page hub (a "dashboard for the category"),
// and the sidebar is just a clean flat list of those top-level destinations.
// The deep nested children from the locked tree (Asset Management → Packaging
// Symbols → ..., etc.) belong on the category landing page as a card grid or
// sub-navigation, NOT inside the sidebar.
//
// What renders here:
//   • Dashboard               → /dashboard
//   • Inbox                   → /inbox            (landing hub)
//   • Orders                  → /orders
//   • Manage                  → /manage           (landing hub)
//   • Settings                → /settings         (landing hub)
//   • Help & Support          → /help-support     (landing hub)
//
//   — APPLICATIONS —          (visual divider)
//
//   • Marketplace             → /marketplace
//   • Design Studio (Admin)   → /design-studio
//   • Packaging Studio        → /packaging-studio
//   • Packaging Mockups       → /packaging-mockups
//   • Integrations & API      → /integrations     (landing hub)
//
// Pages without routes will 404 until built — Pavel asked for "all wired"
// 2026-06-01. The category landing pages are the next build phase.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import type { LucideIcon } from 'lucide-react'
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

  return (
    <aside
      aria-label="Admin navigation"
      className="hidden w-60 shrink-0 overflow-y-auto border-r border-ink-200 bg-white px-3 py-5 lg:block"
    >
      {SIDEBAR_REGIONS.map((region, regionIdx) => (
        <div
          key={region.id}
          className={cn(regionIdx > 0 && 'mt-6 border-t border-ink-100 pt-5')}
        >
          {regionIdx > 0 && region.label && (
            <div className="mb-2 flex items-center gap-2 px-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">
              <span className="h-px flex-1 bg-ink-200" />
              <span>{region.label}</span>
              <span className="h-px flex-1 bg-ink-200" />
            </div>
          )}
          <nav className="space-y-0.5">
            {region.items.map((item) => (
              <TopLevelRow
                key={topLevelKey(item)}
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
// One top-level row — either a leaf item or a group's landing-page link
// -----------------------------------------------------------------------------

function TopLevelRow({
  item,
  pathname,
  badges,
}: {
  item: SidebarItem
  pathname: string
  badges: SidebarBadges
}) {
  // Item leaf at root: render as a regular Link.
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

  // Group at root: render as a Link to the group's landing-page URL.
  // Aggregate badges from any descendant items with badgeKeys so the row
  // can surface a count (Inbox shows the sum of its queues).
  const href = item.href ?? '/'
  const total = sumBadgesInGroup(item.children, badges)
  return (
    <SidebarLink
      href={href}
      label={item.label}
      icon={item.icon ?? null}
      active={isActiveForGroup(href, pathname, item)}
      badge={total > 0 ? total : undefined}
    />
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
  icon: LucideIcon | null
  active: boolean
  badge?: number
}) {
  const showBadge = typeof badge === 'number' && badge > 0
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]',
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
      {Icon && (
        <Icon
          aria-hidden="true"
          className={cn('h-4 w-4 shrink-0', active ? 'text-pink-600' : 'text-ink-400')}
        />
      )}
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
// Active-state matchers
// -----------------------------------------------------------------------------

function isActive(href: string, pathname: string): boolean {
  const [path] = href.split('?')
  if (path === '/dashboard') return pathname === '/dashboard'
  if (path === '/') return pathname === '/'
  return pathname === path || pathname.startsWith(path + '/')
}

/**
 * A group is "active" when the current pathname is on the group's own landing
 * URL OR on any descendant item's URL (so /admin/creators lights up the
 * Manage row).
 */
function isActiveForGroup(
  href: string,
  pathname: string,
  group: Extract<SidebarItem, { kind: 'group' }>,
): boolean {
  if (isActive(href, pathname)) return true
  return descendantActive(group.children, pathname)
}

function descendantActive(items: SidebarItem[], pathname: string): boolean {
  for (const item of items) {
    if (item.kind === 'item') {
      if (isActive(item.href, pathname)) return true
    } else {
      if (item.href && isActive(item.href, pathname)) return true
      if (descendantActive(item.children, pathname)) return true
    }
  }
  return false
}

function sumBadgesInGroup(children: SidebarItem[], badges: SidebarBadges): number {
  let total = 0
  for (const c of children) {
    if (c.kind === 'item' && c.badgeKey) {
      total += badges[c.badgeKey] ?? 0
    } else if (c.kind === 'group') {
      total += sumBadgesInGroup(c.children, badges)
    }
  }
  return total
}

function topLevelKey(item: SidebarItem): string {
  return item.kind === 'item' ? `i:${item.href}:${item.label}` : `g:${item.label}`
}
