// DSLD mirror import (Phase 1). Fetches the NIH DSLD v9 API for a curated set of
// common supplement ingredient terms, extracts distinct dietary-ingredient
// identities via the shared parser, and mirrors them into the Ingredient Library
// (source = DSLD, domainData.dietaryIngredient). This makes the supplement search
// work in MIRROR mode and on HYBRID/LIVE failover — no live API needed at runtime.
// Idempotent. Run: pnpm --filter @ilaunchify/db seed:dsld-mirror.
// docs/PRODUCT_DOMAINS_ARCHITECTURE.md (Phase 1 — DSLD mirror).

import { PrismaClient } from '@prisma/client'
import { parseDsldHits } from '../../../apps/partner/src/app/(dashboard)/products/new/dsld'

const prisma = new PrismaClient()
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Common supplement ingredients to pre-mirror. Extend freely.
const TERMS = [
  'Vitamin A', 'Vitamin C', 'Vitamin D', 'Vitamin E', 'Vitamin K', 'Thiamin', 'Riboflavin',
  'Niacin', 'Vitamin B6', 'Folate', 'Vitamin B12', 'Biotin', 'Pantothenic Acid',
  'Calcium', 'Iron', 'Magnesium', 'Zinc', 'Selenium', 'Copper', 'Manganese', 'Chromium',
  'Potassium', 'Iodine', 'Omega-3', 'Fish Oil', 'Probiotics', 'Collagen', 'Whey Protein',
  'Creatine', 'Ashwagandha', 'Turmeric', 'Curcumin', 'Ginkgo', 'Ginseng', 'Melatonin',
  'Glucosamine', 'Chondroitin', 'CoQ10', 'Caffeine', 'L-Theanine', 'Green Tea', 'Elderberry',
  'Quercetin', 'Resveratrol', 'Lutein', 'Berberine',
]
const BASE = 'https://api.ods.od.nih.gov/dsld/v9'

async function main() {
  let created = 0
  for (const term of TERMS) {
    let json: unknown = null
    try {
      const res = await fetch(`${BASE}/search-filter?q=${encodeURIComponent(term)}&size=15`, { headers: { Accept: 'application/json' } })
      if (!res.ok) { console.warn(`DSLD ${res.status} for "${term}"`); continue }
      json = await res.json()
    } catch (e) {
      console.warn(`DSLD fetch failed for "${term}": ${(e as Error).message}`)
      continue
    }
    const candidates = parseDsldHits(json, term, 8)
    for (const c of candidates) {
      const sourceRefId = `dsld-${slug(c.name)}`
      const exists = await prisma.ingredient.findFirst({ where: { source: 'DSLD', sourceRefId }, select: { id: true } })
      if (exists) continue
      await prisma.ingredient.create({
        data: {
          name: c.name, internalName: c.name, labelDeclarationName: c.name,
          nutritionPer100g: {}, source: 'DSLD', sourceRefId, category: 'supplement',
          domainData: { dietaryIngredient: { category: c.category, form: c.form ?? null, altName: c.altName ?? null } },
          verificationStatus: 'ADMIN_VERIFIED', allergens: [], allergenFlags: [],
        },
      })
      created++
    }
    await sleep(150) // be polite to the public API
  }

  const rowCount = await prisma.ingredient.count({ where: { source: 'DSLD' } })
  await (prisma as unknown as { ingredientSourceConfig: { upsert: (a: unknown) => Promise<unknown> } }).ingredientSourceConfig
    .upsert({ where: { source: 'DSLD' }, update: { rowCount, lastSyncedAt: new Date() }, create: { source: 'DSLD', rowCount, lastSyncedAt: new Date() } })
    .catch(() => {})

  console.log(`DSLD mirror: ${created} new dietary ingredients (total ${rowCount}).`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
