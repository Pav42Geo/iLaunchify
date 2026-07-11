// Unit pins for the Turnstile /siteverify interpreter (H5 A4).
//
// Same convention as dev-guard.test.ts / admin-invite.test.ts: throw-based scenarios
// + a synchronous runAll() aggregator, NO vitest import — runs under
// scripts/run-pure-tests.mjs. We test the PURE interpret function (the spec's accepted
// minimum: "mock the fetch or test only the pure interpret"); verifyTurnstile's io
// branches (skip-when-unset, fail-closed-on-error) are covered by manual verification
// (spec §5) since the pure runner can't await async.

import { interpretSiteverify } from './turnstile'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

export const scenarioSuccess = () => {
  const r = interpretSiteverify({ success: true })
  assert(r.ok === true, 'success:true → ok')
  assert(r.errorCodes === undefined, 'success carries no error codes')
  return true
}

export const scenarioFailureCarriesCodes = () => {
  const r = interpretSiteverify({ success: false, 'error-codes': ['invalid-input-response'] })
  assert(r.ok === false, 'success:false → not ok')
  assert(
    Array.isArray(r.errorCodes) && r.errorCodes[0] === 'invalid-input-response',
    'failure surfaces Cloudflare error-codes',
  )
  return true
}

export const scenarioFailureWithoutCodes = () => {
  const r = interpretSiteverify({ success: false })
  assert(r.ok === false && Array.isArray(r.errorCodes) && r.errorCodes.length === 0, 'no codes → []')
  return true
}

export const scenarioMissingSuccessIsFailure = () => {
  // Any body that isn't an explicit success:true is a failure — never fail open on a
  // malformed/empty response.
  for (const body of [{}, null, undefined, { success: 'true' as unknown as boolean }, { success: 1 as unknown as boolean }]) {
    const r = interpretSiteverify(body)
    assert(r.ok === false, `body ${JSON.stringify(body)} → not ok (only literal true passes)`)
  }
  return true
}

export function runAll(): void {
  scenarioSuccess()
  scenarioFailureCarriesCodes()
  scenarioFailureWithoutCodes()
  scenarioMissingSuccessIsFailure()
}
