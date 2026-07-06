'use client'

// Right cluster for the admin dashboard topbar (REBUILD R1.3 · menu v2
// 2026-07-06, docs/ACCOUNT_MENUS_PROPOSAL.md).
//
// Facebook-style account panel:
//   1. Identity + RBAC role chip (info-only)
//   2. Shortcut grid — badge-bearing work queues ("take me to the work")
//   3. Drill-in sub-panels GENERATED from sidebar-config.ts — the sidebar
//      stays the single source of truth, so menu labels/links/capabilities
//      can never drift from it again (the pre-v2 menu had drifted).
//
// Like AdminSidebarTree, this client component reads SIDEBAR_REGIONS
// directly (Lucide icon refs can't cross the server→client boundary) and
// receives only serializable props: badges, capabilities, roleLabel.

import { AppHeaderUserMenu, type AppHeaderUserMenuChildItem } from '@ilaunchify/ui'
import {
  LayoutDashboard,
  Inbox,
  ShoppingBag,
  Package,
  ShieldAlert,
  LifeBuoy,
  FileSearch,
  Layers,
  Settings,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { SIDEBAR_REGIONS, type SidebarBadges, type SidebarItem } from './sidebar-config'

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

export function AdminTopbarRight({ email, name, roleLabel, capabilities, badges }: Props) {
  const caps = capabilities ? new Set(capabilities) : null

  const inboxRows = flatten(findGroup('primary', 'Inbox'), caps)
  const settingsRows = flatten(findGroup('primary', 'Settings'), caps)
  const applicationsRows = flatten(
    SIDEBAR_REGIONS.find((r) => r.id === 'applications')?.items ?? [],
    caps,
  )

  return (
    <>
      <NotificationBell />
      <AppHeaderUserMenu
        user={{ name, email }}
        avatarTone="ink"
        width="wide"
        roleChip={roleLabel ? { label: roleLabel, tone: 'dark' } : undefined}
        shortcuts={[
          { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
          { label: 'Orders', href: '/orders', icon: ShoppingBag },
          {
            label: 'Approvals',
            href: '/products?tab=new',
            icon: Package,
            badge: badges?.['products.pending'],
          },
          { label: 'Risk Inbox', href: '/risk', icon: ShieldAlert },
          { label: 'Support', href: '/support-tickets', icon: LifeBuoy },
          { label: 'Audit Log', href: '/audit', icon: FileSearch },
        ]}
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
