#!/usr/bin/env node
/**
 * Run the pure, dependency-free logic suites that ship as `runAll()` aggregators
 * (the @ilaunchify/auth convention — no vitest import, so they type-check under
 * `tsc --noEmit` but were never EXECUTED). This runner transpiles each suite +
 * its pure sibling to a temp dir with the repo's local tsc and runs `runAll()`,
 * so the assertions actually fire. Zero install required:
 *
 *   node scripts/run-pure-tests.mjs
 *
 * Add a suite by listing its [pureModule, testModule, label] below.
 */

import { execSync } from 'node:child_process'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const SRC = 'packages/auth/src'
const TSC = 'node_modules/.bin/tsc'

// [pure source module, test module, human label]
const SUITES = [
  ['capability-rules.ts', 'capability-rules.test.ts', 'RBAC capability matrix'],
  ['admin-invite.ts', 'admin-invite.test.ts', 'Admin-invite acceptance'],
  ['ownership-rules.ts', 'ownership.test.ts', 'Ownership guards'],
]

const out = mkdtempSync(join(tmpdir(), 'pure-tests-'))
const files = [...new Set(SUITES.flatMap(([pure, test]) => [pure, test]))]
  .map((f) => `${SRC}/${f}`)
  .join(' ')

// tsc emits JS even when it reports type errors (we don't pass --noEmitOnError),
// so a non-zero exit here is fine — the .js we need is still written.
try {
  execSync(`${TSC} ${files} --outDir ${out} --module commonjs --target es2020 --skipLibCheck --esModuleInterop`, {
    stdio: 'pipe',
  })
} catch {
  /* type errors under the bare (non-project) config are expected; JS is emitted */
}

console.log('\nPure logic suites\n' + '─'.repeat(48))
let failed = 0
for (const [, test, label] of SUITES) {
  const jsPath = join(out, test.replace(/\.ts$/, '.js'))
  if (!existsSync(jsPath)) {
    failed++
    console.log(`✗ ${label} — transpile produced no output`)
    continue
  }
  try {
    const mod = require(jsPath)
    if (typeof mod.runAll !== 'function') throw new Error('no runAll() export')
    mod.runAll()
    console.log(`✓ ${label}`)
  } catch (err) {
    failed++
    console.log(`✗ ${label} — ${err.message}`)
  }
}
console.log('─'.repeat(48))
if (failed === 0) {
  console.log('✓ ALL PURE SUITES PASSED\n')
  process.exit(0)
} else {
  console.log(`✗ ${failed} suite(s) failed\n`)
  process.exit(1)
}
