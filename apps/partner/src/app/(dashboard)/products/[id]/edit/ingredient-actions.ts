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

import { prisma, isIngredientBanned } from '@ilaunchify/db'
import { requirePartnerActor, checkRateLimit } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import type { BioengineeredStatus, IngredientSource, Prisma } from '@ilaunchify/db'

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

// Tier 1.1 (docs/SECURITY_ARCHITECTURE.md): delegates to the centralized
// ownership guard in @ilaunchify/auth. Historical return shape preserved.
async function authorizePartner() {
  const r = await requirePartnerActor()
  if (!r.ok) {
    return { user: null, partnerId: null as string | null, error: r.error }
  }
  return { user: r.user, partnerId: r.partnerId, error: null as null }
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

  // Tier 0.3 (docs/SECURITY_ARCHITECTURE.md) — search fires per keystroke, so
  // the ceiling is generous for humans but stops scripted USDA scraping.
  // 120/min per partner; fails open on DB hiccups (see checkRateLimit).
  const rate = await checkRateLimit({
    scope: 'ingredient-search',
    id: partnerId,
    limit: 120,
    windowSec: 60,
  })
  if (!rate.ok) return { ok: false, error: 'RATE_LIMITED' }

  const limit = Math.min(input.limit ?? 25, 50)
  const q = input.query.trim()

  // Build a Prisma where that includes USDA + LIBRARY + (PRIVATE owned by me).
  // Mode 3 (Slice 4) synthetic "Whole Product" rows are never surfaced — they
  // hold a declared panel, not a real ingredient.
  const visibility: Prisma.IngredientWhereInput = {
    isDeclaredPanelSynthetic: false,
    OR: [
      { source: 'USDA' },
      { source: 'LIBRARY' },
      { source: 'PARTNER_PRIVATE', ownerPartnerId: partnerId },
    ],
  }

  // Empty query → curated panel: this partner's recently-used (up to 8) +
  // library staples (up to 12). The client renders them under two subheaders
  // ("Recently used" / "Library staples") keyed off the recentlyUsed flag.
  if (!q) {
    const recent = await getRecentlyUsedIngredients(partnerId, EMPTY_STATE_RECENT_LIMIT)
    const recentIds = recent.map((r) => r.id)
    const notRecent = { id: { notIn: recentIds.length > 0 ? recentIds : ['__none__'] } }

    // Library staples — curated LIBRARY rows the partner hasn't just used.
    // No global useCount on Ingredient (it's per-partner on IngredientUsage)
    // and no displayPriority column, so order by name. Cold-seed fallback to
    // USDA when no LIBRARY rows exist yet.
    let staples = await prisma.ingredient.findMany({
      where: { ...visibility, ...notRecent, source: 'LIBRARY' },
      orderBy: { name: 'asc' },
      take: EMPTY_STATE_STAPLES_LIMIT,
    })
    if (staples.length === 0) {
      staples = await prisma.ingredient.findMany({
        where: { ...visibility, ...notRecent, source: 'USDA' },
        orderBy: { name: 'asc' },
        take: EMPTY_STATE_STAPLES_LIMIT,
      })
    }

    const results: IngredientResult[] = [
      ...recent,
      ...staples.map((i) => toResult(i, { recentlyUsed: false, useCount: 0 })),
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
// EMPTY-STATE PANEL — recently-used + library staples (Slice 1).
// -----------------------------------------------------------------------------

/** Caps for the empty-query picker panel. */
const EMPTY_STATE_RECENT_LIMIT = 8
const EMPTY_STATE_STAPLES_LIMIT = 12

/**
 * The calling partner's recently-used ingredients, newest first.
 *
 * IngredientUsage is scoped by `partnerId` (confirmed in schema — not userId /
 * partnerServiceId). Ordered by `lastUsedAt DESC` (recency = "what was I just
 * working on"); switch to `[{ useCount: 'desc' }]` if Pavel prefers frequency.
 * Returns picker-ready IngredientResult rows flagged recentlyUsed.
 *
 * Internal (NOT exported) on purpose: in a 'use server' module every export is
 * a client-callable endpoint, and this takes a partnerId with no auth of its
 * own. searchIngredients already authorized the caller before invoking it. Add
 * an authorized wrapper if a surface ever needs it directly.
 */
async function getRecentlyUsedIngredients(
  partnerId: string,
  limit: number = EMPTY_STATE_RECENT_LIMIT,
): Promise<IngredientResult[]> {
  const usage = await prisma.ingredientUsage.findMany({
    where: { partnerId },
    orderBy: [{ lastUsedAt: 'desc' }],
    take: limit,
    include: { ingredient: true },
  })
  return usage.map((u) =>
    toResult(u.ingredient, { recentlyUsed: true, useCount: u.useCount }),
  )
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

  // Banned-ingredient runtime enforcement (FDA_REGULATORY_POSTURE §5). Match
  // against the seeded BannedIngredient dictionary; block + audit the attempt.
  const banned =
    (await isIngredientBanned(internalName)) ??
    (await isIngredientBanned(labelDeclarationName))
  if (banned) {
    await logAuditAs(user, {
      entityType: 'Ingredient',
      entityId: internalName,
      action: 'INGREDIENT_BANNED_BLOCK',
      payload: {
        attemptedName: internalName,
        labelDeclarationName,
        matchedBanned: banned.matchName,
        reason: banned.reason,
        reference: banned.reference,
        partnerId,
      },
    })
    return {
      ok: false,
      error: `"${internalName}" is on the banned-ingredient list and can't be added — ${banned.reason}`,
    }
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
