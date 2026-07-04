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
  Box,
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
  Workflow,
  Layout,
  PackageOpen,
  PackageX,
  FileText,
  Store,
  TrendingUp,
  Recycle,
  BadgeCheck,
  Gift,
  DollarSign,
  Truck,
  Warehouse,
  Send,
  Route,
  PlaneTakeoff,
  SlidersHorizontal,
  RotateCcw,
  Wallet,
  Landmark,
  Palette,
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
  | 'categoryReview.pending'
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
    // Inbox = the ONE admin work queue. All approval/review queues live here, ordered by
    // theme (Partners → Catalog & product review → Orders & money → Support) so the pile
    // scans as groups. Category review moved in here from top-level (Pavel 2026-07-04).
    {
      kind: 'group',
      label: 'Inbox',
      icon: Inbox,
      children: [
        // — Partners —
        { kind: 'item', label: 'Leads', icon: Inbox, href: '/leads', badgeKey: 'leads.pending' },
        { kind: 'item', label: 'Partner verification', icon: ShieldCheck, href: '/partners', badgeKey: 'partners.pending' },
        // D4 RAMP — new partners' first-3-dispatch confirmations (PARTNER_ROLE_ACCOUNTS §4.3)
        { kind: 'item', label: 'Partner ramp', icon: BadgeCheck, href: '/partners/ramp', capability: 'partners:approve' },
        // — Catalog & product review —
        { kind: 'item', label: 'Product approvals', icon: Package, href: '/products?tab=new', badgeKey: 'products.pending' },
        { kind: 'item', label: 'Category review', icon: Tag, href: '/categories/review', badgeKey: 'categoryReview.pending', capability: 'catalog:write' },
        { kind: 'item', label: 'Ingredient queue', icon: FlaskConical, href: '/ingredients', badgeKey: 'ingredients.pending' },
        { kind: 'item', label: 'Accessory verification', icon: Gift, href: '/accessories' },
        { kind: 'item', label: 'Packaging review', icon: PackageOpen, href: '/asset-management/packaging-review' },
        { kind: 'item', label: 'Cert instance reviews', icon: Award, href: '/certificate-types', badgeKey: 'certs.pending' },
        { kind: 'item', label: 'Cert type requests', icon: ScrollText, href: '/certificate-requests' },
        // — Orders & money —
        { kind: 'item', label: 'Disputes', icon: Scale, href: '/disputes', badgeKey: 'disputes.pending' },
        { kind: 'item', label: 'Cancellation requests', icon: RotateCcw, href: '/cancellations', badgeKey: 'cancellations.pending', capability: 'refunds:approve' },
        { kind: 'item', label: 'Refund requests', icon: RotateCcw, href: '/support-tickets/refund-requests', capability: 'refunds:approve' },
        // — Support —
        { kind: 'item', label: 'Support tickets', icon: LifeBuoy, href: '/support-tickets', hiddenUntilBuilt: false },
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
    // 'Category review' moved into the Inbox work queue (Pavel 2026-07-04).
    {
      kind: 'group',
      label: 'Users & Roles',
      icon: Users,
      children: [
        { kind: 'item', label: 'Creators', icon: Users, href: '/creators' },
        { kind: 'item', label: 'Partners', icon: Building2, href: '/partners' },
        { kind: 'item', label: 'Admins', icon: Shield, href: '/admins', capability: 'users:admin' },
        { kind: 'item', label: 'Roles & Permissions', icon: Shield, href: '/roles', capability: 'users:admin' },
      ],
    },
    // ---- Libraries — reference catalogs (Pavel 2026-07-04) -------------------
    // Replaces the old "Asset Management" catch-all. Its design/packaging assets moved
    // to the studio that consumes them (Design Studio / Packaging Studio in APPLICATIONS);
    // only cross-cutting reference catalogs live here.
    {
      kind: 'group',
      label: 'Libraries',
      icon: Boxes,
      children: [
        { kind: 'item', label: 'Certificate Library', icon: Award, href: '/certificate-types' },
        { kind: 'item', label: 'Ingredient Library', icon: FlaskConical, href: '/ingredients' },
        { kind: 'item', label: 'Bulk import (assets)', icon: FileText, href: '/assets/import' },
      ],
    },
    // ---- Logistics (Phase L1c — docs/LOGISTICS_AND_FULFILLMENT.md §9) --------
    // Only built surfaces are listed (hide-until-built rule) — all §9 admin
    // logistics surfaces have now shipped. Moved here (between Compliance and
    // Finance) per Pavel 2026-07-04.
    {
      kind: 'group',
      label: 'Logistics',
      icon: Truck,
      children: [
        { kind: 'item', label: 'Shipments', icon: Send, href: '/logistics/shipments' },
        // Partner Role Accounts P0 — FC short/over/damaged adjudication queue
        { kind: 'item', label: 'Receiving exceptions', icon: PackageX, href: '/logistics/receiving-exceptions' },
        // Partner Role Accounts P3 — at-risk/breached windows radar (§7.3)
        { kind: 'item', label: 'SLA monitor', icon: History, href: '/logistics/sla' },
        { kind: 'item', label: 'Carriers', icon: Route, href: '/logistics/carriers' }, // Phase L2 — CarrierServiceRule matrix + integration status
        { kind: 'item', label: 'Fulfillment centers', icon: Warehouse, href: '/logistics/fulfillment-centers' },
        { kind: 'item', label: 'Channel plans', icon: PlaneTakeoff, href: '/logistics/channel-plans' }, // Phase L3b — ChannelInboundPlan (FBA/WFS/FBT)
        { kind: 'item', label: 'Logistics gates', icon: SlidersHorizontal, href: '/logistics/settings', capability: 'platform:admin' },
      ],
    },
    // ---- Finance — promoted to top-level (Pavel 2026-07-04) ------------------
    // Was nested inside Settings; money is high-frequency + high-stakes, so it's its
    // own PRIMARY group now. Read-mostly; refunds/clawbacks gated harder.
    {
      kind: 'group',
      label: 'Finance',
      icon: DollarSign,
      children: [
        { kind: 'item', label: 'Overview', icon: LineChart, href: '/finance', capability: 'billing:read', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Invoices', icon: FileText, href: '/finance/invoices', capability: 'billing:read', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Payouts & transfers', icon: Wallet, href: '/finance/payouts', capability: 'billing:read', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Refunds', icon: RotateCcw, href: '/finance/refunds', capability: 'refunds:approve', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Clawbacks', icon: Recycle, href: '/finance/clawbacks', capability: 'refunds:approve', hiddenUntilBuilt: false },
        { kind: 'item', label: 'Tax forms (1099)', icon: Landmark, href: '/finance/tax-forms', capability: 'billing:read', hiddenUntilBuilt: false },
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
            // C6.3 — channel replenishment knobs (CHANNEL_MANAGEMENT_SPEC §3.5a)
            { kind: 'item', label: 'Channel Replenishment', icon: Truck, href: '/order-settings/channels', capability: 'billing:write' },
          ],
        },
        // Markets & Regions — flattened from the old "Languages & Markets" wrapper (its only
        // built child). The empty Global Compliance Center sub-group was removed (2026-07-04).
        { kind: 'item', label: 'Markets & Regions', icon: Globe, href: '/markets' },
        { kind: 'item', label: 'Theme Studio', icon: Palette, href: '/theme-studio', capability: 'platform:admin' }, // Phase 3a read-only token catalog (2026-06-25)
        { kind: 'item', label: 'Developer & API', icon: KeyRound, href: '/developer', capability: 'platform:admin' },
        { kind: 'item', label: 'Security & Access', icon: Lock, href: '/security' }, // built 2026-06-05 (Tier 1 surface)
        // Communications group + Global Compliance Center + Analytics & Monitoring removed
        // 2026-07-04 — every page under them was an unbuilt placeholder. They return under
        // Settings when the pages ship.
        // ---- Compliance & Data Rights (P10 / GDPR) — nested into Settings 2026-07-04 ----
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
        { kind: 'item', label: 'Audit Log', icon: History, href: '/audit' },
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
    // Design Studio = 2D label & artwork authoring + the assets it consumes.
    // (Packaging/structural building blocks moved to the Packaging Studio group below,
    // 2026-07-04 — each studio owns its own assets.)
    {
      kind: 'group',
      label: 'Design Studio',
      icon: LayoutTemplate,
      children: [
        // Design Studio (Admin Mode) is reached from the top-bar Design Studio icon
        // (→ /go/design-studio), which establishes the creator session first. The old
        // sidebar "Admin Mode" link was removed (Pavel 2026-07-01).
        { kind: 'item', label: 'Design Templates', icon: LayoutTemplate, href: '/templates', capability: 'catalog:write' },
        { kind: 'item', label: 'AI Generator', icon: Sparkles, href: '/ai-generator', capability: 'catalog:write' },
        { kind: 'item', label: 'AI Template Pool', icon: Sparkles, href: '/ai-generator/pool', capability: 'catalog:write' },
        { kind: 'item', label: 'Die-lines', icon: Layout, href: '/dielines' },
        // Die-line CURATION is a canvas surface in the Design Studio (creator app) — opened
        // via the /go bridge which establishes the creator session first (Pavel 2026-07-01).
        { kind: 'item', label: 'Die-line Curation', icon: Brush, href: '/go/dieline-studio', capability: 'catalog:write' },
        { kind: 'item', label: 'Facts Labels', icon: FileText, href: '/label-formats', capability: 'platform:admin' },
        { kind: 'item', label: 'Mandatory Phrases', icon: ScrollText, href: '/mandatory-phrases' },
        // Label/artwork assets (moved from Asset Management 2026-07-04).
        { kind: 'item', label: 'Labeling Symbols', icon: ScrollText, href: '/assets/labeling-symbols' },
        { kind: 'item', label: 'Die-Cut Design Templates', icon: Brush, href: '/asset-management/die-cut-design-templates', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Graphics Library', icon: Image, href: '/asset-management/graphics-library', hiddenUntilBuilt: true },
        { kind: 'item', label: 'Fonts Library', icon: Type, href: '/asset-management/fonts-library', hiddenUntilBuilt: true },
      ],
    },
    // Packaging Studio = 3D/structural packaging authoring + the assets it consumes.
    // Promoted to a first-class group (2026-07-04); the old hidden /applications/packaging-studio
    // duplicate was removed.
    {
      kind: 'group',
      label: 'Packaging Studio',
      icon: Box,
      children: [
        { kind: 'item', label: 'Packaging Studio', icon: Box, href: '/packaging-studio', capability: 'catalog:write' },
        { kind: 'item', label: 'Container Die-lines', icon: Boxes, href: '/asset-management/packaging-containers' },
        { kind: 'item', label: 'Packing Types', icon: Package, href: '/asset-management/packaging-types' },
        // Packaging assets (moved from Asset Management 2026-07-04).
        { kind: 'item', label: 'Packaging Symbols', icon: Recycle, href: '/assets/packaging-symbols' },
        { kind: 'item', label: 'Packaging Mockups (2D & 3D)', icon: Eye, href: '/asset-management/product-mockups' },
        { kind: 'item', label: 'Packaging Materials', icon: Boxes, href: '/asset-management/packaging-materials', hiddenUntilBuilt: true },
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
