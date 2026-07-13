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
  Settings,
  BarChart3,
  DollarSign,
  Box,
  Award,
  Package,
  Gift,
  Printer,
  PackageOpen,
  Boxes,
  Send,
  Receipt,
  Zap,
  Gauge,
  Megaphone,
  Medal,
  Handshake,
  Rocket,
  Lightbulb,
  MessageCircle,
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
const NAV_STANDING: PartnerNavItem = { href: '/standing', label: 'Your standing', icon: Medal }
const NAV_INBOUND: PartnerNavItem = { href: '/inbound', label: 'Inbound', icon: PackageOpen }
const NAV_INVENTORY: PartnerNavItem = { href: '/inventory', label: 'Inventory', icon: Boxes }
const NAV_OUTBOUND: PartnerNavItem = { href: '/outbound', label: 'Outbound', icon: Send }
const NAV_BILLING: PartnerNavItem = { href: '/billing', label: 'Storage billing', icon: Receipt }
const NAV_ON_DEMAND: PartnerNavItem = { href: '/on-demand', label: 'On-demand', icon: Zap }
const NAV_PRODUCTS: PartnerNavItem = { href: '/products', label: 'Products', icon: Package }
const NAV_SERVICES: PartnerNavItem = { href: '/services', label: 'Services', icon: Wrench }
const NAV_PACKAGING: PartnerNavItem = { href: '/packaging', label: 'Packaging', icon: Box }
const NAV_PRINT_SPEC: PartnerNavItem = { href: '/print-spec', label: 'Prepress output', icon: Printer }
const NAV_CAPABILITY: PartnerNavItem = { href: '/capability-requests', label: 'Capability requests', icon: Megaphone }
const NAV_ACCESSORIES: PartnerNavItem = { href: '/accessories', label: 'Accessories', icon: Gift }
const NAV_CERTIFICATIONS: PartnerNavItem = { href: '/certifications', label: 'Certifications', icon: Award }
const NAV_PAYMENTS: PartnerNavItem = { href: '/payments', label: 'Payments', icon: DollarSign }
const NAV_SETTINGS: PartnerNavItem = { href: '/settings', label: 'Settings', icon: Settings }
const NAV_COPARTNERS: PartnerNavItem = { href: '/co-partners', label: 'Co-partners', icon: Handshake }
// Co-creation Opportunity Pool (CO_CREATION_MARKETPLACE_SPEC §10) — matched
// creator briefs + Express Interest. Manufacturing-only, commercial (terms/
// pricing) → org-admin.
const NAV_OPPORTUNITIES: PartnerNavItem = { href: '/opportunities', label: 'Opportunities', icon: Lightbulb }
// Rooms & Messages hub (2026-07-13) — room chat + 1:1 DMs. Operational: every
// team member in a collaboration room chats there, not just org admins.
const NAV_MESSAGES: PartnerNavItem = { href: '/messages', label: 'Messages', icon: MessageCircle }
const NAV_ACTIVATION: PartnerNavItem = { href: '/activation', label: 'Activation Setup', icon: Rocket }

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
  } = {},
): PartnerNavItem[] {
  const isOrgAdmin = opts.isOrgAdmin ?? true // founders/back-compat default
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
  // their services; commercial + catalog surfaces (products, packaging,
  // pricing, payments, billing) are org-admin only.
  const nav: PartnerNavItem[] = [NAV_DASHBOARD, NAV_ORDERS, NAV_PERFORMANCE]
  // Messages: co-creation participants (producers + co-packers). Rooms outlive
  // the module kick-off toggle — never strand an in-flight conversation.
  if (producing || has('COPACKING')) nav.push(NAV_MESSAGES)
  if (fulfillment) nav.push(NAV_INBOUND, NAV_INVENTORY, NAV_OUTBOUND)
  if (isOrgAdmin) {
    // Post-approval setup surface — the union of every service's activation track.
    nav.push(NAV_ACTIVATION)
    if (producing) nav.push(NAV_STANDING)
    // Co-creation briefs (Pavel 2026-07-10, admin-choosable poolAccessPolicy):
    // manufacturers always; co-packers unless the admin set MFG_ONLY (layout
    // passes copackBriefPool from settings). Recipe-door-only scoping for
    // co-packers is enforced in the pool loader + express-interest action.
    if (
      opts.briefPoolEnabled !== false &&
      (producing || (has('COPACKING') && opts.copackBriefPool !== false))
    ) {
      nav.push(NAV_OPPORTUNITIES)
    }
    if (producing) nav.push(NAV_ON_DEMAND, NAV_PRODUCTS)
    nav.push(NAV_SERVICES)
    if (producing) nav.push(NAV_PACKAGING)
    if (prepress) nav.push(NAV_PRINT_SPEC)
    // PS-8c — claimable capability RFQs. Public print work → pure printers only
    // (a producer/co-packer that also prints closes its own cycle, doesn't claim).
    if (purePrinter) nav.push(NAV_CAPABILITY)
    if (producing) nav.push(NAV_ACCESSORIES)
    // Co-partners (D7) — a manufacturer directs its own print/pack subcontractors.
    // Gated on the nomination feature being enabled (dark until counsel clears it).
    if (producing && opts.showCoPartners) nav.push(NAV_COPARTNERS)
    nav.push(NAV_CERTIFICATIONS, NAV_PAYMENTS)
    if (fulfillment) nav.push(NAV_BILLING)
  }
  nav.push(NAV_SETTINGS)
  return nav
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
