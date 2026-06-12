'use server'

// NIH DSLD ingredient search (Phase 1D). Reads the admin-managed source config
// (mode MIRROR / LIVE / HYBRID + failover) and, when live, queries the DSLD v9
// API, normalizing hits to dietary-ingredient candidates via the pure parser.
// Partner-gated + rate-limited, mirroring the food IngredientPicker search.
// docs/PRODUCT_DOMAINS_ARCHITECTURE.md (Phase 1).

import { prisma, resolveIngredientSource } from '@ilaunchify/db'
import { requirePartnerActor, checkRateLimit } from '@ilaunchify/auth'
import { parseDsldHits, type DsldIngredientCandidate } from './dsld'

type Result = { ok: true; data: DsldIngredientCandidate[]; note?: string } | { ok: false; error: string }

/** Search the mirrored DSLD rows in the Ingredient Library (source = DSLD). */
async function searchDsldMirror(q: string): Promise<DsldIngredientCandidate[]> {
  try {
    const rows = await (prisma as unknown as {
      ingredient: { findMany: (a: unknown) => Promise<Array<{ id: string; name: string; internalName: string | null; domainData: unknown }>> }
    }).ingredient.findMany({
      where: { source: 'DSLD', OR: [{ name: { contains: q, mode: 'insensitive' } }, { internalName: { contains: q, mode: 'insensitive' } }] },
      select: { id: true, name: true, internalName: true, domainData: true },
      take: 15,
    })
    return rows.map((r) => {
      const di = ((r.domainData as Record<string, unknown> | null)?.dietaryIngredient as Record<string, unknown>) ?? {}
      return {
        id: r.id,
        name: r.internalName ?? r.name,
        category: String(di.category ?? 'other'),
        ...(di.form ? { form: String(di.form) } : {}),
        ...(di.altName ? { altName: String(di.altName) } : {}),
      }
    })
  } catch {
    return []
  }
}

export async function searchDsldIngredients(query: string): Promise<Result> {
  const actor = await requirePartnerActor()
  if (!actor.ok) return { ok: false, error: actor.error }
  const q = query.trim()
  if (q.length < 2) return { ok: true, data: [] }

  // Same generous human ceiling as the food search; stops scripted scraping.
  const rate = await checkRateLimit({ scope: 'dsld-search', id: actor.partnerId, limit: 120, windowSec: 60 })
  if (!rate.ok) return { ok: false, error: 'RATE_LIMITED' }

  const cfg = await resolveIngredientSource('DSLD')
  if (!cfg.enabled) return { ok: false, error: 'DSLD source is disabled. Enable it in Admin → Ingredient Data Sources.' }

  // MIRROR mode: serve from the mirrored DSLD rows (no live call).
  if (cfg.mode === 'MIRROR') {
    const data = await searchDsldMirror(q)
    return { ok: true, data, note: data.length === 0 ? 'No mirrored DSLD rows match — run the DSLD mirror import.' : undefined }
  }

  const base = (cfg.apiBaseUrl || 'https://api.ods.od.nih.gov/dsld/v9/').replace(/\/$/, '')
  const url = `${base}/search-filter?q=${encodeURIComponent(q)}&size=25`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`DSLD ${res.status}`)
    const json = (await res.json()) as unknown
    return { ok: true, data: parseDsldHits(json, q) }
  } catch (err) {
    // Auto-failover to the mirrored DB copy when configured.
    if (cfg.failoverToDb) {
      const data = await searchDsldMirror(q)
      return { ok: true, data, note: 'DSLD API unreachable — showing the mirrored copy.' }
    }
    return { ok: false, error: `DSLD unreachable: ${(err as Error).message}` }
  }
}
