#!/usr/bin/env node
// =============================================================================
// Platform invariant guard — the deterministic floor of the "monitor every
// build" system (scaffolded 2026-07-06).
// =============================================================================
//
// Companion to scripts/check-no-raw-tailwind-colors.mjs. That script guards the
// design palette; this one guards the *architecture* — the invariants that
// currently live only in CLAUDE.md + .claude/memory and are enforced by human
// vigilance. Every rule here is something a reviewer would otherwise have to
// remember. Encoding them makes new builds wire themselves in correctly instead
// of drifting.
//
// Philosophy: don't ask an agent to check what a script can PROVE. This catches
// the mechanical invariants cheaply and always. The `connection-review`
// subagent handles the judgment calls (natural wiring, input/output contracts,
// "what did this build forget") that a linter can't.
//
// Two severities:
//   • ERROR — a hard, zero-false-positive invariant. Fails the build (exit 1).
//   • WARN  — a high-signal heuristic that MIGHT be a legitimate exception.
//             Reported, never blocks — unless you pass --strict (then warns
//             fail too, for a clean-tree gate once the baseline is burned down).
//
// Run:  pnpm check:invariants           (errors fail, warns report)
//       pnpm check:invariants --strict  (warns fail too)
//
// Each check is a small function in CHECKS[]. Add a new invariant = add one
// entry. This is meant to grow as the platform grows — it is the living
// enforcement half of the flow-manifest idea.
// =============================================================================

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const STRICT = process.argv.includes('--strict')
const PRUNE = new Set(['node_modules', '.next', 'dist', '.turbo', '.git', 'FOD-reference'])

// ── file walker (mirrors check-no-raw-tailwind-colors.mjs) ───────────────────
function walk(dir, out, exts) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (PRUNE.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out, exts)
    else if (exts.some((e) => p.endsWith(e))) out.push(p)
  }
}
function collect(roots, exts) {
  const files = []
  for (const r of roots) walk(r, files, exts)
  return files
}
const read = (f) => readFileSync(f, 'utf8')
const APPS = ['apps/admin', 'apps/creator', 'apps/partner', 'apps/marketing']
const CODE = [...APPS.map((a) => `${a}/src`), 'packages']

// =============================================================================
// CHECK 1 — CockroachDB rejects @db.Text  (ERROR)
// prisma generate fails P1012. STRING is already unbounded; use @db.String(N)
// for caps. Memory: ilaunchify-cockroachdb-no-db-text.
// =============================================================================
function checkNoDbText() {
  const hits = []
  for (const f of collect(['packages/db/prisma'], ['.prisma'])) {
    read(f).split('\n').forEach((line, i) => {
      const code = line.split('//')[0] // ignore comments (they often say "no @db.Text")
      if (/@db\.Text\b/.test(code)) hits.push(`${f}:${i + 1}  @db.Text — use bare String or @db.String(N)`)
    })
  }
  return { name: 'no-@db.Text (CockroachDB P1012)', level: 'error', hits }
}

// =============================================================================
// CHECK 2 — cross-app <Link> to a foreign app's route  (WARN)
// `<Link href="/pricing">` from inside creator/partner/admin 404s — those are
// marketing-owned surfaces. Use marketingUrl()/creatorUrl()/partnerUrl() + a
// plain <a>. We only flag prefixes that are UNAMBIGUOUSLY marketing-owned per
// CLAUDE.md to keep false positives at zero. Memory:
// ilaunchify-cross-app-links-must-use-helper.
// =============================================================================
const MARKETING_ONLY_PREFIXES = ['/pricing', '/business', '/launch/']
function checkCrossAppLink() {
  const hits = []
  const roots = ['apps/creator/src', 'apps/partner/src', 'apps/admin/src']
  for (const f of collect(roots, ['.tsx'])) {
    const src = read(f)
    // Only files that actually import next/link can render a broken <Link>.
    if (!/from ['"]next\/link['"]/.test(src)) continue
    src.split('\n').forEach((line, i) => {
      const m = line.match(/href=["'](\/[^"']*)["']/)
      if (m && MARKETING_ONLY_PREFIXES.some((p) => m[1].startsWith(p))) {
        hits.push(`${f}:${i + 1}  <Link href="${m[1]}"> is cross-app — use marketingUrl() + <a>`)
      }
    })
  }
  return { name: 'cross-app <Link> → foreign route', level: 'warn', hits }
}

// =============================================================================
// CHECK 3 — server action mutates without an audit write  (WARN)
// CLAUDE.md: "Every mutating action writes an AuditLog row via packages/audit."
// Heuristic: a file that declares 'use server' AND runs a prisma write but never
// imports @ilaunchify/audit is suspicious. Warn (some actions legitimately
// delegate the write to a service/FSM that audits internally). Memory:
// ilaunchify-security-architecture-locked.
// =============================================================================
const PRISMA_WRITE = /\bprisma\.\w+\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\b/
function checkMutationHasAudit() {
  const hits = []
  for (const f of collect(APPS.map((a) => `${a}/src`), ['.ts', '.tsx'])) {
    const src = read(f)
    if (!/['"]use server['"]/.test(src)) continue
    if (!PRISMA_WRITE.test(src)) continue
    const audits = /@ilaunchify\/audit|logAudit|logAuditAs|logSystemAudit/.test(src)
    if (!audits) hits.push(`${f}  'use server' + prisma write, no @ilaunchify/audit import`)
  }
  return { name: "server-action mutation writes AuditLog", level: 'warn', hits }
}

// =============================================================================
// CHECK 4 — FSM-governed status changed by a raw prisma.update  (WARN)
// CLAUDE.md: "Every product/partner state change goes through an FSM helper,
// never inline prisma.update." The FSMs live in packages/orders (order-fsm,
// dispatch-fsm) + packages/academy/fsm + packages/support. Flag a direct
// prisma.<model>.update whose payload sets `status:` OUTSIDE those FSM homes.
// Memory: ilaunchify-partner-onboarding (activation FSM), routing-owner-pinned.
// =============================================================================
const FSM_HOMES = ['packages/orders/', 'packages/academy/', 'packages/support/', 'packages/db/prisma/seed']
const FSM_MODELS = ['order', 'dispatch', 'productTemplate', 'partner', 'partnerService', 'ticket']
function checkFsmBypass() {
  const hits = []
  const rx = new RegExp(`\\bprisma\\.(${FSM_MODELS.join('|')})\\.update(Many)?\\s*\\(`, 'g')
  for (const f of collect(CODE, ['.ts', '.tsx'])) {
    if (FSM_HOMES.some((h) => f.includes(h))) continue
    if (/\.test\.ts$/.test(f)) continue
    const lines = read(f).split('\n')
    lines.forEach((line, i) => {
      if (!rx.test(line)) return
      // Look at the next ~6 lines for a status: assignment in the payload.
      const window = lines.slice(i, i + 6).join('\n')
      if (/\bstatus\s*:/.test(window)) {
        hits.push(`${f}:${i + 1}  raw prisma.update sets status — route through an FSM helper`)
      }
    })
  }
  return { name: 'FSM-governed status via raw prisma.update', level: 'warn', hits }
}

// =============================================================================
// CHECK 5 — schema pushed but Prisma client not regenerated  (WARN, local only)
// The 3-layer stale-client trap (memory, node_modules, .next). If schema.prisma
// is newer than the generated client, dev will hit "Property X does not exist".
// Local-only signal; skipped in CI where the client is always freshly generated.
// Memory: ilaunchify-dev-prisma-restart.
// =============================================================================
function checkPrismaClientFresh() {
  if (process.env.CI) return { name: 'prisma client freshness (skipped in CI)', level: 'warn', hits: [] }
  const schema = 'packages/db/prisma/schema.prisma'
  const client = 'node_modules/.prisma/client/index.js'
  const hits = []
  if (existsSync(schema) && existsSync(client)) {
    if (statSync(schema).mtimeMs > statSync(client).mtimeMs) {
      hits.push('schema.prisma is newer than the generated client — run: pnpm db:generate && rm -rf apps/*/.next')
    }
  }
  return { name: 'Prisma client freshness (stale-client trap)', level: 'warn', hits }
}

// =============================================================================
const CHECKS = [
  checkNoDbText,
  checkCrossAppLink,
  checkMutationHasAudit,
  checkFsmBypass,
  checkPrismaClientFresh,
]

let errorCount = 0
let warnCount = 0
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', reset: '\x1b[0m' }

console.log(`\n${C.dim}iLaunchify platform invariants${STRICT ? ' (--strict)' : ''}${C.reset}\n`)

for (const check of CHECKS) {
  const { name, level, hits } = check()
  if (hits.length === 0) {
    console.log(`${C.green}✓${C.reset} ${name}`)
    continue
  }
  const isError = level === 'error' || STRICT
  const mark = isError ? `${C.red}✖${C.reset}` : `${C.yellow}⚠${C.reset}`
  console.log(`${mark} ${name}  ${C.dim}(${hits.length})${C.reset}`)
  for (const h of hits) console.log(`    ${h}`)
  if (level === 'error') errorCount += hits.length
  else warnCount += hits.length
}

console.log('')
if (errorCount > 0 || (STRICT && warnCount > 0)) {
  console.log(`${C.red}Invariant check failed${C.reset} — ${errorCount} error(s), ${warnCount} warning(s).\n`)
  process.exit(1)
}
if (warnCount > 0) {
  console.log(`${C.yellow}${warnCount} warning(s)${C.reset} — review, then run with --strict once the baseline is clean.\n`)
} else {
  console.log(`${C.green}All invariants hold.${C.reset}\n`)
}
process.exit(0)
