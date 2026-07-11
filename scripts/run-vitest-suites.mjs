#!/usr/bin/env node
/**
 * Execute the PURE vitest suites in money-path packages WITHOUT a working vitest
 * install (the sandbox is missing rollup's native binary). These suites use only
 * `describe / it / expect` with no mocks/async/prisma, so we transpile them with
 * the repo's tsc and run them against a minimal `expect` shim. Zero install:
 *
 *   node scripts/run-vitest-suites.mjs
 *
 * This is a CI/local convenience for the sandbox; on a real machine
 * `pnpm --filter @ilaunchify/orders test` runs the same files under real vitest.
 */

import { execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const TSC = 'node_modules/.bin/tsc'
const PKGS = ['packages/marketplace/src', 'packages/orders/src', 'packages/payments/src', 'packages/nutrition/src', 'packages/ui/src/lib', 'packages/shipping/src', 'packages/risk/src', 'packages/channels/src', 'packages/packaging-3d/src', 'packages/plans/src', 'packages/audit/src', 'packages/imagegen/src']

// ── minimal vitest shim ───────────────────────────────────────────────────────
let pass = 0
let fail = 0
const failures = []
let suite = ''

function deepEqual(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => deepEqual(a[k], b[k]))
}

function makeExpect(actual, negate = false) {
  const check = (ok, msg) => {
    if (ok === negate) throw new Error(`${msg}${negate ? ' (negated)' : ''}`)
  }
  const api = {
    toBe: (e) => check(Object.is(actual, e), `expected ${fmt(actual)} to be ${fmt(e)}`),
    toEqual: (e) => check(deepEqual(actual, e), `expected ${fmt(actual)} to equal ${fmt(e)}`),
    toStrictEqual: (e) => check(deepEqual(actual, e), `expected ${fmt(actual)} to strictly equal ${fmt(e)}`),
    toBeCloseTo: (e, d = 2) => check(Math.abs(actual - e) < 0.5 * 10 ** -d, `expected ${actual} ≈ ${e}`),
    toBeGreaterThan: (e) => check(actual > e, `expected ${actual} > ${e}`),
    toBeGreaterThanOrEqual: (e) => check(actual >= e, `expected ${actual} >= ${e}`),
    toBeLessThan: (e) => check(actual < e, `expected ${actual} < ${e}`),
    toBeLessThanOrEqual: (e) => check(actual <= e, `expected ${actual} <= ${e}`),
    toBeNull: () => check(actual === null, `expected ${fmt(actual)} to be null`),
    toBeTruthy: () => check(!!actual, `expected ${fmt(actual)} to be truthy`),
    toBeFalsy: () => check(!actual, `expected ${fmt(actual)} to be falsy`),
    toBeDefined: () => check(actual !== undefined, `expected defined`),
    toBeUndefined: () => check(actual === undefined, `expected undefined`),
    toContain: (e) => check(Array.isArray(actual) ? actual.includes(e) : String(actual).includes(e), `expected ${fmt(actual)} to contain ${fmt(e)}`),
    toMatch: (e) => check(e instanceof RegExp ? e.test(String(actual)) : String(actual).includes(String(e)), `expected ${fmt(actual)} to match ${fmt(e)}`),
    toHaveLength: (n) => check(actual != null && actual.length === n, `expected length ${actual?.length} to be ${n}`),
    toMatchObject: (e) => check(Object.keys(e).every((k) => deepEqual(actual?.[k], e[k])), `expected ${fmt(actual)} to match ${fmt(e)}`),
    toHaveProperty: (path, ...rest) => {
      const parts = String(path).split('.')
      let cur = actual
      let has = true
      for (const p of parts) {
        if (cur != null && Object.prototype.hasOwnProperty.call(Object(cur), p)) cur = cur[p]
        else { has = false; break }
      }
      const ok = rest.length ? has && deepEqual(cur, rest[0]) : has
      check(ok, `expected ${fmt(actual)} to have property "${path}"${rest.length ? ` = ${fmt(rest[0])}` : ''}`)
    },
    toThrow: (expected) => {
      let threw = false
      let err
      try { actual() } catch (e) { threw = true; err = e }
      if (expected == null) return check(threw, 'expected function to throw')
      const m = err?.message ?? ''
      const ok = threw && (expected instanceof RegExp ? expected.test(m) : m.includes(String(expected)))
      check(ok, `expected throw matching ${fmt(expected)}, got ${threw ? fmt(m) : 'no throw'}`)
    },
  }
  Object.defineProperty(api, 'not', { get: () => makeExpect(actual, !negate) })
  return api
}
function fmt(v) {
  try { return typeof v === 'string' ? `"${v}"` : JSON.stringify(v) } catch { return String(v) }
}
function expect(actual) { return makeExpect(actual) }
function describe(name, fn) { const prev = suite; suite = suite ? `${suite} › ${name}` : name; fn(); suite = prev }
function it(name, fn) {
  try { fn(); pass++ } catch (e) { fail++; failures.push(`${suite} › ${name} — ${e.message}`) }
}

// ── transpile + run ───────────────────────────────────────────────────────────
const root = mkdtempSync(join(tmpdir(), 'vitest-pure-'))
// expose the shim's functions to required test modules via a global bridge.
globalThis.__shim = { describe, it, test: it, expect }

for (const pkgSrc of PKGS) {
  const outDir = join(root, pkgSrc.replace(/[\\/]/g, '_'))
  // transpile the whole src dir so any sibling import resolves; we only require
  // the *.test.js files, whose imports are pure (verified: no prisma in tests).
  try {
    execSync(`${TSC} ${pkgSrc}/*.ts --outDir ${outDir} --module commonjs --target es2020 --skipLibCheck --esModuleInterop`, { stdio: 'pipe' })
  } catch { /* type errors don't block emit */ }

  // drop a fake 'vitest' module that forwards to our global shim.
  const vmDir = join(outDir, 'node_modules', 'vitest')
  mkdirSync(vmDir, { recursive: true })
  writeFileSync(join(vmDir, 'package.json'), JSON.stringify({ name: 'vitest', main: 'index.js' }))
  writeFileSync(join(vmDir, 'index.js'), 'module.exports = globalThis.__shim;')

  // Stub the runtime @ilaunchify/* deps a tested source module may import at the
  // top level (e.g. auto-cancel.ts imports prisma). The PURE functions under
  // test never touch them at call time, so a no-op Proxy lets the module load.
  for (const dep of ['db', 'audit', 'notifications', 'payments', 'storage', 'risk']) {
    const d = join(outDir, 'node_modules', '@ilaunchify', dep)
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'package.json'), JSON.stringify({ name: `@ilaunchify/${dep}`, main: 'index.js' }))
    writeFileSync(join(d, 'index.js'), 'module.exports = new Proxy({}, { get: () => undefined });')
  }

  // RECURSIVE (2026-07-10 fix): when a tested dir imports a sibling dir (e.g.
  // ui/lib → ui/tokens), tsc infers a rootDir ABOVE the glob and nests the
  // output — a top-level readdir then finds no *.test.js and the whole
  // package's tests silently skip. Walk the tree instead.
  const testFiles = readdirSync(outDir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.test.js') && !f.includes('node_modules'))
  for (const f of testFiles) {
    suite = `${pkgSrc.split('/')[1]}/${f.replace(/\\/g, '/').replace('.test.js', '')}`
    try { require(join(outDir, f)) } catch (e) { fail++; failures.push(`${suite} — load error: ${e.message}`) }
  }
}

console.log('\nMoney-path vitest suites (pure, via shim)\n' + '─'.repeat(52))
for (const f of failures) console.log(`✗ ${f}`)
console.log('─'.repeat(52))
console.log(`${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
