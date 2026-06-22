#!/usr/bin/env node
/**
 * Run the pure, dependency-free logic suites that ship as `runAll()` aggregators
 * (the project convention — no vitest import, so they type-check under
 * `tsc --noEmit` but were never EXECUTED). This runner transpiles each suite +
 * its pure sibling(s) to a temp dir with the repo's local tsc and runs
 * `runAll()`, so the assertions actually fire. Zero install required:
 *
 *   node scripts/run-pure-tests.mjs
 *
 * A suite qualifies if, after type-only imports are erased, the test file and
 * its `deps` require nothing outside the listed files (DB-bound engines don't
 * qualify — extract their pure core first). Add one by appending to SUITES.
 */

import { execSync } from 'node:child_process'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const TSC = 'node_modules/.bin/tsc'

// { base dir, pure dep modules, the *.test.ts, human label }
const SUITES = [
  { base: 'packages/auth/src', deps: ['capability-rules.ts'], test: 'capability-rules.test.ts', label: 'RBAC capability matrix' },
  { base: 'packages/auth/src', deps: ['admin-invite.ts'], test: 'admin-invite.test.ts', label: 'Admin-invite acceptance' },
  { base: 'packages/auth/src', deps: ['ownership-rules.ts'], test: 'ownership.test.ts', label: 'Ownership guards' },
  { base: 'apps/admin/src/lib', deps: ['partner-fsm.ts'], test: 'partner-fsm.test.ts', label: 'Partner status FSM' },
  { base: 'packages/marketplace/src', deps: ['niche-rule-eval.ts'], test: 'suggestNiches.test.ts', label: 'Niche suggestion engine' },
  { base: 'packages/marketplace/src', deps: ['phrase-rule-eval.ts'], test: 'suggestPhrases.test.ts', label: 'Phrase suggestion engine' },
  { base: 'packages/marketplace/src', deps: ['evaluateRestrictions.ts'], test: 'evaluateRestrictions.test.ts', label: 'Restricted-category gate' },
]

const root = mkdtempSync(join(tmpdir(), 'pure-tests-'))

console.log('\nPure logic suites\n' + '─'.repeat(48))
let failed = 0

SUITES.forEach((s, i) => {
  const outDir = join(root, String(i))
  const files = [...s.deps, s.test].map((f) => `${s.base}/${f}`).join(' ')
  // tsc emits JS even when it reports type errors (no --noEmitOnError), so a
  // non-zero exit is fine — the .js we need is still written.
  try {
    execSync(
      `${TSC} ${files} --outDir ${outDir} --module commonjs --target es2020 --skipLibCheck --esModuleInterop`,
      { stdio: 'pipe' },
    )
  } catch {
    /* type errors under the bare (non-project) config are expected */
  }

  const jsPath = join(outDir, basename(s.test).replace(/\.ts$/, '.js'))
  if (!existsSync(jsPath)) {
    failed++
    console.log(`✗ ${s.label} — transpile produced no output`)
    return
  }
  try {
    const mod = require(jsPath)
    if (typeof mod.runAll !== 'function') throw new Error('no runAll() export')
    mod.runAll()
    console.log(`✓ ${s.label}`)
  } catch (err) {
    failed++
    console.log(`✗ ${s.label} — ${err.message}`)
  }
})

console.log('─'.repeat(48))
if (failed === 0) {
  console.log('✓ ALL PURE SUITES PASSED\n')
  process.exit(0)
} else {
  console.log(`✗ ${failed} suite(s) failed\n`)
  process.exit(1)
}
