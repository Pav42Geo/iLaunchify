'use server'

// Server actions for the editor cards on /partner/products/[id]/edit.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.3 + #131.
//
// Each card-level write goes through one of these. Ownership is checked
// via manufacturerServiceId → PartnerService → Partner. Edits on REJECTED
// templates are refused. Most actions trigger revalidatePath on the editor.

import { prisma, findFirstBannedIngredient } from '@ilaunchify/db'
import { requireUser, requirePartnerActor, decideTemplateAccess } from '@ilaunchify/auth'
import { z, parseActionInput } from '@ilaunchify/types'
import { logAuditAs } from '@ilaunchify/audit'
import { uploadFile, brandAssetKey } from '@ilaunchify/storage'
import {
  suggestNiches,
  recordNicheAssignment,
  suggestPhrases,
  recordPhraseAssignment,
  PHRASE_FACT_KEYS,
  type SuggestNichesResult,
  type SuggestPhrasesResult,
} from '@ilaunchify/marketplace'
import { revalidatePath } from 'next/cache'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

// -----------------------------------------------------------------------------
// Ownership guard — used by every action below.
// Returns the partner row + the template id if the partner owns it.
// -----------------------------------------------------------------------------

// Tier 1.1 (docs/SECURITY_ARCHITECTURE.md): the actor check + the allow/deny
// decision are centralized in @ilaunchify/auth (requirePartnerActor +
// decideTemplateAccess — table-tested in ownership.test.ts). The template
// SELECT stays local so this file can pull extra fields (recipeEntryMode)
// without widening the shared guard. Historical return shape preserved.
async function authorize(productTemplateId: string) {
  const actor = await requirePartnerActor()
  if (!actor.ok) {
    return { user: null, partner: null, template: null, error: actor.error }
  }

  const template = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    select: {
      id: true,
      manufacturerServiceId: true,
      status: true,
      recipeEntryMode: true,
      manufacturerService: { select: { partnerId: true } },
    },
  })

  const decision = decideTemplateAccess({
    role: actor.user.role,
    requesterPartnerId: actor.partnerId,
    template: {
      exists: !!template,
      status: template?.status ?? null,
      ownerPartnerId: template?.manufacturerService?.partnerId ?? null,
      hasManufacturerService: !!template?.manufacturerServiceId,
    },
  })
  if (!decision.allowed) {
    return {
      user: actor.user,
      partner: { id: actor.partnerId },
      template: null,
      error: decision.reason,
    }
  }

  const { manufacturerService: _ms, ...tpl } = template!
  return { user: actor.user, partner: { id: actor.partnerId }, template: tpl, error: null as null }
}

// -----------------------------------------------------------------------------
// Banned-ingredient runtime enforcement (FDA_REGULATORY_POSTURE §5).
//
// createPartnerPrivateIngredient already honored the BannedIngredient
// dictionary, but existing USDA / Library / Private *picks* bypassed it —
// contradicting Creator Agreement §3. This closes the gap on every slot/
// replacement add path. Returns the offending name + match (so the caller can
// audit + error), or null when clear. Never mutates.
// -----------------------------------------------------------------------------

async function findSlotIngredientBan(opts: {
  ingredientId?: string
  name?: string | null
}): Promise<{
  name: string
  match: { matchName: string | null; reason: string; reference: string | null }
} | null> {
  if (opts.ingredientId) {
    const ing = await prisma.ingredient.findUnique({
      where: { id: opts.ingredientId },
      select: { name: true, internalName: true, labelDeclarationName: true },
    })
    if (!ing) return null
    // Check every name field — a banned matcher could hit any of them.
    const names = [ing.internalName, ing.labelDeclarationName, ing.name].filter(
      (n): n is string => Boolean(n),
    )
    return findFirstBannedIngredient(names)
  }
  if (opts.name?.trim()) {
    return findFirstBannedIngredient([opts.name.trim()])
  }
  return null
}

// -----------------------------------------------------------------------------
// INGREDIENT SLOTS
// -----------------------------------------------------------------------------

export async function addIngredientSlot(input: {
  productTemplateId: string
  // NEW (W2-IP) — use the picker's selected Ingredient.id.
  ingredientId?: string
  // Legacy name-based path — kept for back-compat (always creates SELF_ATTESTED
  // partner-private row with no allergens). New UI should NOT use this branch.
  name?: string
  weightG: number
}): Promise<Result<{ slotId: string }>> {
  const { user, partner, template, error } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }

  if (input.weightG <= 0) return { ok: false, error: 'Weight must be greater than 0 grams.' }
  if (!input.ingredientId && !input.name?.trim()) {
    return { ok: false, error: 'Pick an ingredient or provide a name.' }
  }

  // Banned-list save-time enforcement — block any pick/name that matches the
  // dictionary. Audit + refuse, never mutate.
  const ban = await findSlotIngredientBan({ ingredientId: input.ingredientId, name: input.name })
  if (ban) {
    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: template.id,
      action: 'INGREDIENT_BANNED_BLOCK',
      payload: {
        productTemplateId: template.id,
        via: 'addIngredientSlot',
        ingredientId: input.ingredientId ?? null,
        attemptedName: ban.name,
        matchedBanned: ban.match.matchName,
        reason: ban.match.reason,
        reference: ban.match.reference,
        partnerId: partner.id,
      },
    })
    return {
      ok: false,
      error: `"${ban.name}" is on the banned list for this product category and cannot be added — ${ban.match.reason} Contact admin to request an exception.`,
    }
  }

  const slot = await prisma.$transaction(async (tx) => {
    // Stamp the primary recipe-entry method on the first slot add (Slice 2).
    // Belt-and-suspenders against a race with the chooser's setRecipeEntryMode;
    // the first writer owns it, so this only fires when still null. No audit
    // here — setRecipeEntryMode writes RECIPE_ENTRY_MODE_SET on the UI path.
    if (template.recipeEntryMode === null) {
      await tx.productTemplate.update({
        where: { id: template.id },
        data: { recipeEntryMode: 'SEARCH_BUILD' },
      })
    }
    let ingredientId = input.ingredientId
    if (!ingredientId) {
      // Legacy path — bare name -> SELF_ATTESTED PARTNER_PRIVATE row.
      const ing = await tx.ingredient.create({
        data: {
          name: input.name!.trim(),
          internalName: input.name!.trim(),
          labelDeclarationName: input.name!.trim(),
          nutritionPer100g: {},
          source: 'PARTNER_PRIVATE',
          ownerPartnerId: partner.id,
          verificationStatus: 'SELF_ATTESTED',
          createdById: user.id,
          allergenFlags: [],
        },
      })
      ingredientId = ing.id
    } else {
      // Picker path — guard that the partner is allowed to use this ingredient.
      // USDA + LIBRARY are open to everyone; PARTNER_PRIVATE is scoped.
      const ing = await tx.ingredient.findUnique({
        where: { id: ingredientId },
        select: { id: true, source: true, ownerPartnerId: true },
      })
      if (!ing) throw new Error('INGREDIENT_NOT_FOUND')
      if (ing.source === 'PARTNER_PRIVATE' && ing.ownerPartnerId !== partner.id) {
        throw new Error('NOT_YOUR_INGREDIENT')
      }
    }
    const lastSlot = await tx.templateIngredientSlot.findFirst({
      where: { productTemplateId: template.id },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    })
    const created = await tx.templateIngredientSlot.create({
      data: {
        productTemplateId: template.id,
        baseIngredientId: ingredientId,
        weightG: input.weightG,
        displayOrder: (lastSlot?.displayOrder ?? -1) + 1,
      },
    })
    // Bump usage so the picker ranks this ingredient higher next time.
    await tx.ingredientUsage.upsert({
      where: { partnerId_ingredientId: { partnerId: partner.id, ingredientId } },
      create: { partnerId: partner.id, ingredientId, useCount: 1 },
      update: { useCount: { increment: 1 }, lastUsedAt: new Date() },
    })
    return created
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true, data: { slotId: slot.id } }
}

export async function updateIngredientSlot(input: {
  slotId: string
  weightG?: number
  allowReplacement?: boolean
  label?: string | null
}): Promise<Result> {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false, error: 'NOT_A_PARTNER' }

  const slot = await prisma.templateIngredientSlot.findUnique({
    where: { id: input.slotId },
    include: { productTemplate: { select: { id: true, manufacturerServiceId: true } } },
  })
  if (!slot) return { ok: false, error: 'Slot not found.' }

  const { error } = await authorize(slot.productTemplate.id)
  if (error) return { ok: false, error }

  // No banned-list check here: updateIngredientSlot only edits weight / replace
  // toggle / label — it has no path to change baseIngredientId. The ban gate
  // lives on the two paths that introduce an ingredient (addIngredientSlot,
  // addReplacement). If a baseIngredientId swap is ever added here, gate it too.
  await prisma.templateIngredientSlot.update({
    where: { id: input.slotId },
    data: {
      ...(input.weightG !== undefined ? { weightG: input.weightG } : {}),
      ...(input.allowReplacement !== undefined ? { allowReplacement: input.allowReplacement } : {}),
      ...(input.label !== undefined ? { label: input.label?.trim() || null } : {}),
    },
  })

  revalidatePath(`/products/${slot.productTemplate.id}/edit`)
  return { ok: true }
}

export async function removeIngredientSlot(slotId: string): Promise<Result> {
  const slot = await prisma.templateIngredientSlot.findUnique({
    where: { id: slotId },
    include: { productTemplate: { select: { id: true } } },
  })
  if (!slot) return { ok: false, error: 'Slot not found.' }

  const { error } = await authorize(slot.productTemplate.id)
  if (error) return { ok: false, error }

  await prisma.templateIngredientSlot.delete({ where: { id: slotId } })
  revalidatePath(`/products/${slot.productTemplate.id}/edit`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// RECIPE ENTRY MODE — analytics record of how the partner built the recipe
// (Slice 2). The first method to set it owns it: never overwritten. Analytics-
// only metadata, so it does NOT trigger a PUBLISHED → PENDING_EDIT_REVIEW
// transition.
// -----------------------------------------------------------------------------

export type RecipeEntryModeValue = 'SEARCH_BUILD' | 'AI_PARSER' | 'DECLARED_PANEL'

export async function setRecipeEntryMode(
  productTemplateId: string,
  mode: RecipeEntryModeValue,
): Promise<Result<{ mode: RecipeEntryModeValue }>> {
  const { user, template, error } = await authorize(productTemplateId)
  if (error) return { ok: false, error }

  // Never overwrite — the first writer owns the record.
  if (template.recipeEntryMode !== null) {
    return { ok: true, data: { mode: template.recipeEntryMode } }
  }

  await prisma.productTemplate.update({
    where: { id: template.id },
    data: { recipeEntryMode: mode },
  })

  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: template.id,
    action: 'RECIPE_ENTRY_MODE_SET',
    payload: { mode },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true, data: { mode } }
}

// -----------------------------------------------------------------------------
// SLOT REPLACEMENTS — alternative ingredients creator can swap in
// -----------------------------------------------------------------------------

export async function addReplacement(input: {
  slotId: string
  // NEW (W2-IP) — picker's selected Ingredient.id.
  ingredientId?: string
  // Legacy free-text path — kept for back-compat.
  ingredientName?: string
  weightGOverride: number | null
  calloutText: string | null
}): Promise<Result<{ replacementId: string }>> {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false, error: 'NOT_A_PARTNER' }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return { ok: false, error: 'PARTNER_NOT_FOUND' }

  const slot = await prisma.templateIngredientSlot.findUnique({
    where: { id: input.slotId },
    include: { productTemplate: { select: { id: true } } },
  })
  if (!slot) return { ok: false, error: 'Slot not found.' }

  const { error } = await authorize(slot.productTemplate.id)
  if (error) return { ok: false, error }

  if (!input.ingredientId && !input.ingredientName?.trim()) {
    return { ok: false, error: 'Pick a replacement ingredient or provide a name.' }
  }

  // Banned-list save-time enforcement — same gate as addIngredientSlot.
  const ban = await findSlotIngredientBan({
    ingredientId: input.ingredientId,
    name: input.ingredientName,
  })
  if (ban) {
    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: slot.productTemplate.id,
      action: 'INGREDIENT_BANNED_BLOCK',
      payload: {
        productTemplateId: slot.productTemplate.id,
        via: 'addReplacement',
        slotId: input.slotId,
        ingredientId: input.ingredientId ?? null,
        attemptedName: ban.name,
        matchedBanned: ban.match.matchName,
        reason: ban.match.reason,
        reference: ban.match.reference,
        partnerId: partner.id,
      },
    })
    return {
      ok: false,
      error: `"${ban.name}" is on the banned list for this product category and cannot be added — ${ban.match.reason} Contact admin to request an exception.`,
    }
  }

  const replacement = await prisma.$transaction(async (tx) => {
    let ingredientId = input.ingredientId
    if (!ingredientId) {
      const ing = await tx.ingredient.create({
        data: {
          name: input.ingredientName!.trim(),
          internalName: input.ingredientName!.trim(),
          labelDeclarationName: input.ingredientName!.trim(),
          nutritionPer100g: {},
          source: 'PARTNER_PRIVATE',
          ownerPartnerId: partner.id,
          verificationStatus: 'SELF_ATTESTED',
          createdById: user.id,
          allergenFlags: [],
        },
      })
      ingredientId = ing.id
    } else {
      const ing = await tx.ingredient.findUnique({
        where: { id: ingredientId },
        select: { id: true, source: true, ownerPartnerId: true },
      })
      if (!ing) throw new Error('INGREDIENT_NOT_FOUND')
      if (ing.source === 'PARTNER_PRIVATE' && ing.ownerPartnerId !== partner.id) {
        throw new Error('NOT_YOUR_INGREDIENT')
      }
    }
    const lastReplacement = await tx.templateIngredientReplacement.findFirst({
      where: { slotId: input.slotId },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    })
    const created = await tx.templateIngredientReplacement.create({
      data: {
        slotId: input.slotId,
        ingredientId,
        weightGOverride: input.weightGOverride,
        calloutText: input.calloutText?.trim() || null,
        displayOrder: (lastReplacement?.displayOrder ?? -1) + 1,
      },
    })
    await tx.ingredientUsage.upsert({
      where: { partnerId_ingredientId: { partnerId: partner.id, ingredientId } },
      create: { partnerId: partner.id, ingredientId, useCount: 1 },
      update: { useCount: { increment: 1 }, lastUsedAt: new Date() },
    })
    return created
  })

  revalidatePath(`/products/${slot.productTemplate.id}/edit`)
  return { ok: true, data: { replacementId: replacement.id } }
}

export async function removeReplacement(replacementId: string): Promise<Result> {
  const repl = await prisma.templateIngredientReplacement.findUnique({
    where: { id: replacementId },
    include: { slot: { include: { productTemplate: { select: { id: true } } } } },
  })
  if (!repl) return { ok: false, error: 'Replacement not found.' }

  const { error } = await authorize(repl.slot.productTemplate.id)
  if (error) return { ok: false, error }

  await prisma.templateIngredientReplacement.delete({ where: { id: replacementId } })
  revalidatePath(`/products/${repl.slot.productTemplate.id}/edit`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// VARIANTS — container/serving/MOQ/lead-time per SKU
// -----------------------------------------------------------------------------

// REFERENCE CONVERSION for docs/ZOD_ACTION_BOUNDARIES.md (Tier 1.2) — this is
// the pattern every mutating action converts to. Notes that matter:
//   - The schema is NOT exported: 'use server' modules may only export async
//     functions. The TYPE export (z.infer) is fine — types are erased.
//   - Order is authorize → parse: don't reveal validation behavior to callers
//     who couldn't act anyway.
//   - Error messages are preserved verbatim from the manual checks they
//     replace — the UI shows them as toasts.
const AddVariantSchema = z
  .object({
    productTemplateId: z.string().min(1),
    flavor: z.string().nullable(),
    containerFormat: z.string().trim().min(1, 'Container format is required.'),
    containerSizeG: z.number().nullable(),
    servingsPerContainer: z.number().int().min(1, 'Servings must be ≥ 1.'),
    servingSizeG: z.number().gt(0, 'Serving size must be > 0g.'),
    servingSizeDesc: z.string().nullable(),
    moqMin: z.number().int().min(1, 'MOQ range invalid (min ≥ 1, max ≥ min).'),
    moqMax: z.number().int(),
    leadTimeDays: z.number().int().min(0),
    unitCostCentsOverride: z.number().int().nullable(),
  })
  .refine((v) => v.moqMax >= v.moqMin, {
    message: 'MOQ range invalid (min ≥ 1, max ≥ min).',
  })

export type AddVariantInput = z.infer<typeof AddVariantSchema>

export async function addVariant(raw: AddVariantInput): Promise<Result<{ variantId: string }>> {
  const { error, template } = await authorize(raw.productTemplateId)
  if (error) return { ok: false, error }

  const parsed = parseActionInput(AddVariantSchema, raw)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const input = parsed.data

  const variant = await prisma.productTemplateVariant.create({
    data: {
      productTemplateId: template.id,
      flavor: input.flavor?.trim() || null,
      containerFormat: input.containerFormat, // already trimmed by the schema
      containerSizeG: input.containerSizeG ?? null,
      servingsPerContainer: input.servingsPerContainer,
      servingSizeG: input.servingSizeG,
      servingSizeDesc: input.servingSizeDesc?.trim() || null,
      moqMin: input.moqMin,
      moqMax: input.moqMax,
      leadTimeDays: input.leadTimeDays,
      unitCostCentsOverride: input.unitCostCentsOverride,
    },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true, data: { variantId: variant.id } }
}

export async function updateVariant(input: {
  variantId: string
  patch: Partial<Omit<AddVariantInput, 'productTemplateId'>>
}): Promise<Result> {
  const variant = await prisma.productTemplateVariant.findUnique({
    where: { id: input.variantId },
    include: { productTemplate: { select: { id: true } } },
  })
  if (!variant) return { ok: false, error: 'Variant not found.' }

  const { error } = await authorize(variant.productTemplate.id)
  if (error) return { ok: false, error }

  await prisma.productTemplateVariant.update({
    where: { id: input.variantId },
    data: {
      ...(input.patch.flavor !== undefined ? { flavor: input.patch.flavor?.trim() || null } : {}),
      ...(input.patch.containerFormat !== undefined
        ? { containerFormat: input.patch.containerFormat.trim() }
        : {}),
      ...(input.patch.containerSizeG !== undefined ? { containerSizeG: input.patch.containerSizeG } : {}),
      ...(input.patch.servingsPerContainer !== undefined
        ? { servingsPerContainer: input.patch.servingsPerContainer }
        : {}),
      ...(input.patch.servingSizeG !== undefined ? { servingSizeG: input.patch.servingSizeG } : {}),
      ...(input.patch.servingSizeDesc !== undefined
        ? { servingSizeDesc: input.patch.servingSizeDesc?.trim() || null }
        : {}),
      ...(input.patch.moqMin !== undefined ? { moqMin: input.patch.moqMin } : {}),
      ...(input.patch.moqMax !== undefined ? { moqMax: input.patch.moqMax } : {}),
      ...(input.patch.leadTimeDays !== undefined ? { leadTimeDays: input.patch.leadTimeDays } : {}),
      ...(input.patch.unitCostCentsOverride !== undefined
        ? { unitCostCentsOverride: input.patch.unitCostCentsOverride }
        : {}),
    },
  })

  revalidatePath(`/products/${variant.productTemplate.id}/edit`)
  return { ok: true }
}

export async function removeVariant(variantId: string): Promise<Result> {
  const variant = await prisma.productTemplateVariant.findUnique({
    where: { id: variantId },
    include: { productTemplate: { select: { id: true } } },
  })
  if (!variant) return { ok: false, error: 'Variant not found.' }

  const { error } = await authorize(variant.productTemplate.id)
  if (error) return { ok: false, error }

  // Refuse to remove the last variant — every template needs ≥1
  const count = await prisma.productTemplateVariant.count({
    where: { productTemplateId: variant.productTemplate.id },
  })
  if (count <= 1) {
    return { ok: false, error: 'Templates need at least one variant. Add another before removing this one.' }
  }

  await prisma.productTemplateVariant.delete({ where: { id: variantId } })
  revalidatePath(`/products/${variant.productTemplate.id}/edit`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// ALLERGENS — manual overrides (additions + removals + reason)
// Auto-derived contains-list is computed client-side from slot allergenFlags.
// -----------------------------------------------------------------------------

export async function saveManualAllergens(input: {
  productTemplateId: string
  manualOverrides: Array<{ allergen: string; action: 'ADD' | 'REMOVE'; reason: string }>
}): Promise<Result> {
  const { error, template } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }

  await prisma.productTemplate.update({
    where: { id: template.id },
    data: { allergenManualOverrides: input.manualOverrides },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// PACKAGING LINKS — add / remove / per-size price + lead-time edit.
// Pricing tiers are JSON; UI exposes only basePriceCents + leadTimeDays at V1.
// -----------------------------------------------------------------------------

export async function addPackagingLink(input: {
  productTemplateId: string
  packagingSystemId: string
  basePriceCents: number
  leadTimeDays: number
}): Promise<Result> {
  const { partner, template, error } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }

  // Verify the picked PackagingSystem belongs to this partner and is ACTIVE
  const sys = await prisma.packagingSystem.findUnique({
    where: { id: input.packagingSystemId },
    select: { partnerId: true, status: true },
  })
  if (!sys || sys.partnerId !== partner.id) {
    return { ok: false, error: 'Packaging system not found in your catalog.' }
  }
  if (sys.status !== 'ACTIVE') {
    return { ok: false, error: 'Activate the packaging system before linking to a product.' }
  }
  if (input.basePriceCents < 1) return { ok: false, error: 'Set a base price.' }
  if (input.leadTimeDays < 0) return { ok: false, error: 'Lead time must be ≥ 0.' }

  // @@id([productTemplateId, packagingSystemId]) — duplicate insert would error
  const existing = await prisma.productTemplatePackaging.findUnique({
    where: {
      productTemplateId_packagingSystemId: {
        productTemplateId: template.id,
        packagingSystemId: input.packagingSystemId,
      },
    },
  })
  if (existing) return { ok: false, error: 'That packaging is already linked.' }

  await prisma.productTemplatePackaging.create({
    data: {
      productTemplateId: template.id,
      packagingSystemId: input.packagingSystemId,
      basePriceCents: input.basePriceCents,
      leadTimeDays: input.leadTimeDays,
      pricingTiers: [],
    },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true }
}

export async function updatePackagingLink(input: {
  productTemplateId: string
  packagingSystemId: string
  basePriceCents?: number
  leadTimeDays?: number
}): Promise<Result> {
  const { error, template } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }

  await prisma.productTemplatePackaging.update({
    where: {
      productTemplateId_packagingSystemId: {
        productTemplateId: template.id,
        packagingSystemId: input.packagingSystemId,
      },
    },
    data: {
      ...(input.basePriceCents !== undefined ? { basePriceCents: input.basePriceCents } : {}),
      ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
    },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true }
}

export async function removePackagingLink(input: {
  productTemplateId: string
  packagingSystemId: string
}): Promise<Result> {
  const { error, template } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }

  // Refuse if it's the last link — every template needs ≥1
  const count = await prisma.productTemplatePackaging.count({
    where: { productTemplateId: template.id },
  })
  if (count <= 1) {
    return { ok: false, error: 'Templates need at least one packaging link. Add another before removing this one.' }
  }

  await prisma.productTemplatePackaging.delete({
    where: {
      productTemplateId_packagingSystemId: {
        productTemplateId: template.id,
        packagingSystemId: input.packagingSystemId,
      },
    },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// CERTIFICATES — attach VERIFIED instances + remove.
// Per-size scope (appliesToPackagingSystemIds) defaults to NULL = all sizes.
// UI for per-size scope is V1.1.
// -----------------------------------------------------------------------------

export async function attachCertificate(input: {
  productTemplateId: string
  instanceId: string
}): Promise<Result> {
  const { user, partner, template, error } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }

  const instance = await prisma.partnerCertificateInstance.findUnique({
    where: { id: input.instanceId },
    select: { partnerId: true, status: true, expiryDate: true },
  })
  if (!instance || instance.partnerId !== partner.id) {
    return { ok: false, error: 'Certificate not found in your catalog.' }
  }
  if (instance.status !== 'VERIFIED') {
    return { ok: false, error: 'Only VERIFIED certificates can be attached. Wait for admin review.' }
  }
  // C4 hard block — never attach an expired cert, even if the nightly cron
  // hasn't flipped its (VERIFIED) status to EXPIRED yet.
  if (instance.expiryDate.getTime() < Date.now()) {
    const when = instance.expiryDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
    return {
      ok: false,
      error: `This certificate expired on ${when}. Renew it from your Certifications page before attaching.`,
    }
  }

  const existing = await prisma.productCertificate.findUnique({
    where: { productTemplateId_instanceId: { productTemplateId: template.id, instanceId: input.instanceId } },
  })
  if (existing) return { ok: false, error: 'That certificate is already attached.' }

  // Reapproval-marked: changing certs on a PUBLISHED template re-gates it.
  const shouldGateForReview = template.status === 'PUBLISHED'

  await prisma.$transaction(async (tx) => {
    await tx.productCertificate.create({
      data: {
        productTemplateId: template.id,
        instanceId: input.instanceId,
        appliesToPackagingSystemIds: [],
      },
    })
    if (shouldGateForReview) {
      await tx.productTemplate.update({
        where: { id: template.id },
        data: { status: 'PENDING_EDIT_REVIEW' },
      })
    }
  })

  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: template.id,
    action: 'PRODUCT_TEMPLATE_CERT_ATTACHED',
    fromValue: template.status,
    toValue: shouldGateForReview ? 'PENDING_EDIT_REVIEW' : template.status,
    payload: { partnerId: partner.id, instanceId: input.instanceId, gatedForReview: shouldGateForReview },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true }
}

export async function detachCertificate(input: {
  productTemplateId: string
  instanceId: string
}): Promise<Result> {
  const { user, partner, error, template } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }

  // Reapproval-marked: removing a cert from a PUBLISHED template re-gates it.
  const shouldGateForReview = template.status === 'PUBLISHED'

  await prisma.$transaction(async (tx) => {
    await tx.productCertificate.delete({
      where: {
        productTemplateId_instanceId: { productTemplateId: template.id, instanceId: input.instanceId },
      },
    })
    if (shouldGateForReview) {
      await tx.productTemplate.update({
        where: { id: template.id },
        data: { status: 'PENDING_EDIT_REVIEW' },
      })
    }
  })

  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: template.id,
    action: 'PRODUCT_TEMPLATE_CERT_DETACHED',
    fromValue: template.status,
    toValue: shouldGateForReview ? 'PENDING_EDIT_REVIEW' : template.status,
    payload: { partnerId: partner.id, instanceId: input.instanceId, gatedForReview: shouldGateForReview },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// MEDIA — hero image upload via R2.
// Reuses brandAssetKey for now (paths under brands/ make sense since the
// ProductTemplate is brand-adjacent). Future #166 may move to a dedicated
// productAssetKey.
// -----------------------------------------------------------------------------

export async function uploadProductHero(formData: FormData): Promise<Result> {
  const productTemplateId = String(formData.get('productTemplateId') ?? '')
  const file = formData.get('file')
  if (!productTemplateId) return { ok: false, error: 'Missing productTemplateId.' }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No image provided.' }
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: 'Image too large (max 10 MB).' }
  }

  const { user, error, template } = await authorize(productTemplateId)
  if (error) return { ok: false, error }

  const buffer = Buffer.from(await file.arrayBuffer())
  let upload
  try {
    upload = await uploadFile({
      key: brandAssetKey({
        brandId: template.id, // re-use brand path with template id as "brandId"
        kind: 'hero_image',
        filename: file.name,
      }),
      body: buffer,
      contentType: file.type,
    })
  } catch (err) {
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }

  const asset = await prisma.asset.create({
    data: {
      ownerType: 'PRODUCT',
      ownerId: template.id,
      type: 'PRODUCT_IMAGE',
      source: 'USER_UPLOAD',
      storageKey: upload.key,
      mimeType: file.type,
      sizeBytes: upload.sizeBytes,
      isPublic: true,
      uploadedByUserId: user.id,
    },
  })

  await prisma.productTemplate.update({
    where: { id: template.id },
    data: { imageAssetId: asset.id },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// CUSTOM META — key/value pairs (max 10).
// -----------------------------------------------------------------------------

export async function saveCustomMeta(input: {
  productTemplateId: string
  customMeta: Array<{ key: string; value: string }>
}): Promise<Result> {
  const { error, template } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }

  if (input.customMeta.length > 10) {
    return { ok: false, error: 'Max 10 custom meta fields.' }
  }
  // Drop blank rows + dedupe by key (keep last write)
  const cleaned: Record<string, string> = {}
  for (const { key, value } of input.customMeta) {
    const k = key.trim()
    if (k) cleaned[k] = value.trim()
  }
  const final = Object.entries(cleaned).map(([key, value]) => ({ key, value }))

  await prisma.productTemplate.update({
    where: { id: template.id },
    data: { customMeta: final },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// NUTRIENT OVERRIDES — per docs/MANUFACTURER_PRODUCT_BUILDER.md §4a.5c.
// Stored on ProductTemplate.nutrientOverrides as
//   [{ nutrient: string, value: number, reason: string }].
// The compliance service applies these AFTER summing the recipe and BEFORE
// rounding, so the partner can correct for things like baking moisture loss.
// Re-triggers admin review on a published template (handled by the FSM).
// -----------------------------------------------------------------------------

const ALLOWED_NUTRIENT_IDS = new Set([
  'calories',
  'totalFat',
  'saturatedFat',
  'transFat',
  'cholesterol',
  'sodium',
  'totalCarbohydrate',
  'dietaryFiber',
  'totalSugars',
  'addedSugars',
  'protein',
  'vitaminD',
  'calcium',
  'iron',
  'potassium',
  'vitaminA',
  'vitaminC',
  'vitaminE',
])

export interface NutrientOverrideRow {
  nutrient: string
  value: number
  reason: string
}

export async function saveNutrientOverrides(input: {
  productTemplateId: string
  overrides: NutrientOverrideRow[]
}): Promise<Result> {
  const { error, template } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }

  if (input.overrides.length > 20) {
    return { ok: false, error: 'Maximum 20 nutrient overrides.' }
  }

  // Validate + drop empties. We do not error on a single bad row — the editor
  // shows row-level validation; here we just refuse to persist garbage.
  const seenNutrients = new Set<string>()
  const cleaned: NutrientOverrideRow[] = []
  for (const raw of input.overrides) {
    const nutrient = (raw.nutrient ?? '').trim()
    if (!nutrient) continue
    if (!ALLOWED_NUTRIENT_IDS.has(nutrient)) {
      return { ok: false, error: `Unknown nutrient: ${nutrient}` }
    }
    if (seenNutrients.has(nutrient)) {
      return { ok: false, error: `Duplicate override for ${nutrient}.` }
    }
    const value = Number(raw.value)
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, error: `Invalid value for ${nutrient}.` }
    }
    const reason = (raw.reason ?? '').trim()
    if (!reason) {
      return { ok: false, error: `Reason is required for ${nutrient} override.` }
    }
    seenNutrients.add(nutrient)
    cleaned.push({ nutrient, value, reason })
  }

  await prisma.productTemplate.update({
    where: { id: template.id },
    // Prisma's InputJsonValue is conservative about typed-object arrays —
    // cast through unknown so the editor's runtime-validated shape lands in
    // the JSON column. Matches the existing customMeta pattern.
    data: { nutrientOverrides: cleaned as unknown as object },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// INGREDIENT GROUPS — per docs/MANUFACTURER_PRODUCT_BUILDER.md §4a.5d.
// Stored on ProductTemplate.ingredientGroups as
//   [{ groupName, ingredientIds[], displayMode, sortAs }].
// FDA 21 CFR 101.4 permits a small set of category names — keep enforced.
// -----------------------------------------------------------------------------

const ALLOWED_GROUP_NAMES = new Set([
  'Spices',
  'Natural Flavors',
  'Artificial Flavors',
  'Spices and Spice Extractives',
])

export type IngredientGroupDisplayMode = 'CATEGORY_ONLY' | 'CATEGORY_WITH_SUBLIST'
export type IngredientGroupSortAs = 'byWeight' | 'asWritten'

export interface IngredientGroupRow {
  groupName: string
  ingredientIds: string[]
  displayMode: IngredientGroupDisplayMode
  sortAs: IngredientGroupSortAs
}

export async function saveIngredientGroups(input: {
  productTemplateId: string
  groups: IngredientGroupRow[]
}): Promise<Result> {
  const { error, template } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }

  if (input.groups.length > 8) {
    return { ok: false, error: 'Maximum 8 ingredient groups per product.' }
  }

  // Validate: only allowed group names, each ingredient belongs to one group.
  const seenIngredientIds = new Set<string>()
  const cleaned: IngredientGroupRow[] = []
  const seenGroupNames = new Set<string>()
  for (const raw of input.groups) {
    const groupName = (raw.groupName ?? '').trim()
    if (!groupName) continue
    if (!ALLOWED_GROUP_NAMES.has(groupName)) {
      return { ok: false, error: `Group name not allowed by FDA: ${groupName}` }
    }
    if (seenGroupNames.has(groupName)) {
      return { ok: false, error: `Duplicate group: ${groupName}` }
    }
    const ingredientIds = (raw.ingredientIds ?? []).filter((id): id is string => !!id?.trim())
    if (!ingredientIds.length) continue
    for (const id of ingredientIds) {
      if (seenIngredientIds.has(id)) {
        return { ok: false, error: `An ingredient is in two groups.` }
      }
      seenIngredientIds.add(id)
    }
    seenGroupNames.add(groupName)
    cleaned.push({
      groupName,
      ingredientIds,
      displayMode: raw.displayMode === 'CATEGORY_WITH_SUBLIST' ? 'CATEGORY_WITH_SUBLIST' : 'CATEGORY_ONLY',
      sortAs: raw.sortAs === 'asWritten' ? 'asWritten' : 'byWeight',
    })
  }

  // Verify every referenced ingredient id is actually a base slot on this template
  // (defence in depth — the picker only surfaces slot ingredients).
  if (cleaned.length) {
    const allIds = cleaned.flatMap((g) => g.ingredientIds)
    const slots = await prisma.templateIngredientSlot.findMany({
      where: { productTemplateId: template.id, baseIngredientId: { in: allIds } },
      select: { baseIngredientId: true },
    })
    const validIds = new Set(slots.map((s) => s.baseIngredientId))
    for (const g of cleaned) {
      g.ingredientIds = g.ingredientIds.filter((id) => validIds.has(id))
    }
  }

  await prisma.productTemplate.update({
    where: { id: template.id },
    // See comment on saveNutrientOverrides for the cast rationale.
    data: { ingredientGroups: cleaned as unknown as object },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// PARTNER NOTE — partner side of the admin↔partner thread.
// -----------------------------------------------------------------------------

export async function postPartnerProductNote(input: {
  productTemplateId: string
  body: string
}): Promise<Result> {
  const { user, error, template } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }
  if (!input.body.trim()) return { ok: false, error: 'Note body is required.' }

  await prisma.productNote.create({
    data: {
      productTemplateId: template.id,
      authorId: user.id,
      authorType: 'PARTNER',
      body: input.body.trim(),
    },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// NICHES — 2026-06-02 V1.1 marketplace taxonomy (Slice 3B).
// Per docs/MARKETPLACE_DESIGN.md §2 + memory note
// ilaunchify-marketplace-decisions-2026-06-01.md.
//
// The partner sees 8 niche chips. Auto-suggestions come from
// @ilaunchify/marketplace.suggestNiches — rules with `isLocked=true` cannot
// be deselected. All other chips toggle freely; saves diff-and-write.
//
// **Approval map** — per docs/MANUFACTURER_PRODUCT_BUILDER.md §8b, niche
// changes on a PUBLISHED template move it to PENDING_EDIT_REVIEW (the live
// version keeps serving until admin approves). Edits on a DRAFT /
// NEEDS_CHANGES row stay in that state.
// -----------------------------------------------------------------------------

export async function saveProductNiches(
  productTemplateId: string,
  nicheIds: string[],
): Promise<Result<{ suggestions: SuggestNichesResult['suggestions'] }>> {
  const { user, partner, error, template } = await authorize(productTemplateId)
  if (error) return { ok: false, error }

  // Re-run the suggestion engine — locked rules cannot be deselected. We
  // need this regardless to (a) enforce the locked invariant server-side
  // and (b) return fresh suggestions to the client for re-render.
  const suggestion = await suggestNiches({ productTemplateId })
  const lockedNicheIds = new Set(
    suggestion.suggestions.filter((s) => s.isLocked).map((s) => s.nicheId),
  )

  // Dedupe + normalise input
  const desired = new Set(nicheIds.filter((id) => typeof id === 'string' && id.length > 0))

  // Every locked niche must remain selected.
  for (const lockedId of lockedNicheIds) {
    desired.add(lockedId)
  }

  // Validate that every desired niche actually exists (defence in depth —
  // the picker only surfaces real rows but a hand-crafted POST shouldn't
  // be able to insert orphan FKs).
  const existing = await prisma.niche.findMany({
    where: { id: { in: Array.from(desired) }, isActive: true },
    select: { id: true },
  })
  const existingIds = new Set(existing.map((n) => n.id))
  for (const id of desired) {
    if (!existingIds.has(id)) {
      return { ok: false, error: 'One or more niches are invalid.' }
    }
  }

  // Current state — what's already linked.
  const current = await prisma.productTemplateNiche.findMany({
    where: { productTemplateId: template.id },
    select: { nicheId: true },
  })
  const currentIds = new Set(current.map((c) => c.nicheId))

  const toAdd = Array.from(desired).filter((id) => !currentIds.has(id))
  const toRemove = Array.from(currentIds).filter((id) => !desired.has(id))

  // Refuse to remove any locked niche (paranoid — desired-set logic above
  // already adds locked back in, but a client racing the engine could in
  // principle submit a stale list).
  for (const id of toRemove) {
    if (lockedNicheIds.has(id)) {
      return { ok: false, error: 'A locked niche cannot be removed.' }
    }
  }

  if (toAdd.length === 0 && toRemove.length === 0) {
    // Nothing changed — still return fresh suggestions for client UX.
    return { ok: true, data: { suggestions: suggestion.suggestions } }
  }

  // Approval-map — published templates flip to PENDING_EDIT_REVIEW on niche
  // edits. Draft / NEEDS_CHANGES / PENDING_EDIT_REVIEW / PAUSED stay put.
  const shouldGateForReview = template.status === 'PUBLISHED'

  // Look up rule ids for the auto-rule audit rows (if a desired-added niche
  // has a matching rule, we want to log source=AUTO_RULE; otherwise it's
  // MANUFACTURER-initiated).
  const ruleIdByNicheId = new Map<string, string>()
  for (const s of suggestion.suggestions) {
    ruleIdByNicheId.set(s.nicheId, s.ruleId)
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (toAdd.length > 0) {
        await tx.productTemplateNiche.createMany({
          data: toAdd.map((nicheId) => ({
            productTemplateId: template.id,
            nicheId,
            isPrimary: false, // V1.1+ — Pavel reserved 1 primary + N secondaries
          })),
          skipDuplicates: true,
        })
      }
      if (toRemove.length > 0) {
        await tx.productTemplateNiche.deleteMany({
          where: { productTemplateId: template.id, nicheId: { in: toRemove } },
        })
      }
      if (shouldGateForReview) {
        await tx.productTemplate.update({
          where: { id: template.id },
          data: { status: 'PENDING_EDIT_REVIEW' },
        })
      }
    })
  } catch (err) {
    return { ok: false, error: `Could not save niches: ${(err as Error).message}` }
  }

  // Audit — one NicheAssignmentAudit row per delta, plus a single product-
  // level AuditLog summarising the change.
  for (const nicheId of toAdd) {
    await recordNicheAssignment({
      productTemplateId: template.id,
      nicheId,
      source: 'MANUFACTURER',
      ruleId: ruleIdByNicheId.get(nicheId) ?? null,
      actorUserId: user.id,
      applied: true,
    })
  }
  for (const nicheId of toRemove) {
    await recordNicheAssignment({
      productTemplateId: template.id,
      nicheId,
      source: 'MANUFACTURER',
      ruleId: null,
      actorUserId: user.id,
      applied: false,
    })
  }
  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: template.id,
    action: 'PRODUCT_TEMPLATE_NICHES_UPDATED',
    fromValue: template.status,
    toValue: shouldGateForReview ? 'PENDING_EDIT_REVIEW' : template.status,
    payload: {
      partnerId: partner.id,
      added: toAdd,
      removed: toRemove,
      lockedNiches: Array.from(lockedNicheIds),
      gatedForReview: shouldGateForReview,
    },
  })

  // Recompute suggestions post-write — niche selection itself isn't a rule
  // input so the result is stable, but doing the second call keeps the
  // client's chip state perfectly consistent with the server's view.
  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true, data: { suggestions: suggestion.suggestions } }
}

// -----------------------------------------------------------------------------
// LIFESTYLE TAGS — Layer 4 of the marketplace taxonomy.
// Multi-select of Keto / Vegan / Athletes / Functional / etc. across the
// Lifestyle / Audience / Trend groups. NOT approval-gated — these ship live.
// -----------------------------------------------------------------------------

export async function saveProductLifestyleTags(
  productTemplateId: string,
  tagIds: string[],
): Promise<Result> {
  const { user, partner, error, template } = await authorize(productTemplateId)
  if (error) return { ok: false, error }

  const desired = new Set(tagIds.filter((id) => typeof id === 'string' && id.length > 0))

  // Validate every desired tag is real + active.
  if (desired.size > 0) {
    const existing = await prisma.lifestyleTag.findMany({
      where: { id: { in: Array.from(desired) }, isActive: true },
      select: { id: true },
    })
    const existingIds = new Set(existing.map((t) => t.id))
    for (const id of desired) {
      if (!existingIds.has(id)) {
        return { ok: false, error: 'One or more lifestyle tags are invalid.' }
      }
    }
  }

  const current = await prisma.productTemplateLifestyleTag.findMany({
    where: { productTemplateId: template.id },
    select: { lifestyleTagId: true },
  })
  const currentIds = new Set(current.map((c) => c.lifestyleTagId))

  const toAdd = Array.from(desired).filter((id) => !currentIds.has(id))
  const toRemove = Array.from(currentIds).filter((id) => !desired.has(id))

  if (toAdd.length === 0 && toRemove.length === 0) return { ok: true }

  try {
    await prisma.$transaction(async (tx) => {
      if (toAdd.length > 0) {
        await tx.productTemplateLifestyleTag.createMany({
          data: toAdd.map((lifestyleTagId) => ({
            productTemplateId: template.id,
            lifestyleTagId,
            source: 'MANUFACTURER' as const,
          })),
          skipDuplicates: true,
        })
      }
      if (toRemove.length > 0) {
        await tx.productTemplateLifestyleTag.deleteMany({
          where: {
            productTemplateId: template.id,
            lifestyleTagId: { in: toRemove },
          },
        })
      }
    })
  } catch (err) {
    return { ok: false, error: `Could not save lifestyle tags: ${(err as Error).message}` }
  }

  // Lifestyle tags ship live — no PENDING_EDIT_REVIEW gate. We still write a
  // product-level AuditLog so admin sees the change.
  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: template.id,
    action: 'PRODUCT_TEMPLATE_LIFESTYLE_TAGS_UPDATED',
    payload: { partnerId: partner.id, added: toAdd, removed: toRemove },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// LABEL PHRASES — 2026-06-05 per-product label-phrase suggestion engine.
// Mirrors the Niches card: a deterministic engine (@ilaunchify/marketplace
// suggestPhrases) computes which regulatory phrases apply to this product.
// Two write paths:
//   • saveProductPhraseFacts — the manufacturer answers yes/no FACTS about the
//     product (DSHEA claims, aerosol, tamper-evident, …). These feed the engine
//     so a handful of MANDATORY phrases trigger deterministically.
//   • saveProductPhrases — the manufacturer toggles RECOMMENDED phrases on/off.
//     MANDATORY/locked phrases are force-included server-side and cannot be
//     dropped.
//
// **Approval map** — both writes re-gate a PUBLISHED template to
// PENDING_EDIT_REVIEW (label phrases are compliance-bearing). Draft /
// NEEDS_CHANGES rows stay put.
// -----------------------------------------------------------------------------

const PHRASE_FACT_KEY_SET = new Set<string>(PHRASE_FACT_KEYS)

export async function saveProductPhraseFacts(
  productTemplateId: string,
  facts: Record<string, boolean>,
): Promise<Result<{ suggestions: SuggestPhrasesResult['suggestions'] }>> {
  const { user, partner, error, template } = await authorize(productTemplateId)
  if (error) return { ok: false, error }

  // Sanitize: keep only known PHRASE_FACT_FLAGS keys with boolean values. A
  // hand-crafted POST can't smuggle arbitrary JSON into the column.
  const cleaned: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(facts ?? {})) {
    if (PHRASE_FACT_KEY_SET.has(key) && typeof value === 'boolean') {
      cleaned[key] = value
    }
  }

  // Approval-map — published templates flip to PENDING_EDIT_REVIEW on fact edits.
  const shouldGateForReview = template.status === 'PUBLISHED'

  try {
    await prisma.$transaction(async (tx) => {
      await tx.productTemplate.update({
        where: { id: template.id },
        data: { phraseFacts: cleaned },
      })
      if (shouldGateForReview) {
        await tx.productTemplate.update({
          where: { id: template.id },
          data: { status: 'PENDING_EDIT_REVIEW' },
        })
      }
    })
  } catch (err) {
    return { ok: false, error: `Could not save product facts: ${(err as Error).message}` }
  }

  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: template.id,
    action: 'PRODUCT_TEMPLATE_PHRASE_FACTS_UPDATED',
    fromValue: template.status,
    toValue: shouldGateForReview ? 'PENDING_EDIT_REVIEW' : template.status,
    payload: { partnerId: partner.id, facts: cleaned, gatedForReview: shouldGateForReview },
  })

  // Re-run the engine post-write so the client re-renders against fresh facts.
  const suggestion = await suggestPhrases({ productTemplateId: template.id })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true, data: { suggestions: suggestion.suggestions } }
}

export async function saveProductPhrases(
  productTemplateId: string,
  mandatoryPhraseIds: string[],
): Promise<Result<{ suggestions: SuggestPhrasesResult['suggestions'] }>> {
  const { user, partner, error, template } = await authorize(productTemplateId)
  if (error) return { ok: false, error }

  // Re-run the engine — locked/mandatory phrases cannot be deselected. We need
  // this regardless to (a) enforce the locked invariant server-side and (b)
  // return fresh suggestions to the client.
  const suggestion = await suggestPhrases({ productTemplateId: template.id })
  const lockedPhraseIds = new Set(
    suggestion.suggestions.filter((s) => s.isLocked).map((s) => s.phraseId),
  )
  // Map phraseId → engine-suggested rule id (for the AUTO_RULE-ish audit trail)
  // and the rule's requirement so created rows carry the right catalog value.
  const ruleIdByPhraseId = new Map<string, string>()
  for (const s of suggestion.suggestions) ruleIdByPhraseId.set(s.phraseId, s.ruleId)

  // Dedupe + normalise input, then force-include every locked phrase — the
  // manufacturer cannot drop a mandatory phrase.
  const desired = new Set(
    mandatoryPhraseIds.filter((id) => typeof id === 'string' && id.length > 0),
  )
  for (const lockedId of lockedPhraseIds) desired.add(lockedId)

  // Validate every desired id is an active MandatoryPhrase (defence in depth).
  const desiredArr = Array.from(desired)
  const phraseRows = desiredArr.length
    ? await prisma.mandatoryPhrase.findMany({
        where: { id: { in: desiredArr }, isActive: true },
        select: { id: true, requirement: true },
      })
    : []
  const requirementByPhraseId = new Map(phraseRows.map((p) => [p.id, p.requirement]))
  for (const id of desired) {
    if (!requirementByPhraseId.has(id)) {
      return { ok: false, error: 'One or more phrases are invalid.' }
    }
  }

  // Current state — what's already linked.
  const current = await prisma.productTemplatePhrase.findMany({
    where: { productTemplateId: template.id },
    select: { mandatoryPhraseId: true },
  })
  const currentIds = new Set(current.map((c) => c.mandatoryPhraseId))

  const toAdd = desiredArr.filter((id) => !currentIds.has(id))
  const toRemove = Array.from(currentIds).filter((id) => !desired.has(id))

  // Refuse to remove any locked phrase (paranoid — the desired-set logic above
  // already re-adds locked, but a client racing the engine could submit stale).
  for (const id of toRemove) {
    if (lockedPhraseIds.has(id)) {
      return { ok: false, error: 'A required phrase cannot be removed.' }
    }
  }

  if (toAdd.length === 0 && toRemove.length === 0) {
    return { ok: true, data: { suggestions: suggestion.suggestions } }
  }

  // Approval-map — published templates flip to PENDING_EDIT_REVIEW on edits.
  const shouldGateForReview = template.status === 'PUBLISHED'

  try {
    await prisma.$transaction(async (tx) => {
      if (toAdd.length > 0) {
        await tx.productTemplatePhrase.createMany({
          data: toAdd.map((mandatoryPhraseId) => ({
            productTemplateId: template.id,
            mandatoryPhraseId,
            requirement: requirementByPhraseId.get(mandatoryPhraseId) ?? 'RECOMMENDED',
            source: 'MANUFACTURER' as const,
          })),
          skipDuplicates: true,
        })
      }
      if (toRemove.length > 0) {
        await tx.productTemplatePhrase.deleteMany({
          where: { productTemplateId: template.id, mandatoryPhraseId: { in: toRemove } },
        })
      }
      if (shouldGateForReview) {
        await tx.productTemplate.update({
          where: { id: template.id },
          data: { status: 'PENDING_EDIT_REVIEW' },
        })
      }
    })
  } catch (err) {
    return { ok: false, error: `Could not save phrases: ${(err as Error).message}` }
  }

  // Audit — one PhraseAssignmentAudit row per delta (outside the txn), plus a
  // single product-level AuditLog summarising the change.
  for (const mandatoryPhraseId of toAdd) {
    await recordPhraseAssignment({
      productTemplateId: template.id,
      mandatoryPhraseId,
      source: 'MANUFACTURER',
      ruleId: ruleIdByPhraseId.get(mandatoryPhraseId) ?? null,
      actorUserId: user.id,
      applied: true,
    })
  }
  for (const mandatoryPhraseId of toRemove) {
    await recordPhraseAssignment({
      productTemplateId: template.id,
      mandatoryPhraseId,
      source: 'MANUFACTURER',
      ruleId: null,
      actorUserId: user.id,
      applied: false,
    })
  }
  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: template.id,
    action: 'PRODUCT_TEMPLATE_PHRASES_UPDATED',
    fromValue: template.status,
    toValue: shouldGateForReview ? 'PENDING_EDIT_REVIEW' : template.status,
    payload: {
      partnerId: partner.id,
      added: toAdd,
      removed: toRemove,
      lockedPhrases: Array.from(lockedPhraseIds),
      gatedForReview: shouldGateForReview,
    },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true, data: { suggestions: suggestion.suggestions } }
}
