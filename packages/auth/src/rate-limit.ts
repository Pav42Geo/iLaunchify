// DB-backed fixed-window rate limiting — docs/SECURITY_ARCHITECTURE.md
// Tier 0.3 (LOCKED 2026-06-05).
//
// Why DB and not Redis: there is no Redis in the stack and we don't add
// infrastructure for a counter. CockroachDB upserts are plenty for the
// volumes that matter here (credential endpoints + a couple of hot actions).
//
// Algorithm: fixed window. key = `${scope}:${principal}:${windowIndex}`,
// upsert with atomic increment, deny when count exceeds the limit. Fixed
// window's worst case (2× burst at a window boundary) is acceptable at
// these limits.
//
// Failure mode: on unexpected DB errors we FAIL OPEN with a console.error —
// if the DB is down, login can't succeed anyway, and we don't want the rate
// limiter to be the thing that takes a surface offline. (Deliberate deviation
// from "fail closed on auth"; noted in the architecture doc's KPI review.)
//
// Cleanup: each call has a ~2% chance of sweeping expired rows, so the table
// stays small without a cron.

import { prisma } from '@ilaunchify/db'

export interface RateLimitOptions {
  /** Namespace, e.g. "signup:ip" / "signup:email" / "signin:id" / "ingredient-search". */
  scope: string
  /** The principal being limited — IP, email, userId, partnerId. */
  id: string
  /** Max requests per window. */
  limit: number
  /** Window length in seconds. */
  windowSec: number
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number }

export async function checkRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now()
  const windowMs = opts.windowSec * 1000
  const windowIndex = Math.floor(now / windowMs)
  const key = `${opts.scope}:${opts.id}:${windowIndex}`
  const expiresAt = new Date((windowIndex + 1) * windowMs)

  try {
    const bucket = await prisma.rateLimitBucket.upsert({
      where: { key },
      create: { key, count: 1, expiresAt },
      update: { count: { increment: 1 } },
      select: { count: true },
    })

    // Opportunistic sweep — fire-and-forget, never blocks the caller.
    if (Math.random() < 0.02) {
      prisma.rateLimitBucket
        .deleteMany({ where: { expiresAt: { lt: new Date(now) } } })
        .catch(() => {})
    }

    if (bucket.count > opts.limit) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)),
      }
    }
    return { ok: true }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[rate-limit] check failed — failing open', {
      scope: opts.scope,
      err: (err as Error).message,
    })
    return { ok: true }
  }
}

/**
 * Best-effort client IP for server actions / route handlers. Trusts the
 * left-most x-forwarded-for entry (set by the hosting proxy). Returns
 * "unknown" outside a request context so callers can still rate-limit
 * by a degenerate-but-shared bucket rather than crash.
 */
export async function requestIp(): Promise<string> {
  try {
    const { headers } = await import('next/headers')
    const h = await headers()
    const xff = h.get('x-forwarded-for')
    if (xff) return xff.split(',')[0]!.trim()
    return h.get('x-real-ip') ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
