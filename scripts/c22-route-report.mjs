#!/usr/bin/env node
// =============================================================================
// C22 ROUTE REPORT: dry-run of the C2.2 READY -> production router.
//
// CONTEXT (docs/C22_BUILD_BRIEF_2026-07-22.md step 5). Before trusting the
// auto-billing router on real data, see what it WOULD do: for every routable
// ChannelOrder (READY past manual-confirm + auto-recoverable ON_HOLD) this
// prints the plan branch per line (ON_DEMAND production vs BULK stock), the
// velocity-band selection input (trailing-30d units + order units), the
// ON_DEMAND band row that selection lands on, and the resulting charge
// (goods + tier fee), next to any gate that would park the order.
//
// NO price computation is duplicated here beyond the shared kernel rule
// (last eligible band by minQty over bandUnits; below-first-band falls back to
// band 1), and the fee uses the LIVE FeeRule rows, so the printout should equal
// what routeReadyChannelOrder charges to the cent. If they ever differ, the
// router is wrong, not this report.
//
//   node scripts/c22-route-report.mjs        # or: pnpm c22:report
//
// READ-ONLY: no writes, no Stripe calls, no claims.
// Reads DATABASE_URL from env / .env.local / .env, same as mode:delta.
// =============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
  console.error('DATABASE_URL is not set (env / .env.local / .env).')
  process.exit(1)
}

const require = createRequire(join(repoRoot, 'packages/db/package.json'))
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const cents = (n) => `$${(n / 100).toFixed(2)}`
const DAY = 24 * 60 * 60 * 1000

// The shared band rule (packages/plans pricing-band.ts): last eligible band in
// input order (sortOrder), below-every-band falls back to the FIRST band.
function pickBand(bands, units) {
  if (bands.length === 0) return null
  let found = null
  for (let i = 0; i < bands.length; i++) {
    const min = bands[i].minQty
    if (min !== null && min !== undefined && min <= units) found = i
  }
  return bands[found ?? 0]
}

async function feeBpsForTier(tier) {
  // Same resolution as @ilaunchify/plans resolveCreatorFeeBps: the tier's plan
  // (SubscriptionPlan.code creator_<tier>) -> FeeRule(production_order_subtotal).
  // Falls back to the Maker 15% (CREATOR_FEE_FALLBACK_BPS) exactly as the SSOT.
  try {
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { code: `creator_${tier}` },
      select: { id: true },
    })
    const rule = plan
      ? await prisma.feeRule.findFirst({
          where: { planId: plan.id, triggerEvent: 'production_order_subtotal', active: true },
          select: { ratePercent: true, flatCents: true, minCents: true, maxCents: true },
        })
      : null
    if (rule?.ratePercent != null) {
      return { feeBps: Math.round(Number(rule.ratePercent) * 100), bounds: rule, source: 'TIER_RULE' }
    }
  } catch {
    /* fall through */
  }
  return { feeBps: 1500, bounds: null, source: 'FALLBACK' }
}

function creatorFee(baseCents, feeBps, bounds) {
  // Mirrors creatorFeeCents (packages/plans creator-fee-math): rate + flat,
  // clamped by min/max.
  let fee = Math.round((baseCents * feeBps) / 10_000) + (bounds?.flatCents ?? 0)
  if (bounds?.minCents != null) fee = Math.max(fee, bounds.minCents)
  if (bounds?.maxCents != null) fee = Math.min(fee, bounds.maxCents)
  return fee
}

const orders = await prisma.channelOrder.findMany({
  where: {
    productionOrderId: null,
    manualConfirmRequired: false,
    status: { in: ['READY', 'ON_HOLD'] },
  },
  orderBy: { placedAt: 'asc' },
  include: {
    lines: true,
    connection: { select: { creatorUserId: true, channel: { select: { code: true } } } },
  },
})

console.log(`\nC2.2 route report - ${orders.length} routable channel order(s)\n${'─'.repeat(72)}`)

const now = Date.now()
for (const o of orders) {
  console.log(`\n${o.connection.channel.code} · ${o.externalOrderId} · ${o.status}${o.statusReason ? ` (${o.statusReason})` : ''}`)
  const vlinkIds = o.lines.map((l) => l.channelVariantLinkId).filter(Boolean)
  const vlinks = vlinkIds.length
    ? await prisma.channelVariantLink.findMany({
        where: { id: { in: vlinkIds } },
        select: { id: true, productId: true, flavorPresetId: true, channelProductLink: { select: { mode: true } } },
      })
    : []
  const byId = new Map(vlinks.map((v) => [v.id, v]))

  // Aggregate per product per mode (mirrors planChannelOrderRouting).
  const jobs = new Map()
  let unmapped = 0
  for (const l of o.lines) {
    const link = l.channelVariantLinkId ? byId.get(l.channelVariantLinkId) : null
    if (!link) {
      unmapped += 1
      continue
    }
    const mode = link.channelProductLink?.mode === 'BULK' ? 'BULK' : 'ON_DEMAND'
    const key = `${link.productId}:${mode}`
    const job = jobs.get(key) ?? { productId: link.productId, mode, units: 0, flavors: new Map() }
    job.units += l.quantity
    // Per-flavor split (mirrors planChannelOrderRouting): feeds the priceDelta fold.
    const fid = link.flavorPresetId ?? null
    job.flavors.set(fid, (job.flavors.get(fid) ?? 0) + l.quantity)
    jobs.set(key, job)
  }
  if (unmapped > 0) {
    console.log(`  would park NEEDS_ATTENTION: ${unmapped} unmapped line(s)`)
    continue
  }

  for (const job of jobs.values()) {
    const product = await prisma.product.findUnique({
      where: { id: job.productId },
      select: {
        name: true,
        productTemplateId: true,
        brand: { select: { creatorProfile: { select: { userId: true } } } },
      },
    })
    if (!product) {
      console.log(`  ${job.productId}: product missing -> NEEDS_ATTENTION`)
      continue
    }
    if (job.mode === 'BULK') {
      console.log(`  ${product.name} x${job.units} [BULK]: ships from reserved stock, no production order, no charge`)
      continue
    }

    // Trailing-30d velocity for (creator, product), same read as the router.
    const creatorUserId = o.connection.creatorUserId
    const productLinks = await prisma.channelVariantLink.findMany({
      where: { productId: job.productId },
      select: { id: true },
    })
    const trailingLines = productLinks.length
      ? await prisma.channelOrderLine.findMany({
          where: {
            channelVariantLinkId: { in: productLinks.map((x) => x.id) },
            channelOrder: {
              // Exclude THIS order (router parity): bandUnits adds it separately.
              id: { not: o.id },
              placedAt: { gte: new Date(now - 30 * DAY) },
              status: { not: 'CANCELLED' },
              connection: { creatorUserId },
            },
          },
          select: { quantity: true },
        })
      : []
    const trailing = trailingLines.reduce((s, r) => s + r.quantity, 0)
    const bandUnits = trailing + job.units

    const tiers = product.productTemplateId
      ? await prisma.productTemplatePricingTier.findMany({
          where: { productTemplateId: product.productTemplateId, fulfillmentMode: 'ON_DEMAND' },
          orderBy: { sortOrder: 'asc' },
          select: { minQty: true, perUnitCostCents: true },
        })
      : []
    if (tiers.length === 0) {
      console.log(`  ${product.name} x${job.units} [ON_DEMAND]: NO on-demand bands -> would park NEEDS_ATTENTION (never borrows the bulk curve)`)
      continue
    }
    const band = pickBand(tiers, bandUnits)

    // Flavor priceDelta fold (router parity, e2e finding 2026-07-22): premium
    // flavors ride on top of the band goods exactly as route-core folds them.
    const flavorIds = [...job.flavors.keys()].filter(Boolean)
    const presets = flavorIds.length
      ? await prisma.flavorPreset.findMany({
          where: { id: { in: flavorIds }, status: 'ACTIVE' },
          select: { id: true, priceDeltaCents: true },
        })
      : []
    const deltaById = new Map(presets.map((p) => [p.id, p.priceDeltaCents ?? 0]))
    let flavorDeltaCents = 0
    for (const [fid, units] of job.flavors) {
      if (fid) flavorDeltaCents += (deltaById.get(fid) ?? 0) * units
    }

    const goods = band.perUnitCostCents * job.units + flavorDeltaCents

    const tierRow = await prisma.creatorProfile.findUnique({
      where: { userId: creatorUserId },
      select: { subscriptionTier: true },
    })
    const tier = String(tierRow?.subscriptionTier ?? 'maker').toLowerCase()
    const fee = await feeBpsForTier(tier)
    const feeCents = creatorFee(goods, fee.feeBps, fee.bounds)
    console.log(
      `  ${product.name} x${job.units} [ON_DEMAND]: trailing30d=${trailing} bandUnits=${bandUnits} -> band minQty=${band.minQty} @ ${cents(band.perUnitCostCents)}/unit${flavorDeltaCents ? ` + flavor delta ${cents(flavorDeltaCents)}` : ''}`,
    )
    console.log(
      `    goods ${cents(goods)} + fee ${cents(feeCents)} (${fee.feeBps} bps, tier ${tier}, ${fee.source}) = WOULD CHARGE ${cents(goods + feeCents)}`,
    )
  }
}

console.log(`\n${'─'.repeat(72)}\nRead-only report. The router itself: creator inbox "Run router" / "Route now",\nor POST /api/cron/channel-router (hourly).\n`)
await prisma.$disconnect()
