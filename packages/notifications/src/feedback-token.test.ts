// Pin-tests for the signed one-click feedback token (H4 — packages/notifications had
// 0 `.test.` suites). This is a security-critical HMAC verifier: a bug means forged
// votes or accepted tampered tokens. Pure (node:crypto only). Locks roundtrip,
// tamper-resistance, expiry, and the soft-window "late" semantics.
import { describe, it, expect } from 'vitest'
import {
  buildFeedbackToken,
  verifyFeedbackToken,
  buildFeedbackUrl,
  buildFeedbackLinkPair,
  FEEDBACK_TOKEN_MAX_AGE_MS,
} from './feedback-token'

const SECRET = 'test-secret-key'
const base = { userId: 'u1', subjectType: 'partner', subjectId: 's1', promptKey: 'q1' } as const
const YEAR = 365 * 24 * 60 * 60 * 1000

describe('feedback token — roundtrip', () => {
  it('verifies a freshly built token and returns the payload', () => {
    const tok = buildFeedbackToken({ ...base, score: 'UP', secret: SECRET })
    const r = verifyFeedbackToken(tok, { secret: SECRET, softWindowMs: YEAR })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.userId).toBe('u1')
      expect(r.score).toBe('UP')
      expect(r.subjectId).toBe('s1')
      expect(r.late).toBe(false)
    }
  })
})

describe('feedback token — tamper resistance', () => {
  it('rejects a wrong secret (bad-signature)', () => {
    const tok = buildFeedbackToken({ ...base, score: 'DOWN', secret: SECRET })
    expect(verifyFeedbackToken(tok, { secret: 'other', softWindowMs: YEAR })).toEqual({ ok: false, reason: 'bad-signature' })
  })
  it('rejects a tampered payload segment', () => {
    const tok = buildFeedbackToken({ ...base, score: 'UP', secret: SECRET })
    const [v, p, s] = tok.split('.')
    const tampered = `${v}.${p}x.${s}` // mutate payload → signature no longer matches
    const r = verifyFeedbackToken(tampered, { secret: SECRET, softWindowMs: YEAR })
    expect(r.ok).toBe(false)
  })
  it('rejects a malformed token (wrong shape)', () => {
    expect(verifyFeedbackToken('not-a-token', { secret: SECRET, softWindowMs: YEAR })).toEqual({ ok: false, reason: 'malformed' })
    expect(verifyFeedbackToken('v9.a.b', { secret: SECRET, softWindowMs: YEAR })).toEqual({ ok: false, reason: 'malformed' })
  })
  it('rejects when no secret is supplied to verify', () => {
    const tok = buildFeedbackToken({ ...base, score: 'UP', secret: SECRET })
    expect(verifyFeedbackToken(tok, { secret: '', softWindowMs: YEAR })).toEqual({ ok: false, reason: 'bad-signature' })
  })
  it('throws when building without a secret', () => {
    expect(() => buildFeedbackToken({ ...base, score: 'UP', secret: '' })).toThrow(/secret/)
  })
})

describe('feedback token — time semantics', () => {
  it('flags late (past soft window) but still ok', () => {
    const issuedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
    const tok = buildFeedbackToken({ ...base, score: 'UP', secret: SECRET, issuedAt })
    const r = verifyFeedbackToken(tok, { secret: SECRET, softWindowMs: 24 * 60 * 60 * 1000 /* 1 day */ })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.late).toBe(true)
  })
  it('rejects a token older than the hard ceiling (expired)', () => {
    const issuedAt = new Date(Date.now() - (FEEDBACK_TOKEN_MAX_AGE_MS + 60_000))
    const tok = buildFeedbackToken({ ...base, score: 'UP', secret: SECRET, issuedAt })
    expect(verifyFeedbackToken(tok, { secret: SECRET, softWindowMs: YEAR })).toEqual({ ok: false, reason: 'expired' })
  })
  it('rejects a token from the future beyond clock-skew (expired)', () => {
    const issuedAt = new Date(Date.now() + 10 * 60_000) // +10 min
    const tok = buildFeedbackToken({ ...base, score: 'UP', secret: SECRET, issuedAt })
    expect(verifyFeedbackToken(tok, { secret: SECRET, softWindowMs: YEAR })).toEqual({ ok: false, reason: 'expired' })
  })
})

describe('feedback URL builders', () => {
  it('builds an encoded feedback url and a UP/DOWN link pair', () => {
    expect(buildFeedbackUrl('https://x.com/', 'abc def')).toBe('https://x.com/feedback?token=abc%20def')
    const pair = buildFeedbackLinkPair({ ...base, secret: SECRET, baseUrl: 'https://x.com' })
    expect(pair.upUrl).toContain('/feedback?token=')
    expect(pair.downUrl).toContain('/feedback?token=')
    expect(pair.upUrl).not.toBe(pair.downUrl)
  })
})
