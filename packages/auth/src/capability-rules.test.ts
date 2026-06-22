// Table-driven tests for the admin RBAC capability matrix (docs/ADMIN_RBAC.md).
//
// Same convention as ownership.test.ts: throw-based scenarios with a runAll()
// aggregator, NO hard vitest import, so this type-checks under `tsc --noEmit`
// today and plugs into a runner later.
//
// Why this matters: this matrix is the admin authorization fence. The tables
// pin exactly what each role can and cannot do so a refactor can't silently
// widen access (e.g. let a Support agent touch money or the admin team).

import {
  hasCapability,
  resolveCapabilities,
  ALL_CAPABILITIES,
  ROLE_CAPABILITIES,
} from './capability-rules'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

export const scenarioSuperAdminHasEverything = () => {
  for (const cap of ALL_CAPABILITIES) {
    assert(hasCapability('SUPER_ADMIN', cap), `SUPER_ADMIN missing ${cap}`)
  }
  assert(
    resolveCapabilities('SUPER_ADMIN').length === ALL_CAPABILITIES.length,
    'SUPER_ADMIN should resolve to all capabilities',
  )
  return true
}

export const scenarioNullIsSuperAdmin = () => {
  // P0 fail-open: a null/undefined adminRole resolves to SUPER_ADMIN so existing
  // admins are unaffected until roles are assigned.
  assert(hasCapability(null, 'users:admin'), 'null should be super (users:admin)')
  assert(hasCapability(undefined, 'billing:write'), 'undefined should be super (billing:write)')
  assert(resolveCapabilities(null).length === ALL_CAPABILITIES.length, 'null resolves to all caps')
  return true
}

export const scenarioSupportAgentFenced = () => {
  const can: Parameters<typeof hasCapability>[1][] = [
    'tickets:write', 'orders:read', 'refunds:propose',
  ]
  const cannot: Parameters<typeof hasCapability>[1][] = [
    'refunds:approve', 'refunds:execute', 'billing:read', 'billing:write',
    'orders:write', 'users:admin', 'security:admin', 'platform:admin',
    'tickets:admin', 'reviews:write', 'tiers:write', 'partners:approve',
  ]
  for (const c of can) assert(hasCapability('SUPPORT_AGENT', c), `agent should have ${c}`)
  for (const c of cannot) assert(!hasCapability('SUPPORT_AGENT', c), `agent should NOT have ${c}`)
  return true
}

export const scenarioSupportLeadFenced = () => {
  const can: Parameters<typeof hasCapability>[1][] = [
    'tickets:admin', 'refunds:approve', 'orders:write', 'billing:read', 'reviews:write',
    'partners:approve',
  ]
  const cannot: Parameters<typeof hasCapability>[1][] = [
    'billing:write', 'refunds:execute', 'tiers:write', 'users:admin',
    'security:admin', 'platform:admin',
  ]
  for (const c of can) assert(hasCapability('SUPPORT_LEAD', c), `lead should have ${c}`)
  for (const c of cannot) assert(!hasCapability('SUPPORT_LEAD', c), `lead should NOT have ${c}`)
  return true
}

export const scenarioBillingAdminFenced = () => {
  const can: Parameters<typeof hasCapability>[1][] = [
    'billing:write', 'tiers:write', 'refunds:execute',
  ]
  const cannot: Parameters<typeof hasCapability>[1][] = [
    'tickets:write', 'users:admin', 'security:admin', 'platform:admin', 'partners:approve',
  ]
  for (const c of can) assert(hasCapability('BILLING_ADMIN', c), `billing should have ${c}`)
  for (const c of cannot) assert(!hasCapability('BILLING_ADMIN', c), `billing should NOT have ${c}`)
  return true
}

export const scenarioSuperOnlyCapabilities = () => {
  const superOnly: Parameters<typeof hasCapability>[1][] = [
    'users:admin', 'security:admin', 'platform:admin', 'catalog:write',
  ]
  for (const role of ['SUPPORT_AGENT', 'SUPPORT_LEAD', 'BILLING_ADMIN'] as const) {
    for (const c of superOnly) assert(!hasCapability(role, c), `${role} should NOT have ${c}`)
  }
  for (const c of superOnly) assert(hasCapability('SUPER_ADMIN', c), `SUPER_ADMIN missing ${c}`)
  return true
}

export const scenarioBundlesReferenceKnownCaps = () => {
  for (const role of ['SUPPORT_AGENT', 'SUPPORT_LEAD', 'BILLING_ADMIN'] as const) {
    const caps = ROLE_CAPABILITIES[role]
    if (caps === '*') continue
    for (const cap of caps) {
      assert(ALL_CAPABILITIES.includes(cap), `${role} references unknown capability ${cap}`)
    }
  }
  return true
}

// All scenarios — run via a manual runner to confirm locally:
//   import { runAll } from '@ilaunchify/auth/src/capability-rules.test'
export function runAll(): void {
  scenarioSuperAdminHasEverything()
  scenarioNullIsSuperAdmin()
  scenarioSupportAgentFenced()
  scenarioSupportLeadFenced()
  scenarioBillingAdminFenced()
  scenarioSuperOnlyCapabilities()
  scenarioBundlesReferenceKnownCaps()
}
