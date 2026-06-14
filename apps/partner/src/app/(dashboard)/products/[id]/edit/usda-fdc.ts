// USDA FoodData Central (FDC) live adapter — server-only. Lets ingredient search
// reach the full USDA catalog instead of only the seeded mirror, per the source
// mode (LIVE / HYBRID) in packages/db ingredient-sources. Free government API:
// needs a free data.gov key (USDA_FDC_API_KEY; DEMO_KEY fallback for testing).
// 1,000 req/hr per IP. Everything fails SOFT — any error returns empty / null so
// search falls back to the DB mirror.
//
// docs: https://fdc.nal.usda.gov/api-guide

import { resolveIngredientSource } from '@ilaunchify/db'

const FDC_BASE = 'https://api.nal.usda.gov/fdc/v1'
const TIMEOUT_MS = 5000

function apiKey(): string {
  return process.env.USDA_FDC_API_KEY || 'DEMO_KEY'
}

/** USDA live search is active only when the admin source mode is LIVE or HYBRID
 *  (and the source is enabled). MIRROR → DB only. */
export async function usdaLiveMode(): Promise<'LIVE' | 'HYBRID' | null> {
  try {
    const cfg = await resolveIngredientSource('USDA')
    if (!cfg.enabled) return null
    return cfg.mode === 'LIVE' || cfg.mode === 'HYBRID' ? cfg.mode : null
  } catch {
    return null
  }
}

// FDC nutrient NUMBER → our per-100g engine keys (21 CFR 101.9 panel set).
const NUTRIENT_MAP: Record<string, string> = {
  '208': 'calories',
  '204': 'totalFat',
  '606': 'saturatedFat',
  '605': 'transFat',
  '601': 'cholesterol',
  '307': 'sodium',
  '205': 'totalCarbohydrate',
  '291': 'dietaryFiber',
  '269': 'totalSugars',
  '539': 'addedSugars',
  '203': 'protein',
  '328': 'vitaminD',
  '301': 'calcium',
  '303': 'iron',
  '306': 'potassium',
}

// FDC returns two shapes: search → { nutrientNumber, value }; detail →
// { nutrient: { number }, amount }. Normalise both to per-100g (FDC foodNutrients
// are per 100 g for Foundation/SR/Branded-derived rows).
function mapNutrients(foodNutrients: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!Array.isArray(foodNutrients)) return out
  for (const fn of foodNutrients as Array<Record<string, unknown>>) {
    const number = String(
      (fn.nutrientNumber as string | number | undefined) ??
        ((fn.nutrient as Record<string, unknown> | undefined)?.number as string | number | undefined) ??
        '',
    )
    const key = NUTRIENT_MAP[number]
    if (!key) continue
    const raw = (fn.value as number | undefined) ?? (fn.amount as number | undefined)
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw
  }
  return out
}

async function fdcFetch(path: string): Promise<unknown | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const sep = path.includes('?') ? '&' : '?'
    const res = await fetch(`${FDC_BASE}${path}${sep}api_key=${encodeURIComponent(apiKey())}`, {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export interface UsdaFood {
  fdcId: number
  description: string
  per100g: Record<string, number>
}

/** Search FDC by name. Returns [] on any failure (→ DB-only fallback). */
export async function searchUsdaFoods(query: string, limit: number): Promise<UsdaFood[]> {
  const q = query.trim()
  if (!q) return []
  const data = (await fdcFetch(
    `/foods/search?query=${encodeURIComponent(q)}&pageSize=${Math.min(limit, 25)}&dataType=Foundation,SR%20Legacy,Branded`,
  )) as { foods?: Array<Record<string, unknown>> } | null
  if (!data || !Array.isArray(data.foods)) return []
  return data.foods
    .map((f) => ({
      fdcId: Number(f.fdcId),
      description: String(f.description ?? '').trim(),
      per100g: mapNutrients(f.foodNutrients),
    }))
    .filter((f) => Number.isFinite(f.fdcId) && f.description.length > 0)
}

/** Fetch one FDC food's per-100g profile (for materialize-on-pick). */
export async function fetchUsdaFood(fdcId: number): Promise<UsdaFood | null> {
  const data = (await fdcFetch(`/food/${fdcId}`)) as Record<string, unknown> | null
  if (!data || !data.description) return null
  return {
    fdcId,
    description: String(data.description).trim(),
    per100g: mapNutrients(data.foodNutrients),
  }
}
