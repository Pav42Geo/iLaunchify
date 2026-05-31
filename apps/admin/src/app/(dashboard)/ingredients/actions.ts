'use server'

// #140 — admin ingredient verification queue.
//
// Surfaces every SELF_ATTESTED partner-private Ingredient so admin can
// either bless it in place (ADMIN_VERIFIED) or promote it to the shared
// Curated Library (LIBRARY_PROMOTED).
//
// Per memory [[ilaunchify-ingredient-governance]] — admin is informed,
// not blocking. SELF_ATTESTED ingredients are immediately usable by the
// partner who created them; this queue exists to absorb cross-partner
// repeats into the shared library and to give compliance-flagged rows a
// review surface, not to gate production.

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'

type Result<T = { ok: true }> = T | { ok: false; error: string }

// =============================================================================
// verifyIngredient — bless a partner-private ingredient as ADMIN_VERIFIED
// =============================================================================
//
// Keeps the row private to its owning partner (doesn't make it visible
// to other partners). Use this when admin has reviewed the COA + nutrient
// values and confirmed they're accurate but the ingredient is bespoke
// enough that it shouldn't enter the shared library yet.

export async function verifyIngredient(input: {
  ingredientId: string
  reviewNote?: string
}): Promise<Result> {
  const user = await requireRole(['ADMIN'])

  const existing = await prisma.ingredient.findUnique({
    where: { id: input.ingredientId },
    select: {
      id: true,
      internalName: true,
      name: true,
      verificationStatus: true,
      ownerPartnerId: true,
      source: true,
    },
  })
  if (!existing) return { ok: false, error: 'Ingredient not found.' }
  if (existing.verificationStatus !== 'SELF_ATTESTED') {
    return {
      ok: false,
      error: `Ingredient is already ${existing.verificationStatus.toLowerCase()}; no action needed.`,
    }
  }

  await prisma.ingredient.update({
    where: { id: input.ingredientId },
    data: {
      verificationStatus: 'ADMIN_VERIFIED',
      verifiedById: user.id,
    },
  })

  await logAuditAs(user, {
    entityType: 'Ingredient',
    entityId: existing.id,
    action: 'INGREDIENT_VERIFY',
    fromValue: 'SELF_ATTESTED',
    toValue: 'ADMIN_VERIFIED',
    payload: {
      internalName: existing.internalName ?? existing.name,
      ownerPartnerId: existing.ownerPartnerId,
      reviewNote: input.reviewNote ?? null,
    },
  })

  revalidatePath('/ingredients')
  return { ok: true }
}

// =============================================================================
// promoteToLibrary — copy a partner-private row into the Curated Library
// =============================================================================
//
// Creates a NEW Ingredient row with source=LIBRARY (visible to every
// partner) and links it back to the source row via
// promotedFromIngredientId so the lineage is preserved. The original
// partner-private row is NOT deleted — we keep it as the legal
// "originated from partner X" provenance trail.
//
// Optional admin overrides at promotion time:
//   - labelDeclarationName: lets admin normalise the FDA-printed name
//     (e.g. "natural strawberry flavor" instead of partner's
//     "Symrise Strawberry Type-B"). Falls back to existing value.
//   - complianceNotes: free-text for the library row only.
//   - bioengineeredStatus: admin can re-classify after CoA review.
//
// V2 will offer "migrate references" to flip every RecipeIngredient
// reference from the private row to the new library row. V1 leaves
// existing recipes pinned to the private row (still works — they're
// just not auto-upgraded).

export async function promoteToLibrary(input: {
  ingredientId: string
  labelDeclarationName?: string
  complianceNotes?: string
  bioengineeredStatus?: 'NOT_APPLICABLE' | 'BIOENGINEERED' | 'DERIVED_FROM_BIOENGINEERED'
}): Promise<Result<{ ok: true; newIngredientId: string }>> {
  const user = await requireRole(['ADMIN'])

  const source = await prisma.ingredient.findUnique({
    where: { id: input.ingredientId },
  })
  if (!source) return { ok: false, error: 'Ingredient not found.' }
  if (source.source !== 'PARTNER_PRIVATE') {
    return {
      ok: false,
      error: 'Only partner-private ingredients can be promoted to the library.',
    }
  }

  // Build the library copy. Strip ownerPartnerId (library rows are
  // partnerless), set source=LIBRARY, stamp the promotion lineage.
  // verificationStatus = LIBRARY_PROMOTED so it doesn't accidentally
  // show in this same queue next time.
  const created = await prisma.ingredient.create({
    data: {
      name: source.name,
      internalName: source.internalName,
      labelDeclarationName:
        input.labelDeclarationName?.trim() ||
        source.labelDeclarationName ||
        source.internalName ||
        source.name,
      densityGPerML: source.densityGPerML,
      allergenFlags: source.allergenFlags,
      allergens: source.allergens,
      complianceNotes:
        input.complianceNotes?.trim() || source.complianceNotes,
      bioengineeredStatus:
        input.bioengineeredStatus ?? source.bioengineeredStatus,
      nutritionPer100g: source.nutritionPer100g as object,
      category: source.category,
      isOrganic: source.isOrganic,
      source: 'LIBRARY',
      sourceRefId: source.id, // breadcrumb: original PARTNER_PRIVATE row id
      verificationStatus: 'LIBRARY_PROMOTED',
      verifiedById: user.id,
      createdById: user.id,
      promotedFromIngredientId: source.id,
      // ownerPartnerId intentionally null — library rows aren't owned.
    },
  })

  // Also flip the source row to ADMIN_VERIFIED so the source partner
  // sees their attestation was reviewed (it's still their private row,
  // just blessed). Keeps the SELF_ATTESTED queue clean on next visit.
  await prisma.ingredient.update({
    where: { id: source.id },
    data: {
      verificationStatus: 'ADMIN_VERIFIED',
      verifiedById: user.id,
    },
  })

  await logAuditAs(user, {
    entityType: 'Ingredient',
    entityId: created.id,
    action: 'INGREDIENT_LIBRARY_PROMOTE',
    fromValue: source.id, // the private row id
    toValue: created.id,
    payload: {
      internalName: source.internalName ?? source.name,
      sourcePartnerId: source.ownerPartnerId,
      labelDeclarationName: created.labelDeclarationName,
      complianceNotes: created.complianceNotes,
      bioengineeredStatus: created.bioengineeredStatus,
    },
  })

  revalidatePath('/ingredients')
  return { ok: true, newIngredientId: created.id }
}

// =============================================================================
// listIngredientCandidates — server-side data loader for the queue page
// =============================================================================
//
// Returns SELF_ATTESTED partner-private rows with usage stats so the
// page can prioritise high-usage cross-partner repeats (the absorption
// candidates) at the top.

export interface IngredientCandidate {
  id: string
  name: string
  internalName: string | null
  labelDeclarationName: string | null
  allergenFlags: string[]
  bioengineeredStatus: string
  ownerPartnerId: string | null
  ownerPartnerName: string | null
  coaFileId: string | null
  createdAt: Date
  // Usage signal — how many recipes reference this private row.
  usageCount: number
  // Cross-partner echo — count of OTHER partner-private SELF_ATTESTED
  // rows with the same internalName (case-insensitive). High echo = a
  // strong promotion candidate (multiple partners are reinventing the
  // same ingredient).
  echoCount: number
}

export async function listIngredientCandidates(): Promise<
  IngredientCandidate[]
> {
  await requireRole(['ADMIN'])

  const rows = await prisma.ingredient.findMany({
    where: {
      verificationStatus: 'SELF_ATTESTED',
      source: 'PARTNER_PRIVATE',
    },
    select: {
      id: true,
      name: true,
      internalName: true,
      labelDeclarationName: true,
      allergenFlags: true,
      bioengineeredStatus: true,
      ownerPartnerId: true,
      coaFileId: true,
      createdAt: true,
      ownerPartner: { select: { companyName: true } },
      _count: { select: { recipeIngredients: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  // Group by lowercased internalName to compute echo counts in-process.
  // 200 rows max keeps this cheap; tipping over that volume = move to a
  // GROUP BY query.
  const echoByName = new Map<string, number>()
  for (const r of rows) {
    const key = (r.internalName ?? r.name).toLowerCase().trim()
    echoByName.set(key, (echoByName.get(key) ?? 0) + 1)
  }

  const candidates: IngredientCandidate[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    internalName: r.internalName,
    labelDeclarationName: r.labelDeclarationName,
    allergenFlags: r.allergenFlags,
    bioengineeredStatus: r.bioengineeredStatus,
    ownerPartnerId: r.ownerPartnerId,
    ownerPartnerName: r.ownerPartner?.companyName ?? null,
    coaFileId: r.coaFileId,
    createdAt: r.createdAt,
    usageCount: r._count.recipeIngredients,
    echoCount:
      echoByName.get((r.internalName ?? r.name).toLowerCase().trim()) ?? 1,
  }))

  // Promotion candidates first (high echo, high usage), then chronological.
  candidates.sort((a, b) => {
    const aPriority = a.echoCount * 10 + a.usageCount
    const bPriority = b.echoCount * 10 + b.usageCount
    if (aPriority !== bPriority) return bPriority - aPriority
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  return candidates
}
