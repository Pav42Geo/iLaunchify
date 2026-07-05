// One-click unsubscribe — server-side apply (the route handler's engine).
//
// Verifies the signed token (pure, unsubscribe.ts) and flips the EMAIL
// preference for that (user, category) off. Used by both the GET landing page
// and the RFC 8058 List-Unsubscribe-Post POST handler (checklist E). The
// secret is passed in by the route — this module never reads env.

import { verifyUnsubscribeToken } from './unsubscribe'
import { setCategoryPreference } from './center-db'
import { categoryConfig } from './categories'

export type ApplyUnsubscribeResult =
  | { ok: true; categoryLabel: string }
  | {
      ok: false
      reason:
        | 'malformed'
        | 'bad-signature'
        | 'expired'
        | 'unknown-category'
        | 'not-opt-outable'
        | 'persist-failed'
    }

export async function applyUnsubscribeToken(
  token: string,
  opts: { secret: string },
): Promise<ApplyUnsubscribeResult> {
  const verified = verifyUnsubscribeToken(token, { secret: opts.secret })
  if (!verified.ok) return { ok: false, reason: verified.reason }
  try {
    await setCategoryPreference({
      userId: verified.userId,
      category: verified.category,
      channel: 'EMAIL',
      enabled: false,
    })
  } catch {
    return { ok: false, reason: 'persist-failed' }
  }
  return { ok: true, categoryLabel: categoryConfig(verified.category).label }
}
