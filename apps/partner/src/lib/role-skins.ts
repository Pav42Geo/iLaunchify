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
const NAV_INBOUND: PartnerNavItem = { href: '/inbound', label: 'Inbound', icon: PackageOpen }
const NAV_INVENTORY: PartnerNavItem = { href: '/inventory', label: 'Inventory', icon: Boxes }
const NAV_OUTBOUND: PartnerNavItem = { href: '/outbound', label: 'Outbound', icon: Send }
const NAV_BILLING: PartnerNavItem = { href: '/billing', label: 'Storage billing', icon: Receipt }
const NAV_ON_DEMAND: PartnerNavItem = { href: '/on-demand', label: 'On-demand', icon: Zap }
const NAV_PRODUCTS: PartnerNavItem = { href: '/products', label: 'Products', icon: Package }
const NAV_SERVICES: PartnerNavItem = { href: '/services', label: 'Services', icon: Wrench }
const NAV_PACKAGING: PartnerNavItem = { href: '/packaging', label: 'Packaging', icon: Box }
const NAV_PRINT_SPEC: PartnerNavItem = { href: '/print-spec', label: 'Prepress output', icon: Printer }
const NAV_ACCESSORIES: PartnerNavItem = { href: '/accessories', label: 'Accessories', icon: Gift }
const NAV_CERTIFICATIONS: PartnerNavItem = { href: '/certifications', label: 'Certifications', icon: Award }
const NAV_PAYMENTS: PartnerNavItem = { href: '/payments', label: 'Payments', icon: DollarSign }
const NAV_SETTINGS: PartnerNavItem = { href: '/settings', label: 'Settings', icon: Settings }

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
  opts: { isOrgAdmin?: boolean } = {},
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

  // P3 §2 role scoping: non-admin members get the OPERATIONAL surfaces of
  // their services; commercial + catalog surfaces (products, packaging,
  // pricing, payments, billing) are org-admin only.
  const nav: PartnerNavItem[] = [NAV_DASHBOARD, NAV_ORDERS]
  if (fulfillment) nav.push(NAV_INBOUND, NAV_INVENTORY, NAV_OUTBOUND)
  if (isOrgAdmin) {
    if (producing) nav.push(NAV_ON_DEMAND, NAV_PRODUCTS)
    nav.push(NAV_SERVICES)
    if (producing) nav.push(NAV_PACKAGING)
    if (prepress) nav.push(NAV_PRINT_SPEC)
    if (producing) nav.push(NAV_ACCESSORIES)
    nav.push(NAV_CERTIFICATIONS, NAV_PAYMENTS)
    if (fulfillment) nav.push(NAV_BILLING)
  }
  nav.push(NAV_SETTINGS)
  return nav
}

// ---------------------------------------------------------------------------
// Copy skins.
// ---------------------------------------------------------------------------

/**
 * Role prefix for page eyebrows ("Fulfillment Center", "Manufacturing", …).
 * One service → its label; several (or none) → "Partner".
 */
export function rolePrefix(serviceTypes: readonly string[]): string {
  const known = serviceTypes.filter((t): t is PartnerServiceType => t in SERVICE_TYPE_LABEL)
  return known.length === 1 && known[0] ? SERVICE_TYPE_LABEL[known[0]] : 'Partner'
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
