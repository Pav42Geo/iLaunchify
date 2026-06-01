'use server'

// Server actions for the editor cards on /partner/products/[id]/edit.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.3 + #131.
//
// Each card-level write goes through one of these. Ownership is checked
// via manufacturerServiceId → PartnerService → Partner. Edits on REJECTED
// templates are refused. Most actions trigger revalidatePath on the editor.

import { prisma, findFirstBannedIngredient } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { uploadFile, brandAssetKey } from '@ilaunchify/storage'
import {
  suggestNiches,
  recordNicheAssignment,
  type SuggestNichesResult,
} from '@ilaunchify/marketplace'
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
