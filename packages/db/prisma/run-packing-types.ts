// Standalone runner for the packing-type taxonomy seed — applies the 15
// PackingProfile rows incl. Cowork's `labelTopology` (3 SINGLE / 2 AGGREGATE /
// 10 PER_FLAVOR) and `structuralType` (the 6-bucket consolidation) values,
// WITHOUT a full `prisma db seed`. Idempotent (upsert by slug).
//
//   pnpm --filter @ilaunchify/db seed:packing-types
//
// PREREQUISITE: run `db push` + `generate` first — the seed writes
// `structuralType`, which the DB column + generated client must already have.

import { PrismaClient } from '@prisma/client'
import { seedPackingTypes } from './seed-packing-types'

const prisma = new PrismaClient()

seedPackingTypes(prisma)
  .then(() => console.log('✓ Packing types applied (labelTopology + structuralType).'))
  .catch((e) => {
    console.error('✗ Packing-type seed failed:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
