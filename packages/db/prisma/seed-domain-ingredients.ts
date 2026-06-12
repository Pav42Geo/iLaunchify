// Seed the curated INCI (cosmetic) + AAFCO (pet) starter dictionaries into the
// Ingredient Library as admin-managed rows (source = INCI / AAFCO), so ops can
// grow them via Admin → Ingredient Library without a deploy. The formulation
// steps then search the DB (with the static dictionary as a pre-seed fallback).
// Idempotent — re-running only inserts what's missing. docs/PRODUCT_DOMAINS_ARCHITECTURE.md.
//
// The curated arrays live in the partner app (client-safe, no deps); the seed
// imports them so there's a single source of truth.

import { PrismaClient } from '@prisma/client'
import { INCI_DICTIONARY } from '../../../apps/partner/src/app/(dashboard)/products/new/inci-dictionary'
import { AAFCO_DICTIONARY } from '../../../apps/partner/src/app/(dashboard)/products/new/aafco-dictionary'

const prisma = new PrismaClient()
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function main() {
  let inci = 0
  for (const e of INCI_DICTIONARY) {
    const sourceRefId = slug(e.name)
    const exists = await prisma.ingredient.findFirst({ where: { source: 'INCI', sourceRefId }, select: { id: true } })
    if (exists) continue
    await prisma.ingredient.create({
      data: {
        name: e.name, internalName: e.name, labelDeclarationName: e.name,
        nutritionPer100g: {}, source: 'INCI', sourceRefId, category: 'cosmetic',
        domainData: { inci: { function: e.fn, color: !!e.color, fragrance: !!e.fragrance } },
        verificationStatus: 'ADMIN_VERIFIED', allergens: [], allergenFlags: [],
      },
    })
    inci++
  }

  let aafco = 0
  for (const e of AAFCO_DICTIONARY) {
    const sourceRefId = slug(e.name)
    const exists = await prisma.ingredient.findFirst({ where: { source: 'AAFCO', sourceRefId }, select: { id: true } })
    if (exists) continue
    await prisma.ingredient.create({
      data: {
        name: e.name, internalName: e.name, labelDeclarationName: e.name,
        nutritionPer100g: {}, source: 'AAFCO', sourceRefId, category: 'pet',
        domainData: { guaranteedAnalysis: { category: e.category } },
        verificationStatus: 'ADMIN_VERIFIED', allergens: [], allergenFlags: [],
      },
    })
    aafco++
  }

  // Reflect the mirrored row counts on the source config for the admin module.
  const upd = async (source: 'INCI' | 'AAFCO') => {
    const rowCount = await prisma.ingredient.count({ where: { source } })
    await (prisma as unknown as { ingredientSourceConfig: { upsert: (a: unknown) => Promise<unknown> } }).ingredientSourceConfig
      .upsert({ where: { source }, update: { rowCount, lastSyncedAt: new Date() }, create: { source, rowCount, lastSyncedAt: new Date() } })
      .catch(() => {})
  }
  await upd('INCI')
  await upd('AAFCO')

  console.log(`Seeded ${inci} new INCI + ${aafco} new AAFCO ingredients into the Library.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
