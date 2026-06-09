'use server'

// Guided builder actions (2026-06-08). The 6-step turnkey builder creates the
// DRAFT ProductTemplate up front (after Basics) so each subsequent step can
// autosave into real DB rows via the existing editor cards. Kept in its own
// file (not products/actions.ts) to stay off Code's hot path.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { resolveCertBadgeUrls } from '@/lib/cert-badges'
import { suggestPhrases, PHRASE_FACT_FLAGS } from '@ilaunchify/marketplace'

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

export interface CertRow {
  productCertificateId: string | null // present only for ATTACHED rows
  instanceId: string
  certName: string
  certificateNumber: string | null
  expiryDateIso: string
  status: 'PENDING_REVIEW' | 'VERIFIED' | 'EXPIRED' | 'REJECTED'
  badgeUrl: string | null // cert type's web badge (image)
}
export interface CertData { attached: CertRow[]; available: CertRow[] }

/** Load the draft's attached certificates + the partner's attachable instances
 *  (#consolidation slice 1). Reuses the editor's data shape; attach/detach use the
 *  editor's existing `attachCertificate`/`detachCertificate` server actions. */
export async function loadCertData(productTemplateId: string): Promise<CertData> {
  const empty: CertData = { attached: [], available: [] }
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return empty
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: {
        manufacturerServiceId: true,
        certificates: { select: { instance: { select: { id: true, certificateNumber: true, expiryDate: true, status: true, certificateType: { select: { name: true, thumbnailFileId: true } } } } } },
      },
    })
    if (!tpl) return empty
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return empty

    const available = await prisma.partnerCertificateInstance.findMany({
      where: { partnerId: partner.id, status: { in: ['VERIFIED', 'PENDING_REVIEW'] } },
      include: { certificateType: { select: { name: true, thumbnailFileId: true } } },
      orderBy: { expiryDate: 'asc' },
    })
    // Resolve cert-type web badges (images) — same helper as /certifications.
    const fileIds = [
      ...tpl.certificates.map((c) => c.instance.certificateType.thumbnailFileId),
      ...available.map((a) => a.certificateType.thumbnailFileId),
    ]
    const badges = await resolveCertBadgeUrls(fileIds).catch(() => new Map<string, string>())
    const badge = (id: string | null) => (id ? badges.get(id) ?? null : null)

    const attachedInstanceIds = new Set(tpl.certificates.map((c) => c.instance.id))
    return {
      attached: tpl.certificates.map((c) => ({
        productCertificateId: null, instanceId: c.instance.id, certName: c.instance.certificateType.name,
        certificateNumber: c.instance.certificateNumber, expiryDateIso: c.instance.expiryDate.toISOString(),
        status: c.instance.status as CertRow['status'], badgeUrl: badge(c.instance.certificateType.thumbnailFileId),
      })),
      available: available.filter((a) => !attachedInstanceIds.has(a.id)).map((a) => ({
        productCertificateId: null, instanceId: a.id, certName: a.certificateType.name,
        certificateNumber: a.certificateNumber, expiryDateIso: a.expiryDate.toISOString(),
        status: a.status as CertRow['status'], badgeUrl: badge(a.certificateType.thumbnailFileId),
      })),
    }
  } catch (err) {
    console.error('[loadCertData] failed:', err)
    return empty
  }
}

export interface InitialDraftValue {
  label: string; isDefault: boolean; leadDelta: number; costDeltaCents: number; moqOverride: number | null
  overlayOp: 'NONE' | 'SWAP' | 'ADD' | 'REMOVE'; overlayIngId?: string; overlayIngName?: string
}
export interface InitialDraftAxis {
  key: string; label: string; editableByCreator: boolean; affectsLabel: boolean; boundSlotId: string | null
  values: InitialDraftValue[]
}
export interface InitialDraft {
  id: string
  status: string // ProductTemplateStatus
  name: string
  familyCode: string | null
  description: string | null
  longDescription: string | null
  categoryId: string | null
  subcategoryId: string
  packingProfileId: string | null
  maxFlavorsPerPack: number | null
  nicheIds: string[]
  lifestyleTagIds: string[]
  flavors: Array<{ name: string; soi: string }>
  axes: InitialDraftAxis[]
  // Recipe base slots — restored so editing shows the real recipe (and the
  // recipe-step autosave round-trips instead of wiping it).
  recipeSlots: Array<{ ingId: string; name: string; per100g: Record<string, number>; densityGPerMl: number | null; weightG: number }>
  // Production (default variant) + storage/lead (template) — #35 full load-back.
  storageClass: 'AMBIENT' | 'CHILLED' | 'FROZEN' | null
  storageTempMinF: number | null
  storageTempMaxF: number | null
  leadTimeRepeatDays: number | null
  leadTimeFirstRunDays: number | null
  production: {
    fulfillmentMode: 'BULK_PRODUCTION' | 'ON_DEMAND' | 'BOTH' | null
    moqMin: number; orderIncrement: number; monthlyCapacity: number | null
    shelfLifeDays: number | null; lotTracking: boolean
  } | null
  pricingTiers: Array<{ minQty: number; maxQty: number | null; perUnitCostCents: number; perUnitFloorCents: number; leadTimeDays: number | null }>
}

/** Load an existing DRAFT for the guided builder to resume (#35 load-back). Returns
 *  null if not found / not owned. Single cast query so new columns + relations
 *  (packingProfileId, optionAxes, …) resolve before the client is regenerated. */
export async function loadDraft(productTemplateId: string): Promise<InitialDraft | null> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return null
    const ownIds = partner.services.map((s) => s.id)

    type Loaded = {
      id: string; status: string; name: string; familyCode: string | null; description: string | null
      longDescription: string | null; manufacturerServiceId: string | null; subcategoryId: string
      packingProfileId: string | null; maxFlavorsPerPack: number | null
      storageClass: string | null; storageTempMinF: number | null; storageTempMaxF: number | null
      leadTimeRepeatDays: number | null; leadTimeFirstRunDays: number | null
      subcategory: { categoryId: string } | null
      flavorPresets: Array<{ name: string; statementOfIdentity: string | null }>
      ingredientSlots: Array<{ baseIngredientId: string; weightG: number | null; baseIngredient: { internalName: string | null; name: string; nutritionPer100g: unknown; densityGPerML: number | null } | null }>
      niches: Array<{ nicheId: string }>
      lifestyleTags: Array<{ lifestyleTagId: string }>
      variants: Array<{ fulfillmentMode: string | null; moqMin: number; orderIncrement: number; monthlyCapacity: number | null; shelfLifeDays: number | null; lotTracking: boolean }>
      pricingTiers: Array<{ minQty: number; maxQty: number | null; perUnitCostCents: number; perUnitFloorCents: number; leadTimeDays: number | null }>
      optionAxes: Array<{
        key: string; label: string; editableByCreator: boolean; affectsLabel: boolean; boundSlotId: string | null
        values: Array<{ label: string; isDefault: boolean; leadTimeDeltaDays: number; unitCostDeltaCents: number; moqOverride: number | null; overlayOp: string; recipeOverlay: unknown }>
      }>
    }
    const tpl = await (prisma as unknown as {
      productTemplate: { findUnique: (a: unknown) => Promise<Loaded | null> }
    }).productTemplate.findUnique({
      where: { id: productTemplateId },
      select: {
        id: true, status: true, name: true, familyCode: true, description: true, longDescription: true,
        manufacturerServiceId: true, subcategoryId: true, packingProfileId: true, maxFlavorsPerPack: true,
        storageClass: true, storageTempMinF: true, storageTempMaxF: true,
        leadTimeRepeatDays: true, leadTimeFirstRunDays: true,
        subcategory: { select: { categoryId: true } },
        flavorPresets: { orderBy: { sortOrder: 'asc' }, select: { name: true, statementOfIdentity: true } },
        ingredientSlots: { orderBy: { displayOrder: 'asc' }, select: { baseIngredientId: true, weightG: true, baseIngredient: { select: { internalName: true, name: true, nutritionPer100g: true, densityGPerML: true } } } },
        niches: { select: { nicheId: true } },
        lifestyleTags: { select: { lifestyleTagId: true } },
        variants: { take: 1, orderBy: { createdAt: 'asc' }, select: { fulfillmentMode: true, moqMin: true, orderIncrement: true, monthlyCapacity: true, shelfLifeDays: true, lotTracking: true } },
        pricingTiers: { orderBy: { sortOrder: 'asc' }, select: { minQty: true, maxQty: true, perUnitCostCents: true, perUnitFloorCents: true, leadTimeDays: true } },
        optionAxes: {
          orderBy: { sortOrder: 'asc' },
          select: {
            key: true, label: true, editableByCreator: true, affectsLabel: true, boundSlotId: true,
            values: { orderBy: { sortOrder: 'asc' }, select: { label: true, isDefault: true, leadTimeDeltaDays: true, unitCostDeltaCents: true, moqOverride: true, overlayOp: true, recipeOverlay: true } },
          },
        },
      },
    }).catch(() => null)

    if (!tpl) return null
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return null

    return {
      id: tpl.id,
      status: tpl.status,
      name: tpl.name,
      familyCode: tpl.familyCode,
      description: tpl.description,
      longDescription: tpl.longDescription,
      categoryId: tpl.subcategory?.categoryId ?? null,
      subcategoryId: tpl.subcategoryId,
      packingProfileId: tpl.packingProfileId,
      maxFlavorsPerPack: tpl.maxFlavorsPerPack,
      nicheIds: tpl.niches.map((n) => n.nicheId),
      lifestyleTagIds: tpl.lifestyleTags.map((l) => l.lifestyleTagId),
      flavors: tpl.flavorPresets.map((f) => ({ name: f.name, soi: f.statementOfIdentity ?? '' })),
      recipeSlots: tpl.ingredientSlots.map((s) => ({
        ingId: s.baseIngredientId,
        name: s.baseIngredient?.internalName ?? s.baseIngredient?.name ?? '',
        per100g: (s.baseIngredient?.nutritionPer100g ?? {}) as Record<string, number>,
        densityGPerMl: s.baseIngredient?.densityGPerML ?? null,
        weightG: s.weightG ?? 0,
      })),
      axes: (tpl.optionAxes ?? []).map((a) => ({
        key: a.key, label: a.label, editableByCreator: a.editableByCreator, affectsLabel: a.affectsLabel, boundSlotId: a.boundSlotId,
        values: a.values.map((v) => {
          const ov = (v.recipeOverlay ?? {}) as { toIngredientId?: string; addIngredientId?: string }
          const ingId = ov.toIngredientId ?? ov.addIngredientId
          return {
            label: v.label, isDefault: v.isDefault, leadDelta: v.leadTimeDeltaDays, costDeltaCents: v.unitCostDeltaCents,
            moqOverride: v.moqOverride, overlayOp: (v.overlayOp as InitialDraftValue['overlayOp']) ?? 'NONE',
            overlayIngId: ingId, overlayIngName: ingId ? '(saved ingredient)' : undefined,
          }
        }),
      })),
      storageClass: (tpl.storageClass as InitialDraft['storageClass']) ?? null,
      storageTempMinF: tpl.storageTempMinF,
      storageTempMaxF: tpl.storageTempMaxF,
      leadTimeRepeatDays: tpl.leadTimeRepeatDays,
      leadTimeFirstRunDays: tpl.leadTimeFirstRunDays,
      production: tpl.variants[0]
        ? {
            fulfillmentMode: (tpl.variants[0].fulfillmentMode as 'BULK_PRODUCTION' | 'ON_DEMAND' | 'BOTH' | null) ?? null,
            moqMin: tpl.variants[0].moqMin,
            orderIncrement: tpl.variants[0].orderIncrement,
            monthlyCapacity: tpl.variants[0].monthlyCapacity,
            shelfLifeDays: tpl.variants[0].shelfLifeDays,
            lotTracking: tpl.variants[0].lotTracking,
          }
        : null,
      pricingTiers: tpl.pricingTiers ?? [],
    }
  } catch (err) {
    console.error('[loadDraft] failed:', err)
    return null
  }
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

export interface PricingTierInput {
  minQty: number
  maxQty: number | null
  perUnitCostCents: number
  perUnitFloorCents: number
  leadTimeDays: number | null
  sortOrder: number
}

/** Replace the draft's volume pricing tiers (#35). ProductTemplatePricingTier is
 *  a pre-existing model, so no cast needed. */
export async function savePricingTiers(productTemplateId: string, tiers: PricingTierInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const clean = tiers
      .filter((t) => t.minQty > 0 && t.perUnitCostCents > 0)
      .map((t, i) => ({
        minQty: Math.max(1, Math.floor(t.minQty)),
        maxQty: t.maxQty == null ? null : Math.max(t.minQty, Math.floor(t.maxQty)),
        perUnitCostCents: Math.max(0, Math.floor(t.perUnitCostCents)),
        perUnitFloorCents: Math.max(0, Math.floor(t.perUnitFloorCents)),
        leadTimeDays: t.leadTimeDays == null ? null : Math.max(0, Math.floor(t.leadTimeDays)),
        sortOrder: i,
      }))

    await prisma.$transaction([
      prisma.productTemplatePricingTier.deleteMany({ where: { productTemplateId } }),
      ...clean.map((t) => prisma.productTemplatePricingTier.create({ data: { productTemplateId, ...t } })),
    ])
    return { ok: true }
  } catch (err) {
    console.error('[savePricingTiers] failed:', err)
    return { ok: false, error: `Could not save pricing: ${(err as Error).message}` }
  }
}

export interface ProductionInput {
  fulfillmentMode: 'BULK_PRODUCTION' | 'ON_DEMAND' | 'BOTH'
  moqMin: number
  orderIncrement: number
  monthlyCapacity: number | null
  shelfLifeDays: number | null
  lotTracking: boolean
}

/** Persist the draft's production spec onto its default variant (#35). Creates
 *  the default variant if none exists (geometry filled later by Recipe/Packaging).
 *  Cast-guarded — some variant columns post-date the generated client. */
export async function saveProduction(productTemplateId: string, input: ProductionInput): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const data = {
      fulfillmentMode: input.fulfillmentMode,
      moqMin: Math.max(1, Math.floor(input.moqMin || 1)),
      orderIncrement: Math.max(1, Math.floor(input.orderIncrement || 1)),
      monthlyCapacity: input.monthlyCapacity == null ? null : Math.max(0, Math.floor(input.monthlyCapacity)),
      shelfLifeDays: input.shelfLifeDays == null ? null : Math.max(1, Math.floor(input.shelfLifeDays)),
      lotTracking: input.lotTracking,
    }
    const existing = await prisma.productTemplateVariant.findFirst({ where: { productTemplateId }, select: { id: true } })
    if (existing) {
      await prisma.productTemplateVariant.update({ where: { id: existing.id }, data: data as never })
    } else {
      await prisma.productTemplateVariant.create({
        data: { productTemplateId, containerFormat: 'Default', servingsPerContainer: 1, servingSizeG: 1, ...data } as never,
      })
    }
    return { ok: true }
  } catch (err) {
    console.error('[saveProduction] failed:', err)
    return { ok: false, error: `Could not save production: ${(err as Error).message}` }
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

export interface AllergenOverride { allergen: string; action: 'ADD' | 'REMOVE'; reason: string }
export interface AllergenData { autoDerived: string[]; manualOverrides: AllergenOverride[]; crossContamination: string }

/** Load allergen state for a draft (consolidation — Recipe step). autoDerived =
 *  union of the base ingredients' allergen flags; overrides + cross-contamination
 *  persist via saveManualAllergens + updateBasics. */
export async function loadAllergenData(productTemplateId: string): Promise<AllergenData> {
  const empty: AllergenData = { autoDerived: [], manualOverrides: [], crossContamination: '' }
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return empty
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: {
        manufacturerServiceId: true, allergenCrossContamination: true, allergenManualOverrides: true,
        ingredientSlots: { select: { baseIngredient: { select: { allergenFlags: true } } } },
      },
    })
    if (!tpl) return empty
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return empty

    const auto = [...new Set(tpl.ingredientSlots.flatMap((s) => s.baseIngredient?.allergenFlags ?? []))].sort()
    const overrides = Array.isArray(tpl.allergenManualOverrides) ? (tpl.allergenManualOverrides as unknown as AllergenOverride[]) : []
    return { autoDerived: auto, manualOverrides: overrides, crossContamination: tpl.allergenCrossContamination ?? '' }
  } catch (err) {
    console.error('[loadAllergenData] failed:', err)
    return empty
  }
}

export interface PhraseSuggestionLite { phraseId: string; title: string; body: string; requirement: string; cfrCitation: string | null; isLocked: boolean }
export interface PhraseData {
  labelingType: string
  factFlags: Array<{ key: string; label: string; help: string }>
  facts: Record<string, boolean>
  suggestions: PhraseSuggestionLite[]
  selectedPhraseIds: string[]
}

/** Load the label-phrase engine state for a draft (consolidation — Packaging
 *  step). Reuses @ilaunchify/marketplace suggestPhrases + PHRASE_FACT_FLAGS;
 *  toggles persist via the editor's saveProductPhraseFacts/saveProductPhrases. */
export async function loadPhraseData(productTemplateId: string): Promise<PhraseData | null> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return null
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true, labelingType: true, phraseFacts: true, phrases: { select: { mandatoryPhraseId: true } } },
    })
    if (!tpl) return null
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return null

    const labelingType = String(tpl.labelingType)
    const factFlags = PHRASE_FACT_FLAGS
      .filter((f) => f.labelingTypes.includes(labelingType))
      .map((f) => ({ key: f.key, label: f.label, help: f.help }))
    const { suggestions } = await suggestPhrases({ productTemplateId })
    return {
      labelingType,
      factFlags,
      facts: (tpl.phraseFacts ?? {}) as Record<string, boolean>,
      suggestions: suggestions.map((s) => ({ phraseId: s.phraseId, title: s.title, body: s.body, requirement: s.requirement, cfrCitation: s.cfrCitation, isLocked: s.isLocked })),
      selectedPhraseIds: tpl.phrases.map((p) => p.mandatoryPhraseId),
    }
  } catch (err) {
    console.error('[loadPhraseData] failed:', err)
    return null
  }
}

export interface CertTypeOption { id: string; name: string; badgeUrl: string | null }

/** Active cert-type catalog for the in-builder "request a certificate" form. */
export async function loadCertTypes(): Promise<CertTypeOption[]> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return []
    const types = await prisma.certificateType.findMany({
      where: { status: 'ACTIVE' }, orderBy: { name: 'asc' },
      select: { id: true, name: true, thumbnailFileId: true },
    })
    const badges = await resolveCertBadgeUrls(types.map((t) => t.thumbnailFileId)).catch(() => new Map<string, string>())
    return types.map((t) => ({ id: t.id, name: t.name, badgeUrl: t.thumbnailFileId ? (badges.get(t.thumbnailFileId) ?? null) : null }))
  } catch (err) {
    console.error('[loadCertTypes] failed:', err)
    return []
  }
}

export interface ComplianceCheck { label: string; status: 'ok' | 'fail' | 'pending' }

/** Structural pre-submit compliance checks for a draft (consolidation — Review).
 *  Mirrors the editor: the checks we CAN run live, the full FDA scan pends (#131). */
export async function loadComplianceChecks(productTemplateId: string): Promise<ComplianceCheck[]> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return []
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: {
        manufacturerServiceId: true, name: true, statementOfIdentity: true,
        ingredientSlots: { select: { id: true } },
        certificates: { select: { instance: { select: { id: true } } } },
      },
    })
    if (!tpl) return []
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return []

    const ok = (b: boolean): ComplianceCheck['status'] => (b ? 'ok' : 'fail')
    return [
      { label: 'Statement of identity set', status: ok(!!(tpl.statementOfIdentity?.trim() || tpl.name?.trim())) },
      { label: 'Recipe ingredients added', status: ok(tpl.ingredientSlots.length > 0) },
      { label: 'Certificate(s) attached', status: tpl.certificates.length > 0 ? 'ok' : 'pending' },
      { label: 'Big-9 allergens declared', status: 'pending' },
      { label: 'Nutrient panel + %DV', status: 'pending' },
      { label: 'Minimum font size enforced', status: 'pending' },
    ]
  } catch (err) {
    console.error('[loadComplianceChecks] failed:', err)
    return []
  }
}

export interface NoteRowData { id: string; authorName: string; authorType: string; body: string; createdAtIso: string }

/** Load the admin↔partner notes thread for a draft (consolidation). Posting
 *  reuses the editor's `postPartnerProductNote`. */
export async function loadNotes(productTemplateId: string): Promise<NoteRowData[]> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return []
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: {
        manufacturerServiceId: true,
        notes: { orderBy: { createdAt: 'asc' }, select: { id: true, authorId: true, authorType: true, body: true, createdAt: true } },
      },
    })
    if (!tpl) return []
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return []

    const authorIds = [...new Set(tpl.notes.map((n) => n.authorId))]
    const users = authorIds.length
      ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } })
      : []
    const nameById = new Map(users.map((u) => [u.id, u.name ?? u.email]))
    return tpl.notes.map((n) => ({
      id: n.id, authorName: nameById.get(n.authorId) ?? 'Unknown',
      authorType: String(n.authorType), body: n.body, createdAtIso: n.createdAt.toISOString(),
    }))
  } catch (err) {
    console.error('[loadNotes] failed:', err)
    return []
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
  allergenCrossContamination?: string | null
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
    if (patch.allergenCrossContamination !== undefined) data.allergenCrossContamination = patch.allergenCrossContamination?.trim() || null
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
