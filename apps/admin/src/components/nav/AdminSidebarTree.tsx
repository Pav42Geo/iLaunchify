'use client'

// Admin sidebar v3 — client renderer (always-open, no collapse).
//
// Pavel rejected the collapsing UX 2026-05-31: "I dont like how the menus
// expand let's find another solution to be more vusually knowing from what
// structure you are coming from or in". This renderer addresses that by:
//
//   1. NEVER collapsing groups — the whole structure is visible at all times.
//      No expand/collapse buttons, no localStorage, no rotating chevrons.
//   2. ACTIVE PATH highlighting — the current item gets a strong pink
//      treatment, AND every ancestor group label gets a tinted state so the
//      admin can scan top → down and see exactly which branch they're in.
//   3. Tree guide lines — a faint vertical rule on the left of nested groups
//      gives the parent-child relationship a visual anchor.
//
// Hidden routes (hiddenUntilBuilt) are filtered out by filterVisible() so
// the rendered sidebar stays small even though the config carries the
// locked V1+V1.5+V2 plan.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import type { LucideIcon } from 'lucide-react'
import {
  SIDEBAR_REGIONS,
  filterVisible,
  findActivePath,
  type SidebarItem,
  type SidebarBadges,
} from './sidebar-config'

interface AdminSidebarTreeProps {
  badges: SidebarBadges
}

export function AdminSidebarTree({ badges }: AdminSidebarTreeProps) {
  const pathname = usePathname()

  // Filter hiddenUntilBuilt + empty groups before rendering.
  const regions = SIDEBAR_REGIONS.map((region) => ({
    ...region,
    items: filterVisible(region.items),
  })).filter((r) => r.items.length > 0)

  // Compute the active path (sequence of group labels leading to the current
  // item) for every region. Only one region will have a non-null match.
  const activeAncestors = new Set<string>()
  for (const region of regions) {
    const path = findActivePath(region.items, pathname)
    if (path) {
      for (const label of path) activeAncestors.add(label)
      break
    }
  }

  return (
    <aside
      aria-label="Admin navigation"
      className="hidden w-64 shrink-0 overflow-y-auto border-r border-ink-200 bg-white px-3 py-5 lg:block"
    >
      {regions.map((region, idx) => (
        <div
          key={region.id}
          className={cn(idx > 0 && 'mt-6 border-t border-ink-100 pt-5')}
        >
          {region.label && (
            <div className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">
              — {region.label} —
            </div>
          )}
          <nav className="space-y-0.5">
            {region.items.map((item) => (
              <RenderItem
                key={itemKey(item)}
                item={item}
                pathname={pathname}
                badges={badges}
                activeAncestors={activeAncestors}
                depth={0}
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
  activeAncestors,
  depth,
}: {
  item: SidebarItem
  pathname: string
  badges: SidebarBadges
  activeAncestors: Set<string>
  depth: number
}) {
  if (item.kind === 'item') {
    return (
      <SidebarLink
        href={item.href}
        label={item.label}
        icon={item.icon}
        active={isActive(item.href, pathname)}
        badge={item.badgeKey ? badges[item.badgeKey] : undefined}
        depth={depth}
      />
    )
  }
  const isOnActivePath = activeAncestors.has(item.label)
  // Sum badges for any descendant items so the group label can show a
  // total pill — only meaningful at depth 0 (top-level Inbox group).
  const total =
    depth === 0
      ? sumBadgesInGroup(item.children, badges)
      : 0

  return (
    <SidebarGroup
      label={item.label}
      icon={item.icon}
      onActivePath={isOnActivePath}
      totalCount={total}
      depth={depth}
    >
      {item.children.map((c) => (
        <RenderItem
          key={itemKey(c)}
          item={c}
          pathname={pathname}
          badges={badges}
          activeAncestors={activeAncestors}
          depth={depth + 1}
        />
      ))}
    </SidebarGroup>
  )
}

// -----------------------------------------------------------------------------
// One group (always-open visual container)
// -----------------------------------------------------------------------------

function SidebarGroup({
  label,
  icon: Icon,
  onActivePath,
  totalCount,
  depth,
  children,
}: {
  label: string
  icon?: LucideIcon
  onActivePath: boolean
  totalCount: number
  depth: number
  children: React.ReactNode
}) {
  return (
    <div className={cn(depth === 0 ? 'mt-3' : 'mt-1')}>
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1',
          // The label is purely visual — no button, no hover affordance.
          // Top-level groups get the small caps treatment, nested groups
          // get a slightly less prominent treatment.
          depth === 0
            ? 'text-[10.5px] font-bold uppercase tracking-[0.1em]'
            : 'text-[11px] font-semibold uppercase tracking-[0.06em]',
          onActivePath
            ? 'text-pink-700'
            : depth === 0
              ? 'text-ink-500'
              : 'text-ink-400',
        )}
      >
        {Icon && (
          <Icon
            aria-hidden="true"
            className={cn(
              'h-3 w-3 shrink-0',
              onActivePath ? 'text-pink-600' : 'text-ink-400',
            )}
          />
        )}
        <span className="flex-1 truncate">{label}</span>
        {totalCount > 0 && (
          <span
            aria-label={`${totalCount} pending`}
            className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-pink-100 px-1 text-[10px] font-semibold tabular-nums text-pink-700"
          >
            {totalCount}
          </span>
        )}
      </div>

      {/* Children — indented + faint guide line on the left. */}
      <div
        className={cn(
          'mt-0.5 space-y-0.5',
          depth === 0
            ? 'ml-3 border-l border-ink-100 pl-2'
            : 'ml-3 border-l border-ink-100 pl-2',
        )}
      >
        {children}
      </div>
    </div>
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
  depth,
}: {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
  badge?: number
  depth: number
}) {
  const showBadge = typeof badge === 'number' && badge > 0
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-2.5 rounded-lg py-1.5 pr-2.5 text-[13px]',
        'transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        // depth 0 has no parent group — pad left for the icon directly
        // depth ≥1 lives inside a guide-line column already
        depth === 0 ? 'pl-2.5' : 'pl-2',
        active
          ? 'bg-pink-50 font-semibold text-pink-700'
          : 'text-ink-700 hover:bg-ink-50 hover:text-ink-900',
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute -left-[2px] top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-pink-500"
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
// Active-state matcher (unchanged from previous version)
// -----------------------------------------------------------------------------

function isActive(href: string, pathname: string): boolean {
  const [path] = href.split('?')
  if (path === '/dashboard') return pathname === '/dashboard'
  if (path === '/' ) return pathname === '/'
  return pathname === path || pathname.startsWith(path + '/')
}

function itemKey(item: SidebarItem): string {
  return item.kind === 'item' ? `i:${item.href}:${item.label}` : `g:${item.label}`
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
