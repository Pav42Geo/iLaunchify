// Token lifecycle policy (Track B3, docs/SHOP_CONNECT_E2E_2026-07-24.md §5).
// PURE: the /api/cron/channel-tokens sweep feeds each connection's metadata in
// and gets one verdict out; all marketplace-specific token math lives here so
// it is golden-testable and the cron stays a thin executor.
//
// Per-channel numbers come from the shop-connect research dossier (§3):
//   etsy      access 1 h · refresh 90 d ROLLING (rotates on every refresh)
//   ebay      access 2 h · refresh ~18 mo FIXED (no rotation; re-consent after)
//   walmart   access 15 min · refresh 1 y
//   amazon    LWA access 1 h · refresh long-lived · RE-AUTHORIZE every 365 d
//   tiktok    honor the *_expire_in fields (days-scale access, long refresh)
//   shopify   offline token: lives until uninstall (no expiry, no refresh)
//   woocommerce  REST keys never expire
// Unlisted codes fall back to DEFAULT_POLICY (honor adapter-reported expiry).

export interface TokenLifecyclePolicy {
  /** Assumed access-token TTL when the adapter reported no expiry. null = does not expire. */
  assumedAccessTtlMs: number | null
  /** Refresh when now >= expiry - skew (never run tokens to the wire). */
  refreshSkewMs: number
  /** Hard lifetime of the refresh credential. null = effectively unlimited. */
  refreshTokenTtlMs: number | null
  /** What the refresh-credential lifetime anchors to: ROLLING = last successful
   *  refresh (rotating refresh tokens, Etsy); FIXED = the original connect
   *  (non-rotating, eBay). */
  refreshAnchor: 'ROLLING' | 'FIXED'
  /** Marketplace-mandated full re-authorization interval (Amazon 365 d). */
  reauthEveryMs: number | null
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const NEVER: TokenLifecyclePolicy = {
  assumedAccessTtlMs: null,
  refreshSkewMs: 0,
  refreshTokenTtlMs: null,
  refreshAnchor: 'FIXED',
  reauthEveryMs: null,
}

export const DEFAULT_POLICY: TokenLifecyclePolicy = {
  assumedAccessTtlMs: null, // trust the adapter's expiresAt only
  refreshSkewMs: 10 * MIN,
  refreshTokenTtlMs: null,
  refreshAnchor: 'ROLLING',
  reauthEveryMs: null,
}

export const TOKEN_POLICIES: Record<string, TokenLifecyclePolicy> = {
  shopify: NEVER, // offline token: dies on uninstall, not on a clock
  woocommerce: NEVER, // per-store REST keys
  etsy: {
    assumedAccessTtlMs: 1 * HOUR,
    refreshSkewMs: 10 * MIN,
    refreshTokenTtlMs: 90 * DAY,
    refreshAnchor: 'ROLLING',
    reauthEveryMs: null,
  },
  ebay: {
    assumedAccessTtlMs: 2 * HOUR,
    refreshSkewMs: 15 * MIN,
    refreshTokenTtlMs: 540 * DAY, // ~18 months, non-rotating
    refreshAnchor: 'FIXED',
    reauthEveryMs: null,
  },
  walmart: {
    assumedAccessTtlMs: 15 * MIN,
    refreshSkewMs: 5 * MIN,
    refreshTokenTtlMs: 365 * DAY,
    refreshAnchor: 'ROLLING',
    reauthEveryMs: null,
  },
  amazon: {
    assumedAccessTtlMs: 1 * HOUR,
    refreshSkewMs: 10 * MIN,
    refreshTokenTtlMs: null, // refresh token long-lived; the 365 d re-auth governs
    refreshAnchor: 'ROLLING',
    reauthEveryMs: 365 * DAY,
  },
  tiktok: {
    assumedAccessTtlMs: 7 * DAY, // observed days-scale; adapter-reported expiry wins
    refreshSkewMs: 12 * HOUR,
    refreshTokenTtlMs: null,
    refreshAnchor: 'ROLLING',
    reauthEveryMs: null,
  },
  stub: {
    assumedAccessTtlMs: 24 * HOUR,
    refreshSkewMs: 1 * HOUR,
    refreshTokenTtlMs: null,
    refreshAnchor: 'ROLLING',
    reauthEveryMs: null,
  },
}

/** Warn this many days ahead of a mandated re-authorization (renewal nudge). */
export const REAUTH_WARN_DAYS = 30

export interface TokenHealthInput {
  /** Channel code ('etsy', 'stub', ...). Unknown codes use DEFAULT_POLICY. */
  code: string
  nowMs: number
  connectedAtMs: number | null
  /** Adapter-reported access-token expiry persisted at connect/refresh. */
  accessTokenExpiresAtMs: number | null
  /** Last SUCCESSFUL refresh (rolling anchor). */
  lastRefreshAtMs: number | null
  hasRefreshToken: boolean
}

export interface TokenHealthVerdict {
  /** NONE = healthy; REFRESH = run the adapter's refresh now; EXPIRE = the
   *  credential chain is dead, flip TOKEN_EXPIRED + tell the creator. */
  action: 'NONE' | 'REFRESH' | 'EXPIRE'
  reason: string
  /** Days until a mandated re-authorization (Amazon), when inside the warn
   *  window. null = no re-auth pending. 0 = due now (also forces EXPIRE). */
  reauthDueInDays: number | null
}

export function evaluateTokenHealth(input: TokenHealthInput): TokenHealthVerdict {
  const policy = TOKEN_POLICIES[input.code] ?? DEFAULT_POLICY
  const anchorMs =
    policy.refreshAnchor === 'ROLLING'
      ? (input.lastRefreshAtMs ?? input.connectedAtMs)
      : input.connectedAtMs

  // 1. Mandated re-authorization (Amazon 365 d): past due = dead, near = warn.
  let reauthDueInDays: number | null = null
  if (policy.reauthEveryMs !== null && input.connectedAtMs !== null) {
    const dueAt = input.connectedAtMs + policy.reauthEveryMs
    const daysLeft = Math.floor((dueAt - input.nowMs) / DAY)
    if (daysLeft <= 0) {
      return { action: 'EXPIRE', reason: 'reauthorization window passed', reauthDueInDays: 0 }
    }
    if (daysLeft <= REAUTH_WARN_DAYS) reauthDueInDays = daysLeft
  }

  // 2. Refresh-credential death: a refresh past this point cannot succeed.
  if (policy.refreshTokenTtlMs !== null && anchorMs !== null) {
    if (input.nowMs >= anchorMs + policy.refreshTokenTtlMs) {
      return { action: 'EXPIRE', reason: 'refresh credential expired', reauthDueInDays }
    }
  }

  // 3. Access-token expiry: adapter-reported wins; else the assumed TTL from
  //    the last refresh/connect. No expiry signal at all = healthy (Shopify).
  const expiresAtMs =
    input.accessTokenExpiresAtMs ??
    (policy.assumedAccessTtlMs !== null && anchorMs !== null ? anchorMs + policy.assumedAccessTtlMs : null)
  if (expiresAtMs !== null && input.nowMs >= expiresAtMs - policy.refreshSkewMs) {
    if (!input.hasRefreshToken) {
      return { action: 'EXPIRE', reason: 'access token expiring with no refresh credential', reauthDueInDays }
    }
    return { action: 'REFRESH', reason: 'access token inside the refresh window', reauthDueInDays }
  }

  return { action: 'NONE', reason: 'healthy', reauthDueInDays }
}
