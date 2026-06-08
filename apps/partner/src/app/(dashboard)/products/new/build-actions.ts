'use server'

// Guided builder actions (2026-06-08). The 6-step turnkey builder creates the
// DRAFT ProductTemplate up front (after Basics) so each subsequent step can
// autosave into real DB rows via the existing editor cards. Kept in its own
// file (not products/actions.ts) to stay off Code's hot path.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function requirePartner() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { user, partner: null as null, error: 'Not a partner account.' }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      services: { where: { type: 'MANUFACTURING' }, select: { id: true }, take: 1 },
    },
  })
  if (!partner) return { user, partner: null as null, error: 'Partner profile not found.' }
  return { user, partner, error: null as null }
}

export interface CreateDraftShellInput {
  name: string
  subcategoryId: string
}

/** Fetch the nutrient panel for a picked ingredient (the IngredientPicker only
 *  returns id/name/density). Feeds the live FDA-label engine in the recipe step. */
export async function getIngredientNutrition(
  id: string,
): Promise<Result<{ name: string; per100g: Record<string, number>; densityGPerMl: number | null; allergens: string[] }>> {
  try {
    const ing = await prisma.ingredient.findUnique({
      where: { id },
      select: { internalName: true, name: true, nutritionPer100g: true, densityGPerML: true, allergenFlags: true },
    })
    if (!ing) return { ok: false, error: 'Ingredient not found.' }
    return {
      ok: true,
      data: {
        name: ing.internalName ?? ing.name,
        per100g: (ing.nutritionPer100g ?? {}) as Record<string, number>,
        densityGPerMl: ing.densityGPerML,
        allergens: ing.allergenFlags ?? [],
      },
    }
  } catch (err) {
    return { ok: false, error: `Could not load ingredient: ${(err as Error).message}` }
  }
}

export interface SlotInput { ingredientId: string; weightG: number; displayOrder: number }

/** Replace the draft's base ingredient slots (real-picked ingredients only). */
export async function saveRecipeSlots(productTemplateId: string, slots: SlotInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    // Validate the ingredient ids are visible to this partner.
    const ids = [...new Set(slots.map((s) => s.ingredientId))]
    const visible = ids.length
      ? await prisma.ingredient.findMany({
          where: {
            id: { in: ids }, isDeclaredPanelSynthetic: false,
            OR: [{ source: 'USDA' }, { source: 'LIBRARY' }, { source: 'PARTNER_PRIVATE', ownerPartnerId: partner.id }],
          },
          select: { id: true },
        })
      : []
    const okIds = new Set(visible.map((v) => v.id))
    const valid = slots.filter((s) => okIds.has(s.ingredientId) && s.weightG > 0)

    await prisma.$transaction([
      prisma.templateIngredientSlot.deleteMany({ where: { productTemplateId } }),
      ...valid.map((s) =>
        prisma.templateIngredientSlot.create({
          data: { productTemplateId, baseIngredientId: s.ingredientId, weightG: s.weightG, displayOrder: s.displayOrder },
        }),
      ),
    ])
    return { ok: true }
  } catch (err) {
    console.error('[saveRecipeSlots] failed:', err)
    return { ok: false, error: `Could not save recipe: ${(err as Error).message}` }
  }
}

export interface OptionValueInput {
  label: string
  isDefault: boolean
  leadTimeDeltaDays: number
  unitCostDeltaCents: number
  moqOverride: number | null
  priceDeltaCents: number
  // §12b ingredient operation (bound in the Recipe step). Defaults NONE.
  overlayOp?: 'NONE' | 'SWAP' | 'ADD' | 'REMOVE'
  recipeOverlay?: unknown | null
  sortOrder: number
}
export interface OptionAxisInput {
  key: string // OptionAxisKey
  label: string
  layer: 'RECIPE' | 'PACKAGING'
  editableByCreator: boolean
  affectsLabel: boolean // true → values change the recipe → engine recomputes the Facts label
  boundSlotId?: string | null // SWAP/REMOVE axes bind to one base recipe slot
  required: boolean
  sortOrder: number
  values: OptionValueInput[]
}

/**
 * Replace the draft's configurable option axes (non-flavor: sweetener, strength,
 * caffeine, custom). The FLAVOR axis lives in its own flavor table. Each value
 * carries compositional deltas. Cast-guarded: ProductOptionAxis/Value land on the
 * client only after the Phase-1 migration (docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md).
 */
export async function saveOptionAxes(productTemplateId: string, axes: OptionAxisInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    // Keep only axes with a name + at least one named value.
    const clean = axes
      .map((a, i) => ({
        ...a,
        label: a.label.trim(),
        sortOrder: a.sortOrder ?? i,
        values: a.values
          .map((v, j) => ({ ...v, label: v.label.trim(), sortOrder: v.sortOrder ?? j }))
          .filter((v) => v.label.length > 0),
      }))
      .filter((a) => a.label.length > 0 && a.values.length > 0)
      .map((a) => ({
        ...a,
        // Guarantee exactly one default per axis.
        values: a.values.some((v) => v.isDefault)
          ? a.values
          : a.values.map((v, j) => ({ ...v, isDefault: j === 0 })),
      }))

    // ProductOptionAxis/Value are not in the generated client until migration.
    const p = prisma as unknown as {
      productOptionAxis: {
        deleteMany: (a: unknown) => Promise<unknown>
        create: (a: unknown) => Promise<unknown>
      }
    }
    await p.productOptionAxis.deleteMany({ where: { productTemplateId } })
    for (const a of clean) {
      await p.productOptionAxis.create({
        data: {
          productTemplateId,
          key: a.key,
          label: a.label,
          layer: a.layer,
          editableByCreator: a.editableByCreator,
          affectsLabel: a.affectsLabel,
          boundSlotId: a.boundSlotId ?? null,
          required: a.required,
          sortOrder: a.sortOrder,
          values: {
            create: a.values.map((v) => ({
              label: v.label,
              isDefault: v.isDefault,
              leadTimeDeltaDays: Math.max(0, Math.floor(v.leadTimeDeltaDays || 0)),
              unitCostDeltaCents: Math.floor(v.unitCostDeltaCents || 0),
              moqOverride: v.moqOverride == null ? null : Math.max(1, Math.floor(v.moqOverride)),
              priceDeltaCents: Math.floor(v.priceDeltaCents || 0),
              overlayOp: v.overlayOp ?? 'NONE',
              recipeOverlay: v.recipeOverlay ?? undefined,
              sortOrder: v.sortOrder,
            })),
          },
        },
      })
    }
    return { ok: true }
  } catch (err) {
    console.error('[saveOptionAxes] failed:', err)
    return { ok: false, error: `Could not save options: ${(err as Error).message}` }
  }
}

export interface ChangeApprovalRuleInput {
  changeType: 'LABEL_COPY' | 'FLAVOR_ADD' | 'RECIPE_CHANGE' | 'PACKAGING_CHANGE' | 'PRICE_CHANGE'
  requiredApprover: 'BRAND_OPS' | 'MANUFACTURER_QA' | 'LEGAL' | 'PRODUCTION_SCHEDULING'
  sortOrder: number
}

/** Replace the draft's per-template approval-trigger overrides (#7). Cast-guarded. */
export async function saveChangeApprovalRules(productTemplateId: string, rules: ChangeApprovalRuleInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const p = prisma as unknown as { productChangeApprovalRule: { deleteMany: (a: unknown) => Promise<unknown>; createMany: (a: unknown) => Promise<unknown> } }
    await p.productChangeApprovalRule.deleteMany({ where: { productTemplateId } })
    if (rules.length) {
      await p.productChangeApprovalRule.createMany({
        data: rules.map((r, i) => ({ productTemplateId, changeType: r.changeType, requiredApprover: r.requiredApprover, sortOrder: r.sortOrder ?? i })),
      })
    }
    return { ok: true }
  } catch (err) {
    console.error('[saveChangeApprovalRules] failed:', err)
    return { ok: false, error: `Could not save approval rules: ${(err as Error).message}` }
  }
}

export interface OptionRuleInput {
  kind: 'EXCLUDE' | 'REQUIRE'
  whenValueId: string // composite "axisKey:valueLabel" (whenValueId/targetValueId are plain strings)
  targetValueId: string
  message: string | null
}

/** Replace the draft's cross-option compatibility rules (#5). Endpoints are
 *  composite axisKey:valueLabel keys (id-churn-safe). Cast-guarded. */
export async function saveOptionRules(productTemplateId: string, rules: OptionRuleInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const clean = rules.filter((r) => r.whenValueId && r.targetValueId && r.whenValueId !== r.targetValueId)
    const p = prisma as unknown as { productOptionRule: { deleteMany: (a: unknown) => Promise<unknown>; createMany: (a: unknown) => Promise<unknown> } }
    await p.productOptionRule.deleteMany({ where: { productTemplateId } })
    if (clean.length) {
      await p.productOptionRule.createMany({
        data: clean.map((r) => ({ productTemplateId, kind: r.kind, whenValueId: r.whenValueId, targetValueId: r.targetValueId, message: r.message?.trim() || null })),
      })
    }
    return { ok: true }
  } catch (err) {
    console.error('[saveOptionRules] failed:', err)
    return { ok: false, error: `Could not save compatibility rules: ${(err as Error).message}` }
  }
}

export interface FeeInput {
  label: string
  basis: 'PER_UNIT' | 'PER_SKU_ONE_TIME' | 'PER_ORDER'
  amountCents: number
  waivedAboveQty: number | null
  sortOrder: number
}

/** Replace the draft's one-time / per-unit / per-order fees (#3). Cast-guarded:
 *  ProductTemplateFee lands on the client after the Phase-1 migration. */
export async function saveFees(productTemplateId: string, fees: FeeInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    const clean = fees
      .map((f, i) => ({ ...f, label: f.label.trim(), sortOrder: f.sortOrder ?? i }))
      .filter((f) => f.label.length > 0 && f.amountCents > 0)

    const p = prisma as unknown as {
      productTemplateFee: {
        deleteMany: (a: unknown) => Promise<unknown>
        createMany: (a: unknown) => Promise<unknown>
      }
    }
    await p.productTemplateFee.deleteMany({ where: { productTemplateId } })
    if (clean.length) {
      await p.productTemplateFee.createMany({
        data: clean.map((f) => ({
          productTemplateId,
          label: f.label,
          basis: f.basis,
          amountCents: Math.max(0, Math.floor(f.amountCents)),
          waivedAboveQty: f.basis === 'PER_SKU_ONE_TIME' && f.waivedAboveQty ? Math.max(1, Math.floor(f.waivedAboveQty)) : null,
          sortOrder: f.sortOrder,
        })),
      })
    }
    return { ok: true }
  } catch (err) {
    console.error('[saveFees] failed:', err)
    return { ok: false, error: `Could not save fees: ${(err as Error).message}` }
  }
}

export interface FlavorInput { name: string; statementOfIdentity?: string | null; sortOrder: number }

/** Replace the draft's flavor presets (the variety pool). Only named flavors
 *  persist; each becomes a FlavorPreset with an empty slot overlay (the recipe
 *  step fills slotResolution later). Idempotent: full replace by template. */
export async function saveFlavors(productTemplateId: string, flavors: FlavorInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    const clean = flavors
      .map((f, i) => ({ name: f.name.trim(), soi: f.statementOfIdentity?.trim() || null, sortOrder: f.sortOrder ?? i }))
      .filter((f) => f.name.length > 0)

    await prisma.$transaction([
      prisma.flavorPreset.deleteMany({ where: { productTemplateId } }),
      ...clean.map((f) =>
        prisma.flavorPreset.create({
          data: {
            productTemplateId,
            name: f.name,
            statementOfIdentity: f.soi,
            sortOrder: f.sortOrder,
            slotResolution: [], // recipe step fills the overlay later
          },
        }),
      ),
    ])
    return { ok: true }
  } catch (err) {
    console.error('[saveFlavors] failed:', err)
    return { ok: false, error: `Could not save flavors: ${(err as Error).message}` }
  }
}

export interface BasicsPatch {
  name?: string
  familyCode?: string | null // base SKU
  description?: string | null // short
  longDescription?: string | null
  productType?: 'SINGLE' | 'MULTI_FLAVOR' | 'MULTI_PACK'
  packingProfileId?: string | null
  maxFlavorsPerPack?: number | null // multi-flavor variety cap; null = no cap
  // Phase 2 configurator (docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md §4,§5)
  storageClass?: 'AMBIENT' | 'CHILLED' | 'FROZEN'
  storageTempMinF?: number | null
  storageTempMaxF?: number | null
  leadTimeRepeatDays?: number | null
  leadTimeFirstRunDays?: number | null
  customMeta?: Array<{ key: string; value: string }> | null
}

/** Verify the partner owns the draft, then patch whitelisted Basics fields. */
export async function updateBasics(
  productTemplateId: string,
  patch: BasicsPatch,
): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    const data: Record<string, unknown> = {}
    if (patch.name !== undefined) {
      const n = patch.name.trim()
      if (n.length < 2 || n.length > 120) return { ok: false, error: 'Name must be 2–120 chars.' }
      data.name = n
    }
    if (patch.familyCode !== undefined) data.familyCode = patch.familyCode?.trim() || null
    if (patch.description !== undefined) data.description = patch.description?.trim() || null
    if (patch.longDescription !== undefined) data.longDescription = patch.longDescription?.trim() || null
    if (patch.productType !== undefined) data.productType = patch.productType
    if (patch.packingProfileId !== undefined) data.packingProfileId = patch.packingProfileId
    if (patch.maxFlavorsPerPack !== undefined) {
      const m = patch.maxFlavorsPerPack
      data.maxFlavorsPerPack = m == null ? null : Math.max(1, Math.floor(m))
    }
    if (patch.storageClass !== undefined) data.storageClass = patch.storageClass
    if (patch.storageTempMinF !== undefined) data.storageTempMinF = patch.storageTempMinF
    if (patch.storageTempMaxF !== undefined) data.storageTempMaxF = patch.storageTempMaxF
    if (patch.leadTimeRepeatDays !== undefined) data.leadTimeRepeatDays = patch.leadTimeRepeatDays == null ? null : Math.max(0, Math.floor(patch.leadTimeRepeatDays))
    if (patch.leadTimeFirstRunDays !== undefined) data.leadTimeFirstRunDays = patch.leadTimeFirstRunDays == null ? null : Math.max(0, Math.floor(patch.leadTimeFirstRunDays))
    if (patch.customMeta !== undefined) data.customMeta = patch.customMeta ?? undefined

    if (Object.keys(data).length === 0) return { ok: true }
    // `data` is built dynamically; the productType/longDescription fields exist
    // after `prisma db push` + `db:generate`. Cast keeps it green pre-generate.
    await prisma.productTemplate.update({ where: { id: productTemplateId }, data: data as never })
    revalidatePath('/products')
    return { ok: true }
  } catch (err) {
    console.error('[updateBasics] failed:', err)
    return { ok: false, error: `Could not save: ${(err as Error).message}` }
  }
}

/**
 * Create a minimal DRAFT ProductTemplate from Basics only. No ingredients /
 * packaging / variants yet — those are added in the guided builder steps. The
 * submit gate (≥1 ingredient + packaging + variant) still applies at submit.
 */
export async function createDraftShell(
  input: CreateDraftShellInput,
): Promise<Result<{ id: string; slug: string }>> {
  // Whole body guarded — a server action must always resolve to a Result
  // (never throw / never resolve undefined), or the client crashes on res.ok.
  try {
    const { user, partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const name = input.name.trim()
    if (name.length < 2 || name.length > 120) {
      return { ok: false, error: 'Product name must be 2–120 characters.' }
    }
    if (!input.subcategoryId) return { ok: false, error: 'Pick a category + subcategory.' }

    const subcat = await prisma.subcategory.findUnique({
      where: { id: input.subcategoryId },
      select: { id: true },
    })
    if (!subcat) return { ok: false, error: 'Subcategory not found.' }

    // Unique slug from name + partner suffix.
    const base = slugify(name) || 'product'
    let slug = `${base}-${partner.id.slice(-6)}`
    let n = 0
    while (await prisma.productTemplate.findUnique({ where: { slug }, select: { id: true } })) {
      n += 1
      slug = `${base}-${partner.id.slice(-6)}-${n}`
      if (n > 50) return { ok: false, error: 'Could not generate a unique slug — try a different name.' }
    }

    const created = await prisma.productTemplate.create({
      data: {
        name,
        slug,
        subcategoryId: input.subcategoryId,
        manufacturerServiceId: partner.services[0]?.id ?? null,
        status: 'DRAFT',
      },
      select: { id: true, slug: true },
    })

    // Audit is best-effort — never let a logging hiccup fail the create.
    try {
      await logAuditAs(user, {
        entityType: 'ProductTemplate',
        entityId: created.id,
        action: 'PRODUCT_TEMPLATE_CREATE',
        toValue: 'DRAFT',
        payload: { partnerId: partner.id, name, via: 'guided-builder' },
      })
    } catch (auditErr) {
      console.error('[createDraftShell] audit log failed (non-fatal):', auditErr)
    }

    revalidatePath('/products')
    return { ok: true, data: created }
  } catch (err) {
    console.error('[createDraftShell] failed:', err)
    return { ok: false, error: `Could not create draft: ${(err as Error).message}` }
  }
}
