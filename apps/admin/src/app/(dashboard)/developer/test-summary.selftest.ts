// Node self-test for summarizeTestResults (no test runner needed):
//   npx tsx apps/admin/src/app/(dashboard)/developer/test-summary.selftest.ts
// or via the pure-suite aggregator if wired. Pure logic — exits non-zero on failure.

import { summarizeTestResults, type NamedTestResult } from './test-summary'

let failures = 0
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++
    // eslint-disable-next-line no-console
    console.error(`✗ ${label}`)
  }
}

const mk = (name: string, ok: boolean): NamedTestResult => ({ key: name.toLowerCase(), name, ok })

// All pass
{
  const s = summarizeTestResults([mk('Stripe', true), mk('Resend', true)])
  check('all-pass total', s.total === 2)
  check('all-pass passed', s.passed === 2)
  check('all-pass failed', s.failed === 0)
  check('all-pass allPassed', s.allPassed === true)
  check('all-pass failedNames empty', s.failedNames.length === 0)
}

// Mixed
{
  const s = summarizeTestResults([mk('Stripe', true), mk('Resend', false), mk('R2', false)])
  check('mixed total', s.total === 3)
  check('mixed passed', s.passed === 1)
  check('mixed failed', s.failed === 2)
  check('mixed allPassed false', s.allPassed === false)
  check('mixed failedNames order', s.failedNames.join(',') === 'Resend,R2')
}

// Empty — allPassed must be false (nothing actually verified)
{
  const s = summarizeTestResults([])
  check('empty total', s.total === 0)
  check('empty allPassed false', s.allPassed === false)
}

if (failures > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
// eslint-disable-next-line no-console
console.log('✓ test-summary: all checks passed')
