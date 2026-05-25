'use server'

// Server actions for the editor cards on /partner/products/[id]/edit.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.3 + #131.
//
// Each card-level write goes through one of these. Ownership is checked
// via manufacturerServiceId → PartnerService → Partner. Edits on REJECTED
// templates are refused. Most actions trigger revalidatePath on the editor.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { revalidatePath } from 'next/cache'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

// -----------------------------------------------------------------------------
// Ownership guard — used by every action below.
// Returns the partner row + the template id if the partner owns it.
// -----------------------------------------------------------------------------

async function authorize(productTemplateId: string) {
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return { user: null, partner: null, template: null, error: 'NOT_A_PARTNER' as const }
  }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) {
    return { user, partner: null, template: null, error: 'PARTNER_NOT_FOUND' as const }
  }
  const template = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    select: { id: true, manufacturerServiceId: true, status: true },
  })
  if (!template) return { user, partner, template: null, error: 'TEMPLATE_NOT_FOUND' as const }
  if (template.status === 'REJECTED') {
    return { user, partner, template: null, error: 'TEMPLATE_REJECTED' as const }
  }
  if (template.manufacturerServiceId) {
    const owned = await prisma.partnerService.findFirst({
      where: { id: template.manufacturerServiceId, partnerId: partner.id },
      select: { id: true },
    })
    if (!owned) return { user, partner, template: null, error: 'NOT_YOUR_TEMPLATE' as const }
  }
  return { user, partner, template, error: null as null }
}

// -----------------------------------------------------------------------------
// INGREDIENT SLOTS
// -----------------------------------------------------------------------------

export async function addIngredientSlot(input: {
  productTemplateId: string
  name: string
  weightG: number
}): Promise<Result<{ slotId: string }>> {
  const { user, partner, template, error } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }

  if (!input.name.trim()) return { ok: false, error: 'Ingredient name is required.' }
  if (input.weightG <= 0) return { ok: false, error: 'Weight must be greater than 0 grams.' }

  // Create a partner-private Ingredient row + the slot in one txn
  const slot = await prisma.$transaction(async (tx) => {
    const ing = await tx.ingredient.create({
      data: {
        name: input.name.trim(),
        internalName: input.name.trim(),
        labelDeclarationName: input.name.trim(),
        nutritionPer100g: {},
        source: 'PARTNER_PRIVATE',
        ownerPartnerId: partner.id,
        verificationStatus: 'SELF_ATTESTED',
        createdById: user.id,
        allergenFlags: [],
      },
    })
    const lastSlot = await tx.templateIngredientSlot.findFirst({
      where: { productTemplateId: template.id },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    })
    return await tx.templateIngredientSlot.create({
      data: {
        productTemplateId: template.id,
        baseIngredientId: ing.id,
        weightG: input.weightG,
        displayOrder: (lastSlot?.displayOrder ?? -1) + 1,
      },
    })
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
// SLOT REPLACEMENTS — alternative ingredients creator can swap in
// -----------------------------------------------------------------------------

export async function addReplacement(input: {
  slotId: string
  ingredientName: string
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

  if (!input.ingredientName.trim()) {
    return { ok: false, error: 'Replacement ingredient name is required.' }
  }

  const replacement = await prisma.$transaction(async (tx) => {
    const ing = await tx.ingredient.create({
      data: {
        name: input.ingredientName.trim(),
        internalName: input.ingredientName.trim(),
        labelDeclarationName: input.ingredientName.trim(),
        nutritionPer100g: {},
        source: 'PARTNER_PRIVATE',
        ownerPartnerId: partner.id,
        verificationStatus: 'SELF_ATTESTED',
        createdById: user.id,
        allergenFlags: [],
      },
    })
    const lastReplacement = await tx.templateIngredientReplacement.findFirst({
      where: { slotId: input.slotId },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    })
    return await tx.templateIngredientReplacement.create({
      data: {
        slotId: input.slotId,
        ingredientId: ing.id,
        weightGOverride: input.weightGOverride,
        calloutText: input.calloutText?.trim() || null,
        displayOrder: (lastReplacement?.displayOrder ?? -1) + 1,
      },
    })
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

export interface AddVariantInput {
  productTemplateId: string
  flavor: string | null
  containerFormat: string
  containerSizeG: number | null
  servingsPerContainer: number
  servingSizeG: number
  servingSizeDesc: string | null
  moqMin: number
  moqMax: number
  leadTimeDays: number
  unitCostCentsOverride: number | null
}

export async function addVariant(input: AddVariantInput): Promise<Result<{ variantId: string }>> {
  const { error, template } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }

  if (!input.containerFormat.trim()) {
    return { ok: false, error: 'Container format is required.' }
  }
  if (input.servingsPerContainer < 1) return { ok: false, error: 'Servings must be ≥ 1.' }
  if (input.servingSizeG <= 0) return { ok: false, error: 'Serving size must be > 0g.' }
  if (input.moqMin < 1 || input.moqMax < input.moqMin) {
    return { ok: false, error: 'MOQ range invalid (min ≥ 1, max ≥ min).' }
  }

  const variant = await prisma.productTemplateVariant.create({
    data: {
      productTemplateId: template.id,
      flavor: input.flavor?.trim() || null,
      containerFormat: input.containerFormat.trim(),
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
