// Cloudflare Turnstile server verifier (H5 A4 — docs/A4_TURNSTILE_BUILD_SPEC_2026-07-11.md).
//
// Bot defense for the OPEN entrances (creator/partner signup + login pre-check +
// partner contact). Lives next to rate-limit.ts — same entrance-security family.
// Split pure ↔ io so the interpretation logic is unit-tested without a network.
//
// Feature-gating: verification runs only when TURNSTILE_SECRET_KEY is set. Unset →
// skip (allow) so unconfigured dev/preview still works, but a production deploy
// missing the secret logs a loud warning (it has NO bot defense). Pavel can flip
// the unset branch to fail-closed later.

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export interface TurnstileResult {
  ok: boolean
  /** true when verification was skipped because the secret is unset (feature off). */
  skipped?: boolean
  errorCodes?: string[]
}

/** Cloudflare /siteverify response shape (the fields we read). */
export interface SiteverifyBody {
  success?: boolean
  'error-codes'?: string[]
}

// PURE — interpret Cloudflare's /siteverify JSON. Unit-tested.
export function interpretSiteverify(body: SiteverifyBody | null | undefined): TurnstileResult {
  return body?.success === true
    ? { ok: true }
    : { ok: false, errorCodes: body?.['error-codes'] ?? [] }
}

// IO — POST the token to Cloudflare. Feature-gated: no secret → skip (allow) with a
// prod warning. Never throws; a network/parse failure returns { ok:false } (fail-closed
// on error) so a broken round-trip can't be treated as a pass.
export async function verifyTurnstile(args: {
  token: string | null | undefined
  ip?: string | null
}): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.warn('[turnstile] TURNSTILE_SECRET_KEY unset in production — bot defense OFF')
    }
    return { ok: true, skipped: true }
  }
  if (!args.token) return { ok: false, errorCodes: ['missing-input-response'] }
  try {
    const form = new URLSearchParams({ secret, response: args.token })
    if (args.ip) form.set('remoteip', args.ip)
    const res = await fetch(SITEVERIFY, { method: 'POST', body: form })
    return interpretSiteverify((await res.json()) as SiteverifyBody)
  } catch {
    return { ok: false, errorCodes: ['network-error'] } // fail-closed on error
  }
}
