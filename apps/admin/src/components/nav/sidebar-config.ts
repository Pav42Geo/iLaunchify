// =============================================================================
// Admin sidebar v3 — declarative tree
// =============================================================================
//
// Pavel locked the structure 2026-05-31 after the FOD legacy-screenshot audit.
// The shape:
//
//   • Top-level item        (always visible, no children — e.g. Dashboard)
//   • Section with children (collapsible group with header + children rows)
//   • Two outer regions     (PRIMARY + APPLICATIONS) separated by a divider
//
// This file is the ONLY source of truth for sidebar contents. Anything the
// admin should *reach* via the left rail belongs here. Anything queued
// (inbox/review items) that does NOT have a built page yet is omitted —
// don't surface dead links.
//
// Conventions for new entries:
//   • href is the path under /admin (the admin app is mounted at /).
//   • icon is a lucide-react component reference (not instance).
//   • `kind: 'item'` = single nav row.
//   • `kind: 'section'` = collapsible header with `children: SidebarItem[]`.
//   • Sections can be nested ONE level deep (V1 — flat enough for ~12 items).

import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Inbox,
  ShoppingBag,
  Package,
  Boxes,
  Library,
  FlaskConical,
  Award,
  Users,
  Building2,
  ShieldCheck,
  CreditCard,
  Crown,
  Plug,
  Wrench,
  History,
  Bell,
  Settings,
  ShoppingCart,
  PaintBucket,
  Globe,
  MapPin,
} from 'lucide-react'

export type SidebarItem =
  | {
      kind: 'item'
      href: string
      label: string
      icon: LucideIcon
      /** Optional pink-pill count surfaced on the row. */
      badgeKey?: BadgeKey
    }
  | {
      kind: 'section'
      /** Stable id used for localStorage open/closed persistence. */
      id: string
      label: string
      icon: LucideIcon
      defaultOpen?: boolean
      children: SidebarItem[]
    }

export interface SidebarRegion {
  id: string
  label: string
  items: SidebarItem[]
}

/**
 * Badge keys correspond to live counts the sidebar can render as small pink
 * pill annotations on rows. The values are computed server-side in
 * loadSidebarBadges() and threaded through the sidebar as a record so the
 * config stays static and pure.
 */
export type BadgeKey =
  | 'leads.pending'
  | 'partners.pending'
  | 'products.pending'
  | 'ingredients.pending'
  | 'certs.pending'
  | 'inbox.total'

export type SidebarBadges = Partial<Record<BadgeKey, number>>

// -----------------------------------------------------------------------------
// PRIMARY region — operate the platform
// -----------------------------------------------------------------------------
//
// Order intent: top-down severity. Dashboard first because every shift starts
// there. Inbox second because anything red-hot lives there. Then the high-
// volume operational surfaces. Library + admin tools at the bottom.

const PRIMARY: SidebarRegion = {
  id: 'primary',
  label: 'Operate',
  items: [
    {
      kind: 'item',
      href: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      kind: 'section',
      id: 'inbox',
      label: 'Inbox',
      icon: Inbox,
      defaultOpen: true,
      children: [
        // All five Inbox entries route to surfaces that exist today. Where a
        // real query-param filter is wired (only /products?tab=new today), we
        // use it; the rest land on the bare list so the existing functionality
        // is the source of truth.
        {
          kind: 'item',
          href: '/leads',
          label: 'Leads',
          icon: Inbox,
          badgeKey: 'leads.pending',
        },
        {
          kind: 'item',
          href: '/partners',
          label: 'Partner verification',
          icon: ShieldCheck,
          badgeKey: 'partners.pending',
        },
        {
          kind: 'item',
          href: '/products?tab=new',
          label: 'Product approvals',
          icon: Package,
          badgeKey: 'products.pending',
        },
        {
          kind: 'item',
          href: '/ingredients',
          label: 'Ingredient queue',
          icon: FlaskConical,
          badgeKey: 'ingredients.pending',
        },
        {
          kind: 'item',
          href: '/certificate-types',
          label: 'Cert reviews',
          icon: Award,
          badgeKey: 'certs.pending',
        },
      ],
    },
    {
      kind: 'section',
      id: 'orders',
      label: 'Orders & fulfilment',
      icon: ShoppingBag,
      defaultOpen: true,
      children: [
        // Single existing list route — kept under its parent so the group label
        // matches the dashboard widget grouping. Sub-routes (dispatches /
        // subscriptions filters) will be added in a follow-up once /orders
        // supports those URL params.
        { kind: 'item', href: '/orders', label: 'All orders', icon: ShoppingBag },
      ],
    },
    {
      kind: 'section',
      id: 'catalog',
      label: 'Catalog',
      icon: Boxes,
      defaultOpen: false,
      children: [
        { kind: 'item', href: '/products', label: 'Products', icon: Package },
        { kind: 'item', href: '/ingredients', label: 'Ingredients', icon: FlaskConical },
        { kind: 'item', href: '/certificate-types', label: 'Cert library', icon: Award },
        // #154 — V1 read-only surfaces for Market + Region. Seed-driven; the
        // pages link straight from the sidebar so admin can verify coverage.
        { kind: 'item', href: '/markets', label: 'Markets', icon: Globe },
        { kind: 'item', href: '/regions', label: 'Regions', icon: MapPin },
      ],
    },
    {
      kind: 'section',
      id: 'people',
      label: 'People & access',
      icon: Users,
      defaultOpen: false,
      children: [
        { kind: 'item', href: '/creators', label: 'Creators', icon: Users },
        { kind: 'item', href: '/partners', label: 'Partners', icon: Building2 },
      ],
    },
    {
      kind: 'section',
      id: 'commerce',
      label: 'Commerce',
      icon: CreditCard,
      defaultOpen: false,
      children: [
        { kind: 'item', href: '/tiers', label: 'Tiers & plans', icon: Crown },
        { kind: 'item', href: '/channels', label: 'Channels', icon: Plug },
        { kind: 'item', href: '/compliance', label: 'Compliance', icon: ShieldCheck },
      ],
    },
  ],
}

// -----------------------------------------------------------------------------
// APPLICATIONS region — embedded operational tools
// -----------------------------------------------------------------------------
//
// These are full-surface mini-apps the admin OPERATES rather than READS. Kept
// in their own region per Pavel's spec — they're heavier than nav entries and
// shouldn't visually mix with audit / settings.

const APPLICATIONS: SidebarRegion = {
  id: 'applications',
  label: 'Applications',
  items: [
    {
      kind: 'section',
      id: 'platform-tools',
      label: 'Platform tools',
      icon: Wrench,
      defaultOpen: false,
      children: [
        { kind: 'item', href: '/audit', label: 'Audit log', icon: History },
        { kind: 'item', href: '/notifications', label: 'Notifications', icon: Bell },
        { kind: 'item', href: '/settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
}

export const SIDEBAR_REGIONS: SidebarRegion[] = [PRIMARY, APPLICATIONS]

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Walks the tree and flattens to a `[href, label]` map.
 * Used by the topbar breadcrumb + tests to assert every route is wired.
 */
export function flattenSidebar(regions: SidebarRegion[] = SIDEBAR_REGIONS) {
  const out: Array<{ href: string; label: string }> = []
  function walk(items: SidebarItem[]) {
    for (const it of items) {
      if (it.kind === 'item') out.push({ href: it.href, label: it.label })
      else walk(it.children)
    }
  }
  for (const r of regions) walk(r.items)
  return out
}

// Re-export icon names for the dashboard widget that mirrors quick actions.
export {
  LayoutDashboard,
  Inbox,
  ShoppingBag,
  Package,
  Users,
  Building2,
  ShieldCheck,
  Crown,
  ShoppingCart,
  PaintBucket,
  Library,
}
