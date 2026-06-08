'use server'

// Partner product template builder actions.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4 + #130.
//
// Flow:
//   /partner/products/new (Stepper) → createDraftFromStepper → DRAFT row
//                                   → redirect to /partner/products/[id]/edit
//   /partner/products/[id]/edit     → autosave via saveProductFields (debounced)
//                                   → submitForReview when ready

import { prisma, findFirstBannedIngredient, findBannedProductTerm } from '@ilaunchify/db'
import { evaluateProductRestrictions } from '@ilaunchify/marketplace'
import type { ProductTemplateStatus } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

async function requirePartner() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { user, partner: null as null, error: 'NOT_A_PARTNER' as const }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      companyName: true,
      services: {
        where: { type: 'MANUFACTURING' },
        select: { id: true },
        take: 1,
      },
    },
  })
  if (!partner) return { user, partner: null as null, error: 'PARTNER_NOT_FOUND' as const }
  return { user, partner, error: null as null }
}

// -----------------------------------------------------------------------------
// CREATE DRAFT from stepper completion (one transaction).
//
// Atomically writes:
//   - ProductTemplate (DRAFT)
//   - TemplateIngredientSlot rows (one per stepper ingredient)
//     · Each row needs an Ingredient FK; we create partner-private Ingredient
//       rows on the fly with SELF_ATTESTED verification (per docs §4a.5).
//   - ProductTemplatePackaging links (one per picked packaging)
//   - ProductTemplateVariant (single default — partner edits the rest in /edit)
// -----------------------------------------------------------------------------

export interface StepperIngredient {
  /**
   * Picked from the unified ingredient search (USDA / Library / partner-
   * private) — the preferred path since 2026-06-05. When present the slot
   * points at this real Ingredient row (with nutrition + allergen flags).
   */
  ingredientId?: string | null
  /** Display name; also the legacy free-text path when ingredientId is null. */
  name: string
  weightG: number
  /** UI-only — source chip in the stepper row. Ignored server-side. */
  source?: string
}

export interface CreateDraftInput {
  // Step 1 — What
  name: string
  subcategoryId: string
  // Step 2 — How it's made
  ingredients: StepperIngredient[]
  // Step 3 — How it ships
  packagingSystemIds: string[]
  // Step 4 — What it costs
  priceFloorCents: number
  containerFormat: string
  servingsPerContainer: number
  servingSizeG: number
}

export async function createDraftFromStepper(
  input: CreateDraftInput,
): Promise<Result<{ id: string; slug: string }>> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  if (!input.name.trim() || input.name.trim().length > 120) {
    return { ok: false, error: 'Product name must be 2–120 characters.' }
  }
  if (!input.subcategoryId) return { ok: false, error: 'Pick a category + subcategory.' }
  if (input.ingredients.length === 0) {
    return { ok: false, error: 'Add at least one base ingredient.' }
  }
  if (input.packagingSystemIds.length === 0) {
    return { ok: false, error: 'Pick at least one packaging system.' }
  }
  if (input.priceFloorCents < 1) {
    return { ok: false, error: 'Set a base price (in cents).' }
  }
  if (!input.containerFormat.trim()) {
    return { ok: false, error: 'Describe the container (e.g. "16oz jar").' }
  }

  // Slug uniqueness — derive from name + partner id suffix so reuse is fine.
  const baseSlug = slugify(input.name)
  let slug = `${baseSlug}-${partner.id.slice(-6)}`
  let suffix = 0
  while (await prisma.productTemplate.findUnique({ where: { slug }, select: { id: true } })) {
    suffix += 1
    slug = `${baseSlug}-${partner.id.slice(-6)}-${suffix}`
    if (suffix > 50) return { ok: false, error: 'Could not generate a unique slug. Try a different name.' }
  }

  // Verify the partner owns the picked packaging + has a MANUFACTURING service.
  const manufacturerService = partner.services[0]
  // V1 schema allows manufacturerServiceId NULL — that's fine if partner doesn't have MANUFACTURING.

  const ownedPackaging = await prisma.packagingSystem.findMany({
    where: { id: { in: input.packagingSystemIds }, partnerId: partner.id },
    select: { id: true },
  })
  if (ownedPackaging.length !== input.packagingSystemIds.length) {
    return { ok: false, error: 'One or more packaging systems do not belong to you.' }
  }

  const subcat = await prisma.subcategory.findUnique({
    where: { id: input.subcategoryId },
    select: { id: true },
  })
  if (!subcat) return { ok: false, error: 'Subcategory not found.' }

  // Validate picked ingredient ids (the unified-picker path) — USDA + LIBRARY
  // are open to everyone; PARTNER_PRIVATE must belong to this partner. Same
  // visibility rule as addIngredientSlot / searchIngredients.
  const pickedIds = [
    ...new Set(
      input.ingredients.map((i) => i.ingredientId).filter((v): v is string => !!v),
    ),
  ]
  if (pickedIds.length > 0) {
    const visible = await prisma.ingredient.findMany({
      where: {
        id: { in: pickedIds },
        isDeclaredPanelSynthetic: false,
        OR: [
          { source: 'USDA' },
          { source: 'LIBRARY' },
          { source: 'PARTNER_PRIVATE', ownerPartnerId: partner.id },
        ],
      },
      select: { id: true },
    })
    if (visible.length !== pickedIds.length) {
      return { ok: false, error: 'One or more picked ingredients are unavailable.' }
    }
  }

  // -------- Transactional create --------
  let created: { id: string; slug: string }
  try {
    created = await prisma.$transaction(async (tx) => {
      // 1. Resolve an Ingredient FK per stepper row. Picker rows (2026-06-05)
      //    point at REAL ingredients — USDA/Library nutrition + allergen flags
      //    flow into the label from minute one. Name-only rows keep the legacy
      //    SELF_ATTESTED partner-private create (back-compat; promote later
      //    via #138/#140).
      const ingredientIds: string[] = []
      for (const ing of input.ingredients) {
        if (ing.ingredientId) {
          ingredientIds.push(ing.ingredientId) // validated above
          continue
        }
        const createdIng = await tx.ingredient.create({
          data: {
            name: ing.name.trim(),
            internalName: ing.name.trim(),
            labelDeclarationName: ing.name.trim(),
            nutritionPer100g: {}, // empty for now; populated when partner switches to a USDA/library source
            source: 'PARTNER_PRIVATE',
            ownerPartnerId: partner.id,
            verificationStatus: 'SELF_ATTESTED',
            createdById: user.id,
            allergenFlags: [],
          },
        })
        ingredientIds.push(createdIng.id)
      }

      // 2. Create the ProductTemplate
      const tpl = await tx.productTemplate.create({
        data: {
          name: input.name.trim(),
          slug,
          subcategoryId: input.subcategoryId,
          manufacturerServiceId: manufacturerService?.id ?? null,
          status: 'DRAFT',
          priceFloorCents: input.priceFloorCents,
          unitCostCents: input.priceFloorCents, // partner refines later
        },
      })

      // 3. Slot rows
      await Promise.all(
        ingredientIds.map((ingredientId, i) =>
          tx.templateIngredientSlot.create({
            data: {
              productTemplateId: tpl.id,
              baseIngredientId: ingredientId,
              weightG: input.ingredients[i]!.weightG,
              displayOrder: i,
            },
          }),
        ),
      )

      // 4. Packaging links. ProductTemplatePackaging requires per-size pricing.
      //    Stepper captures one base price; we mirror it to every linked
      //    packaging system. Partner refines per-size pricing in the editor.
      await Promise.all(
        input.packagingSystemIds.map((packagingSystemId) =>
          tx.productTemplatePackaging.create({
            data: {
              productTemplateId: tpl.id,
              packagingSystemId,
              basePriceCents: input.priceFloorCents,
              leadTimeDays: 30,
              pricingTiers: [],
            },
          }),
        ),
      )

      // 5. Single default variant (partner adds more in /edit)
      await tx.productTemplateVariant.create({
        data: {
          productTemplateId: tpl.id,
          containerFormat: input.containerFormat.trim(),
          servingsPerContainer: Math.max(1, input.servingsPerContainer),
          servingSizeG: input.servingSizeG > 0 ? input.servingSizeG : 30,
        },
      })

      return { id: tpl.id, slug: tpl.slug }
    })
  } catch (err) {
    return { ok: false, error: `Could not create product: ${(err as Error).message}` }
  }

  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: created.id,
    action: 'PRODUCT_TEMPLATE_CREATE',
    toValue: 'DRAFT',
    payload: {
      partnerId: partner.id,
      name: input.name,
      ingredientCount: input.ingredients.length,
      packagingCount: input.packagingSystemIds.length,
    },
  })

  revalidatePath('/products')
  return { ok: true, data: created }
}

// -----------------------------------------------------------------------------
// Autosave — partial field update for the single-page editor.
// Server validates ownership + accepts a small whitelisted patch shape.
// -----------------------------------------------------------------------------

export interface SaveProductPatch {
  name?: string
  description?: string
  priceFloorCents?: number
  unitCostCents?: number
  allergenCrossContamination?: string | null
  customMeta?: Array<{ key: string; value: string }> | null
}

export async function saveProductFields(
  productTemplateId: string,
  patch: SaveProductPatch,
): Promise<Result> {
  const { partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const tpl = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    select: { manufacturerServiceId: true, status: true },
  })
  if (!tpl) return { ok: false, error: 'Product not found.' }
  // Ownership via manufacturerServiceId → PartnerService → Partner.
  // Defense in depth: also check via Partner.services
  if (tpl.manufacturerServiceId) {
    const owned = await prisma.partnerService.findFirst({
      where: { id: tpl.manufacturerServiceId, partnerId: partner.id },
      select: { id: true },
    })
    if (!owned) return { ok: false, error: 'Not your product.' }
  }

  // Refuse edits on REJECTED rows (partner must clone or start fresh).
  if (tpl.status === 'REJECTED') {
    return { ok: false, error: 'Rejected templates are read-only. Create a new draft.' }
  }

  await prisma.productTemplate.update({
    where: { id: productTemplateId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.priceFloorCents !== undefined ? { priceFloorCents: patch.priceFloorCents } : {}),
      ...(patch.unitCostCents !== undefined ? { unitCostCents: patch.unitCostCents } : {}),
      ...(patch.allergenCrossContamination !== undefined
        ? { allergenCrossContamination: patch.allergenCrossContamination?.trim() || null }
        : {}),
      ...(patch.customMeta !== undefined ? { customMeta: patch.customMeta ?? undefined } : {}),
    },
  })

  revalidatePath(`/products/${productTemplateId}/edit`)
  revalidatePath('/products')
  return { ok: true }
}

// -----------------------------------------------------------------------------
// Submit DRAFT for first review (DRAFT → PENDING_REVIEW).
// Edits to a PUBLISHED row use a different flow (pendingEditPayload → PENDING_EDIT_REVIEW),
// wired in #133.
// -----------------------------------------------------------------------------

export async function submitProductForReview(productTemplateId: string): Promise<Result> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const tpl = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    include: {
      subcategory: { select: { slug: true } },
      niches: { select: { niche: { select: { slug: true } } } },
      ingredientSlots: {
        select: {
          id: true,
          baseIngredient: {
            select: { name: true, internalName: true, labelDeclarationName: true },
          },
        },
      },
      optionalIngredients: {
        select: {
          ingredient: {
            select: { name: true, internalName: true, labelDeclarationName: true },
          },
        },
      },
      packagingSystems: { select: { packagingSystemId: true } },
      variants: { select: { id: true } },
    },
  })
  if (!tpl) return { ok: false, error: 'Product not found.' }
  if (tpl.status !== 'DRAFT' && tpl.status !== 'NEEDS_CHANGES') {
    return { ok: false, error: `Cannot submit from status ${tpl.status}.` }
  }
  if (tpl.ingredientSlots.length === 0) {
    return { ok: false, error: 'Add at least one ingredient slot.' }
  }
  if (tpl.packagingSystems.length === 0) {
    return { ok: false, error: 'Pick at least one packaging system.' }
  }
  if (tpl.variants.length === 0) {
    return { ok: false, error: 'Configure at least one variant (container size).' }
  }

  // Banned-ingredient runtime enforcement (FDA_REGULATORY_POSTURE §5). Re-check
  // the full composition at the publish gate — refuse the transition + audit
  // the block if any base/optional ingredient matches the dictionary.
  const ingredientNames = [
    ...tpl.ingredientSlots.flatMap((s) =>
      s.baseIngredient
        ? [s.baseIngredient.name, s.baseIngredient.internalName, s.baseIngredient.labelDeclarationName]
        : [],
    ),
    ...tpl.optionalIngredients.flatMap((o) =>
      o.ingredient
        ? [o.ingredient.name, o.ingredient.internalName, o.ingredient.labelDeclarationName]
        : [],
    ),
  ].filter((n): n is string => Boolean(n))

  const banned = await findFirstBannedIngredient(ingredientNames)
  if (banned) {
    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: productTemplateId,
      action: 'PRODUCT_TEMPLATE_BANNED_BLOCK',
      fromValue: tpl.status,
      payload: {
        name: tpl.name,
        partnerId: partner.id,
        offendingIngredient: banned.name,
        matchedBanned: banned.match.matchName,
        reason: banned.match.reason,
        reference: banned.match.reference,
      },
    })
    return {
      ok: false,
      error: `Cannot submit: "${banned.name}" is a banned ingredient — ${banned.match.reason}. Remove it before submitting.`,
    }
  }

  // Banned-product-category gate (FDA_REGULATORY_POSTURE §5 item 14 / risk #9) —
  // defense-in-depth so a banned product TYPE never reaches PENDING_REVIEW.
  const bannedCategory = findBannedProductTerm({
    name: tpl.name,
    subcategorySlug: tpl.subcategory?.slug,
    nicheSlugs: tpl.niches.map((n) => n.niche.slug),
    ingredientNames,
  })
  if (bannedCategory) {
    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: productTemplateId,
      action: 'PRODUCT_BANNED_CATEGORY_BLOCK',
      fromValue: tpl.status,
      payload: {
        name: tpl.name,
        partnerId: partner.id,
        bannedTerm: bannedCategory.term,
        label: bannedCategory.label,
        reason: bannedCategory.reason,
        matchedIn: bannedCategory.matchedIn,
      },
    })
    return {
      ok: false,
      error: `Cannot submit: ${bannedCategory.label} is a prohibited product category — ${bannedCategory.reason}`,
    }
  }

  // Restricted-category gate (labeling ≠ licensing) — the authoritative source
  // block. The two checks above are term/ingredient-based, so they can't see a
  // restriction declared via a FACT (isAlcoholBeverage / isHempCbd /
  // isTobaccoNicotine) or the OTC labeling type. This evaluator does — the same
  // one every downstream surface uses. A restricted formulation must never reach
  // PENDING_REVIEW: blocking it here means it's never published, so it never
  // appears in the marketplace, the Design Studio, or checkout.
  const restrictionHits = evaluateProductRestrictions({
    labelingType: tpl.labelingType,
    phraseFacts: (tpl.phraseFacts ?? null) as Record<string, unknown> | null,
    ingredientNames,
  })
  if (restrictionHits.length > 0) {
    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: productTemplateId,
      action: 'PRODUCT_TEMPLATE_RESTRICTED_BLOCK',
      fromValue: tpl.status,
      payload: {
        name: tpl.name,
        partnerId: partner.id,
        restrictions: restrictionHits.map((h) => ({
          code: h.code,
          matchedBy: h.matchedBy,
          evidence: h.evidence,
        })),
      },
    })
    const labels = restrictionHits.map((h) => h.label).join(', ')
    return {
      ok: false,
      error:
        `Cannot submit: ${labels} — this category requires licensing iLaunchify ` +
        `doesn't support yet, so it can't be produced on the platform. This is not legal advice.`,
    }
  }

  await prisma.productTemplate.update({
    where: { id: productTemplateId },
    data: { status: 'PENDING_REVIEW' },
  })

  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: productTemplateId,
    action: 'PRODUCT_TEMPLATE_SUBMIT_FOR_REVIEW',
    fromValue: tpl.status,
    toValue: 'PENDING_REVIEW',
    payload: { partnerId: partner.id, name: tpl.name },
  })

  revalidatePath('/products')
  revalidatePath(`/products/${productTemplateId}/edit`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// Archive a DRAFT (partner cleanup). Published rows can't be archived this way —
// admin handles deprecation.
// -----------------------------------------------------------------------------

export async function archiveDraft(productTemplateId: string): Promise<Result> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const tpl = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    select: { id: true, status: true, name: true, manufacturerServiceId: true },
  })
  if (!tpl) return { ok: false, error: 'Product not found.' }
  if (tpl.status !== 'DRAFT' && tpl.status !== 'NEEDS_CHANGES') {
    return { ok: false, error: 'Only draft templates can be archived by the partner.' }
  }
  if (tpl.manufacturerServiceId) {
    const owned = await prisma.partnerService.findFirst({
      where: { id: tpl.manufacturerServiceId, partnerId: partner.id },
      select: { id: true },
    })
    if (!owned) return { ok: false, error: 'Not your product.' }
  }

  await prisma.productTemplate.update({
    where: { id: productTemplateId },
    data: { status: 'REJECTED' }, // REJECTED + back-compat ARCHIVED alias serve the same role
  })

  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: productTemplateId,
    action: 'PRODUCT_TEMPLATE_ARCHIVE',
    fromValue: tpl.status,
    toValue: 'REJECTED',
    payload: { partnerId: partner.id, name: tpl.name },
  })

  revalidatePath('/products')
  return { ok: true }
}

// -----------------------------------------------------------------------------
// PAUSE / RESUME — partner-side marketplace visibility toggle.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4 + the admin PUBLISHED⇄PAUSED
// transition. A live (PUBLISHED) template can be pulled from the marketplace
// by its own manufacturer at any time; PAUSED hides it from creators while
// preserving everything (recipe, certs, history) so re-listing is one click.
// Reversible, audited, ownership-checked. We never touch templates that are
// mid-review (PENDING_*), draft, or archived — only the live⇄paused pair.
// -----------------------------------------------------------------------------

type LoadedTemplate =
  | { ok: false; error: string }
  | {
      ok: true
      user: Awaited<ReturnType<typeof requirePartner>>['user']
      partnerId: string
      tpl: { id: string; status: ProductTemplateStatus; name: string; manufacturerServiceId: string | null }
    }

async function loadOwnedTemplate(productTemplateId: string): Promise<LoadedTemplate> {
  const { user, partner, error } = await requirePartner()
  if (error || !partner) return { ok: false, error: error ?? 'Not a partner.' }
  const tpl = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    select: { id: true, status: true, name: true, manufacturerServiceId: true },
  })
  if (!tpl) return { ok: false, error: 'Product not found.' }
  if (tpl.manufacturerServiceId) {
    const owned = await prisma.partnerService.findFirst({
      where: { id: tpl.manufacturerServiceId, partnerId: partner.id },
      select: { id: true },
    })
    if (!owned) return { ok: false, error: 'Not your product.' }
  }
  return { ok: true, user, partnerId: partner.id, tpl }
}

export async function pauseProduct(productTemplateId: string): Promise<Result> {
  const loaded = await loadOwnedTemplate(productTemplateId)
  if (!loaded.ok) return { ok: false, error: loaded.error }
  const { user, partnerId, tpl } = loaded

  if (tpl.status !== 'PUBLISHED') {
    return { ok: false, error: 'Only live products can be turned off.' }
  }

  await prisma.productTemplate.update({
    where: { id: productTemplateId },
    data: { status: 'PAUSED' },
  })

  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: productTemplateId,
    action: 'PRODUCT_TEMPLATE_PAUSE',
    fromValue: 'PUBLISHED',
    toValue: 'PAUSED',
    payload: { partnerId, name: tpl.name, initiatedBy: 'PARTNER' },
  })

  revalidatePath('/products')
  return { ok: true }
}

export async function resumeProduct(productTemplateId: string): Promise<Result> {
  const loaded = await loadOwnedTemplate(productTemplateId)
  if (!loaded.ok) return { ok: false, error: loaded.error }
  const { user, partnerId, tpl } = loaded

  if (tpl.status !== 'PAUSED') {
    return { ok: false, error: 'Only paused products can be re-listed.' }
  }

  await prisma.productTemplate.update({
    where: { id: productTemplateId },
    data: { status: 'PUBLISHED' },
  })

  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: productTemplateId,
    action: 'PRODUCT_TEMPLATE_REACTIVATE',
    fromValue: 'PAUSED',
    toValue: 'PUBLISHED',
    payload: { partnerId, name: tpl.name, initiatedBy: 'PARTNER' },
  })

  revalidatePath('/products')
  return { ok: true }
}

// -----------------------------------------------------------------------------
// CLONE — create a new DRAFT ProductTemplate by copying an existing source.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.1a + #134.
//
// Two source modes:
//   STARTER — admin-curated platform template (slug starts with 'starter-',
//             manufacturerServiceId NULL). Anyone can clone.
//   OWN     — partner's own template (DRAFT or PUBLISHED). Ownership-checked.
//
// We copy: name, description, prices, subcategory, ingredient slots (with
// their base ingredients + replacements + replacements' ingredients), variants,
// allergen overrides, customMeta. We DO NOT copy: packaging links (partner
// picks their own), certificates (partner attaches their own VERIFIED ones),
// notes, status, slug. New row is always DRAFT.
// -----------------------------------------------------------------------------

export type CloneSource = 'STARTER' | 'OWN'

export async function cloneTemplate(input: {
  sourceTemplateId: string
  source: CloneSource
  newName: string
}): Promise<Result<{ id: string; slug: string }>> {
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return { ok: false, error: 'Sign in as a partner.' }
  }

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      services: { where: { type: 'MANUFACTURING' }, select: { id: true }, take: 1 },
    },
  })
  if (!partner) return { ok: false, error: 'Your partner record is missing.' }

  // -------- Source validation --------
  const source = await prisma.productTemplate.findUnique({
    where: { id: input.sourceTemplateId },
    include: {
      ingredientSlots: {
        include: {
          baseIngredient: true,
          replacements: { include: { ingredient: true } },
        },
        orderBy: { displayOrder: 'asc' },
      },
      variants: true,
    },
  })
  if (!source) return { ok: false, error: 'Source template not found.' }

  // STARTER: must start with 'starter-' + have NULL manufacturerServiceId
  // OWN:     must belong to this partner via manufacturerServiceId
  if (input.source === 'STARTER') {
    if (!source.slug.startsWith('starter-') || source.manufacturerServiceId !== null) {
      return { ok: false, error: 'That template is not a starter — you cannot clone it.' }
    }
  } else {
    const owned =
      source.manufacturerServiceId !== null &&
      (await prisma.partnerService.findFirst({
        where: { id: source.manufacturerServiceId, partnerId: partner.id },
        select: { id: true },
      }))
    if (!owned) return { ok: false, error: 'You can only clone your own templates.' }
  }

  // -------- Slug generation (unique) --------
  const newName = input.newName.trim() || `${source.name} (copy)`
  if (newName.length > 120) {
    return { ok: false, error: 'New name must be ≤ 120 characters.' }
  }
  const baseSlug = slugify(newName)
  let slug = `${baseSlug}-${partner.id.slice(-6)}`
  let suffix = 0
  while (await prisma.productTemplate.findUnique({ where: { slug }, select: { id: true } })) {
    suffix += 1
    slug = `${baseSlug}-${partner.id.slice(-6)}-${suffix}`
    if (suffix > 50) return { ok: false, error: 'Could not generate a unique slug — try a different name.' }
  }

  // -------- Transactional clone --------
  let created: { id: string; slug: string }
  try {
    created = await prisma.$transaction(async (tx) => {
      // 1. Reuse vs copy ingredients: for STARTER clones we point at the same
      //    LIBRARY ingredients (they're public). For OWN clones with partner-
      //    private ingredients, we create new partner-private duplicates so
      //    edits to the clone don't bleed into the original.
      const slotIngredientIds: string[] = []
      const replacementMappings: Array<{
        slotIndex: number
        replacementIds: string[]
      }> = []

      for (let i = 0; i < source.ingredientSlots.length; i++) {
        const slot = source.ingredientSlots[i]!
        const base = slot.baseIngredient

        let newBaseId: string
        if (base.source === 'LIBRARY' || base.source === 'USDA') {
          // Public — reuse
          newBaseId = base.id
        } else {
          // Partner-private — duplicate (owned by this partner)
          const dup = await tx.ingredient.create({
            data: {
              name: base.name,
              internalName: base.internalName,
              labelDeclarationName: base.labelDeclarationName,
              nutritionPer100g: base.nutritionPer100g as never,
              source: 'PARTNER_PRIVATE',
              ownerPartnerId: partner.id,
              verificationStatus: 'SELF_ATTESTED',
              createdById: user.id,
              allergenFlags: base.allergenFlags,
              densityGPerML: base.densityGPerML,
              complianceNotes: base.complianceNotes,
              bioengineeredStatus: base.bioengineeredStatus,
            },
          })
          newBaseId = dup.id
        }
        slotIngredientIds.push(newBaseId)

        // Replacements — same logic
        const newReplacementIds: string[] = []
        for (const r of slot.replacements) {
          const ing = r.ingredient
          if (ing.source === 'LIBRARY' || ing.source === 'USDA') {
            newReplacementIds.push(ing.id)
          } else {
            const dup = await tx.ingredient.create({
              data: {
                name: ing.name,
                internalName: ing.internalName,
                labelDeclarationName: ing.labelDeclarationName,
                nutritionPer100g: ing.nutritionPer100g as never,
                source: 'PARTNER_PRIVATE',
                ownerPartnerId: partner.id,
                verificationStatus: 'SELF_ATTESTED',
                createdById: user.id,
                allergenFlags: ing.allergenFlags,
              },
            })
            newReplacementIds.push(dup.id)
          }
        }
        replacementMappings.push({ slotIndex: i, replacementIds: newReplacementIds })
      }

      // 2. ProductTemplate row
      const tpl = await tx.productTemplate.create({
        data: {
          slug,
          name: newName,
          description: source.description,
          subcategoryId: source.subcategoryId,
          manufacturerServiceId: partner.services[0]?.id ?? null,
          status: 'DRAFT',
          priceFloorCents: source.priceFloorCents,
          unitCostCents: source.unitCostCents,
          allergenManualOverrides: source.allergenManualOverrides ?? undefined,
          customMeta: source.customMeta ?? undefined,
        },
      })

      // 3. Slots + replacements (in source order)
      for (let i = 0; i < source.ingredientSlots.length; i++) {
        const srcSlot = source.ingredientSlots[i]!
        const newSlot = await tx.templateIngredientSlot.create({
          data: {
            productTemplateId: tpl.id,
            baseIngredientId: slotIngredientIds[i]!,
            weightG: srcSlot.weightG,
            displayOrder: srcSlot.displayOrder,
            allowReplacement: srcSlot.allowReplacement,
            label: srcSlot.label,
            description: srcSlot.description,
          },
        })
        const mapping = replacementMappings[i]!
        for (let j = 0; j < srcSlot.replacements.length; j++) {
          await tx.templateIngredientReplacement.create({
            data: {
              slotId: newSlot.id,
              ingredientId: mapping.replacementIds[j]!,
              weightGOverride: srcSlot.replacements[j]!.weightGOverride,
              calloutText: srcSlot.replacements[j]!.calloutText,
              displayOrder: srcSlot.replacements[j]!.displayOrder,
            },
          })
        }
      }

      // 4. Variants (copy every variant — partner can prune later)
      for (const v of source.variants) {
        await tx.productTemplateVariant.create({
          data: {
            productTemplateId: tpl.id,
            flavor: v.flavor,
            containerFormat: v.containerFormat,
            containerSizeG: v.containerSizeG,
            servingsPerContainer: v.servingsPerContainer,
            servingSizeG: v.servingSizeG,
            servingSizeDesc: v.servingSizeDesc,
            packingType: v.packingType,
            flavorArrangement: v.flavorArrangement,
            innerPacksPerOuter: v.innerPacksPerOuter,
            outerPacksPerCase: v.outerPacksPerCase,
            customerPicksCount: v.customerPicksCount,
            subscriptionInterval: v.subscriptionInterval,
            assortmentFlavors: v.assortmentFlavors ?? undefined,
            packingConfig: v.packingConfig ?? undefined,
            moqMin: v.moqMin,
            moqMax: v.moqMax,
            leadTimeDays: v.leadTimeDays,
            unitCostCentsOverride: v.unitCostCentsOverride,
          },
        })
      }

      return { id: tpl.id, slug: tpl.slug }
    })
  } catch (err) {
    return { ok: false, error: `Clone failed: ${(err as Error).message}` }
  }

  // Distinct audit action so admin can spot starter-derived templates
  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: created.id,
    action: input.source === 'STARTER' ? 'PRODUCT_TEMPLATE_CLONE_STARTER' : 'PRODUCT_TEMPLATE_CLONE_OWN',
    toValue: 'DRAFT',
    payload: {
      partnerId: partner.id,
      sourceTemplateId: input.sourceTemplateId,
      sourceName: source.name,
      newName,
    },
  })

  revalidatePath('/products')
  return { ok: true, data: created }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}
