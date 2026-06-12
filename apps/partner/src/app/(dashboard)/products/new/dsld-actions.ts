'use server'

// NIH DSLD ingredient search (Phase 1D). Reads the admin-managed source config
// (mode MIRROR / LIVE / HYBRID + failover) and, when live, queries the DSLD v9
// API, normalizing hits to dietary-ingredient candidates via the pure parser.
// Partner-gated + rate-limited, mirroring the food IngredientPicker search.
// docs/PRODUCT_DOMAINS_ARCHITECTURE.md (Phase 1).

import { resolveIngredientSource } from '@ilaunchify/db'
import { requirePartnerActor, checkRateLimit } from '@ilaunchify/auth'
import { parseDsldHits, type DsldIngredientCandidate } from './dsld'

type Result = { ok: true; data: DsldIngredientCandidate[]; note?: string } | { ok: false; error: string }

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

  // MIRROR mode: no live call. The DB mirror import is a later slice, so until
  // then there's nothing to return locally.
  if (cfg.mode === 'MIRROR') {
    return { ok: true, data: [], note: 'DSLD is set to Mirror but no rows are imported yet.' }
  }

  const base = (cfg.apiBaseUrl || 'https://api.ods.od.nih.gov/dsld/v9/').replace(/\/$/, '')
  const url = `${base}/search-filter?q=${encodeURIComponent(q)}&size=25`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`DSLD ${res.status}`)
    const json = (await res.json()) as unknown
    return { ok: true, data: parseDsldHits(json, q) }
  } catch (err) {
    // Auto-failover to the DB mirror when configured (no mirror rows yet → empty).
    if (cfg.failoverToDb) return { ok: true, data: [], note: 'DSLD API unreachable — showing the local copy (empty until the mirror is imported).' }
    return { ok: false, error: `DSLD unreachable: ${(err as Error).message}` }
  }
}
