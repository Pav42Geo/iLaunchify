'use server'

// Mode 2 — AI Recipe Parser server actions.
// Brief: docs/builds/ingredients-ai-parser-slice-3.md.
// Numbers (caps, rate limits, input cap) locked in
// docs/builds/ai-recipe-parser-economics.md — source of truth.
//
// parseRecipeFromText: gate (partner plan feature) → rate-limit → retrieve →
// Haiku → audit. Does NOT write slots. commitParsedSlots: writes the accepted
// lines via the existing addIngredientSlot (so Slice 1 banned-list enforcement
// + audit + reapproval all fire automatically).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { hasFeature, getFeatureLimit, partnerTierToPlanCode } from '@ilaunchify/plans'
import { parseRecipe, type IngredientCandidate, type ParsedRecipeResult } from '@ilaunchify/ai'
import { searchIngredients } from '../[id]/edit/ingredient-actions'
import { setRecipeEntryMode } from '../[id]/edit/card-actions'

// Rate-limit windows (economics §7.2). Monthly cap comes from the plan feature.
const MINUTE_LIMIT = 10
const DAY_LIMIT = 100

type ParseError =
  | 'not-a-partner'
  | 'forbidden'
  | 'upgrade-required'
  | 'rate-limit-minute'
  | 'rate-limit-day'
  | 'cap-reached'
  | 'input-too-large'
  | 'parse-failed'

export type ParseRecipeResponse =
  | { ok: true; result: ParsedRecipeResult }
  | { ok: false; error: ParseError; used?: number; cap?: number }

// -----------------------------------------------------------------------------
// Ownership — local to this file (mirrors card-actions.authorize but also
// selects partner.tier, which the plan-feature gate needs). Kept local so the
// already-shipped card-actions stays untouched.
// -----------------------------------------------------------------------------

async function authorizeParser(productTemplateId: string) {
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return { user: null, partner: null, template: null, error: 'not-a-partner' as const }
  }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, tier: true },
  })
  if (!partner) {
    return { user, partner: null, template: null, error: 'forbidden' as const }
  }
  const template = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    select: { id: true, manufacturerServiceId: true, status: true },
  })
  if (!template || template.status === 'REJECTED') {
    return { user, partner, template: null, error: 'forbidden' as const }
  }
  if (template.manufacturerServiceId) {
    const owned = await prisma.partnerService.findFirst({
      where: { id: template.manufacturerServiceId, partnerId: partner.id },
      select: { id: true },
    })
    if (!owned) {
      return { user, partner, template: null, error: 'forbidden' as const }
    }
  }
  return { user, partner, template, error: null as null }
}

// -----------------------------------------------------------------------------
// parseRecipeFromText — gate + rate-limit + parse. No slot writes.
// -----------------------------------------------------------------------------

export async function parseRecipeFromText(
  productTemplateId: string,
  rawText: string,
): Promise<ParseRecipeResponse> {
  const { user, partner, template, error } = await authorizeParser(productTemplateId)
  if (error) return { ok: false, error }

  const planCode = partnerTierToPlanCode(
    partner.tier.toLowerCase() as 'verified' | 'trusted' | 'premier',
  )

  // Partner-plan feature gate (Pavel 2026-06-01: Trusted+ — verified off).
  if (!(await hasFeature(planCode, 'ai_recipe_parser'))) {
    return { ok: false, error: 'upgrade-required' }
  }
  const monthlyCap = (await getFeatureLimit(planCode, 'ai_recipe_parser_monthly_cap')) ?? 0

  // Three-window rate check (count RECIPE_PARSE_RUN audit rows for this user).
  const [minuteCount, dayCount, monthCount] = await Promise.all([
    countParsesSince(user.id, new Date(Date.now() - 60_000)),
    countParsesSince(user.id, new Date(Date.now() - 86_400_000)),
    countParsesThisMonth(user.id),
  ])
  if (minuteCount >= MINUTE_LIMIT) {
    await logRateLimit(user, productTemplateId, 'minute')
    return { ok: false, error: 'rate-limit-minute' }
  }
  if (dayCount >= DAY_LIMIT) {
    await logRateLimit(user, productTemplateId, 'day')
    return { ok: false, error: 'rate-limit-day' }
  }
  if (monthlyCap <= 0 || monthCount >= monthlyCap) {
    await logRateLimit(user, productTemplateId, 'month')
    return { ok: false, error: 'cap-reached', used: monthCount, cap: monthlyCap }
  }

  try {
    const result = await parseRecipe({
      rawText,
      ingredientSearchFn: ingredientSearchAdapter,
    })

    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: template.id,
      action: 'RECIPE_PARSE_RUN',
      payload: {
        partnerId: partner.id,
        lineCount: result.lines.length,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        cacheReadTokens: result.cacheReadTokens,
        cacheWriteTokens: result.cacheWriteTokens,
        estimatedCostUsd: result.estimatedCostUsd,
        modelUsed: result.modelUsed,
      },
    })
    return { ok: true, result }
  } catch (err) {
    const message = (err as Error).message
    if (message === 'input-too-large') {
      return { ok: false, error: 'input-too-large' }
    }
    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: template.id,
      action: 'RECIPE_PARSE_FAILED',
      payload: { partnerId: partner.id, error: message },
    })
    return { ok: false, error: 'parse-failed' }
  }
}

/** Adapter: top-N ingredient candidates for one line via the existing search. */
const ingredientSearchAdapter = async (
  query: string,
  limit: number,
): Promise<IngredientCandidate[]> => {
  const res = await searchIngredients({ query, limit })
  if (!res.ok) return []
  return res.data.results.map((r) => ({
    id: r.id,
    name: r.internalName,
    // The food recipe parser only deals with food sources; non-food catalogs
    // (DSLD/INCI/AAFCO) never surface here, so narrow to the food tag union.
    source: r.source === 'USDA' || r.source === 'PARTNER_PRIVATE' ? r.source : 'LIBRARY',
    labelDeclarationName: r.labelDeclarationName,
    allergenFlags: r.allergenFlags,
  }))
}

// -----------------------------------------------------------------------------
// commitParsedSlots — stamp AI_PARSER as the recipe's primary method + audit.
//
// In the guided builder, the accepted lines are seeded into the live recipe
// client-side (RecipeBuilderStep) and persisted through the builder's single
// write path (saveRecipeSlots autosave) — so this action does NOT re-write the
// slots, avoiding a double write. Banned ingredients are already blocked at the
// review stage (accept toggle disabled) and again at submit by the restricted-
// source gate, so per-line commit enforcement is redundant here.
// -----------------------------------------------------------------------------

export async function commitParsedSlots(
  productTemplateId: string,
  acceptedLines: Array<{ ingredientId: string; weightG: number; lineNumber: number }>,
): Promise<{ ok: boolean; error?: ParseError; committed?: number }> {
  const { user, partner, error } = await authorizeParser(productTemplateId)
  if (error) return { ok: false, error }

  await setRecipeEntryMode(productTemplateId, 'AI_PARSER')

  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: productTemplateId,
    action: 'RECIPE_PARSE_COMMIT',
    payload: { partnerId: partner.id, committed: acceptedLines.length },
  })

  return { ok: true, committed: acceptedLines.length }
}

// -----------------------------------------------------------------------------
// Rate-limit counting (V1 — count AuditLog rows; economics §8 may add a
// dedicated counter at scale). AuditLog timestamp column is `at`, actor is
// `actorId`.
// -----------------------------------------------------------------------------

function countParsesSince(userId: string, since: Date): Promise<number> {
  return prisma.auditLog.count({
    where: { actorId: userId, action: 'RECIPE_PARSE_RUN', at: { gte: since } },
  })
}

function countParsesThisMonth(userId: string): Promise<number> {
  const now = new Date()
  const startOfMonthUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return prisma.auditLog.count({
    where: { actorId: userId, action: 'RECIPE_PARSE_RUN', at: { gte: startOfMonthUtc } },
  })
}

function logRateLimit(
  user: { id: string; role: 'ADMIN' | 'CREATOR' | 'PARTNER' },
  productTemplateId: string,
  window: 'minute' | 'day' | 'month',
): Promise<void> {
  return logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: productTemplateId,
    action: 'RECIPE_PARSE_RATE_LIMITED',
    payload: { window },
  })
}
