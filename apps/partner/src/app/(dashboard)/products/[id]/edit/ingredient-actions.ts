'use server'

// Ingredient search + partner-private-create actions for the IngredientPicker.
// Per task #138 + docs/MANUFACTURER_PRODUCT_BUILDER.md §4a.
//
// The picker calls searchIngredients() on every keystroke. We rank in this
// order:
//   1. Recent / frequent for THIS partner (IngredientUsage rows)
//   2. Curated Library matches
//   3. Partner-private rows owned by THIS partner
//   4. USDA rows
//
// createPartnerPrivateIngredient() is the explicit "Add new" flow — the
// picker calls it only when the partner clicks the Add modal's Save button.
// All new rows start at SELF_ATTESTED so the partner can immediately ship
// products with them (per the "operational trust > margin optimization" memo).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import type { BioengineeredStatus, IngredientSource, Prisma } from '@prisma/client'

export type IngredientResult = {
  id: string
  source: IngredientSource
  internalName: string
  labelDeclarationName: string
  allergenFlags: string[]
  bioengineeredStatus: BioengineeredStatus
  verificationStatus: 'SELF_ATTESTED' | 'ADMIN_VERIFIED' | 'LIBRARY_PROMOTED'
  ownerPartnerId: string | null
  densityGPerML: number | null
  // UI metadata
  recentlyUsed: boolean
  useCount: number
}

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

async function authorizePartner() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return { user: null, partnerId: null as string | null, error: 'NOT_A_PARTNER' as const }
  }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) {
    return { user, partnerId: null, error: 'PARTNER_NOT_FOUND' as const }
  }
  return { user, partnerId: partner.id, error: null as null }
}

// -----------------------------------------------------------------------------
// SEARCH — unified across USDA / LIBRARY / this-partner's PRIVATE rows.
// -----------------------------------------------------------------------------

export async function searchIngredients(input: {
  query: string
  limit?: number
}): Promise<Result<{ results: IngredientResult[] }>> {
  const { partnerId, error } = await authorizePartner()
  if (error) return { ok: false, error }

  const limit = Math.min(input.limit ?? 25, 50)
  const q = input.query.trim()

  // Build a Prisma where that includes USDA + LIBRARY + (PRIVATE owned by me).
  const visibility: Prisma.IngredientWhereInput = {
    OR: [
      { source: 'USDA' },
      { source: 'LIBRARY' },
      { source: 'PARTNER_PRIVATE', ownerPartnerId: partnerId },
    ],
  }

  // Empty query → return recent/frequent for this partner instead of cold list.
  if (!q) {
    const recentUsage = await prisma.ingredientUsage.findMany({
      where: { partnerId },
      orderBy: [{ lastUsedAt: 'desc' }],
      take: limit,
      include: {
        ingredient: true,
      },
    })
    const recentIds = recentUsage.map((u) => u.ingredientId)
    // Top-up with library staples if recent list is short.
    const filler =
      recentUsage.length < limit
        ? await prisma.ingredient.findMany({
            where: {
              ...visibility,
              id: { notIn: recentIds.length > 0 ? recentIds : ['__none__'] },
              source: 'LIBRARY',
            },
            orderBy: { name: 'asc' },
            take: limit - recentUsage.length,
          })
        : []
    const results: IngredientResult[] = [
      ...recentUsage.map((u) => toResult(u.ingredient, { recentlyUsed: true, useCount: u.useCount })),
      ...filler.map((i) => toResult(i, { recentlyUsed: false, useCount: 0 })),
    ]
    return { ok: true, data: { results } }
  }

  // Active query → name + internalName + labelDeclarationName ILIKE.
  // Mode: 'insensitive' is the Prisma way to opt into CITEXT-like matching.
  const matchWhere: Prisma.IngredientWhereInput = {
    AND: [
      visibility,
      {
        OR: [
          { internalName: { contains: q, mode: 'insensitive' } },
          { labelDeclarationName: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
    ],
  }

  const matches = await prisma.ingredient.findMany({
    where: matchWhere,
    orderBy: [{ name: 'asc' }],
    take: limit,
  })

  // Annotate with this-partner's usage counts so the UI can show a "used N×" hint.
  const usage = await prisma.ingredientUsage.findMany({
    where: { partnerId, ingredientId: { in: matches.map((m) => m.id) } },
    select: { ingredientId: true, useCount: true },
  })
  const usageMap = new Map(usage.map((u) => [u.ingredientId, u.useCount]))

  // Re-rank: PARTNER_PRIVATE first (it's specific), then LIBRARY, then USDA.
  const sourceRank: Record<IngredientSource, number> = {
    PARTNER_PRIVATE: 0,
    LIBRARY: 1,
    USDA: 2,
  }
  const ranked = matches
    .map((m) => ({
      m,
      rank: sourceRank[m.source ?? 'USDA'] ?? 99,
      used: usageMap.get(m.id) ?? 0,
    }))
    .sort((a, b) => {
      // Used-by-me wins.
      if (b.used !== a.used) return b.used - a.used
      // Then by source.
      return a.rank - b.rank
    })
    .map(({ m, used }) => toResult(m, { recentlyUsed: used > 0, useCount: used }))

  return { ok: true, data: { results: ranked } }
}

function toResult(
  ing: {
    id: string
    name: string
    source: IngredientSource | null
    internalName: string | null
    labelDeclarationName: string | null
    allergenFlags: string[]
    bioengineeredStatus: BioengineeredStatus
    verificationStatus: 'SELF_ATTESTED' | 'ADMIN_VERIFIED' | 'LIBRARY_PROMOTED'
    ownerPartnerId: string | null
    densityGPerML: number | null
  },
  extras: { recentlyUsed: boolean; useCount: number },
): IngredientResult {
  return {
    id: ing.id,
    source: ing.source ?? 'USDA',
    internalName: ing.internalName ?? ing.name,
    labelDeclarationName: ing.labelDeclarationName ?? ing.internalName ?? ing.name,
    allergenFlags: ing.allergenFlags,
    bioengineeredStatus: ing.bioengineeredStatus,
    verificationStatus: ing.verificationStatus,
    ownerPartnerId: ing.ownerPartnerId,
    densityGPerML: ing.densityGPerML,
    recentlyUsed: extras.recentlyUsed,
    useCount: extras.useCount,
  }
}

// -----------------------------------------------------------------------------
// CREATE — partner-private SELF_ATTESTED row with full metadata.
// -----------------------------------------------------------------------------

export type CreatePartnerPrivateIngredientInput = {
  internalName: string
  labelDeclarationName: string
  allergenFlags: string[]
  bioengineeredStatus: BioengineeredStatus
  densityGPerML: number | null
  complianceNotes: string | null
  // Empty nutritionPer100g is fine — partner can refine via the curated-library
  // promotion queue (task #140) or compliance team can request COA later.
}

export async function createPartnerPrivateIngredient(
  input: CreatePartnerPrivateIngredientInput,
): Promise<Result<{ ingredient: IngredientResult }>> {
  const { user, partnerId, error } = await authorizePartner()
  if (error) return { ok: false, error }

  const internalName = input.internalName.trim()
  const labelDeclarationName = input.labelDeclarationName.trim() || internalName
  if (!internalName) return { ok: false, error: 'Internal name is required.' }
  if (internalName.length > 200) return { ok: false, error: 'Internal name is too long.' }
  if (labelDeclarationName.length > 200) {
    return { ok: false, error: 'Label declaration name is too long.' }
  }

  const ing = await prisma.ingredient.create({
    data: {
      name: internalName, // legacy column — keep populated for back-compat
      internalName,
      labelDeclarationName,
      nutritionPer100g: {},
      source: 'PARTNER_PRIVATE',
      ownerPartnerId: partnerId,
      verificationStatus: 'SELF_ATTESTED',
      createdById: user.id,
      allergenFlags: input.allergenFlags,
      allergens: input.allergenFlags, // legacy mirror
      bioengineeredStatus: input.bioengineeredStatus,
      densityGPerML: input.densityGPerML,
      complianceNotes: input.complianceNotes?.trim() || null,
    },
  })

  return {
    ok: true,
    data: { ingredient: toResult(ing, { recentlyUsed: false, useCount: 0 }) },
  }
}

// -----------------------------------------------------------------------------
// USAGE TRACKING — bump count after a slot/replacement actually uses the row.
// Called by the slot/replacement actions in card-actions.ts.
// -----------------------------------------------------------------------------

export async function trackIngredientUsage(ingredientId: string): Promise<void> {
  const { partnerId } = await authorizePartner()
  if (!partnerId) return
  await prisma.ingredientUsage.upsert({
    where: { partnerId_ingredientId: { partnerId, ingredientId } },
    create: { partnerId, ingredientId, useCount: 1 },
    update: { useCount: { increment: 1 }, lastUsedAt: new Date() },
  })
}
