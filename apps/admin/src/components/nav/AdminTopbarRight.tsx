'use client'

// Right cluster for the admin dashboard topbar (REBUILD R1.3 · menu v2
// 2026-07-06, docs/ACCOUNT_MENUS_PROPOSAL.md).
//
// Facebook-style account panel:
//   1. Identity + RBAC role chip (info-only)
//   2. Shortcut grid — TASK-DRIVEN rotation (Pavel 2026-07-06, "cards rotate
//      depending on the new tasks"): queues with pending work first (badge
//      count desc), then recently-visited pages (localStorage), then the
//      classic six as first-run fallback. Never fixed.
//   3. Drill-in sub-panels GENERATED from sidebar-config.ts — the sidebar
//      stays the single source of truth, so menu labels/links/capabilities
//      can never drift from it again (the pre-v2 menu had drifted).
//
// Like AdminSidebarTree, this client component reads SIDEBAR_REGIONS
// directly (Lucide icon refs can't cross the server→client boundary) and
// receives only serializable props: badges, capabilities, roleLabel.

import * as React from 'react'
import { usePathname } from 'next/navigation'
import {
  AppHeaderUserMenu,
  type AppHeaderUserMenuChildItem,
  type AppHeaderUserMenuShortcut,
} from '@ilaunchify/ui'
import { Inbox, LifeBuoy, Layers, Settings, type LucideIcon } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import {
  SIDEBAR_REGIONS,
  type BadgeKey,
  type SidebarBadges,
  type SidebarItem,
} from './sidebar-config'

interface Props {
  email: string
  name: string | null
  /** Human RBAC role label (ADMIN_ROLE_LABEL) — resolved server-side. */
  roleLabel?: string | null
  /** Viewer capabilities — same pruning contract as AdminSidebarTree
      (UX only; requireCapability is the real fence). */
  capabilities?: string[]
  badges?: SidebarBadges
}

// Flatten a sidebar subtree into sub-panel rows (icons carried through from
// sidebar-config). Nested groups become non-interactive section labels
// followed by their items. Mirrors AdminSidebarTree's pruning:
// hiddenUntilBuilt skipped, capability-gated items pruned, empty groups
// dropped.
function flatten(items: SidebarItem[], caps: Set<string> | null): AppHeaderUserMenuChildItem[] {
  const out: AppHeaderUserMenuChildItem[] = []
  for (const item of items) {
    if (item.kind === 'item') {
      if (item.hiddenUntilBuilt) continue
      if (item.capability && caps && !caps.has(item.capability)) continue
      out.push({ label: item.label, href: item.href, icon: item.icon })
    } else {
      const children = flatten(item.children, caps)
      if (children.length > 0) {
        out.push({ label: item.label, icon: item.icon }) // section label (no href)
        out.push(...children)
      }
    }
  }
  return out
}

function findGroup(regionId: string, label: string): SidebarItem[] {
  const region = SIDEBAR_REGIONS.find((r) => r.id === regionId)
  for (const item of region?.items ?? []) {
    if (item.kind === 'group' && item.label === label) return item.children
  }
  return []
}

// =============================================================================
// Task-driven shortcut grid (Pavel 2026-07-06)
// =============================================================================

interface ShortcutCandidate {
  label: string
  href: string
  icon: LucideIcon
  badgeKey?: BadgeKey
}

/** Every navigable sidebar item, flat — labels/icons/badges from the config. */
function collectCandidates(
  items: SidebarItem[],
  caps: Set<string> | null,
  out: ShortcutCandidate[],
): void {
  for (const item of items) {
    if (item.kind === 'item') {
      if (item.hiddenUntilBuilt) continue
      if (item.capability && caps && !caps.has(item.capability)) continue
      out.push({ label: item.label, href: item.href, icon: item.icon, badgeKey: item.badgeKey })
    } else {
      collectCandidates(item.children, caps, out)
    }
  }
}

/** First-run fallback (the classic six) — resolved against the config so
 *  labels can't drift. */
const DEFAULT_HREFS = ['/dashboard', '/orders', '/products?tab=new', '/risk', '/support-tickets', '/audit']

const RECENTS_KEY = 'ilfy.admin.recent-pages'
const MAX_RECENTS = 12

/** Canonical config href for the current pathname (longest path-prefix wins;
 *  query strings on config hrefs are ignored for matching, kept for linking). */
function matchHref(pathname: string, candidates: ShortcutCandidate[]): string | null {
  let best: { href: string; len: number } | null = null
  for (const c of candidates) {
    const path = c.href.split('?')[0]!
    if (path === '/' || !(pathname === path || pathname.startsWith(`${path}/`))) continue
    if (!best || path.length > best.len) best = { href: c.href, len: path.length }
  }
  return best?.href ?? null
}

export function AdminTopbarRight({ email, name, roleLabel, capabilities, badges }: Props) {
  const caps = React.useMemo(
    () => (capabilities ? new Set(capabilities) : null),
    [capabilities],
  )

  const inboxRows = flatten(findGroup('primary', 'Inbox'), caps)
  const settingsRows = flatten(findGroup('primary', 'Settings'), caps)
  const applicationsRows = flatten(
    SIDEBAR_REGIONS.find((r) => r.id === 'applications')?.items ?? [],
    caps,
  )

  // ---- task-driven grid -----------------------------------------------------
  const candidates = React.useMemo(() => {
    const out: ShortcutCandidate[] = []
    for (const region of SIDEBAR_REGIONS) collectCandidates(region.items, caps, out)
    return out
  }, [caps])

  const pathname = usePathname()
  const [recents, setRecents] = React.useState<string[]>([])

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY)
      if (raw) setRecents((JSON.parse(raw) as string[]).filter((h) => typeof h === 'string'))
    } catch {
      /* corrupt storage — start fresh */
    }
  }, [])

  React.useEffect(() => {
    if (!pathname) return
    const href = matchHref(pathname, candidates)
    if (!href) return
    setRecents((prev) => {
      const next = [href, ...prev.filter((h) => h !== href)].slice(0, MAX_RECENTS)
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
      } catch {
        /* storage unavailable */
      }
      return next
    })
  }, [pathname, candidates])

  const shortcuts = React.useMemo<AppHeaderUserMenuShortcut[]>(() => {
    const byHref = new Map(candidates.map((c) => [c.href, c]))
    const badgeOf = (c: ShortcutCandidate) => (c.badgeKey ? (badges?.[c.badgeKey] ?? 0) : 0)
    // 1. Queues with waiting work, biggest pile first ("new tasks rotate in").
    const withWork = candidates.filter((c) => badgeOf(c) > 0).sort((a, b) => badgeOf(b) - badgeOf(a))
    // 2. Recently-visited pages. 3. Classic-six fallback.
    const ordered = [
      ...withWork,
      ...recents.map((h) => byHref.get(h)).filter((c): c is ShortcutCandidate => !!c),
      ...DEFAULT_HREFS.map((h) => byHref.get(h)).filter((c): c is ShortcutCandidate => !!c),
    ]
    const seen = new Set<string>()
    const tiles: AppHeaderUserMenuShortcut[] = []
    for (const c of ordered) {
      if (seen.has(c.href)) continue
      seen.add(c.href)
      const badge = badgeOf(c)
      tiles.push({ label: c.label, href: c.href, icon: c.icon, ...(badge > 0 ? { badge } : {}) })
      if (tiles.length === 6) break
    }
    return tiles
  }, [candidates, recents, badges])

  return (
    <>
      <NotificationBell />
      <AppHeaderUserMenu
        user={{ name, email }}
        avatarTone="ink"
        width="wide"
        roleChip={roleLabel ? { label: roleLabel, tone: 'dark' } : undefined}
        shortcuts={shortcuts}
        sections={[
          {
            items: [
              // Drill-ins generated from sidebar-config — see header comment.
              { label: 'Inbox — work queues', icon: Inbox, children: inboxRows },
              { label: 'Settings & configuration', icon: Settings, children: settingsRows },
              { label: 'Applications', icon: Layers, children: applicationsRows },
              { label: 'Help Center', href: '/support-tickets', icon: LifeBuoy },
            ],
          },
        ]}
        onSignOut={() => signOut({ callbackUrl: '/login' })}
      />
    </>
  )
}
