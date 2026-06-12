// Ingredient data-source configuration reader (Pavel 2026-06-11). Each external
// ingredient source (USDA · DSLD · INCI · AAFCO · LIBRARY · PARTNER_PRIVATE) has
// an admin-managed mode — MIRROR (DB copy) · LIVE (external API) · HYBRID (live
// discovery + snapshot) — with auto-failover to the mirrored DB copy when a LIVE
// API is unreachable. The search adapter reads this. Cast-guarded + defaulted so
// it is always safe to call before the migration lands / a row exists.
// See docs/PRODUCT_DOMAINS_ARCHITECTURE.md §5.

import { prisma } from './index'

export type IngredientSource = 'USDA' | 'LIBRARY' | 'PARTNER_PRIVATE' | 'DSLD' | 'INCI' | 'AAFCO'
export type IngredientSourceMode = 'MIRROR' | 'LIVE' | 'HYBRID'
export type LabelingTypeKey = 'FOOD' | 'DIETARY_SUPPLEMENT' | 'PET_PRODUCT' | 'OTC' | 'COSMETIC'

export interface IngredientSourceConfigValues {
  source: IngredientSource
  mode: IngredientSourceMode
  failoverToDb: boolean
  enabled: boolean
  apiBaseUrl: string | null
  rateLimitPerMin: number
  syncCron: string | null
  lastSyncedAt: Date | null
  rowCount: number
  labelingTypes: LabelingTypeKey[]
  notes: string | null
}

/** Sensible defaults per source (used until an admin row overrides them). */
export const INGREDIENT_SOURCE_DEFAULTS: Record<IngredientSource, IngredientSourceConfigValues> = {
  USDA: {
    source: 'USDA', mode: 'MIRROR', failoverToDb: true, enabled: true,
    apiBaseUrl: 'https://api.nal.usda.gov/fdc/v1/', rateLimitPerMin: 60, syncCron: null,
    lastSyncedAt: null, rowCount: 0, labelingTypes: ['FOOD'], notes: null,
  },
  LIBRARY: {
    source: 'LIBRARY', mode: 'MIRROR', failoverToDb: true, enabled: true,
    apiBaseUrl: null, rateLimitPerMin: 0, syncCron: null,
    lastSyncedAt: null, rowCount: 0, labelingTypes: ['FOOD', 'DIETARY_SUPPLEMENT', 'COSMETIC', 'PET_PRODUCT'], notes: 'iLaunchify-curated, all domains',
  },
  PARTNER_PRIVATE: {
    source: 'PARTNER_PRIVATE', mode: 'MIRROR', failoverToDb: true, enabled: true,
    apiBaseUrl: null, rateLimitPerMin: 0, syncCron: null,
    lastSyncedAt: null, rowCount: 0, labelingTypes: ['FOOD', 'DIETARY_SUPPLEMENT', 'COSMETIC', 'PET_PRODUCT'], notes: 'Partner-uploaded, scoped per partner',
  },
  DSLD: {
    // Pavel: hybrid by default for DSLD — live discovery, mirror chosen rows.
    source: 'DSLD', mode: 'HYBRID', failoverToDb: true, enabled: true,
    apiBaseUrl: 'https://api.ods.od.nih.gov/dsld/v9/', rateLimitPerMin: 60, syncCron: null,
    lastSyncedAt: null, rowCount: 0, labelingTypes: ['DIETARY_SUPPLEMENT'], notes: 'NIH Dietary Supplement Label Database',
  },
  INCI: {
    source: 'INCI', mode: 'MIRROR', failoverToDb: true, enabled: false, // Phase 2
    apiBaseUrl: null, rateLimitPerMin: 60, syncCron: null,
    lastSyncedAt: null, rowCount: 0, labelingTypes: ['COSMETIC'], notes: 'Cosmetic INCI dictionary (Phase 2)',
  },
  AAFCO: {
    source: 'AAFCO', mode: 'MIRROR', failoverToDb: true, enabled: false, // Phase 3
    apiBaseUrl: null, rateLimitPerMin: 60, syncCron: null,
    lastSyncedAt: null, rowCount: 0, labelingTypes: ['PET_PRODUCT'], notes: 'AAFCO feed-ingredient library (Phase 3)',
  },
}

export const INGREDIENT_SOURCES: IngredientSource[] = ['USDA', 'LIBRARY', 'PARTNER_PRIVATE', 'DSLD', 'INCI', 'AAFCO']

type ConfigRow = Partial<IngredientSourceConfigValues> & { source: IngredientSource }

/** All source configs, merged over defaults (so every source always appears). */
export async function getIngredientSourceConfigs(): Promise<IngredientSourceConfigValues[]> {
  let rows: ConfigRow[] = []
  try {
    rows = await (prisma as unknown as {
      ingredientSourceConfig: { findMany: (a?: unknown) => Promise<ConfigRow[]> }
    }).ingredientSourceConfig.findMany().catch(() => [] as ConfigRow[])
  } catch {
    rows = []
  }
  const byId = new Map(rows.map((r) => [r.source, r]))
  return INGREDIENT_SOURCES.map((s) => ({ ...INGREDIENT_SOURCE_DEFAULTS[s], ...(byId.get(s) ?? {}) }))
}

/** Effective config for one source (admin row over default). */
export async function resolveIngredientSource(source: IngredientSource): Promise<IngredientSourceConfigValues> {
  try {
    const row = await (prisma as unknown as {
      ingredientSourceConfig: { findUnique: (a: unknown) => Promise<ConfigRow | null> }
    }).ingredientSourceConfig.findUnique({ where: { source } }).catch(() => null)
    return { ...INGREDIENT_SOURCE_DEFAULTS[source], ...(row ?? {}) }
  } catch {
    return INGREDIENT_SOURCE_DEFAULTS[source]
  }
}
