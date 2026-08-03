// Goldens for the channel token vault crypto (Track B1). Pure + sync so the
// suite runs under scripts/run-vitest-suites.mjs as well as real vitest.

import { describe, it, expect } from 'vitest'
import {
  parseChannelTokenKey,
  sealSecret,
  openSecret,
  generateOauthState,
  generatePkcePair,
  pkceChallengeFromVerifier,
} from './secret-box'

const HEX_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
const KEY = parseChannelTokenKey(HEX_KEY)
const OTHER_KEY = parseChannelTokenKey('f'.repeat(64))
const FIXED_IV = Buffer.from('0f0e0d0c0b0a090807060504', 'hex')

describe('parseChannelTokenKey', () => {
  it('accepts 64 hex chars', () => {
    expect(parseChannelTokenKey(HEX_KEY).length).toBe(32)
  })
  it('accepts base64 of 32 bytes', () => {
    expect(parseChannelTokenKey(KEY.toString('base64')).length).toBe(32)
    expect(parseChannelTokenKey(KEY.toString('base64')).toString('hex')).toBe(HEX_KEY)
  })
  it('rejects missing / short / junk keys with actionable errors', () => {
    expect(() => parseChannelTokenKey(undefined)).toThrow(/CHANNEL_TOKEN_KEY is not set/)
    expect(() => parseChannelTokenKey('')).toThrow(/not set/)
    expect(() => parseChannelTokenKey('abc123')).toThrow(/32 bytes/)
    expect(() => parseChannelTokenKey('deadbeef'.repeat(4))).toThrow(/32 bytes/) // 32 hex chars = 16 bytes
  })
})

describe('sealSecret / openSecret', () => {
  it('golden: fixed key + fixed IV produce the pinned v1 envelope', () => {
    const sealed = sealSecret('shpat_example_token_123', KEY, { ivForTests: FIXED_IV })
    expect(sealed).toBe('v1.Dw4NDAsKCQgHBgUE.Ehm9XuskvdpHHhbY8PFtRA==.11jBPS+IytaKssEzXcX9bgIDcT/+a8I=')
    expect(openSecret(sealed, KEY)).toBe('shpat_example_token_123')
  })

  it('roundtrips arbitrary content with random IVs (distinct envelopes, same plaintext)', () => {
    const secret = 'refresh|{"token":"r1.abc","scopes":["listings_w"]}'
    const a = sealSecret(secret, KEY)
    const b = sealSecret(secret, KEY)
    expect(a).not.toBe(b) // fresh IV every seal
    expect(openSecret(a, KEY)).toBe(secret)
    expect(openSecret(b, KEY)).toBe(secret)
  })

  it('roundtrips empty and unicode plaintexts', () => {
    expect(openSecret(sealSecret('', KEY), KEY)).toBe('')
    expect(openSecret(sealSecret('tökén-✓', KEY), KEY)).toBe('tökén-✓')
  })

  it('throws on ciphertext tamper', () => {
    const sealed = sealSecret('secret-token', KEY, { ivForTests: FIXED_IV })
    const parts = sealed.split('.')
    const ct = parts[3] as string
    const flipped = ct[0] === 'A' ? 'B' + ct.slice(1) : 'A' + ct.slice(1)
    expect(() => openSecret([parts[0], parts[1], parts[2], flipped].join('.'), KEY)).toThrow()
  })

  it('throws on auth-tag tamper and on the wrong key', () => {
    const sealed = sealSecret('secret-token', KEY)
    const parts = sealed.split('.')
    const tag = parts[2] as string
    const badTag = (tag[0] === 'A' ? 'B' : 'A') + tag.slice(1)
    expect(() => openSecret([parts[0], parts[1], badTag, parts[3]].join('.'), KEY)).toThrow()
    expect(() => openSecret(sealed, OTHER_KEY)).toThrow()
  })

  it('binds AAD: open with missing or different AAD throws', () => {
    const sealed = sealSecret('secret-token', KEY, { aad: 'access_token' })
    expect(openSecret(sealed, KEY, { aad: 'access_token' })).toBe('secret-token')
    expect(() => openSecret(sealed, KEY)).toThrow()
    expect(() => openSecret(sealed, KEY, { aad: 'refresh_token' })).toThrow()
  })

  it('rejects malformed envelopes', () => {
    expect(() => openSecret('not-sealed', KEY)).toThrow(/unrecognized sealed format/)
    expect(() => openSecret('v2.a.b.c', KEY)).toThrow(/unrecognized sealed format/)
    expect(() => openSecret('v1.YWJj.YWJj.YWJj', KEY)).toThrow(/malformed/)
  })
})

describe('OAuth handshake material', () => {
  it('state tokens are 43-char base64url and unique', () => {
    const a = generateOauthState()
    const b = generateOauthState()
    expect(a).not.toBe(b)
    expect(a.length).toBe(43)
    expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true)
  })

  it('PKCE challenge matches the RFC 7636 appendix B vector', () => {
    expect(pkceChallengeFromVerifier('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })

  it('generated PKCE pairs satisfy RFC 7636 shape', () => {
    const { codeVerifier, codeChallenge, codeChallengeMethod } = generatePkcePair()
    expect(codeChallengeMethod).toBe('S256')
    expect(codeVerifier.length).toBe(64) // within the 43–128 window
    expect(/^[A-Za-z0-9_-]+$/.test(codeVerifier)).toBe(true) // unreserved subset
    expect(codeChallenge).toBe(pkceChallengeFromVerifier(codeVerifier))
  })
})
