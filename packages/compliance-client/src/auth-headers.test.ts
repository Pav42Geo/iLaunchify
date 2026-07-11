// Pin-test for the compliance-client fail-closed auth (H4). Locks the Tier 0.4
// security invariant: prod with no token throws; token → Bearer; dev → open.
import { describe, it, expect } from 'vitest'
import { buildComplianceAuthHeaders } from './auth-headers'

describe('buildComplianceAuthHeaders', () => {
  it('attaches a Bearer token when present', () => {
    expect(buildComplianceAuthHeaders({ token: 'sekret', isProd: true })).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer sekret',
    })
  })

  it('FAILS CLOSED — throws in production when the token is missing', () => {
    expect(() => buildComplianceAuthHeaders({ token: undefined, isProd: true })).toThrow(/refusing to call/)
  })

  it('dev fallback — no auth header when the token is missing outside production', () => {
    expect(buildComplianceAuthHeaders({ token: undefined, isProd: false })).toEqual({
      'content-type': 'application/json',
    })
  })
})
