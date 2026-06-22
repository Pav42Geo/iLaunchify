import { describe, it, expect } from 'vitest'
import {
  hasCapability,
  resolveCapabilities,
  ALL_CAPABILITIES,
  ROLE_CAPABILITIES,
} from './capability-rules'

describe('admin RBAC capability matrix', () => {
  it('SUPER_ADMIN has every capability', () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(hasCapability('SUPER_ADMIN', cap)).toBe(true)
    }
    expect(resolveCapabilities('SUPER_ADMIN')).toHaveLength(ALL_CAPABILITIES.length)
  })

  it('null/undefined role resolves to SUPER_ADMIN (P0 fail-open)', () => {
    expect(hasCapability(null, 'users:admin')).toBe(true)
    expect(hasCapability(undefined, 'billing:write')).toBe(true)
    expect(resolveCapabilities(null)).toHaveLength(ALL_CAPABILITIES.length)
  })

  it('SUPPORT_AGENT can work tickets + read context, but no money/admin', () => {
    expect(hasCapability('SUPPORT_AGENT', 'tickets:write')).toBe(true)
    expect(hasCapability('SUPPORT_AGENT', 'orders:read')).toBe(true)
    expect(hasCapability('SUPPORT_AGENT', 'refunds:propose')).toBe(true)
    expect(hasCapability('SUPPORT_AGENT', 'refunds:approve')).toBe(false)
    expect(hasCapability('SUPPORT_AGENT', 'refunds:execute')).toBe(false)
    expect(hasCapability('SUPPORT_AGENT', 'billing:read')).toBe(false)
    expect(hasCapability('SUPPORT_AGENT', 'billing:write')).toBe(false)
    expect(hasCapability('SUPPORT_AGENT', 'orders:write')).toBe(false)
    expect(hasCapability('SUPPORT_AGENT', 'users:admin')).toBe(false)
    expect(hasCapability('SUPPORT_AGENT', 'security:admin')).toBe(false)
    expect(hasCapability('SUPPORT_AGENT', 'tickets:admin')).toBe(false)
  })

  it('SUPPORT_LEAD adds approve + read-only billing + review queues, no config writes', () => {
    expect(hasCapability('SUPPORT_LEAD', 'tickets:admin')).toBe(true)
    expect(hasCapability('SUPPORT_LEAD', 'refunds:approve')).toBe(true)
    expect(hasCapability('SUPPORT_LEAD', 'orders:write')).toBe(true)
    expect(hasCapability('SUPPORT_LEAD', 'billing:read')).toBe(true)
    expect(hasCapability('SUPPORT_LEAD', 'reviews:write')).toBe(true)
    // fenced
    expect(hasCapability('SUPPORT_LEAD', 'billing:write')).toBe(false)
    expect(hasCapability('SUPPORT_LEAD', 'refunds:execute')).toBe(false)
    expect(hasCapability('SUPPORT_LEAD', 'tiers:write')).toBe(false)
    expect(hasCapability('SUPPORT_LEAD', 'users:admin')).toBe(false)
    expect(hasCapability('SUPPORT_LEAD', 'security:admin')).toBe(false)
  })

  it('BILLING_ADMIN owns money, not ticket internals or admin team', () => {
    expect(hasCapability('BILLING_ADMIN', 'billing:write')).toBe(true)
    expect(hasCapability('BILLING_ADMIN', 'tiers:write')).toBe(true)
    expect(hasCapability('BILLING_ADMIN', 'refunds:execute')).toBe(true)
    expect(hasCapability('BILLING_ADMIN', 'tickets:write')).toBe(false)
    expect(hasCapability('BILLING_ADMIN', 'users:admin')).toBe(false)
    expect(hasCapability('BILLING_ADMIN', 'security:admin')).toBe(false)
  })

  it('users:admin + security:admin + platform:admin are SUPER_ADMIN-only', () => {
    for (const role of ['SUPPORT_AGENT', 'SUPPORT_LEAD', 'BILLING_ADMIN'] as const) {
      expect(hasCapability(role, 'users:admin')).toBe(false)
      expect(hasCapability(role, 'security:admin')).toBe(false)
      expect(hasCapability(role, 'platform:admin')).toBe(false)
    }
    expect(hasCapability('SUPER_ADMIN', 'users:admin')).toBe(true)
    expect(hasCapability('SUPER_ADMIN', 'platform:admin')).toBe(true)
  })

  it('every non-super role bundle references only known capabilities', () => {
    for (const role of ['SUPPORT_AGENT', 'SUPPORT_LEAD', 'BILLING_ADMIN'] as const) {
      const caps = ROLE_CAPABILITIES[role]
      if (caps === '*') continue
      for (const cap of caps) expect(ALL_CAPABILITIES).toContain(cap)
    }
  })
})
