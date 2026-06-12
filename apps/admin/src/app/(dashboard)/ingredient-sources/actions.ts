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
