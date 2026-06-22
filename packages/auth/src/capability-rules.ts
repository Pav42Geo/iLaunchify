// Admin RBAC — PURE capability matrix (docs/ADMIN_RBAC.md). ZERO imports so it
// unit-tests table-driven (mirrors ownership-rules.ts). The server guard
// (requireCapability) lives in capabilities.ts and re-exports these.

// Local string union (mirrors the Prisma `AdminRole` enum). Kept local so this
// module typechecks before `prisma generate` knows the new enum.
export type AdminRole = 'SUPPORT_AGENT' | 'SUPPORT_LEAD' | 'BILLING_ADMIN' | 'SUPER_ADMIN'

export type Capability =
  | 'tickets:read'
  | 'tickets:write'
  | 'tickets:admin'
  | 'orders:read'
  | 'orders:write'
  | 'refunds:propose'
  | 'refunds:approve'
  | 'refunds:execute'
  | 'creators:read'
  | 'partners:read'
  | 'partners:approve'
  | 'reviews:write'
  | 'catalog:write'
  | 'assets:write'
  | 'academy:write'
  | 'billing:read'
  | 'billing:write'
  | 'tiers:write'
  | 'compliance:read'
  | 'compliance:admin'
  | 'users:admin'
  | 'security:admin'
  | 'audit:read'

export const ADMIN_ROLES: AdminRole[] = [
  'SUPPORT_AGENT',
  'SUPPORT_LEAD',
  'BILLING_ADMIN',
  'SUPER_ADMIN',
]

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  SUPPORT_AGENT: 'Support agent',
  SUPPORT_LEAD: 'Support lead',
  BILLING_ADMIN: 'Billing admin',
  SUPER_ADMIN: 'Super admin',
}

export const ALL_CAPABILITIES: Capability[] = [
  'tickets:read', 'tickets:write', 'tickets:admin',
  'orders:read', 'orders:write',
  'refunds:propose', 'refunds:approve', 'refunds:execute',
  'creators:read', 'partners:read', 'partners:approve',
  'reviews:write', 'catalog:write', 'assets:write', 'academy:write',
  'billing:read', 'billing:write', 'tiers:write',
  'compliance:read', 'compliance:admin',
  'users:admin', 'security:admin', 'audit:read',
]

const AGENT: Capability[] = [
  'tickets:read', 'tickets:write',
  'orders:read', 'creators:read', 'partners:read',
  'refunds:propose', 'audit:read',
]

// '*' means all capabilities (super admin). See docs/ADMIN_RBAC.md role matrix.
export const ROLE_CAPABILITIES: Record<AdminRole, Capability[] | '*'> = {
  SUPPORT_AGENT: AGENT,
  SUPPORT_LEAD: [
    ...AGENT,
    'tickets:admin',
    'refunds:approve',
    'orders:write',
    'billing:read', // read-only — answer payout questions, never change config
    'reviews:write', // owns the operational review queues (with super admin)
  ],
  BILLING_ADMIN: [
    'billing:read', 'billing:write', 'tiers:write',
    'refunds:approve', 'refunds:execute',
    'orders:read', 'audit:read',
  ],
  SUPER_ADMIN: '*',
}

/** Expand a role to its concrete capability list. Null → SUPER_ADMIN (P0). */
export function resolveCapabilities(role: AdminRole | null | undefined): Capability[] {
  const caps = ROLE_CAPABILITIES[role ?? 'SUPER_ADMIN']
  return caps === '*' ? [...ALL_CAPABILITIES] : caps
}

/** Pure capability check. Null role → SUPER_ADMIN (P0 fail-open). */
export function hasCapability(role: AdminRole | null | undefined, cap: Capability): boolean {
  const caps = ROLE_CAPABILITIES[role ?? 'SUPER_ADMIN']
  return caps === '*' || caps.includes(cap)
}
