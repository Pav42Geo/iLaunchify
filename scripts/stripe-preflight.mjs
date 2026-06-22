#!/usr/bin/env node
/**
 * Stripe test-mode preflight — verifies the payment env is configured for a SAFE
 * test-mode verification pass, WITHOUT calling Stripe or touching money. Run on
 * the machine that will do the verification (it reads that machine's env):
 *
 *   node scripts/stripe-preflight.mjs            # reads process.env
 *   node scripts/stripe-preflight.mjs .env.local # also loads a dotenv file
 *
 * Hard-fails if STRIPE_SECRET_KEY is a LIVE key (sk_live_…) — you must never run
 * the test-mode runbook against live money. See docs/STRIPE_TESTMODE_VERIFICATION.md.
 */

import { readFileSync, existsSync } from 'node:fs'

// Optional dotenv-style file (no dependency): KEY=VALUE lines into a map.
const env = { ...process.env }
const dotenvPath = process.argv[2]
if (dotenvPath && existsSync(dotenvPath)) {
  for (const line of readFileSync(dotenvPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const mask = (v) => (v ? `${v.slice(0, 8)}…(${v.length} chars)` : '(unset)')
let blocking = 0
const line = (ok, label, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) blocking++
}

console.log('\nStripe test-mode preflight\n' + '─'.repeat(50))

// 1. Secret key present + is a TEST key.
const sk = env.STRIPE_SECRET_KEY
if (!sk) {
  line(false, 'STRIPE_SECRET_KEY', 'unset')
} else if (sk.startsWith('sk_live_') || sk.startsWith('rk_live_')) {
  line(false, 'STRIPE_SECRET_KEY', '⚠️  LIVE key — refusing. Use a sk_test_ key for the runbook.')
} else if (sk.startsWith('sk_test_') || sk.startsWith('rk_test_')) {
  line(true, 'STRIPE_SECRET_KEY', `test key ${mask(sk)}`)
} else {
  line(false, 'STRIPE_SECRET_KEY', `unrecognized prefix ${mask(sk)}`)
}

// 2. Webhook signing secret present.
const whsec = env.STRIPE_WEBHOOK_SECRET
line(!!whsec && whsec.startsWith('whsec_'), 'STRIPE_WEBHOOK_SECRET', whsec ? mask(whsec) : 'unset — webhook signature verification will fail')

// 3. Refund flag — informational. SHOULD be off until the refund flow is verified.
const refunds = env.STRIPE_REFUNDS_ENABLED === 'true'
console.log(`${refunds ? '⚠' : '✓'} STRIPE_REFUNDS_ENABLED = ${refunds ? 'true (LIVE refunds will execute)' : 'false/unset (refunds are dry-run — correct for pre-verification)'}`)

// 4. Reminder of the moving pieces (not env, but worth confirming on the box).
console.log('─'.repeat(50))
console.log('Reminders (not env-checkable here):')
console.log('  • `stripe login` done + `stripe listen --forward-to localhost:3000/api/webhooks/stripe`')
console.log('  • DB reachable (the webhook handlers write Charge/Order/Refund rows)')
console.log('  • Both webhook routes exist: apps/creator + apps/partner /api/webhooks/stripe')
console.log('─'.repeat(50))

if (blocking > 0) {
  console.log(`✗ ${blocking} blocking issue(s) — fix before running the test-mode runbook.\n`)
  process.exit(1)
}
console.log('✓ Env preflight passed — safe to run docs/STRIPE_TESTMODE_VERIFICATION.md.\n')
process.exit(0)
