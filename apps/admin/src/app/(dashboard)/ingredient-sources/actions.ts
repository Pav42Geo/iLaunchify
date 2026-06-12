'use server'

// Admin Ingredient Data Source settings (Pavel 2026-06-11). One row per source
// (USDA · LIBRARY · PARTNER_PRIVATE · DSLD · INCI · AAFCO). The search adapter
// reads these to decide MIRROR / LIVE / HYBRID + auto-failover-to-DB. Cast-guarded
// until the migration lands the model on the generated client.
// docs/PRODUCT_DOMAINS_ARCHITECTURE.md §5.

import {
  prisma,
  getIngredientSourceConfigs,
  type IngredientSourceConfigValues,
  type IngredientSourceMode,
  type LabelingTypeKey,
} from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export { getIngredientSourceConfigs, type IngredientSourceConfigValues }

type Result = { ok: true } | { ok: false; error: string }

const SOURCES = ['USDA', 'LIBRARY', 'PARTNER_PRIVATE', 'DSLD', 'INCI', 'AAFCO'] as const
const MODES = ['MIRROR', 'LIVE', 'HYBRID'] as const
const LABELING = ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'OTC', 'COSMETIC'] as const

export interface IngredientSourcePatch {
  mode?: IngredientSourceMode
  failoverToDb?: boolean
  enabled?: boolean
  apiBaseUrl?: string | null
  rateLimitPerMin?: number
  syncCron?: string | null
  notes?: string | null
  labelingTypes?: LabelingTypeKey[]
}

/** Save one ingredient source's config (admin-gated + audited). */
export async function saveIngredientSource(source: string, patch: IngredientSourcePatch): Promise<Result> {
  const admin = await requireRole('ADMIN')
  if (!SOURCES.includes(source as (typeof SOURCES)[number])) return { ok: false, error: 'Unknown source.' }
  try {
    const data: Record<string, unknown> = {}
    if (patch.mode !== undefined && MODES.includes(patch.mode)) data.mode = patch.mode
    if (patch.failoverToDb !== undefined) data.failoverToDb = !!patch.failoverToDb
    if (patch.enabled !== undefined) data.enabled = !!patch.enabled
    if (patch.apiBaseUrl !== undefined) data.apiBaseUrl = patch.apiBaseUrl?.trim() || null
    if (patch.rateLimitPerMin !== undefined) {
      const n = Math.floor(Number(patch.rateLimitPerMin))
      data.rateLimitPerMin = Number.isFinite(n) ? Math.max(0, Math.min(100_000, n)) : 0
    }
    if (patch.syncCron !== undefined) data.syncCron = patch.syncCron?.trim() || null
    if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null
    if (patch.labelingTypes !== undefined) {
      data.labelingTypes = patch.labelingTypes.filter((t) => LABELING.includes(t))
    }

    await (prisma as unknown as {
      ingredientSourceConfig: { upsert: (a: unknown) => Promise<unknown> }
    }).ingredientSourceConfig.upsert({
      where: { source },
      update: data,
      create: { source, ...data },
    })

    await logAuditAs(admin, {
      entityType: 'IngredientSourceConfig',
      entityId: source,
      action: 'INGREDIENT_SOURCE_UPDATED',
      payload: { source, ...data },
    })
    revalidatePath('/ingredient-sources')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save source: ${(err as Error).message}` }
  }
}

// ---------------------------------------------------------------------------
// DSLD mirror sync — pulls common dietary ingredients from the live NIH DSLD v9
// API into the Library (source = DSLD) so MIRROR mode + failover work offline.
// Mirrors prisma/seed-dsld-mirror.ts but runnable from the admin UI.
// ---------------------------------------------------------------------------

const DSLD_TERMS = [
  'Vitamin A', 'Vitamin C', 'Vitamin D', 'Vitamin E', 'Vitamin K', 'Thiamin', 'Riboflavin', 'Niacin',
  'Vitamin B6', 'Folate', 'Vitamin B12', 'Biotin', 'Pantothenic Acid', 'Calcium', 'Iron', 'Magnesium',
  'Zinc', 'Selenium', 'Copper', 'Manganese', 'Chromium', 'Potassium', 'Iodine', 'Omega-3', 'Fish Oil',
  'Probiotics', 'Collagen', 'Whey Protein', 'Creatine', 'Ashwagandha', 'Turmeric', 'Ginkgo', 'Ginseng',
  'Melatonin', 'Glucosamine', 'Chondroitin', 'CoQ10', 'Caffeine', 'L-Theanine', 'Green Tea', 'Elderberry',
]
const DSLD_DIETARY = new Set(['vitamin', 'mineral', 'botanical', 'amino acid', 'protein', 'probiotic', 'enzyme', 'fatty acid', 'nucleotide', 'carbohydrate'])
const dslug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

interface DsldRaw { _source?: { allIngredients?: Array<{ ingredientGroup?: string; name?: string; category?: string; notes?: string }> } }

export async function syncDsldMirror(): Promise<{ ok: true; created: number; total: number } | { ok: false; error: string }> {
  const admin = await requireRole('ADMIN')
  const cfg = await (await import('@ilaunchify/db')).resolveIngredientSource('DSLD')
  const base = (cfg.apiBaseUrl || 'https://api.ods.od.nih.gov/dsld/v9/').replace(/\/$/, '')
  let created = 0
  try {
    const seen = new Set<string>()
    for (const term of DSLD_TERMS) {
      let json: unknown = null
      try {
        const res = await fetch(`${base}/search-filter?q=${encodeURIComponent(term)}&size=15`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
        if (!res.ok) continue
        json = await res.json()
      } catch { continue }
      const hits = (json as { hits?: DsldRaw[] } | null)?.hits ?? []
      const t = term.toLowerCase()
      for (const hit of hits) {
        for (const ing of hit._source?.allIngredients ?? []) {
          const cat = (ing.category ?? '').toLowerCase()
          if (!DSLD_DIETARY.has(cat)) continue
          const group = (ing.ingredientGroup ?? '').trim()
          const specific = (ing.name ?? '').trim()
          const name = (!group || /unspecified|^other$/i.test(group)) && specific ? specific : group || specific
          if (!name || !name.toLowerCase().includes(t.split(' ')[0] ?? t)) continue
          const sourceRefId = `dsld-${dslug(name)}`
          if (seen.has(sourceRefId)) continue
          seen.add(sourceRefId)
          const exists = await prisma.ingredient.findFirst({ where: { source: 'DSLD', sourceRefId }, select: { id: true } })
          if (exists) continue
          const form = /Form:\s*(?:as\s+)?([^)]+)/i.exec(ing.notes ?? '')?.[1]?.trim() ?? null
          const altName = /Alt\.?\s*Name:\s*([^)]+)/i.exec(ing.notes ?? '')?.[1]?.trim() ?? null
          await prisma.ingredient.create({
            data: {
              name, internalName: name, labelDeclarationName: name, nutritionPer100g: {},
              source: 'DSLD', sourceRefId, category: 'supplement',
              domainData: { dietaryIngredient: { category: cat, form, altName } },
              verificationStatus: 'ADMIN_VERIFIED', allergens: [], allergenFlags: [],
            },
          })
          created++
        }
      }
      await new Promise((r) => setTimeout(r, 120))
    }
    const total = await prisma.ingredient.count({ where: { source: 'DSLD' } })
    await (prisma as unknown as { ingredientSourceConfig: { upsert: (a: unknown) => Promise<unknown> } }).ingredientSourceConfig
      .upsert({ where: { source: 'DSLD' }, update: { rowCount: total, lastSyncedAt: new Date() }, create: { source: 'DSLD', rowCount: total, lastSyncedAt: new Date() } })
      .catch(() => {})
    await logAuditAs(admin, { entityType: 'IngredientSourceConfig', entityId: 'DSLD', action: 'DSLD_MIRROR_SYNCED', payload: { created, total } })
    revalidatePath('/ingredient-sources')
    return { ok: true, created, total }
  } catch (err) {
    return { ok: false, error: `Sync failed: ${(err as Error).message}` }
  }
}
