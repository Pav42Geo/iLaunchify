'use server'

// Search the admin-managed Ingredient Library for a non-food domain source
// (INCI cosmetics / AAFCO pet). Reads the admin source config (enabled), queries
// Ingredient rows by source + name, and returns each row's domain payload from
// domainData. Partner-gated + rate-limited. The formulation steps fall back to
// the static starter dictionary when this returns empty (pre-seed / disabled).
// docs/PRODUCT_DOMAINS_ARCHITECTURE.md (Phase 2/3).

import { prisma, resolveIngredientSource } from '@ilaunchify/db'
import { requirePartnerActor, checkRateLimit } from '@ilaunchify/auth'

export interface LibraryCandidate {
  id: string
  name: string
  /** The domain sub-object from Ingredient.domainData (inci{} or guaranteedAnalysis{}). */
  meta: Record<string, unknown>
}

type Result = { ok: true; data: LibraryCandidate[] } | { ok: false; error: string }

export async function searchLibraryIngredients(source: 'INCI' | 'AAFCO', query: string): Promise<Result> {
  const actor = await requirePartnerActor()
  if (!actor.ok) return { ok: false, error: actor.error }
  const q = query.trim()
  if (q.length < 2) return { ok: true, data: [] }
  const rate = await checkRateLimit({ scope: 'library-search', id: actor.partnerId, limit: 120, windowSec: 60 })
  if (!rate.ok) return { ok: false, error: 'RATE_LIMITED' }

  const cfg = await resolveIngredientSource(source)
  if (!cfg.enabled) return { ok: true, data: [] } // client falls back to the static dictionary

  try {
    const rows = await (prisma as unknown as {
      ingredient: {
        findMany: (a: unknown) => Promise<Array<{ id: string; name: string; internalName: string | null; domainData: unknown }>>
      }
    }).ingredient.findMany({
      where: {
        source,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { internalName: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, internalName: true, domainData: true },
      take: 15,
    })
    const key = source === 'INCI' ? 'inci' : 'guaranteedAnalysis'
    const data: LibraryCandidate[] = rows.map((r) => ({
      id: r.id,
      name: r.internalName ?? r.name,
      meta: ((r.domainData as Record<string, unknown> | null)?.[key] as Record<string, unknown>) ?? {},
    }))
    return { ok: true, data }
  } catch {
    return { ok: true, data: [] }
  }
}
