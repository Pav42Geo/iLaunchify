// Security pins for the dev sign-in bypass predicates (H5 A3).
//
// Same convention as admin-invite.test.ts / capability-rules.test.ts: throw-based
// scenarios + a runAll() aggregator, NO vitest import — runs under
// scripts/run-pure-tests.mjs.
//
// Why this matters: these two predicates are the ONLY thing standing between a
// deployed environment and one-request session forgery. config.ts gates the dev
// Credentials provider on isDevSignInAllowed; /api/dev/login hard-403s on
// isDevLoginBlocked. The pins below lock the invariant that NEITHER can open in
// production, and that the local bypass needs the explicit ENABLE_DEV_LOGIN opt-in
// (NODE_ENV alone is too weak — a reachable preview deploy is non-prod).

import { isDevSignInAllowed, isDevLoginBlocked } from './dev-guard'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

// ── isDevSignInAllowed: the dev Credentials provider (config.ts) ──────────────

export const scenarioDevSignInNeverInProd = () => {
  // The whole point: production can NEVER get the credentials provider, regardless
  // of how many providers are configured.
  assert(isDevSignInAllowed(0, 'production') === false, '0 providers + prod → no dev sign-in')
  assert(isDevSignInAllowed(2, 'production') === false, '2 providers + prod → no dev sign-in')
  return true
}

export const scenarioDevSignInOnlyWithZeroProviders = () => {
  // Outside prod, the fallback is on ONLY when no real provider is configured.
  assert(isDevSignInAllowed(0, 'development') === true, '0 providers + dev → dev sign-in on')
  assert(isDevSignInAllowed(0, 'test') === true, '0 providers + test → dev sign-in on')
  assert(isDevSignInAllowed(1, 'development') === false, 'a real provider present → dev sign-in off')
  assert(isDevSignInAllowed(0, undefined) === true, 'unset NODE_ENV (≠production) → dev sign-in on')
  return true
}

// ── isDevLoginBlocked: the /api/dev/login route guard ─────────────────────────

export const scenarioDevLoginBlockedInProd = () => {
  // Prod is blocked no matter what the flag says (defence in depth).
  assert(isDevLoginBlocked('production', 'true') === true, 'prod + flag=true → still blocked')
  assert(isDevLoginBlocked('production', undefined) === true, 'prod + no flag → blocked')
  return true
}

export const scenarioDevLoginNeedsExplicitOptIn = () => {
  // Non-prod is NOT enough — the explicit ENABLE_DEV_LOGIN=true opt-in is required.
  assert(isDevLoginBlocked('development', undefined) === true, 'dev + no flag → blocked (NODE_ENV alone too weak)')
  assert(isDevLoginBlocked('development', 'false') === true, "dev + flag='false' → blocked")
  assert(isDevLoginBlocked('development', '1') === true, "dev + flag='1' (not 'true') → blocked")
  assert(isDevLoginBlocked('development', 'TRUE') === true, "dev + flag='TRUE' (case-sensitive) → blocked")
  return true
}

export const scenarioDevLoginOpenOnlyWithBoth = () => {
  // The one and only combination that opens the bypass.
  assert(isDevLoginBlocked('development', 'true') === false, 'dev + flag=true → open')
  assert(isDevLoginBlocked('test', 'true') === false, 'test + flag=true → open')
  assert(isDevLoginBlocked(undefined, 'true') === false, 'unset NODE_ENV + flag=true → open')
  return true
}

export function runAll(): void {
  scenarioDevSignInNeverInProd()
  scenarioDevSignInOnlyWithZeroProviders()
  scenarioDevLoginBlockedInProd()
  scenarioDevLoginNeedsExplicitOptIn()
  scenarioDevLoginOpenOnlyWithBoth()
}
