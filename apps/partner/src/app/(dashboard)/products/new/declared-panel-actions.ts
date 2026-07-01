'use server'

// Mode 3 — Declare nutrition/supplement panel directly.
// Brief: docs/builds/ingredients-declared-panel-slice-4.md.
//
// Locked pattern: one synthetic "Whole Product" PARTNER_PRIVATE Ingredient holds
// the declared values; it becomes the product's ONLY slot. Big-9 allergens, BE
// flag, banned-list, audit + reapproval all keep working off the slot's
// Ingredient row. ProductTemplate.nutrientSource flips to DECLARED and
// declaredPanel stores the exact typed PanelData + statement + net qty + allergens
// (so the label renders faithfully — the "Declared by manufacturer" disclosure is
// the FDA_REGULATORY_POSTURE §5 bridge).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import type { PanelData } from '@ilaunchify/types'
import { revalidatePath } from 'next/cache'

export interface DeclarePanelInput {
  panel: PanelData
  ingredientStatement: string
  netQuantity: string
  allergens: string[]
}

type DeclareError = 'not-a-partner' | 'forbidden' | 'upgrade-required'

export type DeclarePanelResponse =
  | { ok: true; syntheticIngredientId: string }
  | { ok: false; error: DeclareError }

async function authorizeDeclare(productTemplateId: string) {
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
    select: { id: true, name: true, manufacturerServiceId: true, status: true },
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

export async function declareNutritionPanel(
  productTemplateId: string,
  input: DeclarePanelInput,
): Promise<DeclarePanelResponse> {
  const { user, partner, template, error } = await authorizeDeclare(productTemplateId)
  if (error) return { ok: false, error }

  // Declaring your own label is the basic, low-friction path — available on every
  // partner tier (un-gated 2026-06-27). The panel stays manufacturer-attested.

  // Synthetic ingredient's canonical nutrient store — derive from the numeric
  // panel rows (keyed by row id). Per-serving values; for DECLARED mode the
  // platform never re-sums these, so the basis convention is informational.
  const nutritionPer100g: Record<string, number> = {}
  for (const row of input.panel.rows) {
    if (typeof row.amount === 'number') nutritionPer100g[row.id] = row.amount
  }

  const syntheticName = `__declared_panel__${productTemplateId}`
  const gateForReview = template.status === 'PUBLISHED'

  const syntheticIngredientId = await prisma.$transaction(async (tx) => {
    // 1. Upsert the synthetic Whole Product ingredient (one per template).
    const existing = await tx.ingredient.findFirst({
      where: { ownerPartnerId: partner.id, isDeclaredPanelSynthetic: true, name: syntheticName },
      select: { id: true },
    })
    let syntheticId: string
    if (existing) {
      await tx.ingredient.update({
        where: { id: existing.id },
        data: { nutritionPer100g, allergenFlags: input.allergens, allergens: input.allergens },
      })
      syntheticId = existing.id
    } else {
      const created = await tx.ingredient.create({
        data: {
          name: syntheticName,
          internalName: `Declared panel — ${template.name}`,
          labelDeclarationName: 'Whole product (declared)',
          nutritionPer100g,
          source: 'PARTNER_PRIVATE',
          ownerPartnerId: partner.id,
          verificationStatus: 'SELF_ATTESTED',
          createdById: user.id,
          isDeclaredPanelSynthetic: true,
          allergenFlags: input.allergens,
          allergens: input.allergens,
        },
        select: { id: true },
      })
      syntheticId = created.id
    }

    // 2. Replace all slots (+ their replacements) with the single synthetic slot.
    await tx.templateIngredientReplacement.deleteMany({
      where: { slot: { productTemplateId } },
    })
    await tx.templateIngredientSlot.deleteMany({ where: { productTemplateId } })
    await tx.templateIngredientSlot.create({
      data: {
        productTemplateId,
        baseIngredientId: syntheticId,
        weightG: 100, // 100g basis matches the nutritionPer100g convention
        allowReplacement: false,
        displayOrder: 0,
        label: 'Declared panel (whole product)',
      },
    })

    // 3. Flip the product to DECLARED + store the exact typed panel. Here we DO
    // overwrite recipeEntryMode (unlike incremental adds) — declaring replaces
    // the whole recipe, so DECLARED_PANEL is the true primary method.
    await tx.productTemplate.update({
      where: { id: productTemplateId },
      data: {
        nutrientSource: 'DECLARED',
        recipeEntryMode: 'DECLARED_PANEL',
        declaredPanel: {
          panel: input.panel,
          ingredientStatement: input.ingredientStatement,
          netQuantity: input.netQuantity,
          allergens: input.allergens,
        } as unknown as object,
        ...(gateForReview ? { status: 'PENDING_EDIT_REVIEW' } : {}),
      },
    })

    return syntheticId
  })

  // Audit after the transaction (logAuditAs uses the base client, not tx).
  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: productTemplateId,
    action: 'DECLARE_NUTRITION_PANEL',
    fromValue: template.status,
    toValue: gateForReview ? 'PENDING_EDIT_REVIEW' : template.status,
    payload: {
      partnerId: partner.id,
      format: input.panel.format,
      nutrientCount: input.panel.rows.length,
      allergenCount: input.allergens.length,
      gatedForReview: gateForReview,
    },
  })

  revalidatePath('/products/new')
  return { ok: true, syntheticIngredientId }
}

// ── Per-flavor declared panel ("I already have my data", per-flavor) ──────────
// Mirrors declareNutritionPanel but scoped to ONE FlavorPreset: replaces that
// flavor's FlavorRecipeSlots (+ replacements + optionals) with a single synthetic
// "Whole flavor (declared)" slot and stores the typed panel on
// FlavorPreset.declaredPanel. The product-level nutrientSource is NOT touched —
// only this flavor becomes declared; other flavors / the base keep their mode.
export async function declareFlavorNutritionPanel(
  flavorPresetId: string,
  input: DeclarePanelInput,
): Promise<DeclarePanelResponse> {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false, error: 'not-a-partner' }

  // Resolve the flavor → its template, then reuse the template ownership check.
  const preset = await (
    prisma as unknown as {
      flavorPreset: {
        findUnique: (a: unknown) => Promise<{ id: string; name: string; productTemplateId: string } | null>
      }
    }
  ).flavorPreset
    .findUnique({ where: { id: flavorPresetId }, select: { id: true, name: true, productTemplateId: true } })
    .catch(() => null)
  if (!preset) return { ok: false, error: 'forbidden' }

  const { partner, template, error } = await authorizeDeclare(preset.productTemplateId)
  if (error) return { ok: false, error }

  const nutritionPer100g: Record<string, number> = {}
  for (const row of input.panel.rows) {
    if (typeof row.amount === 'number') nutritionPer100g[row.id] = row.amount
  }

  const syntheticName = `__declared_flavor_panel__${flavorPresetId}`
  const gateForReview = template.status === 'PUBLISHED'

  const syntheticIngredientId = await prisma.$transaction(async (tx) => {
    // 1. Upsert the synthetic per-flavor ingredient (one per flavor).
    const existing = await tx.ingredient.findFirst({
      where: { ownerPartnerId: partner.id, isDeclaredPanelSynthetic: true, name: syntheticName },
      select: { id: true },
    })
    let syntheticId: string
    if (existing) {
      await tx.ingredient.update({
        where: { id: existing.id },
        data: { nutritionPer100g, allergenFlags: input.allergens, allergens: input.allergens },
      })
      syntheticId = existing.id
    } else {
      const created = await tx.ingredient.create({
        data: {
          name: syntheticName,
          internalName: `Declared flavor — ${preset.name}`,
          labelDeclarationName: 'Whole flavor (declared)',
          nutritionPer100g,
          source: 'PARTNER_PRIVATE',
          ownerPartnerId: partner.id,
          verificationStatus: 'SELF_ATTESTED',
          createdById: user.id,
          isDeclaredPanelSynthetic: true,
          allergenFlags: input.allergens,
          allergens: input.allergens,
        },
        select: { id: true },
      })
      syntheticId = created.id
    }

    // 2. Replace THIS flavor's recipe (slots + their replacements + optionals)
    //    with the single synthetic slot. Cast-guarded — FlavorRecipe* + the
    //    declaredPanel column post-date the generated client until the migration.
    const ftx = tx as unknown as {
      flavorRecipeReplacement: { deleteMany: (a: unknown) => Promise<unknown> }
      flavorRecipeSlot: { deleteMany: (a: unknown) => Promise<unknown>; create: (a: unknown) => Promise<unknown> }
      flavorRecipeOptional: { deleteMany: (a: unknown) => Promise<unknown> }
      flavorPreset: { update: (a: unknown) => Promise<unknown> }
    }
    await ftx.flavorRecipeReplacement.deleteMany({ where: { slot: { flavorPresetId } } })
    await ftx.flavorRecipeSlot.deleteMany({ where: { flavorPresetId } })
    await ftx.flavorRecipeOptional.deleteMany({ where: { flavorPresetId } })
    await ftx.flavorRecipeSlot.create({
      data: {
        flavorPresetId,
        baseIngredientId: syntheticId,
        weightG: 100, // 100g basis matches the nutritionPer100g convention
        allowReplacement: false,
        displayOrder: 0,
        label: 'Declared panel (whole flavor)',
      },
    })

    // 3. Store the typed panel on the flavor.
    await ftx.flavorPreset.update({
      where: { id: flavorPresetId },
      data: {
        declaredPanel: {
          panel: input.panel,
          ingredientStatement: input.ingredientStatement,
          netQuantity: input.netQuantity,
          allergens: input.allergens,
        } as unknown as object,
      },
    })

    // 4. A declared flavor change on a live product still gates for review.
    if (gateForReview) {
      await tx.productTemplate.update({
        where: { id: preset.productTemplateId },
        data: { status: 'PENDING_EDIT_REVIEW' },
      })
    }

    return syntheticId
  })

  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: preset.productTemplateId,
    action: 'DECLARE_NUTRITION_PANEL',
    fromValue: template.status,
    toValue: gateForReview ? 'PENDING_EDIT_REVIEW' : template.status,
    payload: {
      partnerId: partner.id,
      flavorPresetId,
      flavorName: preset.name,
      format: input.panel.format,
      nutrientCount: input.panel.rows.length,
      allergenCount: input.allergens.length,
      gatedForReview: gateForReview,
    },
  })

  revalidatePath('/products/new')
  return { ok: true, syntheticIngredientId }
}
