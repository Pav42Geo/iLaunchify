'use client'

// Admin sidebar v3 — expandable tree (Pavel 2026-06-01).
//
// Defaults that avoid the previous "Inbox always open on Dashboard" noise:
//
//   • Every group starts CLOSED. The sidebar is quiet by default.
//   • The ancestor chain of the active route auto-opens. If you're on
//     /admin/creators, MANAGE and USERS & ROLES both open automatically so
//     you can see Creators highlighted in context.
//   • User toggles persist via localStorage. Closing a section you don't
//     care about today keeps it closed across reloads and route changes.
//
// Visual model:
//   • Group header = button with chevron-right that rotates to chevron-down
//     when open. Icon + label. Hover bg-ink-50. Focus ring on the button.
//   • Open content: indented with a faint vertical guide line on the left
//     (border-l-ink-100 + pl-3) so parent-child is visible.
//   • Active leaf: pink-500 left bar + pink-50 bg + pink-700 bold text.
//   • Active leaf's ancestor group headers: pink-700 text + pink icon, so
//     you can scan top-down and immediately see WHICH branch you're in
//     even when the section is open with siblings beside it.

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import { ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  SIDEBAR_REGIONS,
  type SidebarItem,
  type SidebarBadges,
} from './sidebar-config'

const STORAGE_KEY = 'iLaunchify.admin.sidebar.v4.expand'

interface AdminSidebarTreeProps {
  badges: SidebarBadges
}

export function AdminSidebarTree({ badges }: AdminSidebarTreeProps) {
  const pathname = usePathname()
  const [openSet, setOpenSet] = useState<Set<string>>(new Set())
  const [hydrated, setHydrated] = useState(false)

  // Compute which group labels appear on the path from root → active leaf.
  // Returns ['Manage', 'Users & Roles'] for /admin/creators.
  const activeAncestors = computeActiveAncestors(SIDEBAR_REGIONS, pathname)

  // First mount: merge localStorage + the active ancestor chain.
  useEffect(() => {
    const stored = readStorage()
    const next = new Set<string>(stored)
    for (const ancestor of activeAncestors) next.add(ancestor)
    setOpenSet(next)
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Whenever the pathname changes, auto-open the new ancestor chain (but
  // leave anything else the user opened alone).
  useEffect(() => {
    if (!hydrated) return
    setOpenSet((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const ancestor of activeAncestors) {
        if (!next.has(ancestor)) {
          next.add(ancestor)
          changed = true
        }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, hydrated])

  const toggle = useCallback((label: string) => {
    setOpenSet((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      writeStorage(next)
      return next
    })
  }, [])

  const ancestorSet = new Set(activeAncestors)

  return (
    <aside
      aria-label="Admin navigation"
      className="hidden w-64 shrink-0 overflow-y-auto border-r border-ink-200 bg-white px-3 py-5 lg:block"
    >
      {SIDEBAR_REGIONS.map((region, idx) => (
        <div
          key={region.id}
          className={cn(idx > 0 && 'mt-5 pt-4')}
        >
          {region.label && (
            <div className="mb-2 flex items-center gap-2 px-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">
              <span className="h-px flex-1 bg-ink-200" />
              <span>{region.label}</span>
              <span className="h-px flex-1 bg-ink-200" />
            </div>
          )}
          <nav className="space-y-0.5">
            {region.items.map((item) => (
              <RenderItem
                key={itemKey(item)}
                item={item}
                pathname={pathname}
                badges={badges}
                openSet={openSet}
                onToggle={toggle}
                ancestorSet={ancestorSet}
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
// Item dispatcher (recursive)
// -----------------------------------------------------------------------------

function RenderItem({
  item,
  pathname,
  badges,
  openSet,
  onToggle,
  ancestorSet,
  depth,
}: {
  item: SidebarItem
  pathname: string
  badges: SidebarBadges
  openSet: Set<string>
  onToggle: (label: string) => void
  ancestorSet: Set<string>
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
  const isOpen = openSet.has(item.label)
  const onActivePath = ancestorSet.has(item.label)
  const total = depth === 0 ? sumBadgesInGroup(item.children, badges) : 0

  return (
    <SidebarGroup
      label={item.label}
      icon={item.icon}
      isOpen={isOpen}
      onToggle={() => onToggle(item.label)}
      onActivePath={onActivePath}
      totalCount={total}
      depth={depth}
    >
      {item.children.map((c) => (
        <RenderItem
          key={itemKey(c)}
          item={c}
          pathname={pathname}
          badges={badges}
          openSet={openSet}
          onToggle={onToggle}
          ancestorSet={ancestorSet}
          depth={depth + 1}
        />
      ))}
    </SidebarGroup>
  )
}

// -----------------------------------------------------------------------------
// Expandable group
// -----------------------------------------------------------------------------

function SidebarGroup({
  label,
  icon: Icon,
  isOpen,
  onToggle,
  onActivePath,
  totalCount,
  depth,
  children,
}: {
  label: string
  icon?: LucideIcon
  isOpen: boolean
  onToggle: () => void
  onActivePath: boolean
  totalCount: number
  depth: number
  children: React.ReactNode
}) {
  return (
    <div className={cn(depth === 0 ? 'mt-1' : 'mt-0.5')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={cn(
          'group flex w-full items-center gap-2 rounded-md py-1.5 text-left',
          'transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
          depth === 0 ? 'pl-2.5 pr-2' : 'pl-2 pr-2',
          depth === 0
            ? 'text-[13px] font-medium'
            : 'text-[12.5px]',
          onActivePath
            ? 'text-pink-700'
            : 'text-ink-700 hover:bg-ink-50 hover:text-ink-900',
        )}
      >
        {Icon && (
          <Icon
            aria-hidden="true"
            className={cn(
              'h-4 w-4 shrink-0',
              onActivePath ? 'text-pink-600' : 'text-ink-400',
            )}
          />
        )}
        <span className="flex-1 truncate">{label}</span>
        {totalCount > 0 && (
          <span
            aria-label={`${totalCount} pending`}
            className={cn(
              'inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums',
              onActivePath
                ? 'bg-pink-600 text-white'
                : 'bg-pink-100 text-pink-700',
            )}
          >
            {totalCount}
          </span>
        )}
        {/* Chevron on the RIGHT — rotates 90° clockwise to point down when open. */}
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform duration-150',
            isOpen && 'rotate-90',
          )}
        />
      </button>

      {/* Children — CSS grid-row trick gives smooth height transition. */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="ml-3 mt-0.5 space-y-0.5 border-l border-ink-100 pl-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// One nav row (leaf link)
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
        'relative flex items-center gap-2 rounded-md py-1.5 text-[12.5px]',
        'transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        depth === 0 ? 'pl-2 pr-2.5' : 'pl-2 pr-2',
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
// Helpers
// -----------------------------------------------------------------------------

function isActive(href: string, pathname: string): boolean {
  const [path] = href.split('?')
  if (path === '/dashboard') return pathname === '/dashboard'
  if (path === '/') return pathname === '/'
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

/**
 * Walks the tree to find the ancestor-group chain leading to a leaf whose
 * href matches `pathname`. Returns the labels in root → leaf order, or []
 * if no match (root-level leaves count as having no ancestors).
 */
function computeActiveAncestors(
  regions: ReturnType<typeof Object>['SIDEBAR_REGIONS'] extends infer R
    ? R
    : never,
  pathname: string,
): string[]
function computeActiveAncestors(
  regions: typeof SIDEBAR_REGIONS,
  pathname: string,
): string[] {
  for (const region of regions) {
    const found = walkForAncestors(region.items, pathname)
    if (found) return found
  }
  return []
}

function walkForAncestors(
  items: SidebarItem[],
  pathname: string,
): string[] | null {
  for (const item of items) {
    if (item.kind === 'item') {
      if (isActive(item.href, pathname)) return []
    } else {
      const inside = walkForAncestors(item.children, pathname)
      if (inside !== null) return [item.label, ...inside]
    }
  }
  return null
}

// -----------------------------------------------------------------------------
// localStorage persistence
// -----------------------------------------------------------------------------

function readStorage(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    return []
  }
}

function writeStorage(value: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...value]))
  } catch {
    /* quota / private-mode — ignore */
  }
}
