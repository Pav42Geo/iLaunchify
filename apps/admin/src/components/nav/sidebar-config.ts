// =============================================================================
// Admin sidebar v3 — LOCKED tree (post-2026-06-01)
// =============================================================================
//
// Source of truth (memory): ilaunchify-admin-sidebar-v3-locked.md
//
// Structure: two regions — PRIMARY (no header) and APPLICATIONS (— divider —).
//
// PRIMARY (post Pavel 2026-06-01 amendment):
//   - Dashboard
//   - Inbox group
//   - Orders
//   - Products & Categories               (flat item, was under Manage)
//   - Users & Roles                       (top-level group, was under Manage)
//   - Asset Management                    (top-level group, was under Manage)
//   - Settings group  (now also contains Languages & Markets + Communications)
//
// Pavel removed the wrapping "Manage" group entirely; its children were
// promoted to top-level. Languages & Markets and Communications were moved
// INTO Settings rather than promoted.
//
// All groups are expandable (chevron-RIGHT, rotates to chevron-down on open).
// Help & Support sits at the very bottom in its own bare region.
// AI Tools removed 2026-06-01.
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
  Layers,
  Brush,
  Eye,
  Type,
  Image,
  ScrollText,
  Megaphone,
  Tag,
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
  Recycle,
  BadgeCheck,
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
      icon?: LucideIcon
      children: SidebarItem[]
    }

export interface SidebarRegion {
  id: string
  label: string
  items: SidebarItem[]
}

// =============================================================================
// PRIMARY region — Dashboard / Inbox / Orders / Manage / Settings / Help
// =============================================================================

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
        { kind: 'item', label: 'Cert type requests', icon: ScrollText, href: '/certificate-requests' },
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
    // ---- formerly under Manage — promoted to top-level (Pavel 2026-06-01) ----
    {
      kind: 'item',
      label: 'Manufacturer Products',
      icon: Package,
      href: '/products',
    },
    {
      kind: 'item',
      label: 'Categories',
      icon: Layers,
      href: '/categories',
    },
    {
      kind: 'group',
      label: 'Marketplace',
      icon: Sparkles,
      children: [
        { kind: 'item', label: 'Niches', icon: Sparkles, href: '/niches', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Niche rules', icon: Workflow, href: '/niches/rules', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Lifestyle Tags', icon: Tag, href: '/lifestyle-tags', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Niche audit', icon: History, href: '/niches/audit', hiddenUntilBuilt: false },
      ],
    },
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
    {
      kind: 'group',
      label: 'Asset Management',
      icon: Boxes,
      children: [
        { kind: 'item', label: 'Packaging Symbols', icon: Recycle, href: '/assets/packaging-symbols' },
        { kind: 'item', label: 'Labeling Symbols', icon: ScrollText, href: '/assets/labeling-symbols' },
        { kind: 'item', label: 'Bulk import (assets)', icon: FileText, href: '/assets/import' },
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
        { kind: 'item', label: 'Packaging Mockups (2D & 3D)', icon: Eye, href: '/applications/packaging-mockups', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Graphics Library', icon: Image, href: '/asset-management/graphics-library', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Fonts Library', icon: Type, href: '/asset-management/fonts-library', hiddenUntilBuilt: true },
      ],
    },
    // ---- Compliance & Data Rights (P10 / GDPR) ------------------------------
    {
      kind: 'group',
      label: 'Compliance & Data Rights',
      icon: Shield,
      children: [
        { kind: 'item', label: 'Document access log', icon: ScrollText, href: '/compliance/document-access' },
        { kind: 'item', label: 'Label-claim consents', icon: BadgeCheck, href: '/compliance/claim-consents' },
        { kind: 'item', label: 'Erasure requests', icon: Shield, href: '/compliance/erasure-requests', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Sub-processors', icon: Building2, href: '/compliance/subprocessors', hiddenUntilBuilt: true },
      ],
    },
    // ---- Settings — now also holds Languages & Markets + Communications -----
    {
      kind: 'group',
      label: 'Settings',
      icon: ShieldCheck,
      children: [
        { kind: 'item', label: 'Tiers & Plans', icon: Crown, href: '/tiers' },
        { kind: 'item', label: 'Billing & Subscription', icon: CreditCard, href: '/billing', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Security & Access', icon: Lock, href: '/security', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Developer & API', icon: Code, href: '/developer', hiddenUntilBuilt: true },
        {
          kind: 'group',
          label: 'Communications',
          icon: Megaphone,
          children: [
            { kind: 'item', label: 'Notification templates', icon: Mail, href: '/communications/notification-templates', hiddenUntilBuilt: true },
            { kind: 'item', label: 'Broadcasts', icon: Radio, href: '/communications/broadcasts', hiddenUntilBuilt: true },
            { kind: 'item', label: 'Support workflows', icon: Workflow, href: '/communications/support-workflows', hiddenUntilBuilt: true },
          ],
        },
        {
          kind: 'group',
          label: 'Languages & Markets',
          icon: Globe,
          children: [
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
        },
        { kind: 'item', label: 'Audit Log', icon: History, href: '/audit' },
        { kind: 'item', label: 'Analytics & Monitoring', icon: LineChart, href: '/analytics', hiddenUntilBuilt: true },
      ],
    },
  ],
}

// =============================================================================
// APPLICATIONS region (existing)
// =============================================================================

const APPLICATIONS: SidebarRegion = {
  id: 'applications',
  label: 'Applications',
  items: [
    { kind: 'item', label: 'Marketplace', icon: Store, href: '/applications/marketplace', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Design Studio (with Admin mode)', icon: Brush, href: '/applications/design-studio', hiddenUntilBuilt: true },
    { kind: 'item', label: 'Packaging Studio', icon: Boxes, href: '/applications/packaging-studio', hiddenUntilBuilt: true },
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

// =============================================================================
// HELP region — sits at the very bottom (Pavel 2026-06-01)
// =============================================================================

const HELP: SidebarRegion = {
  id: 'help',
  // No label — renders as a bare group after the APPLICATIONS divider.
  label: '',
  items: [
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

export const SIDEBAR_REGIONS: SidebarRegion[] = [PRIMARY, APPLICATIONS, HELP]
