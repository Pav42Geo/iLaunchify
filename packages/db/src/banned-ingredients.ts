// Banned-ingredient runtime enforcement (FDA_REGULATORY_POSTURE §5 item 11 /
// risk #9). The BannedIngredient dictionary is seeded (seed-ingredient-
// dictionaries.ts) but nothing consulted it at runtime — the Creator Agreement
// claims banned-list enforcement, so this closes the gap.
//
// Matching: case-insensitive exact on matchName, OR matchPattern (regex, 'i').
// Only active rows are considered. No new schema.

import { prisma } from './index'

export interface BannedIngredientMatch {
  matchName: string | null
  reason: string
  reference: string | null
}

interface BannedRow {
  matchName: string | null
  matchPattern: string | null
  reason: string
  reference: string | null
}

function matchOne(name: string, rows: BannedRow[]): BannedIngredientMatch | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  for (const r of rows) {
    if (r.matchName && r.matchName.trim().toLowerCase() === lower) {
      return { matchName: r.matchName, reason: r.reason, reference: r.reference }
    }
    if (r.matchPattern) {
      try {
        if (new RegExp(r.matchPattern, 'i').test(trimmed)) {
          return { matchName: r.matchName, reason: r.reason, reference: r.reference }
        }
      } catch {
        // Malformed pattern in the dictionary — skip rather than crash the save.
      }
    }
  }
  return null
}

async function activeRows(): Promise<BannedRow[]> {
  return prisma.bannedIngredient.findMany({
    where: { isActive: true },
    select: { matchName: true, matchPattern: true, reason: true, reference: true },
  })
}

/**
 * Returns the matching active BannedIngredient if `name` is banned, else null.
 * Use at any single-ingredient save path (e.g. createPartnerPrivateIngredient).
 */
export async function isIngredientBanned(name: string): Promise<BannedIngredientMatch | null> {
  if (!name.trim()) return null
  return matchOne(name, await activeRows())
}

/**
 * Batch variant — checks many ingredient names against the dictionary in one
 * query and returns the first offender (name + match), or null if all clear.
 * Use at the product-publish gate (submitProductForReview).
 */
export async function findFirstBannedIngredient(
  names: string[],
): Promise<{ name: string; match: BannedIngredientMatch } | null> {
  const rows = await activeRows()
  for (const name of names) {
    const match = matchOne(name, rows)
    if (match) return { name: name.trim(), match }
  }
  return null
}
