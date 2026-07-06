// Signed one-click feedback tokens (docs/FEEDBACK_MODULE.md §3.1).
//
// The Amazon trick, done right: the SCORE rides inside the signed link, so the
// click IS the vote — the landing page only enriches (tags + comment). Same
// HMAC-v1 discipline as unsubscribe.ts: secret passed in (FEEDBACK_TOKEN_SECRET,
// never read from env here, never logged), constant-time compare.
//
// Soft expiry (docs Part 2): past the window a token is LATE, not invalid —
// verify returns { ok: true, late: true } and the response is recorded but
// excluded from scorecard aggregates. No dead ends.
//
// Token format:  fb1.<base64url(payload JSON)>.<base64url(hmac)>
// Payload:       { u: userId, s: subjectType, i: subjectId, q: promptKey,
//                  v: 'UP'|'DOWN', t: issuedAt epoch-ms }

import { createHmac, timingSafeEqual } from 'node:crypto'

const VERSION = 'fb1'

/** Hard validity ceiling — beyond this a token is invalid, not just late. */
export const FEEDBACK_TOKEN_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

export type FeedbackScoreValue = 'UP' | 'DOWN'

export interface FeedbackTokenPayload {
  userId: string
  subjectType: string // FeedbackSubjectType — validated against the registry by callers
  subjectId: string
  promptKey: string
  score: FeedbackScoreValue
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url')
}

function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(`${VERSION}.${payloadB64}`).digest())
}

export function buildFeedbackToken(
  params: FeedbackTokenPayload & { secret: string; issuedAt?: Date },
): string {
  if (!params.secret) throw new Error('feedback token secret is required')
  const payload = JSON.stringify({
    u: params.userId,
    s: params.subjectType,
    i: params.subjectId,
    q: params.promptKey,
    v: params.score,
    t: (params.issuedAt ?? new Date()).getTime(),
  })
  const payloadB64 = b64url(Buffer.from(payload, 'utf8'))
  return `${VERSION}.${payloadB64}.${sign(payloadB64, params.secret)}`
}

export type VerifyFeedbackResult =
  | (FeedbackTokenPayload & {
      ok: true
      issuedAt: Date
      /** Past the prompt's soft window — record, flag, exclude from aggregates. */
      late: boolean
    })
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' }

/**
 * Verify a token. `softWindowMs` is the prompt's response window (from the
 * prompt registry) — beyond it the result is `late: true`, still ok. Beyond
 * the hard ceiling (or from the future) the token is rejected outright.
 */
export function verifyFeedbackToken(
  token: string,
  opts: { secret: string; softWindowMs: number; now?: Date },
): VerifyFeedbackResult {
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
  const p = parsed as { u?: unknown; s?: unknown; i?: unknown; q?: unknown; v?: unknown; t?: unknown }
  if (
    typeof p.u !== 'string' ||
    typeof p.s !== 'string' ||
    typeof p.i !== 'string' ||
    typeof p.q !== 'string' ||
    (p.v !== 'UP' && p.v !== 'DOWN') ||
    typeof p.t !== 'number'
  ) {
    return { ok: false, reason: 'malformed' }
  }

  const now = (opts.now ?? new Date()).getTime()
  const age = now - p.t
  if (p.t > now + 60_000 /* clock-skew allowance */ || age > FEEDBACK_TOKEN_MAX_AGE_MS) {
    return { ok: false, reason: 'expired' }
  }

  return {
    ok: true,
    userId: p.u,
    subjectType: p.s,
    subjectId: p.i,
    promptKey: p.q,
    score: p.v,
    issuedAt: new Date(p.t),
    late: age > opts.softWindowMs,
  }
}

// ---------------------------------------------------------------------------
// URL builders — the marketing app hosts /feedback (public, like /unsubscribe)
// ---------------------------------------------------------------------------

export function buildFeedbackUrl(baseUrl: string, token: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  return `${trimmed}/feedback?token=${encodeURIComponent(token)}`
}

/** Both links for one email's feedback block (UP + DOWN tokens over the same subject). */
export function buildFeedbackLinkPair(
  params: Omit<FeedbackTokenPayload, 'score'> & { secret: string; baseUrl: string; issuedAt?: Date },
): { upUrl: string; downUrl: string } {
  const { baseUrl, ...rest } = params
  return {
    upUrl: buildFeedbackUrl(baseUrl, buildFeedbackToken({ ...rest, score: 'UP' })),
    downUrl: buildFeedbackUrl(baseUrl, buildFeedbackToken({ ...rest, score: 'DOWN' })),
  }
}
