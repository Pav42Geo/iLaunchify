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
import type { Capability } from '@ilaunchify/auth'
import {
  Database,
  LayoutDashboard,
  LayoutTemplate,
  GraduationCap,
  PlaySquare,
  BookOpen,
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
  KeyRound,
  History,
  Globe,
  Shield,
  Scale,
  MessageSquare,
  LifeBuoy,
  Sparkles,
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
  Store,
  Mail,
  TrendingUp,
  Recycle,
  BadgeCheck,
  Gift,
  DollarSign,
  Truck,
  RotateCcw,
  Wallet,
  Landmark,
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
  | 'disputes.pending'
  | 'cancellations.pending'
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
      /** Admin RBAC (docs/ADMIN_RBAC.md) — hide unless the viewer holds this
          capability. UX only; the page/action requireCapability is the real
          fence. Untagged items are visible to every admin. */
      capability?: Capability
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
        { kind: 'item', label: 'Accessory verification', icon: Gift, href: '/accessories' },
        { kind: 'item', label: 'Packaging review', icon: PackageOpen, href: '/asset-management/packaging-review' },
        { kind: 'item', label: 'Phrase submissions', icon: MessageSquare, href: '/phrase-submissions', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Support tickets', icon: LifeBuoy, href: '/support-tickets', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Disputes', icon: Scale, href: '/disputes', badgeKey: 'disputes.pending' },
        { kind: 'item', label: 'Cancellation requests', icon: RotateCcw, href: '/cancellations', badgeKey: 'cancellations.pending', capability: 'refunds:approve' },
        { kind: 'item', label: 'Refund requests', icon: RotateCcw, href: '/support-tickets/refund-requests', capability: 'refunds:approve' },
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
      label: 'Products',
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
      label: 'Users & Roles',
      icon: Users,
      children: [
        { kind: 'item', label: 'Admins', icon: Shield, href: '/admins', capability: 'users:admin' },
        { kind: 'item', label: 'Roles & Permissions', icon: Shield, href: '/roles', capability: 'users:admin' },
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
        { kind: 'item', label: 'Die-lines', icon: Layout, href: '/asset-management/die-cut-shapes', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Packing Types', icon: Package, href: '/asset-management/packaging-types' },
        { kind: 'item', label: 'Facts Labels', icon: FileText, href: '/label-formats', capability: 'platform:admin' },
        { kind: 'item', label: 'Mandatory Phrases', icon: ScrollText, href: '/mandatory-phrases' },
        { kind: 'item', label: 'Certificate Library', icon: Award, href: '/certificate-types' },
        { kind: 'item', label: 'Ingredient Library', icon: FlaskConical, href: '/ingredients' },
        { kind: 'item', label: 'Die-Cut Design Templates', icon: Brush, href: '/asset-management/die-cut-design-templates', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Packaging Mockups (2D & 3D)', icon: Eye, href: '/asset-management/product-mockups' },
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
        { kind: 'item', label: 'Document access log', icon: ScrollText, href: '/compliance/document-access', capability: 'compliance:admin' },
        { kind: 'item', label: 'Label-claim consents', icon: BadgeCheck, href: '/compliance/claim-consents', capability: 'compliance:admin' },
        { kind: 'item', label: 'Erasure requests', icon: Shield, href: '/compliance/erasure-requests', hiddenUntilBuilt: true, capability: 'compliance:admin' },
        { kind: 'item', label: 'Sub-processors', icon: Building2, href: '/compliance/subprocessors', hiddenUntilBuilt: true, capability: 'compliance:admin' },
      ],
    },
    // ---- Settings — now also holds Languages & Markets + Communications -----
    {
      kind: 'group',
      label: 'Settings',
      icon: ShieldCheck,
      children: [
        { kind: 'item', label: 'Tiers & Plans', icon: Crown, href: '/tiers', capability: 'tiers:write' },
        { kind: 'item', label: 'Product Domains', icon: Layers, href: '/settings/product-domains', capability: 'platform:admin' },
        { kind: 'item', label: 'Support Policy', icon: LifeBuoy, href: '/settings/support-policy', capability: 'tickets:admin' },
        {
          kind: 'group',
          label: 'Order Settings',
          icon: ShoppingBag,
          children: [
            { kind: 'item', label: 'Fees & Commissions', icon: DollarSign, href: '/order-settings/fees', capability: 'billing:write' },
            { kind: 'item', label: 'Partner Routing', icon: Workflow, href: '/order-settings/routing', capability: 'billing:write' },
            { kind: 'item', label: 'Routing preview', icon: Workflow, href: '/routing-preview', capability: 'billing:write' },
            { kind: 'item', label: 'Shipping & Fulfillment', icon: Truck, href: '/order-settings/shipping', capability: 'billing:write' },
            { kind: 'item', label: 'Cancellations & Refunds', icon: RotateCcw, href: '/order-settings/cancellations', capability: 'refunds:approve' },
            { kind: 'item', label: 'Scoped Overrides', icon: Layers, href: '/order-settings/overrides', capability: 'billing:write' },
            { kind: 'item', label: 'Sample Policy', icon: FlaskConical, href: '/order-settings/sample-settings', capability: 'billing:write' },
          ],
        },
        // Finance console (docs/BILLING_AND_ACCOUNTING.md §4 + ADMIN_FINANCE_SIDEBAR_PROPOSAL.md).
        // Nested in Settings per Pavel 2026-06-22. Read-mostly; refunds gated harder.
        // Each child flips hiddenUntilBuilt → false as its page ships.
        {
          kind: 'group',
          label: 'Finance',
          icon: DollarSign,
          children: [
            { kind: 'item', label: 'Overview', icon: LineChart, href: '/finance', capability: 'billing:read', hiddenUntilBuilt: false },
            { kind: 'item', label: 'Invoices', icon: FileText, href: '/finance/invoices', capability: 'billing:read', hiddenUntilBuilt: false },
            { kind: 'item', label: 'Payouts & transfers', icon: Wallet, href: '/finance/payouts', capability: 'billing:read', hiddenUntilBuilt: false },
            { kind: 'item', label: 'Refunds', icon: RotateCcw, href: '/finance/refunds', capability: 'refunds:approve', hiddenUntilBuilt: false },
            { kind: 'item', label: 'Tax forms (1099)', icon: Landmark, href: '/finance/tax-forms', capability: 'billing:read', hiddenUntilBuilt: false },
          ],
        },
        { kind: 'item', label: 'Security & Access', icon: Lock, href: '/security' }, // built 2026-06-05 (Tier 1 surface)
        { kind: 'item', label: 'Developer & API', icon: KeyRound, href: '/developer', capability: 'platform:admin' },
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
    {
      kind: 'group',
      label: 'Design Studio',
      icon: LayoutTemplate,
      children: [
        { kind: 'item', label: 'Design Templates', icon: LayoutTemplate, href: '/templates', capability: 'catalog:write' },
        {
          kind: 'item',
          label: 'Admin Mode',
          icon: Brush,
          // Opens the real creator Design Studio in admin template-author mode (cross-app).
          href: `${process.env.NEXT_PUBLIC_CREATOR_URL ?? 'http://localhost:3000'}/template-author`,
          capability: 'catalog:write',
        },
      ],
    },
    {
      kind: 'group',
      label: 'Marketplace',
      icon: Sparkles,
      children: [
        { kind: 'item', label: 'Niches', icon: Sparkles, href: '/niches', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Niche rules', icon: Workflow, href: '/niches/rules', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Lifestyle Tags', icon: Tag, href: '/lifestyle-tags', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Decoration compatibility', icon: Brush, href: '/decoration-compatibility' },
        { kind: 'item', label: 'Niche audit', icon: History, href: '/niches/audit', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Phrase audit', icon: History, href: '/phrases/audit', hiddenUntilBuilt: false },
      ],
    },
    {
      kind: 'group',
      label: 'Academy',
      icon: BookOpen,
      children: [
        { kind: 'item', label: 'Overview', icon: LayoutDashboard, href: '/academy', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Courses', icon: GraduationCap, href: '/academy/courses', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Lessons', icon: PlaySquare, href: '/academy/lessons', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Topics', icon: Tag, href: '/academy/categories', hiddenUntilBuilt: false },
      ],
    },
    { kind: 'item', label: 'Packaging Studio', icon: Boxes, href: '/applications/packaging-studio', hiddenUntilBuilt: true },
    {
      kind: 'group',
      label: 'Integrations & API',
      icon: Plug,
      children: [
        { kind: 'item', label: 'Channels', icon: Plug, href: '/channels', capability: 'platform:admin' },
        { kind: 'item', label: 'Ingredient Data Sources', icon: Database, href: '/ingredient-sources' },
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
  // No label — renders as a bare item after the APPLICATIONS divider.
  label: '',
  items: [
    // Single link to the support inbox (the empty /my-tickets sub-page was
    // removed 2026-06-20 — admins handle help via /support-tickets).
    { kind: 'item', label: 'Help Center', icon: LifeBuoy, href: '/support-tickets' },
  ],
}

export const SIDEBAR_REGIONS: SidebarRegion[] = [PRIMARY, APPLICATIONS, HELP]
