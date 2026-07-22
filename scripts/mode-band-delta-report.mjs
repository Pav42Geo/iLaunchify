#!/usr/bin/env node
// =============================================================================
// MODE-BAND DELTA REPORT: what the fulfillmentMode filter changes, per template.
//
// CONTEXT (docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md §5.2). The partner
// builder authors TWO band sets per template (BULK_PRODUCTION + ON_DEMAND,
// meaning A1 of ON_DEMAND_DISAMBIGUATION), and until 2026-07-20 the PDP, the
// configure surface, and the checkout tier read consumed them UNFILTERED:
// interleaved by sortOrder (which is indexed PER MODE, so a template with both
// sets carries two rows per index). The fix filters every consumer-facing read
// to BULK_PRODUCTION (direct orders are bulk) and gives the checkout read a mode
// parameter for the C2.2 on-demand router.
//
// This report makes that change VISIBLE before it is trusted: for every template
// that carries ON_DEMAND rows, it prints the band list each surface used to see
// (interleaved) next to the list it sees now (bulk only). No price computation
// happens here on purpose: picking a band would re-implement the matcher
// (CHECK 15), and the question is which ROWS feed the matcher, not the math.
//
//   node scripts/mode-band-delta-report.mjs        # or: pnpm mode:delta
//
// Reads DATABASE_URL from env / .env.local / .env, same as make-super-admin.mjs.
// =============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

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

function loadPrismaClient() {
  const bases = [pathToFileURL(join(repoRoot, 'packages/db/package.json')).href, import.meta.url]
  for (const base of bases) {
    try {
      return createRequire(base)('@prisma/client')
    } catch {
      // try next base
    }
  }
  return null
}

const mod = loadPrismaClient()
if (!mod?.PrismaClient) {
  console.error('✗ Could not load @prisma/client — run `pnpm db:generate` first.')
  process.exit(1)
}
const prisma = new mod.PrismaClient()

const fmtBand = (t) =>
  `${t.minQty.toLocaleString()}${t.maxQty ? `-${t.maxQty.toLocaleString()}` : '+'} @ $${(t.perUnitCostCents / 100).toFixed(2)}`

try {
  const templates = await prisma.productTemplate.findMany({
    where: { pricingTiers: { some: { fulfillmentMode: 'ON_DEMAND' } } },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      pricingTiers: {
        orderBy: { sortOrder: 'asc' },
        select: { fulfillmentMode: true, sortOrder: true, minQty: true, maxQty: true, perUnitCostCents: true },
      },
    },
  })

  const total = await prisma.productTemplate.count()
  console.log(`\nTemplates with ON_DEMAND bands: ${templates.length} of ${total}\n`)

  let affectedPublished = 0
  for (const t of templates) {
    const bulk = t.pricingTiers.filter((r) => r.fulfillmentMode === 'BULK_PRODUCTION')
    const onDemand = t.pricingTiers.filter((r) => r.fulfillmentMode === 'ON_DEMAND')
    if (t.status === 'PUBLISHED') affectedPublished += 1
    console.log(`${t.status.padEnd(10)} ${t.name} (${t.slug ?? t.id})`)
    console.log(`  BEFORE (interleaved, what PDP/configure/charge saw): ${t.pricingTiers.map(fmtBand).join(' · ')}`)
    console.log(`  AFTER  (bulk surfaces):                              ${bulk.map(fmtBand).join(' · ') || 'NONE — template has ONLY on-demand bands; bulk surfaces now show ABSENCE'}`)
    console.log(`  ON_DEMAND set (C2.2 router only):                    ${onDemand.map(fmtBand).join(' · ')}\n`)
  }

  console.log(
    `${templates.length} template(s) change surface rows (${affectedPublished} PUBLISHED). ` +
      `Templates with only BULK bands are byte-identical before/after.\n`,
  )
} finally {
  await prisma.$disconnect()
}
