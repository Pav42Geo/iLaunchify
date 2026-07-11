// Characterization test for the shared security headers (H4 — packages/security
// had 0 tests). docs/SECURITY_ARCHITECTURE.md Tier 0.2 is LOCKED, so this pins the
// posture: any accidental weakening (dropping HSTS, flipping X-Frame, opening
// framing, or enforcing CSP before the report-only bake) fails the test.
//
// Standalone on purpose: headers.js is plain CommonJS with zero deps.
//   Run:  node packages/security/headers.test.mjs
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { securityHeaders } = require('./headers.js')

let pass = 0
const t = (name, fn) => {
  try { fn(); pass++ } catch (e) { console.error(`✗ ${name} — ${e.message}`); process.exitCode = 1 }
}
const headersOf = (opts) => securityHeaders(opts)[0].headers
const get = (hs, key) => hs.find((h) => h.key === key)?.value

t('a single rule scoped to every path', () => {
  const rules = securityHeaders()
  assert.equal(rules.length, 1)
  assert.equal(rules[0].source, '/:path*')
})

t('CSP ships REPORT-ONLY by default (bake before enforce)', () => {
  assert.ok(get(headersOf(), 'Content-Security-Policy-Report-Only'), 'report-only header present')
  assert.equal(get(headersOf(), 'Content-Security-Policy'), undefined)
})

t('enforceCsp flips to the enforcing header name', () => {
  assert.ok(get(headersOf({ enforceCsp: true }), 'Content-Security-Policy'))
  assert.equal(get(headersOf({ enforceCsp: true }), 'Content-Security-Policy-Report-Only'), undefined)
})

t('HSTS present: 2-year max-age + subdomains', () => {
  const v = get(headersOf(), 'Strict-Transport-Security')
  assert.match(v, /max-age=63072000/)
  assert.match(v, /includeSubDomains/)
})

t('clickjacking + MIME-sniffing locked down', () => {
  assert.equal(get(headersOf(), 'X-Frame-Options'), 'DENY')
  assert.equal(get(headersOf(), 'X-Content-Type-Options'), 'nosniff')
  assert.equal(get(headersOf(), 'Referrer-Policy'), 'strict-origin-when-cross-origin')
})

t('CSP denies framing and pins base/form to self', () => {
  const csp = get(headersOf(), 'Content-Security-Policy-Report-Only')
  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /base-uri 'self'/)
  assert.match(csp, /form-action 'self'/)
})

t('CSP permits Stripe (payments) in script-src and frame-src', () => {
  const csp = get(headersOf(), 'Content-Security-Policy-Report-Only')
  assert.match(csp, /script-src[^;]*https:\/\/js\.stripe\.com/)
  assert.match(csp, /frame-src[^;]*https:\/\/js\.stripe\.com/)
})

t('Permissions-Policy disables camera/mic/geo, scopes payment to Stripe', () => {
  const v = get(headersOf(), 'Permissions-Policy')
  assert.match(v, /camera=\(\)/)
  assert.match(v, /microphone=\(\)/)
  assert.match(v, /geolocation=\(\)/)
  assert.match(v, /payment=\(self "https:\/\/js\.stripe\.com"\)/)
})

if (process.exitCode) console.error(`\nsecurity headers: FAILED`)
else console.log(`✓ security headers: ${pass} checks passed`)
