// Pure summary of a batch of connection-test results. No I/O, no secrets — just
// counts + the names of anything that failed, for the "Test all" headline.
// Node-verified by test-summary.selftest.ts.

export interface NamedTestResult {
  key: string
  name: string
  ok: boolean
}

export interface TestSummary {
  total: number
  passed: number
  failed: number
  /** Display names of the failed integrations, in input order. */
  failedNames: string[]
  /** True only when at least one test ran and every one passed. */
  allPassed: boolean
}

export function summarizeTestResults(results: NamedTestResult[]): TestSummary {
  const failed = results.filter((r) => !r.ok)
  return {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failedNames: failed.map((r) => r.name),
    allPassed: results.length > 0 && failed.length === 0,
  }
}
