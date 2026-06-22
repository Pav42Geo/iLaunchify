#!/usr/bin/env node
/**
 * Grant an admin the SUPER_ADMIN sub-role (RBAC backfill).
 *
 * Since the P4.1 least-privilege flip, an admin whose `adminRole` is NULL holds
 * ZERO capabilities — every capability-gated surface (Developer & API, Refund
 * requests, compliance pages, …) is hidden in the sidebar and its page guard
 * redirects to /login?error=forbidden. Legacy admins created before the flip
 * need a one-time backfill to SUPER_ADMIN. This is that backfill, as a script.
 *
 * Idempotent: re-running on an already-SUPER_ADMIN account is a no-op (0 rows
 * changed) and never downgrades or touches any other field.
 *
 *   node scripts/make-super-admin.mjs georgiev.pavel@gmail.com   # one account
 *   node scripts/make-super-admin.mjs --all                      # every null-role admin
 *   node scripts/make-super-admin.mjs --list                     # show admins + roles, change nothing
 *
 * Reads DATABASE_URL from the environment; if unset it auto-loads .env.local
 * then .env from the repo root. Requires a generated Prisma client
 * (run `pnpm db:generate` first if you hit a client error).
 *
 * After it runs, just reload the admin app — capabilities resolve live per
 * render, so no re-login is needed.
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

// --- Resolve DATABASE_URL (no dotenv dependency) -----------------------------
if (!process.env.DATABASE_URL) {
  for (const f of ['.env.local', '.env']) {
    const p = join(repoRoot, f)
    if (!existsSync(p)) continue
    for (const raw of readFileSync(p, 'utf8').split('\n')) {
      const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
    if (process.env.DATABASE_URL) break
  }
}
if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set (and no .env.local / .env found at repo root).')
  process.exit(1)
}

// --- Args --------------------------------------------------------------------
const arg = process.argv[2]
if (!arg) {
  console.error('Usage: node scripts/make-super-admin.mjs <email> | --all | --list')
  process.exit(1)
}

// --- Load the generated Prisma client ----------------------------------------
// In a pnpm monorepo @prisma/client lives under packages/db, not the repo root,
// so resolve it relative to that package (with a root fallback).
function loadPrismaClient() {
  const bases = [
    pathToFileURL(join(repoRoot, 'packages/db/package.json')).href,
    import.meta.url,
  ]
  for (const base of bases) {
    try {
      return createRequire(base)('@prisma/client')
    } catch {
      // try next base
    }
  }
  return null
}

const prismaModule = loadPrismaClient()
if (!prismaModule?.PrismaClient) {
  console.error('✗ Could not load @prisma/client. Run `pnpm db:generate` first.')
  process.exit(1)
}
const prisma = new prismaModule.PrismaClient({ log: ['error'] })

async function listAdmins() {
  const rows = await prisma.$queryRaw`
    SELECT "email", "adminRole" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "email"
  `
  if (rows.length === 0) {
    console.log('No admin accounts found.')
    return
  }
  console.log(`\nAdmin accounts (${rows.length}):`)
  for (const r of rows) {
    console.log(`  ${r.adminRole === 'SUPER_ADMIN' ? '★' : '·'} ${r.email} — ${r.adminRole ?? '(no role → zero capabilities)'}`)
  }
  console.log('')
}

async function main() {
  if (arg === '--list') {
    await listAdmins()
    return
  }

  // The enum literal is a constant (safe to inline); only the email is bound.
  let changed
  if (arg === '--all') {
    changed = await prisma.$executeRaw`
      UPDATE "User" SET "adminRole" = 'SUPER_ADMIN'
      WHERE "role" = 'ADMIN' AND "adminRole" IS NULL
    `
    console.log(`✓ Promoted ${changed} null-role admin(s) to SUPER_ADMIN.`)
  } else {
    const email = arg
    // Guard: only act on an existing ADMIN account.
    const found = await prisma.$queryRaw`
      SELECT "role", "adminRole" FROM "User" WHERE "email" = ${email}
    `
    if (found.length === 0) {
      console.error(`✗ No user with email "${email}".`)
      process.exitCode = 1
      return
    }
    if (found[0].role !== 'ADMIN') {
      console.error(`✗ "${email}" has role ${found[0].role}, not ADMIN — refusing (admins only).`)
      process.exitCode = 1
      return
    }
    if (found[0].adminRole === 'SUPER_ADMIN') {
      console.log(`✓ "${email}" is already SUPER_ADMIN — no change.`)
      return
    }
    changed = await prisma.$executeRaw`
      UPDATE "User" SET "adminRole" = 'SUPER_ADMIN'
      WHERE "email" = ${email} AND "role" = 'ADMIN'
    `
    console.log(`✓ "${email}" is now SUPER_ADMIN (${changed} row updated).`)
  }

  await listAdmins()
  console.log('Reload the admin app — capabilities resolve live, no re-login needed.')
}

main()
  .catch((e) => {
    console.error('✗ Failed:', e?.message ?? e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
