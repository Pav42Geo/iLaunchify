// =============================================================================
// Admin sidebar v3 — LOCKED tree
// =============================================================================
//
// Source of truth: docs/spaces/.../memory/ilaunchify-admin-sidebar-v3-locked.md
// (Pavel-locked 2026-05-31, VERBATIM). Read that file before changing anything
// in this config. I deviated once already (the wrong "Operate/Catalog/People &
// access" tree from earlier in this session) — Pavel rejected it. Don't drift.
//
// Visual model: ALWAYS-OPEN. No collapse, no expand interaction. The full
// structure is visible at all times so the admin can see, just by glancing
// at the sidebar, where they are AND where they came from. Active item +
// every ancestor group gets visual emphasis (see AdminSidebarTree.tsx).
//
// Hide-until-built rule: when a referenced route doesn't exist yet, the
// item carries `hiddenUntilBuilt: true`. The renderer filters those out
// AND filters groups whose entire children list becomes empty. The tree
// here stays the locked plan; the rendered sidebar shows only what works
// today.
//
// =============================================================================

import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Inbox,
  ShoppingBag,
  Package,
  ShieldCheck,
  FlaskConical,
  Award,
  Users,
  Building2,
  Crown,
  Plug,
  History,
  Globe,
  Shield,
  MessageSquare,
  LifeBuoy,
  Sparkles,
  Bot,
  BookOpen,
  CreditCard,
  Lock,
  Code,
  LineChart,
  Boxes,
  Brush,
  Eye,
  Layers,
  Type,
  Image,
  ScrollText,
  Megaphone,
  Radio,
  Workflow,
  Globe2,
  Map,
  Layout,
  PackageOpen,
  FileText,
  Ticket,
  Store,
  Mail,
  TrendingUp,
} from 'lucide-react'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type BadgeKey =
  | 'leads.pending'
  | 'partners.pending'
  | 'products.pending'
  | 'ingredients.pending'
  | 'certs.pending'
  | 'inbox.total'

export type SidebarBadges = Partial<Record<BadgeKey, number>>

export type SidebarItem =
  | {
      kind: 'item'
      label: string
      icon: LucideIcon
      href: string
      badgeKey?: BadgeKey
      /** True when the destination route hasn't shipped yet. Renderer hides. */
      hiddenUntilBuilt?: boolean
    }
  | {
      kind: 'group'
      label: string
      /** Optional icon shown next to the group label. */
      icon?: LucideIcon
      /**
       * The landing-page URL for this category. Each top-level group is its
       * own hub (dashboard for that category) — the sidebar links to this URL
       * and the landing page renders its own grid of sub-area cards.
       *
       * When omitted, this is a structural-only group (deeper in the tree)
       * that doesn't render as a sidebar entry today.
       */
      href?: string
      children: SidebarItem[]
    }

export interface SidebarRegion {
  id: string
  /** Empty string = no region header rendered (primary region). */
  label: string
  items: SidebarItem[]
}

// =============================================================================
// PRIMARY region — Dashboard / Inbox / Orders / Manage / Settings / Help
// =============================================================================
//
// No region label (the dashes around APPLICATIONS in the locked tree are the
// only visible divider). Items are flat top-level entries until they need
// children.

const PRIMARY: SidebarRegion = {
  id: 'primary',
  label: '',
  items: [
    // ---------------------------------------------------------------- Dashboard
    {
      kind: 'item',
      label: 'Dashboard',
      icon: LayoutDashboard,
      href: '/dashboard',
    },

    // -------------------------------------------------------------------- Inbox
    {
      kind: 'group',
      label: 'Inbox',
      icon: Inbox,
      href: '/inbox',
      children: [
        {
          kind: 'item',
          label: 'Leads',
          icon: Inbox,
          href: '/leads',
          badgeKey: 'leads.pending',
        },
        {
          kind: 'item',
          label: 'Partner verification',
          icon: ShieldCheck,
          href: '/partners',
          badgeKey: 'partners.pending',
        },
        {
          kind: 'item',
          label: 'Cert instance reviews',
          icon: Award,
          // Until a dedicated /admin/certs/instances queue ships, route to
          // the certificate-types page where instance review lives today.
          href: '/certificate-types',
          badgeKey: 'certs.pending',
        },
        {
          kind: 'item',
          label: 'Ingredient queue',
          icon: FlaskConical,
          href: '/ingredients',
          badgeKey: 'ingredients.pending',
        },
        {
          kind: 'item',
          label: 'Product approvals',
          icon: Package,
          href: '/products?tab=new',
          badgeKey: 'products.pending',
        },
        {
          kind: 'item',
          label: 'Packaging-type submissions',
          icon: PackageOpen,
          href: '/packaging-submissions',
          hiddenUntilBuilt: true,
        },
        {
          kind: 'item',
          label: 'Phrase submissions',
          icon: MessageSquare,
          href: '/phrase-submissions',
          hiddenUntilBuilt: true,
        },
        {
          kind: 'item',
          label: 'Support tickets',
          icon: LifeBuoy,
          href: '/support-tickets',
          hiddenUntilBuilt: true,
        },
      ],
    },

    // ------------------------------------------------------------------- Orders
    {
      kind: 'item',
      label: 'Orders',
      icon: ShoppingBag,
      href: '/orders',
    },

    // ------------------------------------------------------------------ Manage
    {
      kind: 'group',
      label: 'Manage',
      icon: Layers,
      href: '/manage',
      children: [
        {
          kind: 'item',
          label: 'Products & Categories',
          icon: Package,
          href: '/products',
        },
        {
          kind: 'group',
          label: 'Users & Roles',
          icon: Users,
          children: [
            {
              kind: 'item',
              label: 'Admins',
              icon: Shield,
              href: '/admins',
              hiddenUntilBuilt: true,
            },
            { kind: 'item', label: 'Creators', icon: Users, href: '/creators' },
            { kind: 'item', label: 'Partners', icon: Building2, href: '/partners' },
          ],
        },
        {
          kind: 'group',
          label: 'Asset Management',
          icon: Boxes,
          children: [
            {
              kind: 'item',
              label: 'Packaging Symbols',
              icon: Sparkles,
              href: '/asset-management/packaging-symbols',
              hiddenUntilBuilt: true,
            },
            {
              kind: 'item',
              label: 'Packaging Materials',
              icon: Boxes,
              href: '/asset-management/packaging-materials',
              hiddenUntilBuilt: true,
            },
            {
              kind: 'item',
              label: 'Die-Cut Shapes (+ compliance grids)',
              icon: Layout,
              href: '/asset-management/die-cut-shapes',
              hiddenUntilBuilt: true,
            },
            {
              kind: 'item',
              label: 'Packaging Types',
              icon: Package,
              href: '/asset-management/packaging-types',
              hiddenUntilBuilt: true,
            },
            {
              kind: 'item',
              label: 'Nutrition Facts Labels',
              icon: FileText,
              href: '/asset-management/nutrition-facts-labels',
              hiddenUntilBuilt: true,
            },
            {
              kind: 'item',
              label: 'Supplement Facts Labels',
              icon: FileText,
              href: '/asset-management/supplement-facts-labels',
              hiddenUntilBuilt: true,
            },
            {
              kind: 'item',
              label: 'Mandatory Phrases',
              icon: ScrollText,
              href: '/asset-management/mandatory-phrases',
              hiddenUntilBuilt: true,
            },
            {
              kind: 'item',
              label: 'Certificate Library',
              icon: Award,
              href: '/certificate-types',
            },
            {
              kind: 'item',
              label: 'Ingredient Library',
              icon: FlaskConical,
              href: '/ingredients',
            },
            {
              kind: 'item',
              label: 'Die-Cut Design Templates',
              icon: Brush,
              href: '/asset-management/die-cut-design-templates',
              hiddenUntilBuilt: true,
            },
            {
              kind: 'item',
              label: 'Product Mockups',
              icon: Eye,
              href: '/asset-management/product-mockups',
              hiddenUntilBuilt: true,
            },
            {
              kind: 'item',
              label: 'Graphics Library',
              icon: Image,
              href: '/asset-management/graphics-library',
              hiddenUntilBuilt: true,
            },
            {
              kind: 'item',
              label: 'Fonts Library',
              icon: Type,
              href: '/asset-management/fonts-library',
              hiddenUntilBuilt: true,
            },
          ],
        },
        {
          kind: 'group',
          label: 'Communications',
          icon: Megaphone,
          children: [
            {
              kind: 'item',
              label: 'Notification templates',
              icon: Mail,
              href: '/communications/notification-templates',
              hiddenUntilBuilt: true,
            },
            {
              kind: 'item',
              label: 'Broadcasts',
              icon: Radio,
              href: '/communications/broadcasts',
              hiddenUntilBuilt: true,
            },
            {
              kind: 'item',
              label: 'Support workflows',
              icon: Workflow,
              href: '/communications/support-workflows',
              hiddenUntilBuilt: true,
            },
          ],
        },
        {
          kind: 'group',
          label: 'Languages & Markets',
          icon: Globe,
          children: [
            {
              kind: 'item',
              label: 'Markets / Regions',
              icon: Globe,
              href: '/markets',
            },
            {
              kind: 'group',
              label: 'Global Compliance Center',
              icon: Globe2,
              children: [
                {
                  kind: 'item',
                  label: 'Market Profiles',
                  icon: Map,
                  href: '/compliance-center/market-profiles',
                  hiddenUntilBuilt: true,
                },
                {
                  kind: 'item',
                  label: 'Regulation Matrix',
                  icon: ShieldCheck,
                  href: '/compliance-center/regulation-matrix',
                  hiddenUntilBuilt: true,
                },
                {
                  kind: 'item',
                  label: 'Compliance Gallery',
                  icon: Award,
                  href: '/compliance-center/compliance-gallery',
                  hiddenUntilBuilt: true,
                },
              ],
            },
          ],
        },
        {
          kind: 'group',
          label: 'AI Tools',
          icon: Sparkles,
          children: [
            {
              kind: 'item',
              label: 'Prompt Library',
              icon: BookOpen,
              href: '/ai-tools/prompt-library',
              hiddenUntilBuilt: true,
            },
            {
              kind: 'item',
              label: 'Template Agents',
              icon: Bot,
              href: '/ai-tools/template-agents',
              hiddenUntilBuilt: true,
            },
          ],
        },
      ],
    },

    // ----------------------------------------------------------------- Settings
    {
      kind: 'group',
      label: 'Settings',
      icon: ShieldCheck,
      href: '/settings',
      children: [
        { kind: 'item', label: 'Tiers & Plans', icon: Crown, href: '/tiers' },
        {
          kind: 'item',
          label: 'Billing & Subscription',
          icon: CreditCard,
          href: '/billing',
          hiddenUntilBuilt: true,
        },
        {
          kind: 'item',
          label: 'Security & Access',
          icon: Lock,
          href: '/security',
          hiddenUntilBuilt: true,
        },
        {
          kind: 'item',
          label: 'Developer & API',
          icon: Code,
          href: '/developer',
          hiddenUntilBuilt: true,
        },
        { kind: 'item', label: 'Audit Log', icon: History, href: '/audit' },
        {
          kind: 'item',
          label: 'Analytics & Monitoring',
          icon: LineChart,
          href: '/analytics',
          hiddenUntilBuilt: true,
        },
      ],
    },

    // ------------------------------------------------------------- Help & Support
    {
      kind: 'group',
      label: 'Help & Support',
      icon: LifeBuoy,
      href: '/help-support',
      children: [
        {
          kind: 'item',
          label: 'My tickets',
          icon: Ticket,
          href: '/my-tickets',
          hiddenUntilBuilt: true,
        },
      ],
    },
  ],
}

// =============================================================================
// APPLICATIONS region — embedded mini-apps
// =============================================================================
//
// All hidden in V1 — placeholders for the locked plan. Channels exists today
// under /channels and is mapped under Integrations & API. Everything else
// surfaces when the corresponding admin tooling lands.

const APPLICATIONS: SidebarRegion = {
  id: 'applications',
  label: 'Applications',
  items: [
    {
      kind: 'item',
      label: 'Marketplace',
      icon: Store,
      href: '/applications/marketplace',
      hiddenUntilBuilt: true,
    },
    {
      kind: 'item',
      label: 'Design Studio (with Admin mode)',
      icon: Brush,
      href: '/applications/design-studio',
      hiddenUntilBuilt: true,
    },
    {
      kind: 'item',
      label: 'Packaging Studio',
      icon: Boxes,
      href: '/applications/packaging-studio',
      hiddenUntilBuilt: true,
    },
    {
      kind: 'item',
      label: 'Packaging Mockups (2D & 3D)',
      icon: Eye,
      href: '/applications/packaging-mockups',
      hiddenUntilBuilt: true,
    },
    {
      kind: 'group',
      label: 'Integrations & API',
      icon: Plug,
      href: '/integrations',
      children: [
        { kind: 'item', label: 'Channels', icon: Plug, href: '/channels' },
        {
          kind: 'item',
          label: 'Marketing',
          icon: Megaphone,
          href: '/integrations/marketing',
          hiddenUntilBuilt: true,
        },
        {
          kind: 'item',
          label: 'Analytics',
          icon: TrendingUp,
          href: '/integrations/analytics',
          hiddenUntilBuilt: true,
        },
      ],
    },
  ],
}

export const SIDEBAR_REGIONS: SidebarRegion[] = [PRIMARY, APPLICATIONS]

// =============================================================================
// Helpers
// =============================================================================
//
// hiddenUntilBuilt is intentionally NOT enforced — per Pavel 2026-06-01
// the sidebar shows every link in the locked tree, even when the
// destination page hasn't shipped yet (those clicks will 404 until they do).
// The flag stays on items as informational metadata for future use.

/**
 * Walk a list of items at one level and find the first leaf whose href
 * matches the pathname. Returns null if no match.
 */
function leafIndexInItems(
  items: SidebarItem[],
  pathname: string,
): number {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item && item.kind === 'item') {
      const [path] = item.href.split('?')
      const matches =
        path === '/dashboard'
          ? pathname === '/dashboard'
          : pathname === path || pathname.startsWith(path + '/')
      if (matches) return i
    }
  }
  return -1
}

/**
 * Find the group-label drill stack that reaches the current pathname.
 *
 *   pathname '/creators' → ['Manage', 'Users & Roles']  (leaf 'Creators' lives inside)
 *   pathname '/dashboard' → []                          (leaf is at root)
 *   pathname '/something-not-in-tree' → []              (default to root)
 */
export function findInitialDrillPath(
  items: SidebarItem[],
  pathname: string,
): string[] {
  // Leaf match at THIS level — no further drill needed.
  if (leafIndexInItems(items, pathname) !== -1) return []
  // Otherwise descend into each group.
  for (const item of items) {
    if (item.kind === 'group') {
      const inside = findInitialDrillPath(item.children, pathname)
      // Found if leaf is inside OR a deeper group contains it.
      if (inside.length > 0 || leafIndexInItems(item.children, pathname) !== -1) {
        return [item.label, ...inside]
      }
    }
  }
  return []
}

/**
 * Resolve a drill stack of group labels into the array of items at that
 * level. Returns the root items if path is empty. Returns null if any
 * label doesn't resolve (stale path).
 */
export function resolveDrillPath(
  rootItems: SidebarItem[],
  path: string[],
): SidebarItem[] | null {
  let current = rootItems
  for (const label of path) {
    const group = current.find(
      (i): i is Extract<SidebarItem, { kind: 'group' }> =>
        i.kind === 'group' && i.label === label,
    )
    if (!group) return null
    current = group.children
  }
  return current
}

/**
 * Flatten BOTH regions into one array of root-level items. Used by the
 * drill-renderer because the divider between PRIMARY and APPLICATIONS is
 * a visual concern in the renderer, not a data concern.
 */
export function rootItemsWithDivider(): {
  primaryItems: SidebarItem[]
  applicationsItems: SidebarItem[]
} {
  return {
    primaryItems: PRIMARY.items,
    applicationsItems: APPLICATIONS.items,
  }
}
