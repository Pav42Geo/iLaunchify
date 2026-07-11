// Pure security predicates for the dev sign-in bypass (H5). Single source of truth,
// unit-tested — so config.ts and the /api/dev/login routes can't drift from the
// invariant that the bypass is unreachable in production (and in any deployed env).

/**
 * The dev-only Credentials sign-in (config.ts) is allowed ONLY with zero real
 * providers configured AND outside production. Production is excluded by
 * construction — this can never be true in a prod runtime.
 */
export function isDevSignInAllowed(
  providerCount: number,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return providerCount === 0 && nodeEnv !== 'production'
}

/**
 * `/api/dev/login` must hard-403 unless BOTH: non-production AND the explicit local
 * opt-in `ENABLE_DEV_LOGIN==='true'`. NODE_ENV alone is too weak — a reachable
 * preview deploy (NODE_ENV!=='production') would otherwise expose session forgery. (H5 A0)
 */
export function isDevLoginBlocked(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  enableFlag: string | undefined = process.env.ENABLE_DEV_LOGIN,
): boolean {
  return nodeEnv === 'production' || enableFlag !== 'true'
}
