// Signed one-click unsubscribe tokens + List-Unsubscribe header builders
// (docs/EMAIL_NOTIFICATION_CENTER.md — "One-click unsubscribe link").
//
// A token authorizes exactly one action — "turn EMAIL off for (userId,
// category)" — with no login. Pure HMAC-SHA256; the secret is PASSED IN by the
// caller (route handler / dispatcher) and is never read from env or logged.
//
// Token format:  v1.<base64url(payload JSON)>.<base64url(hmac)>
// Payload:       { u: userId, c: category, t: issuedAt epoch-ms }

import { createHmac, timingSafeEqual } from 'node:crypto'
import { isCategoryOptOutable, isValidCategorySlug } from './categories'
import type { NotificationCategorySlug } from './center-types'

const VERSION = 'v1'

/** Default max token age: 90 days (long-lived — emails sit in inboxes). */
export const UNSUBSCRIBE_TOKEN_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

function b64url(buf: Buffer): string {
  return buf.toString('base64url')
}

function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(`${VERSION}.${payloadB64}`).digest())
}

export function buildUnsubscribeToken(params: {
  userId: string
  category: NotificationCategorySlug
  secret: string
  /** Override for tests; defaults to now. */
  issuedAt?: Date
}): string {
  if (!params.secret) throw new Error('unsubscribe secret is required')
  const payload = JSON.stringify({
    u: params.userId,
    c: params.category,
    t: (params.issuedAt ?? new Date()).getTime(),
  })
  const payloadB64 = b64url(Buffer.from(payload, 'utf8'))
  return `${VERSION}.${payloadB64}.${sign(payloadB64, params.secret)}`
}

export type VerifyUnsubscribeResult =
  | { ok: true; userId: string; category: NotificationCategorySlug; issuedAt: Date }
  | {
      ok: false
      reason: 'malformed' | 'bad-signature' | 'expired' | 'unknown-category' | 'not-opt-outable'
    }

/**
 * Verify a token. Rejects: wrong shape/version, bad HMAC (constant-time
 * compare), tokens older than maxAgeMs, unknown categories, and categories
 * that are mandatory (can't be unsubscribed even with a valid token).
 */
export function verifyUnsubscribeToken(
  token: string,
  opts: { secret: string; maxAgeMs?: number; now?: Date },
): VerifyUnsubscribeResult {
  if (!opts.secret) return { ok: false, reason: 'bad-signature' }
  const parts = token.split('.')
  const [version, payloadB64, sigB64] = parts
  if (parts.length !== 3 || version !== VERSION || !payloadB64 || !sigB64) {
    return { ok: false, reason: 'malformed' }
  }

  const expected = Buffer.from(sign(payloadB64, opts.secret), 'utf8')
  const actual = Buffer.from(sigB64, 'utf8')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'bad-signature' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const p = parsed as { u?: unknown; c?: unknown; t?: unknown }
  if (typeof p.u !== 'string' || typeof p.c !== 'string' || typeof p.t !== 'number') {
    return { ok: false, reason: 'malformed' }
  }

  const maxAge = opts.maxAgeMs ?? UNSUBSCRIBE_TOKEN_MAX_AGE_MS
  const now = (opts.now ?? new Date()).getTime()
  if (p.t > now + 60_000 /* small clock-skew allowance */ || now - p.t > maxAge) {
    return { ok: false, reason: 'expired' }
  }

  if (!isValidCategorySlug(p.c)) return { ok: false, reason: 'unknown-category' }
  if (!isCategoryOptOutable(p.c)) return { ok: false, reason: 'not-opt-outable' }

  return { ok: true, userId: p.u, category: p.c, issuedAt: new Date(p.t) }
}

// ---------------------------------------------------------------------------
// Header + URL builders
// ---------------------------------------------------------------------------

/** `{base}/unsubscribe?token=…` — base is the app host serving the route. */
export function buildUnsubscribeUrl(baseUrl: string, token: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  return `${trimmed}/unsubscribe?token=${encodeURIComponent(token)}`
}

/**
 * Value for the `List-Unsubscribe` header (RFC 2369). Include the https URL
 * always; add a mailto fallback when provided.
 */
export function buildListUnsubscribeHeader(params: {
  unsubscribeUrl: string
  mailto?: string
}): string {
  const parts = [`<${params.unsubscribeUrl}>`]
  if (params.mailto) parts.push(`<mailto:${params.mailto}>`)
  return parts.join(', ')
}

/**
 * Value for `List-Unsubscribe-Post` (RFC 8058 one-click — Gmail/Yahoo bulk
 * sender requirement). Constant by spec.
 */
export const LIST_UNSUBSCRIBE_POST = 'List-Unsubscribe=One-Click'
