#!/usr/bin/env node
/**
 * RBAC end-to-end verification (docs/ADMIN_RBAC.md).
 *
 * Proves that each admin role's SUGGESTED PRESET bundle yields the intended
 * allow/deny across every capability-gated surface in apps/admin. Pure logic —
 * no DB, runs anywhere: `node scripts/verify-rbac.mjs`.
 *
 * It guards against two classes of bug:
 *   1. A preset that grants too much / too little vs. intent.
 *   2. A gated surface whose required capability drifts from the role design.
 *
 * The SURFACES map below is the authoritative list of capability-gated routes
 * and server actions, extracted from `requireCapability(...)` call sites. When
 * you add a new gate, add a row here so this check keeps covering it.
 *
 * NOTE: the preset bundles mirror packages/auth/src/capability-rules.ts
 * (ROLE_CAPABILITIES). If you change a preset there, mirror it here.
 */

// ── Capability presets (mirror capability-rules.ts ROLE_CAPABILITIES) ────────
const AGENT = [
  'tickets:read', 'tickets:write',
  'orders:read', 'creators:read', 'partners:read',
  'refunds:propose', 'audit:read',
]
const PRESETS = {
  // null adminRole resolves to NO capabilities (least-privilege flip 2026-06-21).
  UNASSIGNED: [],
  SUPPORT_AGENT: AGENT,
  SUPPORT_LEAD: [
    ...AGENT,
    'tickets:admin', 'refunds:approve', 'orders:write',
    'billing:read', 'reviews:write', 'partners:approve',
  ],
  BILLING_ADMIN: [
    'billing:read', 'billing:write', 'tiers:write',
    'refunds:approve', 'refunds:execute',
    'orders:read', 'audit:read',
  ],
  SUPER_ADMIN: '*', // all capabilities
}

// ── Capability-gated surfaces (extracted from requireCapability call sites) ──
// label → capability required to use it.
const SURFACES = {
  // Pages (loader-gated)
  '/security (page)': 'security:admin',
  '/settings/product-domains (page)': 'platform:admin',
  '/label-formats (page+detail)': 'platform:admin',
  '/tiers (+ plan/partner/creator pages)': 'tiers:write',
  '/settings/support-policy (page)': 'tickets:admin',
  '/support-tickets/refund-requests (page)': 'refunds:approve',
  '/admins (page)': 'users:admin',
  '/roles (page)': 'users:admin',
  // Server actions
  'channels: write': 'platform:admin',
  'ingredients: verify': 'reviews:write',
  'ingredients: promoteToLibrary': 'catalog:write',
  'security: actions': 'security:admin',
  'order-settings: write': 'billing:write',
  'certificate-requests: review': 'reviews:write',
  'certificate-types: create/update/setStatus': 'catalog:write',
  'certificate-types: cert-instance status': 'reviews:write',
  'product-domains: write': 'platform:admin',
  'label-formats: write': 'platform:admin',
  'refund-requests: propose': 'refunds:propose',
  'refund-requests: approve/reject': 'refunds:approve',
  'accessories: review': 'reviews:write',
  'tiers: write actions': 'tiers:write',
  'cancellations: review': 'refunds:approve',
  'support-policy: write': 'tickets:admin',
  'packaging-review: approve/reject': 'reviews:write',
  'products: approve/reject/requestChanges': 'reviews:write',
  'products: marketing/marketplace/niches/phrases/lifestyle': 'catalog:write',
  'admins: setAdminRole/grantAdminAccess': 'users:admin',
  'roles: setRoleCapability/applyPreset': 'users:admin',
  'partners: approve/verify/activate/strike': 'partners:approve',
}

// ── Expected ALLOW set per role (everything else must be DENY) ───────────────
// Derived independently from the role DESIGN, not from the presets, so a
// mismatch surfaces a real intent bug.
const EXPECTED_ALLOW = {
  UNASSIGNED: new Set([]), // least privilege — nothing
  SUPPORT_AGENT: new Set([
    'refund-requests: propose',
  ]),
  // Support Lead owns ops: refunds (propose+approve), the review queues, partner
  // approval, support policy. NOT money config (billing:write/tiers:write),
  // catalog:write, platform:admin, security, or users:admin.
  SUPPORT_LEAD: new Set([
    'refund-requests: propose',
    'refund-requests: approve/reject',
    '/support-tickets/refund-requests (page)',
    '/settings/support-policy (page)',
    'support-policy: write',
    'cancellations: review',
    'certificate-requests: review',
    'certificate-types: cert-instance status',
    'accessories: review',
    'packaging-review: approve/reject',
    'products: approve/reject/requestChanges',
    'ingredients: verify',
    'partners: approve/verify/activate/strike',
  ]),
  // Billing Admin owns money: order settings, tiers, refund approval/execution.
  BILLING_ADMIN: new Set([
    'order-settings: write',
    '/tiers (+ plan/partner/creator pages)',
    'tiers: write actions',
    'refund-requests: approve/reject',
    '/support-tickets/refund-requests (page)',
    'cancellations: review',
  ]),
  SUPER_ADMIN: new Set(Object.keys(SURFACES)), // all
}

// ── Engine ───────────────────────────────────────────────────────────────────
function holds(role, cap) {
  const caps = PRESETS[role]
  return caps === '*' || caps.includes(cap)
}

let failures = 0
const roles = Object.keys(PRESETS)
console.log('\nRBAC verification — preset bundles vs. gated surfaces\n' + '─'.repeat(60))

for (const role of roles) {
  const expected = EXPECTED_ALLOW[role]
  let roleFail = 0
  const allowed = []
  for (const [surface, cap] of Object.entries(SURFACES)) {
    const can = holds(role, cap)
    const shouldAllow = expected.has(surface)
    if (can) allowed.push(surface)
    if (can !== shouldAllow) {
      failures++
      roleFail++
      console.log(
        `  ✗ ${role}: ${surface} (needs ${cap}) → got ${can ? 'ALLOW' : 'DENY'}, expected ${shouldAllow ? 'ALLOW' : 'DENY'}`,
      )
    }
  }
  const tag = roleFail === 0 ? '✓' : '✗'
  console.log(`${tag} ${role} — ${allowed.length}/${Object.keys(SURFACES).length} surfaces allowed${roleFail ? ` (${roleFail} mismatch)` : ''}`)
}

console.log('─'.repeat(60))
if (failures === 0) {
  console.log('✓ ALL CHECKS PASSED — presets match intended access.\n')
  process.exit(0)
} else {
  console.log(`✗ ${failures} mismatch(es) — review above.\n`)
  process.exit(1)
}
