// Goldens for the Track B3 token-health policy. Pure + sync (pure runner safe).

import { describe, it, expect } from 'vitest'
import { evaluateTokenHealth, TOKEN_POLICIES, REAUTH_WARN_DAYS } from './token-lifecycle'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const T0 = 1_800_000_000_000 // fixed epoch base for every scenario

function base(code: string) {
  return {
    code,
    nowMs: T0,
    connectedAtMs: T0 - 10 * DAY,
    accessTokenExpiresAtMs: null as number | null,
    lastRefreshAtMs: null as number | null,
    hasRefreshToken: true,
  }
}

describe('evaluateTokenHealth: access-token window', () => {
  it('etsy: fresh token is healthy', () => {
    const v = evaluateTokenHealth({ ...base('etsy'), accessTokenExpiresAtMs: T0 + 50 * MIN })
    expect(v.action).toBe('NONE')
  })

  it('etsy: refresh inside the 10-minute skew window', () => {
    const v = evaluateTokenHealth({ ...base('etsy'), accessTokenExpiresAtMs: T0 + 9 * MIN })
    expect(v.action).toBe('REFRESH')
  })

  it('etsy: no reported expiry falls back to assumed 1h TTL from last refresh', () => {
    const stale = evaluateTokenHealth({ ...base('etsy'), lastRefreshAtMs: T0 - 2 * HOUR })
    expect(stale.action).toBe('REFRESH')
    const fresh = evaluateTokenHealth({ ...base('etsy'), lastRefreshAtMs: T0 - 10 * MIN })
    expect(fresh.action).toBe('NONE')
  })

  it('expiring token with NO refresh credential is EXPIRE, not REFRESH', () => {
    const v = evaluateTokenHealth({
      ...base('etsy'),
      accessTokenExpiresAtMs: T0 + 5 * MIN,
      hasRefreshToken: false,
    })
    expect(v.action).toBe('EXPIRE')
  })

  it('walmart: 15-minute tokens sit inside the refresh window almost immediately', () => {
    const v = evaluateTokenHealth({ ...base('walmart'), lastRefreshAtMs: T0 - 11 * MIN })
    expect(v.action).toBe('REFRESH')
  })

  it('shopify + woocommerce: no clock ever expires them', () => {
    for (const code of ['shopify', 'woocommerce']) {
      const v = evaluateTokenHealth({ ...base(code), connectedAtMs: T0 - 3650 * DAY, hasRefreshToken: false })
      expect(v.action).toBe('NONE')
    }
  })
})

describe('evaluateTokenHealth: refresh-credential lifetime', () => {
  it('etsy: 90-day ROLLING window measured from the last refresh', () => {
    const dead = evaluateTokenHealth({ ...base('etsy'), connectedAtMs: T0 - 200 * DAY, lastRefreshAtMs: T0 - 91 * DAY })
    expect(dead.action).toBe('EXPIRE')
    expect(dead.reason).toBe('refresh credential expired')
    const alive = evaluateTokenHealth({
      ...base('etsy'),
      connectedAtMs: T0 - 200 * DAY,
      lastRefreshAtMs: T0 - 2 * DAY,
      accessTokenExpiresAtMs: T0 + 50 * MIN,
    })
    expect(alive.action).toBe('NONE')
  })

  it('ebay: FIXED ~18-month cliff from connect, refreshing does not extend it', () => {
    const v = evaluateTokenHealth({
      ...base('ebay'),
      connectedAtMs: T0 - 541 * DAY,
      lastRefreshAtMs: T0 - 1 * DAY, // recent refresh cannot save a FIXED anchor
    })
    expect(v.action).toBe('EXPIRE')
  })
})

describe('evaluateTokenHealth: mandated re-authorization (amazon)', () => {
  it('healthy connection far from the 365-day mark reports no reauth', () => {
    const v = evaluateTokenHealth({
      ...base('amazon'),
      connectedAtMs: T0 - 100 * DAY,
      accessTokenExpiresAtMs: T0 + 50 * MIN,
    })
    expect(v.action).toBe('NONE')
    expect(v.reauthDueInDays).toBe(null)
  })

  it(`inside the ${REAUTH_WARN_DAYS}-day warn window the verdict carries the countdown`, () => {
    const v = evaluateTokenHealth({
      ...base('amazon'),
      connectedAtMs: T0 - 350 * DAY,
      accessTokenExpiresAtMs: T0 + 50 * MIN,
    })
    expect(v.action).toBe('NONE')
    expect(v.reauthDueInDays).toBe(15)
  })

  it('past the 365-day mark the connection is dead regardless of token state', () => {
    const v = evaluateTokenHealth({
      ...base('amazon'),
      connectedAtMs: T0 - 366 * DAY,
      accessTokenExpiresAtMs: T0 + 50 * MIN,
    })
    expect(v.action).toBe('EXPIRE')
    expect(v.reauthDueInDays).toBe(0)
  })
})

describe('policy table sanity', () => {
  it('every policy that assumes an access TTL also has a nonzero skew', () => {
    for (const [code, p] of Object.entries(TOKEN_POLICIES)) {
      if (p.assumedAccessTtlMs !== null) {
        expect(p.refreshSkewMs > 0).toBe(true)
        expect(p.refreshSkewMs < p.assumedAccessTtlMs).toBe(true)
      }
      expect(code.length > 0).toBe(true)
    }
  })

  it('unknown codes fall back to adapter-reported expiry only', () => {
    const v = evaluateTokenHealth({ ...base('wix'), connectedAtMs: T0 - 400 * DAY })
    expect(v.action).toBe('NONE') // no expiry signal, no assumed TTL
    const w = evaluateTokenHealth({ ...base('wix'), accessTokenExpiresAtMs: T0 + 1 * MIN })
    expect(w.action).toBe('REFRESH')
  })
})
