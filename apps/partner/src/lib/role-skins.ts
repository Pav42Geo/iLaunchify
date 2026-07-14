// Role-skin registry — docs/PARTNER_ROLE_ACCOUNTS.md §2 (LOCKED 2026-07-02).
//
// One portal chassis, four role skins: the partner app renders the SAME shell
// for every ServiceType; what differs is derived HERE from the partner's
// services — nav items, home eyebrow/copy, quick actions, KPI emphasis.
// Never hardcode "Manufacturing · Home" (or any role copy) in a page again.
//
// D0 (LOCKED): the WAREHOUSE enum value stays; the UI label is
// "Fulfillment Center". This file owns that label map.
//
// This module is client-safe (pure data + lucide icon refs). Per the RSC
// gotcha (CLAUDE.md §Gotchas 5) icon-carrying values must be IMPORTED by the
// client component that renders them — pass `serviceTypes: string[]` across
// the boundary, never the resolved nav items.

import {
  Inbox,
  Wrench,
  BarChart3,
  DollarSign,
  Box,
  Package,
  Printer,
  Zap,
  Gauge,
  Megaphone,
  Medal,
  Rocket,
  Lightbulb,
  Landmark,
  Truck,
  Globe,
  Users,
  Bell,
  type LucideIcon,
} from 'lucide-react'

// Mirrors Prisma ServiceType — string union so this module needs no runtime
// dependency on @ilaunchify/db (safe in client bundles).
export type PartnerServiceType = 'MANUFACTURING' | 'COPACKING' | 'LABEL_PRINTING' | 'WAREHOUSE'

/** D0: external label map. Enum stays WAREHOUSE; humans see "Fulfillment Center". */
export const SERVICE_TYPE_LABEL: Record<PartnerServiceType, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Print production',
  WAREHOUSE: 'Fulfillment Center',
}

export interface PartnerNavItem {
  href: string
  label: string
  icon: LucideIcon
  /**
   * Extra pathname prefixes that keep this item highlighted — used by the
   * tab-merged pages (e.g. Payments is active on /payments AND
   * /settings/billing AND /settings/tax-documents).
   */
  activeMatch?: string[]
}

/** One labeled sidebar section (label null = the unlabeled top cluster). */
export interface PartnerNavGroup {
  label: string | null
  items: PartnerNavItem[]
}

// ---------------------------------------------------------------------------
// Nav skins. Base = surfaces every role shares. Role blocks are inserted in a
// stable order so multi-service partners get the union without duplicates.
// ---------------------------------------------------------------------------

const NAV_DASHBOARD: PartnerNavItem = { href: '/dashboard', label: 'Dashboard', icon: BarChart3 }
const NAV_ORDERS: PartnerNavItem = { href: '/orders', label: 'Orders', icon: Inbox }
// Risk Center M3 — partner-visible reliability score with FULL component
// breakdown (Pavel 2026-07-05). Operational surface: every member sees it.
const NAV_PERFORMANCE: PartnerNavItem = { href: '/performance', label: 'Performance', icon: Gauge }
// MM-6 — manufacturer merit standing (badge → fee tier). Manufacturing-only,
// commercial (shows the fee it unlocks) → org-admin.
const NAV_STANDING: PartnerNavItem = {
  href: '/standing',
  label: 'Standing',
  icon: Medal,
  // Tab-merged (Pavel 2026-07-13): Merit & fee tier · Performance.
  activeMatch: ['/standing', '/performance'],
}
const NAV_ON_DEMAND: PartnerNavItem = { href: '/on-demand', label: 'On-demand', icon: Zap }
const NAV_PRODUCTS: PartnerNavItem = {
  href: '/products',
  label: 'Products',
  icon: Package,
  // Tab-merged (Pavel 2026-07-14): Products · Accessories.
  activeMatch: ['/products', '/accessories'],
}
const NAV_SERVICES: PartnerNavItem = {
  href: '/services',
  label: 'Services',
  icon: Wrench,
  // Tab-merged (Pavel 2026-07-14): Services · Co-partners.
  activeMatch: ['/services', '/co-partners'],
}
const NAV_PACKAGING: PartnerNavItem = {
  href: '/packaging',
  label: 'Packaging',
  icon: Box,
  // Tab-merged (Pavel 2026-07-14): Packaging · Prepress output.
  activeMatch: ['/packaging', '/print-spec'],
}
const NAV_CAPABILITY: PartnerNavItem = { href: '/capability-requests', label: 'Capability requests', icon: Megaphone }
const NAV_PAYMENTS: PartnerNavItem = {
  href: '/payments',
  label: 'Payments',
  icon: DollarSign,
  // Tab-merged (Pavel 2026-07-13): Payouts · Billing · Tax documents.
  activeMatch: ['/payments', '/settings/billing', '/settings/tax-documents', '/billing'],
}
// NAV_SETTINGS retired (Pavel 2026-07-13) — the Settings hub + rail merged
// into this ONE sidebar; /settings redirects to /settings/company.
// Co-creation Opportunity Pool (CO_CREATION_MARKETPLACE_SPEC §10) — matched
// creator briefs + Express Interest. Manufacturing-only, commercial (terms/
// pricing) → org-admin.
const NAV_OPPORTUNITIES: PartnerNavItem = { href: '/opportunities', label: 'Opportunities', icon: Lightbulb }
// Rooms & Messages hub (2026-07-13) — room chat + 1:1 DMs. Operational: every
// team member in a collaboration room chats there, not just org admins.
// Messages was REMOVED from the main sidebar (Pavel 2026-07-13) — it lives
// only inside the Co-Creation Studio nav (CO_CREATION_NAV in PartnerSidebar).
const NAV_ACTIVATION: PartnerNavItem = { href: '/activation', label: 'Activation Setup', icon: Rocket }

// Merged-sidebar additions (Pavel 2026-07-13): the Settings rail folded into
// the ONE sidebar; these were rail-only destinations before. Tab-merged pages
// carry activeMatch so the item stays lit on every tab.
const NAV_COMPANY: PartnerNavItem = {
  href: '/settings/company',
  label: 'Company profile',
  icon: Landmark,
  activeMatch: ['/settings/company', '/profile', '/certifications'],
}
const NAV_LOGISTICS: PartnerNavItem = {
  href: '/settings/fulfillment',
  label: 'Logistics',
  icon: Truck,
  activeMatch: ['/settings/fulfillment', '/settings/shipping'],
}
const NAV_MARKET: PartnerNavItem = {
  href: '/settings/participation',
  label: 'Market participation',
  icon: Globe,
}
const NAV_TEAM: PartnerNavItem = { href: '/settings/team', label: 'Team & roles', icon: Users }
const NAV_PREFERENCES: PartnerNavItem = {
  href: '/settings/notifications',
  label: 'Preferences',
  icon: Bell,
  activeMatch: ['/settings/notifications', '/settings/feedback'],
}

/**
 * Resolve the sidebar nav for a partner from their service types.
 *
 * Rules (docs/PARTNER_ROLE_ACCOUNTS.md §3):
 * - Producing roles (MANUFACTURING) get the catalog surfaces (Products,
 *   Packaging, Accessories, On-demand).
 * - Prepress output shows for anyone who prints or produces (MANUFACTURING /
 *   COPACKING / LABEL_PRINTING) — matches the /print-spec service filter.
 * - Inbound shows only with a WAREHOUSE (Fulfillment Center) service; the
 *   /inbound route re-guards server-side.
 * - Empty service list (legacy rows predating PartnerService backfill) falls
 *   back to the FULL union so nothing a partner relied on disappears.
 */
export function roleNavFor(
  serviceTypes: readonly string[],
  opts: {
    isOrgAdmin?: boolean
    showCoPartners?: boolean
    copackBriefPool?: boolean
    /** Co-creation module kick-off switch — false hides Opportunities for everyone. */
    briefPoolEnabled?: boolean
    /**
     * Every service live (Pavel 2026-07-13): once the partner is fully
     * activated the Activation Setup entry disappears from the sidebar —
     * /activation stays reachable by URL for reference, but isn't navigation.
     */
    activationComplete?: boolean
  } = {},
): PartnerNavItem[] {
  return roleNavGroupsFor(serviceTypes, opts).flatMap((g) => g.items)
}

/**
 * Merged-sidebar groups (Pavel 2026-07-13, design/partner-merged-sidebar-tokens.html):
 * ONE navigation — the Settings rail is folded in, the hub is retired.
 * Top cluster (unlabeled) → Work → Catalog → Business → Operations → Account.
 * Messages is Co-Creation-Studio-only. Products is top-level.
 */
export function roleNavGroupsFor(
  serviceTypes: readonly string[],
  opts: Parameters<typeof roleNavFor>[1] = {},
): PartnerNavGroup[] {
  const isOrgAdmin = opts?.isOrgAdmin ?? true // founders/back-compat default
  const effective: readonly string[] =
    serviceTypes.length > 0
      ? serviceTypes
      : (['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING', 'WAREHOUSE'] satisfies PartnerServiceType[])
  const has = (t: PartnerServiceType) => effective.includes(t)
  const producing = has('MANUFACTURING')
  const prepress = has('MANUFACTURING') || has('COPACKING') || has('LABEL_PRINTING')
  const fulfillment = has('WAREHOUSE')
  // MAIN-ROLE RULE (Pavel 2026-07-09): only a partner whose main role is Print
  // Provider (a pure printer — no MANUFACTURING/COPACKING) takes public print
  // work. A producer/co-packer that also prints closes its own cycle instead.
  const purePrinter = has('LABEL_PRINTING') && !producing && !has('COPACKING')

  // P3 §2 role scoping: non-admin members get the OPERATIONAL surfaces of
  // their services; commercial + catalog surfaces are org-admin only.

  // DEEP MERGES (Pavel 2026-07-14, 13-row target): FC queues live as tabs of
  // Orders, Accessories under Products, Prepress under Packaging,
  // Certifications under Company profile, Co-partners under Services,
  // Storage billing under Payments. activeMatch keeps rows lit on every tab.

  // Top cluster — the everyday surfaces.
  const top: PartnerNavItem[] = [
    NAV_DASHBOARD,
    fulfillment
      ? { ...NAV_ORDERS, activeMatch: ['/orders', '/inbound', '/inventory', '/outbound'] }
      : NAV_ORDERS,
  ]
  if (producing && isOrgAdmin) top.push(NAV_PRODUCTS) // Pavel: Products top-level

  const work: PartnerNavItem[] = []
  if (isOrgAdmin) {
    // Post-approval setup — hidden once everything is live (Pavel 2026-07-13).
    if (!opts?.activationComplete) work.push(NAV_ACTIVATION)
    // Co-creation briefs (Pavel 2026-07-10, admin-choosable poolAccessPolicy):
    // manufacturers always; co-packers unless the admin set MFG_ONLY.
    if (
      opts?.briefPoolEnabled !== false &&
      (producing || (has('COPACKING') && opts?.copackBriefPool !== false))
    ) {
      work.push(NAV_OPPORTUNITIES)
    }
    if (producing) work.push(NAV_ON_DEMAND)
  }

  const catalog: PartnerNavItem[] = []
  if (isOrgAdmin) {
    // Packaging carries Prepress output as a tab — so it shows for every
    // prepress-capable role (producers, co-packers, printers).
    if (prepress) catalog.push(NAV_PACKAGING)
    // PS-8c — claimable capability RFQs → pure printers only.
    if (purePrinter) catalog.push(NAV_CAPABILITY)
  }

  const business: PartnerNavItem[] = []
  if (isOrgAdmin) {
    business.push(NAV_COMPANY, NAV_SERVICES)
    if (producing) business.push(NAV_STANDING)
  } else {
    // Members keep the operational reliability view (Risk Center M3).
    business.push(NAV_PERFORMANCE)
  }

  const operations: PartnerNavItem[] = []
  if (isOrgAdmin) operations.push(NAV_LOGISTICS, NAV_MARKET)

  const account: PartnerNavItem[] = []
  if (isOrgAdmin) account.push(NAV_PAYMENTS, NAV_TEAM)
  account.push(NAV_PREFERENCES) // every member can tune notifications/feedback

  const groups: PartnerNavGroup[] = [
    { label: null, items: top },
    { label: 'Work', items: work },
    { label: 'Catalog', items: catalog },
    { label: 'Business', items: business },
    { label: 'Operations', items: operations },
    { label: 'Account', items: account },
  ]
  return groups.filter((g) => g.items.length > 0)
}

// ---------------------------------------------------------------------------
// Copy skins.
// ---------------------------------------------------------------------------

// Precedence for the eyebrow label when a partner runs several services — pick
// the most "upstream" role so the prefix is specific and never generic. A
// manufacturer that also co-packs reads "Manufacturing"; a co-packer that also
// prints reads "Co-packing". Only a partner with NO known service falls back to
// the generic "Partner".
const ROLE_PREFIX_ORDER: PartnerServiceType[] = [
  'MANUFACTURING',
  'COPACKING',
  'LABEL_PRINTING',
  'WAREHOUSE',
]

/**
 * Role prefix for page eyebrows ("Fulfillment Center", "Manufacturing", …).
 * Single service → its label; multiple → the most-upstream by ROLE_PREFIX_ORDER;
 * none → "Partner". Replaces hardcoded "Manufacturing · X" eyebrows everywhere.
 */
export function rolePrefix(serviceTypes: readonly string[]): string {
  for (const t of ROLE_PREFIX_ORDER) {
    if (serviceTypes.includes(t)) return SERVICE_TYPE_LABEL[t]
  }
  return 'Partner'
}

/**
 * Dashboard eyebrow, derived from services — replaces the hardcoded
 * "Manufacturing · Home".
 */
export function homeEyebrow(serviceTypes: readonly string[]): string {
  return `${rolePrefix(serviceTypes)} · Home`
}

/** "what you do" noun for empty states / subtitles ("production jobs" vs "shipments"). */
export function dispatchNoun(serviceTypes: readonly string[]): string {
  const only = (t: PartnerServiceType) => serviceTypes.length === 1 && serviceTypes[0] === t
  if (only('WAREHOUSE')) return 'fulfillment jobs'
  if (only('LABEL_PRINTING')) return 'print jobs'
  if (only('COPACKING')) return 'work orders'
  return 'production jobs'
}

/** Role-aware hero quick actions (label/href only — page renders its own icons). */
export function heroQuickActions(
  serviceTypes: readonly string[],
): Array<{ href: string; label: string; primary?: boolean }> {
  const actions: Array<{ href: string; label: string; primary?: boolean }> = []
  if (serviceTypes.includes('MANUFACTURING')) {
    actions.push({ href: '/products/new', label: 'New product' })
  }
  if (serviceTypes.includes('WAREHOUSE')) {
    actions.push({ href: '/inbound', label: 'Inbound queue' })
  }
  actions.push({ href: '/orders?tab=awaiting', label: 'Order inbox', primary: true })
  return actions
}
