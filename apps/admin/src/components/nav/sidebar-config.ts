// =============================================================================
// Admin sidebar v3 — section-divider layout (Pavel 2026-06-01 amendment)
// =============================================================================
//
// Source of truth for visual structure:
// docs/spaces/.../memory/ilaunchify-admin-sidebar-v3-locked.md
//
// 2026-06-01 amendment: Pavel asked to promote MANAGE / ASSET MANAGEMENT /
// COMMUNICATIONS / LANGUAGES & MARKETS / SETTINGS to top-level region
// dividers (same treatment as APPLICATIONS — small caps caption with
// horizontal hairlines on each side). AI Tools removed for now.
//
// Visual model: each region renders a header divider (when label is set),
// then its items as a flat list. Items that are still groups (Inbox,
// Users & Roles, Global Compliance Center, Integrations & API, Help &
// Support) remain expandable with the chevron + auto-expand on active.
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
  CreditCard,
  Lock,
  Code,
  LineChart,
  Boxes,
  Brush,
  Eye,
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
      children: SidebarItem[]
    }

export interface SidebarRegion {
  id: string
  /** Empty string = no region header rendered (first/primary region). */
  label: string
  items: SidebarItem[]
}

// =============================================================================
// PRIMARY region — no header, top of sidebar
// =============================================================================
//
// Dashboard is the home button. Inbox stays expandable (8 sub-queues).
// Orders is a leaf. Help & Support kept as an expandable group too.

const PRIMARY: SidebarRegion = {
  id: 'primary',
  label: '',
  items: [
    {
      kind: 'item',
      label: 'Dashboard',
      icon: LayoutDashboard,
      href: '/dashboard',
    },
    {
      kind: 'group',
      label: 'Inbox',
      icon: Inbox,
      children: [
        { kind: 'item', label: 'Leads', icon: Inbox, href: '/leads', badgeKey: 'leads.pending' },
        { kind: 'item', label: 'Partner verification', icon: ShieldCheck, href: '/partners', badgeKey: 'partners.pending' },
        { kind: 'item', label: 'Cert instance reviews', icon: Award, href: '/certificate-types', badgeKey: 'certs.pending' },
        { kind: 'item', label: 'Ingredient queue', icon: FlaskConical, href: '/ingredients', badgeKey: 'ingredients.pending' },
        { kind: 'item', label: 'Product approvals', icon: Package, href: '/products?tab=new', badgeKey: 'products.pending' },
        { kind: 'item', label: 'Packaging-type submissions', icon: PackageOpen, href: '/packaging-submissions', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Phrase submissions', icon: MessageSquare, href: '/phrase-submissions', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Support tickets', icon: LifeBuoy, href: '/support-tickets', hiddenUntilBuilt: true },
      ],
    },
    {
      kind: 'item',
      label: 'Orders',
      icon: ShoppingBag,
      href: '/orders',
    },
    {
      kind: 'group',
      label: 'Help & Support',
      icon: LifeBuoy,
      children: [
        { kind: 'item', label: 'My tickets', icon: Ticket, href: '/my-tickets', hiddenUntilBuilt: true },
      ],
    },
  ],
}

// =============================================================================
// MANAGE region (Pavel 2026-06-01 — promoted to its own divider)
// =============================================================================

const MANAGE: SidebarRegion = {
  id: 'manage',
  label: 'Manage',
  items: [
    { kind: 'item', label: 'Products & Categories', icon: Package, href: '/products' },
    {
      kind: 'group',
      label: 'Users & Roles',
      icon: Users,
      children: [
        { kind: 'item', label: 'Admins', icon: Shield, href: '/admins', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Creators', icon: Users, href: '/creators' },
        { kind: 'item', label: 'Partners', icon: Building2, href: '/partners' },
      ],
    },
  ],
}

// =============================================================================
// ASSET MANAGEMENT region (Pavel 2026-06-01 — promoted to its own divider)
// =============================================================================

const ASSET_MANAGEMENT: SidebarRegion = {
  id: 'asset-management',
  label: 'Asset Management',
  items: [
    { kind: 'item', label: 'Packaging Symbols', icon: Sparkles, href: '/asset-management/packaging-symbols', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Packaging Materials', icon: Boxes, href: '/asset-management/packaging-materials', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Die-Cut Shapes (+ compliance grids)', icon: Layout, href: '/asset-management/die-cut-shapes', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Packaging Types', icon: Package, href: '/asset-management/packaging-types', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Nutrition Facts Labels', icon: FileText, href: '/asset-management/nutrition-facts-labels', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Supplement Facts Labels', icon: FileText, href: '/asset-management/supplement-facts-labels', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Mandatory Phrases', icon: ScrollText, href: '/asset-management/mandatory-phrases', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Certificate Library', icon: Award, href: '/certificate-types' },
    { kind: 'item', label: 'Ingredient Library', icon: FlaskConical, href: '/ingredients' },
    { kind: 'item', label: 'Die-Cut Design Templates', icon: Brush, href: '/asset-management/die-cut-design-templates', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Product Mockups', icon: Eye, href: '/asset-management/product-mockups', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Graphics Library', icon: Image, href: '/asset-management/graphics-library', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Fonts Library', icon: Type, href: '/asset-management/fonts-library', hiddenUntilBuilt: true },
  ],
}

// =============================================================================
// COMMUNICATIONS region (Pavel 2026-06-01 — promoted to its own divider)
// =============================================================================

const COMMUNICATIONS: SidebarRegion = {
  id: 'communications',
  label: 'Communications',
  items: [
    { kind: 'item', label: 'Notification templates', icon: Mail, href: '/communications/notification-templates', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Broadcasts', icon: Radio, href: '/communications/broadcasts', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Support workflows', icon: Workflow, href: '/communications/support-workflows', hiddenUntilBuilt: true },
  ],
}

// =============================================================================
// LANGUAGES & MARKETS region (Pavel 2026-06-01 — promoted to its own divider)
// =============================================================================

const LANGUAGES_AND_MARKETS: SidebarRegion = {
  id: 'languages-and-markets',
  label: 'Languages & Markets',
  items: [
    { kind: 'item', label: 'Markets / Regions', icon: Globe, href: '/markets' },
    {
      kind: 'group',
      label: 'Global Compliance Center',
      icon: Globe2,
      children: [
        { kind: 'item', label: 'Market Profiles', icon: Map, href: '/compliance-center/market-profiles', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Regulation Matrix', icon: ShieldCheck, href: '/compliance-center/regulation-matrix', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Compliance Gallery', icon: Award, href: '/compliance-center/compliance-gallery', hiddenUntilBuilt: true },
      ],
    },
  ],
}

// =============================================================================
// SETTINGS region (Pavel 2026-06-01 — promoted to its own divider)
// =============================================================================

const SETTINGS: SidebarRegion = {
  id: 'settings',
  label: 'Settings',
  items: [
    { kind: 'item', label: 'Tiers & Plans', icon: Crown, href: '/tiers' },
    { kind: 'item', label: 'Billing & Subscription', icon: CreditCard, href: '/billing', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Security & Access', icon: Lock, href: '/security', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Developer & API', icon: Code, href: '/developer', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Audit Log', icon: History, href: '/audit' },
    { kind: 'item', label: 'Analytics & Monitoring', icon: LineChart, href: '/analytics', hiddenUntilBuilt: true },
  ],
}

// =============================================================================
// APPLICATIONS region (existing — kept)
// =============================================================================

const APPLICATIONS: SidebarRegion = {
  id: 'applications',
  label: 'Applications',
  items: [
    { kind: 'item', label: 'Marketplace', icon: Store, href: '/applications/marketplace', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Design Studio (with Admin mode)', icon: Brush, href: '/applications/design-studio', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Packaging Studio', icon: Boxes, href: '/applications/packaging-studio', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Packaging Mockups (2D & 3D)', icon: Eye, href: '/applications/packaging-mockups', hiddenUntilBuilt: true },
    {
      kind: 'group',
      label: 'Integrations & API',
      icon: Plug,
      children: [
        { kind: 'item', label: 'Channels', icon: Plug, href: '/channels' },
        { kind: 'item', label: 'Marketing', icon: Megaphone, href: '/integrations/marketing', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Analytics', icon: TrendingUp, href: '/integrations/analytics', hiddenUntilBuilt: true },
      ],
    },
  ],
}

export const SIDEBAR_REGIONS: SidebarRegion[] = [
  PRIMARY,
  MANAGE,
  ASSET_MANAGEMENT,
  COMMUNICATIONS,
  LANGUAGES_AND_MARKETS,
  SETTINGS,
  APPLICATIONS,
]
