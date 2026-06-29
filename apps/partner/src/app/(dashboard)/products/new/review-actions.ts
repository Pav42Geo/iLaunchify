'use server'

// Real, domain-aware Review summary for the New Product flow. Replaces the
// hardcoded placeholder cards on the Review & submit step with actual draft data:
// the formulation summary varies by product domain (Nutrition / Supplement Facts /
// INCI declaration / Guaranteed Analysis), plus real pricing tiers + packaging.
// Partner-gated to the owning service. Cast-guarded for formulationData.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'

export interface ReviewSummary {
  name: string
  domain: string // labelingType
  domainLabel: string // "Supplement"
  labelArtifact: string // "Supplement Facts" / "Nutrition Facts" / "INCI declaration" / …
  formulationTitle: string // "8 dietary ingredients · 1 blend"
  formulationStatus: 'done' | 'progress' | 'empty'
  statementOfIdentity: string | null
  /** FOOD only: Nutrition Facts audience label (21 CFR 101.9(j)(5)). null otherwise. */
  ageGroupLabel: string | null
  flavors: number
  pricingTiers: number
  lowestCents: number | null
  packagingName: string | null
  niches: number
  tags: number
}

type Result = { ok: true; data: ReviewSummary } | { ok: false; error: string }

const DOMAIN_LABEL: Record<string, { label: string; artifact: string }> = {
  FOOD: { label: 'Food / Beverage', artifact: 'Nutrition Facts' },
  DIETARY_SUPPLEMENT: { label: 'Supplement', artifact: 'Supplement Facts' },
  COSMETIC: { label: 'Cosmetic', artifact: 'INCI ingredient declaration' },
  PET_PRODUCT: { label: 'Pet', artifact: 'Guaranteed Analysis' },
  OTC: { label: 'OTC drug', artifact: 'Drug Facts' },
}

export async function getProductReviewSummary(draftId: string): Promise<Result> {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false, error: 'Not a partner account.' }
  try {
    const tpl = await (prisma as unknown as {
      productTemplate: { findUnique: (a: unknown) => Promise<{
        name: string
        labelingType: string
        intendedAgeGroup: string | null
        statementOfIdentity: string | null
        manufacturerServiceId: string | null
        formulationData: Record<string, unknown> | null
        packingProfile: { name: string } | null
        pricingTiers: Array<{ minQty: number; perUnitCostCents: number }>
        _count: { ingredientSlots: number; flavorPresets: number; niches: number; lifestyleTags: number }
      } | null> }
    }).productTemplate.findUnique({
      where: { id: draftId },
      select: {
        name: true, labelingType: true, intendedAgeGroup: true, statementOfIdentity: true, manufacturerServiceId: true,
        formulationData: true,
        packingProfile: { select: { name: true } },
        pricingTiers: { select: { minQty: true, perUnitCostCents: true }, orderBy: { minQty: 'asc' } },
        _count: { select: { ingredientSlots: true, flavorPresets: true, niches: true, lifestyleTags: true } },
      },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }

    // Ownership (best-effort; matches the other save actions).
    const partner = await prisma.partner.findUnique({ where: { userId: user.id }, select: { services: { select: { id: true } } } })
    const ownIds = partner?.services.map((s) => s.id) ?? []
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const dom = tpl.labelingType
    const meta = DOMAIN_LABEL[dom] ?? DOMAIN_LABEL.FOOD!
    const fd = (tpl.formulationData ?? {}) as Record<string, unknown>

    let formulationTitle = 'Not started'
    let formulationStatus: ReviewSummary['formulationStatus'] = 'empty'
    if (dom === 'DIETARY_SUPPLEMENT') {
      const s = (fd.supplement ?? {}) as { dietaryIngredients?: unknown[]; blends?: unknown[]; dosageForm?: string }
      const di = s.dietaryIngredients?.length ?? 0
      const bl = s.blends?.length ?? 0
      if (di > 0) {
        formulationTitle = `${di} dietary ingredient${di === 1 ? '' : 's'}${bl ? ` · ${bl} blend${bl === 1 ? '' : 's'}` : ''}${s.dosageForm ? ` · ${s.dosageForm}` : ''}`
        formulationStatus = 'done'
      }
    } else if (dom === 'COSMETIC') {
      const c = (fd.cosmetic ?? {}) as { ingredients?: unknown[]; netContentsQty?: number; netContentsUnit?: string }
      const n = c.ingredients?.length ?? 0
      if (n > 0) {
        formulationTitle = `${n} INCI ingredient${n === 1 ? '' : 's'}${c.netContentsQty ? ` · ${c.netContentsQty} ${c.netContentsUnit ?? ''}` : ''}`
        formulationStatus = 'done'
      }
    } else if (dom === 'PET_PRODUCT') {
      const p = (fd.pet ?? {}) as { ingredients?: unknown[]; species?: string; method?: string }
      const n = p.ingredients?.length ?? 0
      if (n > 0) {
        formulationTitle = `${n} ingredient${n === 1 ? '' : 's'}${p.species ? ` · ${p.species}` : ''}${p.method === 'intermittent' ? ' · treat' : ''}`
        formulationStatus = 'done'
      }
    } else {
      // FOOD (and fallback)
      const n = tpl._count.ingredientSlots
      if (n > 0) {
        formulationTitle = `${n} ingredient${n === 1 ? '' : 's'}${tpl._count.flavorPresets ? ` · ${tpl._count.flavorPresets} flavor${tpl._count.flavorPresets === 1 ? '' : 's'}` : ''}`
        formulationStatus = 'done'
      }
    }

    const lowestCents = tpl.pricingTiers.length ? Math.min(...tpl.pricingTiers.map((t) => t.perUnitCostCents)) : null

    // FOOD only: surface the Nutrition Facts audience (21 CFR 101.9(j)(5)).
    const AGE_GROUP_LABEL: Record<string, string> = {
      GENERAL: 'General — adults & children 4+',
      CHILD_1_3: 'Children 1–3 years',
      INFANT_0_12: 'Infants 0–12 months',
    }
    const ageGroupLabel = dom === 'FOOD'
      ? (AGE_GROUP_LABEL[String(tpl.intendedAgeGroup ?? 'GENERAL')] ?? 'General — adults & children 4+')
      : null

    return {
      ok: true,
      data: {
        name: tpl.name,
        domain: dom,
        domainLabel: meta.label,
        labelArtifact: meta.artifact,
        formulationTitle,
        formulationStatus,
        statementOfIdentity: tpl.statementOfIdentity,
        ageGroupLabel,
        flavors: tpl._count.flavorPresets,
        pricingTiers: tpl.pricingTiers.length,
        lowestCents,
        packagingName: tpl.packingProfile?.name ?? null,
        niches: tpl._count.niches,
        tags: tpl._count.lifestyleTags,
      },
    }
  } catch (err) {
    return { ok: false, error: `Could not load review: ${(err as Error).message}` }
  }
}

// =============================================================================
// getProductReviewDetail — rich, display-only review picture for the partner
// builder's "Review & submit" step. Mirrors the DISPLAY sections of the admin
// product detail page (apps/admin/.../products/[id]/page.tsx) so the partner
// sees the full product the way an admin reviewer will — but with NO governance
// / decision tooling (no banned-ingredient checks, no suggest engines, no
// audits). One main findUnique + the same cast-guarded secondary fetches the
// admin uses for pending-migration columns. Partner-gated to the owning service.
// =============================================================================

export interface ReviewDetailIngredient {
  id: string
  name: string
  weightG: number
  weightPct: number
  source: string | null
  allergenFlags: string[]
}
export interface ReviewDetailPackaging {
  id: string
  partnerName: string
  topology: string
  unitCount: number
  moq: number
  basePriceCents: number
  leadTimeDays: number
}
export interface ReviewDetailVariant {
  id: string
  containerFormat: string
  servingsPerContainer: number
  servingSizeG: number
  moqMin: number
  moqMax: number
  sku: string | null
  gtin: string | null
  netContentDisplay: string | null
}
export interface ReviewDetailFlavor {
  id: string
  name: string
  swatchHex: string | null
  status: string
  priceDeltaCents: number
  slotCount: number
  hasExtras: boolean
  hasOverrides: boolean
}
export interface ReviewDetailPricingTier {
  id: string
  fulfillmentMode: string
  minQty: number
  maxQty: number | null
  perUnitCostCents: number
  perUnitFloorCents: number
  leadTimeDays: number | null
}
export interface ReviewDetailFee {
  id: string
  label: string
  basis: string
  amountCents: number
  waivedAboveQty: number | null
}
export interface ReviewDetailCertificate {
  id: string
  name: string
  status: string
}

export interface ReviewDetail {
  // ---- Identity / Basics ----
  name: string
  slug: string
  description: string | null
  longDescription: string | null
  familyCode: string | null
  gtin: string | null
  countryOfOrigin: string | null
  categoryName: string | null
  subcategoryName: string | null
  statementOfIdentity: string | null
  intendedAgeGroup: string | null
  ageGroupLabel: string | null
  labelingType: string
  domainLabel: string
  labelArtifact: string
  manufacturingFormat: string | null
  marketCodes: string[]
  niches: string[]
  lifestyleTags: string[]
  // ---- Recipe & nutrition (domain-aware summary, reused logic) ----
  formulationTitle: string
  formulationStatus: 'done' | 'progress' | 'empty'
  totalRecipeWeightG: number
  servingsPerContainer: number | null
  servingSizeG: number | null
  // ---- Ingredients ----
  ingredients: ReviewDetailIngredient[]
  // ---- Allergens ----
  allergenCrossContamination: string | null
  allergenManualOverrides: Array<{ allergen: string; reason: string }>
  allergenFreeClaims: string[]
  // ---- Packaging ----
  packaging: ReviewDetailPackaging[]
  // ---- Variants ----
  variants: ReviewDetailVariant[]
  // ---- Flavors ----
  flavors: ReviewDetailFlavor[]
  // ---- Cost & pricing ----
  priceFloorCents: number
  unitCostCents: number
  pricingTiers: ReviewDetailPricingTier[]
  // ---- Media ----
  hasHeroImage: boolean
  galleryCount: number
  hasVideo: boolean
  // ---- Production & storage ----
  storageClass: string | null
  storageTempMinF: number | null
  storageTempMaxF: number | null
  leadTimeFirstRunDays: number | null
  leadTimeRepeatDays: number | null
  maxFlavorsPerPack: number | null
  // ---- Fees ----
  fees: ReviewDetailFee[]
  // ---- Certificates ----
  certificates: ReviewDetailCertificate[]
  // ---- Manufacturer references ----
  manufacturerRefs: Array<{ label: string; value: string }>
}

type DetailResult = { ok: true; data: ReviewDetail } | { ok: false; error: string }

const AGE_GROUP_LABEL: Record<string, string> = {
  GENERAL: 'General — adults & children 4+',
  CHILD_1_3: 'Children 1–3 years',
  INFANT_0_12: 'Infants 0–12 months',
}

export async function getProductReviewDetail(draftId: string): Promise<DetailResult> {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false, error: 'Not a partner account.' }
  try {
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: draftId },
      include: {
        subcategory: { select: { name: true, category: { select: { name: true } } } },
        ingredientSlots: {
          orderBy: { displayOrder: 'asc' },
          include: {
            baseIngredient: {
              select: { id: true, name: true, source: true, allergenFlags: true },
            },
          },
        },
        packagingSystems: {
          include: {
            packagingSystem: {
              select: { partnerName: true, topology: true, unitCount: true, moq: true },
            },
          },
        },
        variants: { orderBy: { createdAt: 'asc' } },
        flavorPresets: { orderBy: { sortOrder: 'asc' } },
        pricingTiers: { orderBy: [{ fulfillmentMode: 'asc' }, { sortOrder: 'asc' }] },
        certificates: {
          include: {
            instance: {
              select: {
                status: true,
                certificateType: { select: { name: true } },
              },
            },
          },
        },
        niches: { include: { niche: { select: { name: true } } } },
        lifestyleTags: { include: { lifestyleTag: { select: { name: true } } } },
      },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }

    // Ownership (best-effort; matches the other save actions).
    const partner = await prisma.partner.findUnique({
      where: { userId: user.id },
      select: { services: { select: { id: true } } },
    })
    const ownIds = partner?.services.map((s) => s.id) ?? []
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    // Per-template fees — cast-guarded (ships with the configurator migration;
    // mirrors the admin loose-delegate pattern, degrades to []).
    const looseDb = prisma as unknown as {
      productTemplateFee?: {
        findMany: (a: unknown) => Promise<
          Array<{
            id: string
            label: string
            basis: string
            amountCents: number
            waivedAboveQty: number | null
          }>
        >
      }
    }
    const feeRows =
      (await looseDb.productTemplateFee
        ?.findMany({ where: { productTemplateId: draftId }, orderBy: { sortOrder: 'asc' } })
        .catch(() => [])) ?? []

    // Manufacturer's own external references — partner-private. Cast-guarded
    // (ships with a pending migration; matches the admin shape).
    const refsRow = await (
      prisma as unknown as {
        productTemplate: {
          findUnique: (a: unknown) => Promise<{ manufacturerRefs: unknown } | null>
        }
      }
    ).productTemplate
      .findUnique({ where: { id: draftId }, select: { manufacturerRefs: true } })
      .catch(() => null)
    const manufacturerRefs = Array.isArray(refsRow?.manufacturerRefs)
      ? (refsRow!.manufacturerRefs as Array<{ label?: unknown; value?: unknown }>)
          .filter((r) => r && typeof r.value === 'string')
          .map((r) => ({
            label: typeof r.label === 'string' ? r.label : 'Reference',
            value: r.value as string,
          }))
      : []

    // ---- Domain-aware formulation summary (reuse the existing DOMAIN_LABEL +
    // the same per-domain logic as getProductReviewSummary) ----
    const dom = tpl.labelingType
    const meta = DOMAIN_LABEL[dom] ?? DOMAIN_LABEL.FOOD!
    const fd = (tpl.formulationData ?? {}) as Record<string, unknown>
    let formulationTitle = 'Not started'
    let formulationStatus: ReviewDetail['formulationStatus'] = 'empty'
    if (dom === 'DIETARY_SUPPLEMENT') {
      const s = (fd.supplement ?? {}) as {
        dietaryIngredients?: unknown[]
        blends?: unknown[]
        dosageForm?: string
      }
      const di = s.dietaryIngredients?.length ?? 0
      const bl = s.blends?.length ?? 0
      if (di > 0) {
        formulationTitle = `${di} dietary ingredient${di === 1 ? '' : 's'}${bl ? ` · ${bl} blend${bl === 1 ? '' : 's'}` : ''}${s.dosageForm ? ` · ${s.dosageForm}` : ''}`
        formulationStatus = 'done'
      }
    } else if (dom === 'COSMETIC') {
      const c = (fd.cosmetic ?? {}) as {
        ingredients?: unknown[]
        netContentsQty?: number
        netContentsUnit?: string
      }
      const n = c.ingredients?.length ?? 0
      if (n > 0) {
        formulationTitle = `${n} INCI ingredient${n === 1 ? '' : 's'}${c.netContentsQty ? ` · ${c.netContentsQty} ${c.netContentsUnit ?? ''}` : ''}`
        formulationStatus = 'done'
      }
    } else if (dom === 'PET_PRODUCT') {
      const p = (fd.pet ?? {}) as { ingredients?: unknown[]; species?: string; method?: string }
      const n = p.ingredients?.length ?? 0
      if (n > 0) {
        formulationTitle = `${n} ingredient${n === 1 ? '' : 's'}${p.species ? ` · ${p.species}` : ''}${p.method === 'intermittent' ? ' · treat' : ''}`
        formulationStatus = 'done'
      }
    } else {
      const n = tpl.ingredientSlots.length
      if (n > 0) {
        formulationTitle = `${n} ingredient${n === 1 ? '' : 's'}${tpl.flavorPresets.length ? ` · ${tpl.flavorPresets.length} flavor${tpl.flavorPresets.length === 1 ? '' : 's'}` : ''}`
        formulationStatus = 'done'
      }
    }

    // ---- Ingredients + per-slot weight% (food recipe slots) ----
    const totalRecipeWeightG = tpl.ingredientSlots.reduce((sum, s) => sum + Number(s.weightG), 0)
    const ingredients: ReviewDetailIngredient[] = tpl.ingredientSlots.map((s) => {
      const weightG = Number(s.weightG)
      return {
        id: s.id,
        name: s.label || s.baseIngredient.name,
        weightG,
        weightPct: totalRecipeWeightG > 0 ? (weightG / totalRecipeWeightG) * 100 : 0,
        source: s.baseIngredient.source ?? null,
        allergenFlags: s.baseIngredient.allergenFlags,
      }
    })

    const firstVariant = tpl.variants[0] ?? null
    const variantWithGtin = tpl.variants.find((v) => v.gtin) ?? null

    const data: ReviewDetail = {
      name: tpl.name,
      slug: tpl.slug,
      description: tpl.description,
      longDescription: tpl.longDescription,
      familyCode: tpl.familyCode,
      gtin: variantWithGtin?.gtin ?? null,
      countryOfOrigin: tpl.countryOfOrigin,
      categoryName: tpl.subcategory.category.name,
      subcategoryName: tpl.subcategory.name,
      statementOfIdentity: tpl.statementOfIdentity,
      intendedAgeGroup: tpl.intendedAgeGroup,
      ageGroupLabel:
        dom === 'FOOD'
          ? (AGE_GROUP_LABEL[String(tpl.intendedAgeGroup ?? 'GENERAL')] ??
            'General — adults & children 4+')
          : null,
      labelingType: dom,
      domainLabel: meta.label,
      labelArtifact: meta.artifact,
      manufacturingFormat: tpl.manufacturingFormat ?? null,
      marketCodes: tpl.marketCodes ?? [],
      niches: tpl.niches.map((n) => n.niche.name),
      lifestyleTags: tpl.lifestyleTags.map((t) => t.lifestyleTag.name),
      formulationTitle,
      formulationStatus,
      totalRecipeWeightG,
      servingsPerContainer: firstVariant?.servingsPerContainer ?? null,
      servingSizeG: firstVariant ? Number(firstVariant.servingSizeG) : null,
      ingredients,
      allergenCrossContamination: tpl.allergenCrossContamination,
      allergenManualOverrides: Array.isArray(tpl.allergenManualOverrides)
        ? (tpl.allergenManualOverrides as Array<{ allergen?: unknown; reason?: unknown }>)
            .filter((o) => o && typeof o.allergen === 'string')
            .map((o) => ({
              allergen: o.allergen as string,
              reason: typeof o.reason === 'string' ? o.reason : '',
            }))
        : [],
      allergenFreeClaims: tpl.allergenFreeClaims ?? [],
      packaging: tpl.packagingSystems.map((p) => ({
        id: p.packagingSystemId,
        partnerName: p.packagingSystem.partnerName,
        topology: p.packagingSystem.topology,
        unitCount: p.packagingSystem.unitCount,
        moq: p.moqOverride ?? p.packagingSystem.moq,
        basePriceCents: p.basePriceCents,
        leadTimeDays: p.leadTimeDays,
      })),
      variants: tpl.variants.map((v) => ({
        id: v.id,
        containerFormat: v.containerFormat,
        servingsPerContainer: v.servingsPerContainer,
        servingSizeG: Number(v.servingSizeG),
        moqMin: v.moqMin,
        moqMax: v.moqMax,
        sku: v.sku,
        gtin: v.gtin,
        netContentDisplay: v.netContentDisplay,
      })),
      flavors: tpl.flavorPresets.map((f) => {
        const slots = (f.slotResolution as Array<unknown> | null) ?? []
        const extras = (f.extras as Array<unknown> | null) ?? []
        const overrides = (f.nutrientOverrides as Array<unknown> | null) ?? []
        return {
          id: f.id,
          name: f.name,
          swatchHex: f.swatchHex,
          status: f.status,
          priceDeltaCents: f.priceDeltaCents,
          slotCount: slots.length,
          hasExtras: extras.length > 0,
          hasOverrides: overrides.length > 0,
        }
      }),
      priceFloorCents: tpl.priceFloorCents,
      unitCostCents: tpl.unitCostCents,
      pricingTiers: tpl.pricingTiers.map((t) => ({
        id: t.id,
        fulfillmentMode: t.fulfillmentMode,
        minQty: t.minQty,
        maxQty: t.maxQty,
        perUnitCostCents: t.perUnitCostCents,
        perUnitFloorCents: t.perUnitFloorCents,
        leadTimeDays: t.leadTimeDays,
      })),
      hasHeroImage: Boolean(tpl.imageAssetId),
      galleryCount: tpl.galleryAssetIds?.length ?? 0,
      hasVideo: Boolean(tpl.videoAssetId),
      storageClass: tpl.storageClass ?? null,
      storageTempMinF: tpl.storageTempMinF ?? null,
      storageTempMaxF: tpl.storageTempMaxF ?? null,
      leadTimeFirstRunDays: tpl.leadTimeFirstRunDays ?? null,
      leadTimeRepeatDays: tpl.leadTimeRepeatDays ?? null,
      maxFlavorsPerPack: tpl.maxFlavorsPerPack ?? null,
      fees: feeRows.map((f) => ({
        id: f.id,
        label: f.label,
        basis: f.basis,
        amountCents: f.amountCents,
        waivedAboveQty: f.waivedAboveQty,
      })),
      certificates: tpl.certificates.map((c) => ({
        id: c.instanceId,
        name: c.instance.certificateType.name,
        status: c.instance.status,
      })),
      manufacturerRefs,
    }

    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: `Could not load review: ${(err as Error).message}` }
  }
}
