'use server'

// Server actions for the editor cards on /partner/products/[id]/edit.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.3 + #131.
//
// Each card-level write goes through one of these. Ownership is checked
// via manufacturerServiceId → PartnerService → Partner. Edits on REJECTED
// templates are refused. Most actions trigger revalidatePath on the editor.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { uploadFile, brandAssetKey } from '@ilaunchify/storage'
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

  const slot = await prisma.$transaction(async (tx) => {
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
  const { partner, template, error } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }

  const instance = await prisma.partnerCertificateInstance.findUnique({
    where: { id: input.instanceId },
    select: { partnerId: true, status: true },
  })
  if (!instance || instance.partnerId !== partner.id) {
    return { ok: false, error: 'Certificate not found in your catalog.' }
  }
  if (instance.status !== 'VERIFIED') {
    return { ok: false, error: 'Only VERIFIED certificates can be attached. Wait for admin review.' }
  }

  const existing = await prisma.productCertificate.findUnique({
    where: { productTemplateId_instanceId: { productTemplateId: template.id, instanceId: input.instanceId } },
  })
  if (existing) return { ok: false, error: 'That certificate is already attached.' }

  await prisma.productCertificate.create({
    data: {
      productTemplateId: template.id,
      instanceId: input.instanceId,
      appliesToPackagingSystemIds: [],
    },
  })

  revalidatePath(`/products/${template.id}/edit`)
  return { ok: true }
}

export async function detachCertificate(input: {
  productTemplateId: string
  instanceId: string
}): Promise<Result> {
  const { error, template } = await authorize(input.productTemplateId)
  if (error) return { ok: false, error }

  await prisma.productCertificate.delete({
    where: {
      productTemplateId_instanceId: { productTemplateId: template.id, instanceId: input.instanceId },
    },
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
