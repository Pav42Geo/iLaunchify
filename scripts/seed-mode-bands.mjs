#!/usr/bin/env node
// =============================================================================
// SEED: ON_DEMAND price bands for testing the bulk/on-demand mix.
// docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md §5 + mode-band-delta-report.mjs.
//
// mode:delta (2026-07-20) showed 0 of 19 templates carry ON_DEMAND bands, so
// nothing exercises the mode-filtered reads or (future) C2.2 on-demand pricing.
// This seeds a realistic mix: for chosen templates, it ADDS an ON_DEMAND band
// set DERIVED from the template's own partner-authored bulk bands (never an
// invented flat price): small-batch pricing above bulk, no MOQ, short lead.
//
//   band 1:   1-99   @ bulk-band-1 price x 1.55   lead 7d
//   band 2: 100+     @ bulk-band-1 price x 1.35   lead 10d
//   (floors scale by the same factors; rounded to cents)
//
// ADDITIVE + IDEMPOTENT: never touches existing rows; skips templates that
// already have ON_DEMAND bands; skips templates with no bulk bands (nothing to
// derive from). Rows carry a `notes` marker so they are identifiable test data.
//
//   node scripts/seed-mode-bands.mjs --list          # show templates + band counts
//   node scripts/seed-mode-bands.mjs <slug> [...]    # seed specific templates
//   node scripts/seed-mode-bands.mjs --sample 3      # first N PUBLISHED with bulk bands
//
// After seeding: `pnpm mode:delta` shows the mix; the PDP/configure/checkout
// stay bulk-only (by design); the partner builder's On-demand tab shows the rows.
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
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
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

const SEED_NOTE = 'seeded: on-demand test bands (seed-mode-bands.mjs)'
const scale = (cents, f) => Math.max(1, Math.round(cents * f))

const args = process.argv.slice(2)
const listOnly = args.includes('--list')
const sampleIdx = args.indexOf('--sample')
const sampleN = sampleIdx >= 0 ? Math.max(1, parseInt(args[sampleIdx + 1] ?? '3', 10) || 3) : null
const slugs = args.filter((a, i) => !a.startsWith('--') && i !== sampleIdx + 1)

try {
  const templates = await prisma.productTemplate.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      pricingTiers: {
        orderBy: [{ fulfillmentMode: 'asc' }, { sortOrder: 'asc' }],
        select: { fulfillmentMode: true, minQty: true, perUnitCostCents: true, perUnitFloorCents: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
  const info = templates.map((t) => ({
    ...t,
    bulk: t.pricingTiers.filter((r) => r.fulfillmentMode === 'BULK_PRODUCTION'),
    onDemand: t.pricingTiers.filter((r) => r.fulfillmentMode === 'ON_DEMAND'),
  }))

  if (listOnly || (slugs.length === 0 && sampleN === null)) {
    console.log('\nstatus      bulk  ondemand  template')
    for (const t of info) {
      console.log(`${t.status.padEnd(10)} ${String(t.bulk.length).padStart(5)} ${String(t.onDemand.length).padStart(9)}  ${t.name} (${t.slug ?? t.id})`)
    }
    console.log('\nSeed with:  node scripts/seed-mode-bands.mjs <slug> [...]   or   --sample 3\n')
    process.exit(0)
  }

  const targets =
    sampleN !== null
      ? info.filter((t) => t.status === 'PUBLISHED' && t.bulk.length > 0 && t.onDemand.length === 0).slice(0, sampleN)
      : info.filter((t) => slugs.includes(t.slug ?? '') || slugs.includes(t.id))

  if (targets.length === 0) {
    console.error('✗ No matching templates (check --list; sample mode needs PUBLISHED templates with bulk bands).')
    process.exit(1)
  }

  let seeded = 0
  for (const t of targets) {
    if (t.onDemand.length > 0) {
      console.log(`- skip ${t.name}: already has ${t.onDemand.length} ON_DEMAND band(s)`)
      continue
    }
    if (t.bulk.length === 0) {
      console.log(`- skip ${t.name}: no bulk bands to derive from (author bulk pricing first)`)
      continue
    }
    // Derive from the template's own smallest-qty (most expensive) bulk band.
    const base = [...t.bulk].sort((a, b) => a.minQty - b.minQty)[0]
    const rows = [
      { sortOrder: 0, minQty: 1, maxQty: 99, f: 1.55, leadTimeDays: 7 },
      { sortOrder: 1, minQty: 100, maxQty: null, f: 1.35, leadTimeDays: 10 },
    ].map((r) => ({
      productTemplateId: t.id,
      fulfillmentMode: 'ON_DEMAND',
      sortOrder: r.sortOrder,
      minQty: r.minQty,
      maxQty: r.maxQty,
      perUnitCostCents: scale(base.perUnitCostCents, r.f),
      perUnitFloorCents: scale(base.perUnitFloorCents, r.f),
      leadTimeDays: r.leadTimeDays,
      notes: SEED_NOTE,
    }))
    await prisma.productTemplatePricingTier.createMany({ data: rows })
    seeded += 1
    console.log(
      `✓ ${t.name}: ON_DEMAND 1-99 @ $${(rows[0].perUnitCostCents / 100).toFixed(2)} · 100+ @ $${(rows[1].perUnitCostCents / 100).toFixed(2)} (from bulk $${(base.perUnitCostCents / 100).toFixed(2)})`,
    )
  }
  console.log(`\n${seeded} template(s) seeded. Verify: pnpm mode:delta\n`)
} finally {
  await prisma.$disconnect()
}
