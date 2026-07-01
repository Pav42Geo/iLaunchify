'use server'

// Real, domain-aware Review summary for the New Product flow. Replaces the
// hardcoded placeholder cards on the Review & submit step with actual draft data:
// the formulation summary varies by product domain (Nutrition / Supplement Facts /
// INCI declaration / Guaranteed Analysis), plus real pricing tiers + packaging.
// Partner-gated to the owning service. Cast-guarded for formulationData.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { resolveCertBadgeUrls } from '@/lib/cert-badges'
import {
  calculateLabel,
  toPanelData,
  composeMarketplaceRows,
  toSupplementPanelData,
  toInciDeclaration,
  formatGuaranteedAnalysis,
  petIngredientOrder,
  adequacyStatement,
  composeContainsAllergens,
  type DietaryIngredient,
  type ProprietaryBlend,
  type SupplementNutrition,
  type CosmeticIngredient,
  type GuaranteedAnalysis,
  type PetSpecies,
  type LifeStage,
  type AdequacyMethod,
} from '@ilaunchify/nutrition'
import { resolvePackMode, type PackMode, type PricingBasis, type FlavorPolicy } from '@ilaunchify/ui'
import type { PanelData } from '@ilaunchify/types'

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

export interface ReviewDetailReplacement {
  id: string
  name: string
  /** Optional weight override (g) for the swap, if the slot declares one. */
  weightGOverride: number | null
}
export interface ReviewDetailIngredient {
  id: string
  name: string
  weightG: number
  weightPct: number
  source: string | null
  allergenFlags: string[]
  /** "⇄ or" alternatives the creator can swap into this base slot. */
  replacements: ReviewDetailReplacement[]
}
export interface ReviewDetailOptionalIngredient {
  id: string
  name: string
  weightG: number
  note: string | null
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
/** The chosen packing PROFILE (structural keystone) + filled-logistics summary,
 *  resolved from ProductTemplate.packingProfile + the linked PackagingSystem(s). */
export interface ReviewDetailPackingProfile {
  name: string
  group: string | null
  /** 6-value structural bucket (SINGLE_UNIT, PER_FLAVOR_IN_OUTER, …). */
  structuralType: string | null
  /** Merchandising framing (sampler / gift / bulk / retail …). */
  merchandisingTag: string | null
  packStructure: string | null
  labelColumns: number | null
  /** Units per sellable pack (from the linked packaging system). */
  unitCount: number | null
  /** Packed gross weight of ONE sellable unit, grams. */
  grossWeightG: number | null
  /** Ti — cases per pallet layer. */
  casesPerLayer: number | null
  /** Hi — layers per pallet. */
  layersPerPallet: number | null
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
export interface ReviewDetailFlavorRecipe {
  base: { name: string; grams: number; replacements: string[] }[]
  optionals: { name: string; grams: number; callout: string | null }[]
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
  /** Per-flavor lead override (days); null = use product standard. Slice 3/5. */
  leadTimeDays: number | null
  /** Per-flavor independent recipe (Slice 5). null = no per-flavor recipe authored. */
  recipe: ReviewDetailFlavorRecipe | null
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
  /** Admin-curated PNG web badge (CertificateType.thumbnailFileId) → URL, if set. */
  iconUrl: string | null
}
/** A finish offered on this product (docs/PER_DRAFT_FINISHES.md §6). */
export interface ReviewDetailFinish {
  id: string
  name: string
  /** FinishCategory enum value (SURFACE / FOIL_METALLIC / …). */
  category: string
  /** Compact "+$0.08/unit · +2d · MOQ 500" string, or null. */
  pricingSummary: string | null
  leadTimeDays: number | null
  isDefault: boolean
  isIncludedInPrice: boolean
  note: string | null
}

/** One offered pack size in the variety-pack matrix (a typed ProductTemplateVariant). */
export interface ReviewDetailPackSize {
  label: string
  unitsPerPack: number
  /** MOQ in PACKS (ProductTemplateVariant.moqMin reinterpreted for pack products). */
  moqPacks: number
  /** Flat per-pack price (cents) — meaningful when basis = PER_PACK. */
  pricePerPackCents: number | null
}
/** The pack-composition model the manufacturer authored (docs/VARIETY_PACK_MODEL.md
 *  §4-6, §8). Null when the product has no pack matrix (single-unit products show
 *  nothing new). Read-only display picture for the Passport. */
export interface ReviewDetailPackModel {
  /** Resolved configure mode (Single unit / one-flavor multipack / fixed / pick). */
  mode: PackMode
  /** Per-flavor (summed) vs per-pack (flat). Null when un-set. */
  pricingBasis: PricingBasis | null
  /** Who picks the flavors (creator vs manufacturer-fixed). Null when un-set. */
  flavorPolicy: FlavorPolicy | null
  /** Distinct-flavor floor (pick modes). */
  minFlavorsPerPack: number | null
  /** Distinct-flavor cap (pick modes). */
  maxFlavorsPerPack: number | null
  /** Remainder-distribution rule (pick modes). */
  fillRule: string | null
  /** Offered pack sizes (typed unitsPerPack variants). */
  sizes: ReviewDetailPackSize[]
  /** Per-flavor absolute prices (PER_FLAVOR basis). */
  perFlavorPrices: Array<{ name: string; unitPriceCents: number | null }>
  /** Manufacturer-fixed assortment (PARTNER_FIXED policy): flavor × per-pack count. */
  assortment: Array<{ flavor: string; qty: number }>
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
  /** FOOD: template-wide pool of OPTIONAL ingredients the creator can toggle on. */
  optionalIngredients: ReviewDetailOptionalIngredient[]
  // ---- Allergens ----
  allergenCrossContamination: string | null
  allergenManualOverrides: Array<{ allergen: string; reason: string }>
  allergenFreeClaims: string[]
  // ---- Packaging ----
  packaging: ReviewDetailPackaging[]
  /** The chosen packing profile (structural keystone) + Ti-Hi / gross weight. */
  packingProfile: ReviewDetailPackingProfile | null
  /** Substrate / packaging-material declarations (free-text from PackagingSystem.material). */
  packagingMaterials: string[]
  /** Print finishes offered on this product (docs/PER_DRAFT_FINISHES.md). */
  finishes: ReviewDetailFinish[]
  // ---- Variants ----
  variants: ReviewDetailVariant[]
  // ---- Flavors ----
  flavors: ReviewDetailFlavor[]
  // ---- Pack model (variety-pack matrix) — null for single-unit products ----
  packModel: ReviewDetailPackModel | null
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

/** Compact finish pricing summary ("+$0.08/unit · +2d · MOQ 500") from a
 *  PartnerFinish's pricing fields. Mirrors packaging-finishes-actions.ts. */
function reviewFinishPricingSummary(f: {
  pricingMode: string
  basePriceCents: number
  perUnitPriceCents: number
  pricePerSqInCents: number | null
  pricePerObjectCents: number | null
  pricePerColorCents: number | null
  leadTimeDays: number
  moqMin: number
}): string | null {
  const money = (c: number) => `$${(c / 100).toFixed(2)}`
  const parts: string[] = []
  switch (f.pricingMode) {
    case 'PER_UNIT':
      if (f.perUnitPriceCents > 0) parts.push(`+${money(f.perUnitPriceCents)}/unit`)
      break
    case 'PER_AREA':
      if (f.pricePerSqInCents && f.pricePerSqInCents > 0) parts.push(`+${money(f.pricePerSqInCents)}/sq in`)
      break
    case 'PER_OBJECT':
      if (f.pricePerObjectCents && f.pricePerObjectCents > 0) parts.push(`+${money(f.pricePerObjectCents)}/object`)
      break
    case 'PER_COLOR':
      if (f.pricePerColorCents && f.pricePerColorCents > 0) parts.push(`+${money(f.pricePerColorCents)}/color`)
      break
    case 'FLAT_PER_ORDER':
      if (f.basePriceCents > 0) parts.push(`+${money(f.basePriceCents)}/order`)
      break
    case 'TIERED':
      parts.push('tiered')
      break
    default:
      if (f.perUnitPriceCents > 0) parts.push(`+${money(f.perUnitPriceCents)}/unit`)
  }
  if (f.pricingMode !== 'FLAT_PER_ORDER' && f.basePriceCents > 0) parts.push(`+${money(f.basePriceCents)} setup`)
  if (f.leadTimeDays > 0) parts.push(`+${f.leadTimeDays}d`)
  if (f.moqMin > 0) parts.push(`MOQ ${f.moqMin.toLocaleString()}`)
  return parts.length ? parts.join(' · ') : null
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
            // ⇄ swap alternatives for this base slot (TemplateIngredientReplacement).
            replacements: {
              orderBy: { displayOrder: 'asc' },
              include: { ingredient: { select: { id: true, name: true, labelDeclarationName: true, internalName: true } } },
            },
          },
        },
        // Template-wide OPTIONAL ingredient pool (TemplateOptionalIngredient).
        optionalIngredients: {
          orderBy: { displayOrder: 'asc' },
          include: { ingredient: { select: { id: true, name: true, labelDeclarationName: true, internalName: true } } },
        },
        packingProfile: {
          select: {
            name: true,
            group: true,
            structuralType: true,
            merchandisingTag: true,
            packStructure: true,
            labelColumns: true,
          },
        },
        packagingSystems: {
          include: {
            packagingSystem: {
              select: {
                partnerName: true, topology: true, unitCount: true, moq: true,
                grossWeightG: true, casesPerLayer: true, layersPerPallet: true, material: true,
              },
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
                certificateType: { select: { name: true, thumbnailFileId: true } },
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

    // Per-product finishes — cast-guarded (ProductTemplateFinish ships with the
    // PER_DRAFT_FINISHES migration; degrades to [] until then).
    const finishLooseDb = prisma as unknown as {
      productTemplateFinish?: {
        findMany: (a: unknown) => Promise<
          Array<{
            partnerFinishId: string
            isDefault: boolean
            isIncludedInPrice: boolean
            note: string | null
            partnerFinish: {
              name: string | null
              pricingMode: string
              basePriceCents: number
              perUnitPriceCents: number
              pricePerSqInCents: number | null
              pricePerObjectCents: number | null
              pricePerColorCents: number | null
              leadTimeDays: number
              moqMin: number
              finishType: { name: string; category: string }
            }
          }>
        >
      }
    }
    const finishRows =
      (await finishLooseDb.productTemplateFinish
        ?.findMany({
          where: { productTemplateId: draftId },
          orderBy: { sortOrder: 'asc' },
          select: {
            partnerFinishId: true,
            isDefault: true,
            isIncludedInPrice: true,
            note: true,
            partnerFinish: {
              select: {
                name: true,
                pricingMode: true,
                basePriceCents: true,
                perUnitPriceCents: true,
                pricePerSqInCents: true,
                pricePerObjectCents: true,
                pricePerColorCents: true,
                leadTimeDays: true,
                moqMin: true,
                finishType: { select: { name: true, category: true } },
              },
            },
          },
        })
        .catch(() => [])) ?? []
    const finishes: ReviewDetailFinish[] = finishRows.map((f) => ({
      id: f.partnerFinishId,
      name: f.partnerFinish.name?.trim() || f.partnerFinish.finishType.name,
      category: String(f.partnerFinish.finishType.category),
      pricingSummary: reviewFinishPricingSummary({
        pricingMode: String(f.partnerFinish.pricingMode),
        basePriceCents: f.partnerFinish.basePriceCents,
        perUnitPriceCents: f.partnerFinish.perUnitPriceCents,
        pricePerSqInCents: f.partnerFinish.pricePerSqInCents,
        pricePerObjectCents: f.partnerFinish.pricePerObjectCents,
        pricePerColorCents: f.partnerFinish.pricePerColorCents,
        leadTimeDays: f.partnerFinish.leadTimeDays,
        moqMin: f.partnerFinish.moqMin,
      }),
      leadTimeDays: f.partnerFinish.leadTimeDays ?? null,
      isDefault: f.isDefault,
      isIncludedInPrice: f.isIncludedInPrice,
      note: f.note,
    }))

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

    // Pack model (variety-pack matrix) — all NEW columns are cast-guarded since
    // `pnpm db:generate` hasn't run here (the client is stale). Mirrors the admin
    // loose-delegate pattern: one wrapped read, degrade to null on any failure so
    // a pre-migration draft never crashes the Review. The engine's resolvePackMode
    // labels the mode + decides whether this product even HAS a pack matrix.
    const packModel: ReviewDetailPackModel | null = await (async () => {
      try {
        const packLooseDb = prisma as unknown as {
          productTemplate: {
            findUnique: (a: unknown) => Promise<{
              pricingBasis: string | null
              flavorPolicy: string | null
              minFlavorsPerPack: number | null
              maxFlavorsPerPack: number | null
              flavorFillRule: string | null
              packingProfile: { structuralType: string | null } | null
              variants: Array<{
                unitsPerPack: number | null
                containerFormat: string | null
                moqMin: number | null
                pricePerPackCents: number | null
                assortmentFlavors: unknown
              }>
              flavorPresets: Array<{ name: string; unitPriceCents: number | null }>
            } | null>
          }
        }
        const row = await packLooseDb.productTemplate
          .findUnique({
            where: { id: draftId },
            select: {
              pricingBasis: true,
              flavorPolicy: true,
              minFlavorsPerPack: true,
              maxFlavorsPerPack: true,
              flavorFillRule: true,
              packingProfile: { select: { structuralType: true } },
              variants: {
                orderBy: { createdAt: 'asc' },
                select: {
                  unitsPerPack: true,
                  containerFormat: true,
                  moqMin: true,
                  pricePerPackCents: true,
                  assortmentFlavors: true,
                },
              },
              flavorPresets: {
                orderBy: { sortOrder: 'asc' },
                select: { name: true, unitPriceCents: true },
              },
            },
          })
          .catch(() => null)
        if (!row) return null

        // Offered pack sizes = variant rows that carry a typed unitsPerPack.
        const sizeVariants = (row.variants ?? []).filter(
          (v) => v.unitsPerPack != null && v.unitsPerPack > 0,
        )
        const flavorPolicy =
          row.flavorPolicy === 'CREATOR_PICK' || row.flavorPolicy === 'PARTNER_FIXED'
            ? (row.flavorPolicy as FlavorPolicy)
            : null
        const pricingBasis =
          row.pricingBasis === 'PER_FLAVOR' || row.pricingBasis === 'PER_PACK'
            ? (row.pricingBasis as PricingBasis)
            : null

        const mode = resolvePackMode({
          structuralType:
            (row.packingProfile?.structuralType as Parameters<typeof resolvePackMode>[0]['structuralType']) ??
            null,
          flavorPolicy,
          flavorMode: tpl.flavorPresets.length > 1 ? 'MULTI' : 'SINGLE',
          offeredSizes: sizeVariants.length,
        })

        // Single-unit product with no offered sizes → nothing new to show.
        if (mode === 'SINGLE_UNIT' && sizeVariants.length === 0) return null

        const sizes: ReviewDetailPackSize[] = sizeVariants.map((v) => ({
          label: v.containerFormat?.trim() || `${v.unitsPerPack}-pack`,
          unitsPerPack: v.unitsPerPack ?? 0,
          moqPacks: v.moqMin ?? 0,
          pricePerPackCents: v.pricePerPackCents ?? null,
        }))

        const perFlavorPrices = (row.flavorPresets ?? []).map((f) => ({
          name: f.name,
          unitPriceCents: f.unitPriceCents ?? null,
        }))

        // Fixed assortment lives on the first offered size's `assortmentFlavors`
        // JSON ([{ flavor, qty }]). Resolve flavor ids → names where possible.
        const presetNameById = new Map(
          tpl.flavorPresets.map((f) => [f.id, f.name] as const),
        )
        const rawAssort = sizeVariants.find(
          (v) => Array.isArray(v.assortmentFlavors) && (v.assortmentFlavors as unknown[]).length > 0,
        )?.assortmentFlavors
        const assortment = Array.isArray(rawAssort)
          ? (rawAssort as Array<{ flavor?: unknown; qty?: unknown }>)
              .filter((a) => a && typeof a.flavor === 'string' && typeof a.qty === 'number')
              .map((a) => ({
                flavor: presetNameById.get(a.flavor as string) ?? (a.flavor as string),
                qty: a.qty as number,
              }))
          : []

        return {
          mode,
          pricingBasis,
          flavorPolicy,
          minFlavorsPerPack: row.minFlavorsPerPack ?? null,
          maxFlavorsPerPack: row.maxFlavorsPerPack ?? null,
          fillRule: row.flavorFillRule ?? null,
          sizes,
          perFlavorPrices,
          assortment,
        }
      } catch {
        return null
      }
    })()

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
        replacements: s.replacements.map((r) => ({
          id: r.id,
          name: r.ingredient.labelDeclarationName || r.ingredient.internalName || r.ingredient.name,
          weightGOverride: r.weightGOverride != null ? Number(r.weightGOverride) : null,
        })),
      }
    })

    const optionalIngredients: ReviewDetailOptionalIngredient[] = tpl.optionalIngredients.map((o) => ({
      id: o.id,
      name: o.ingredient.labelDeclarationName || o.ingredient.internalName || o.ingredient.name,
      weightG: Number(o.weightG),
      note: o.calloutText ?? null,
    }))

    const firstVariant = tpl.variants[0] ?? null
    const variantWithGtin = tpl.variants.find((v) => v.gtin) ?? null

    // ---- Packaging structure (chosen packing profile + filled-logistics) ----
    // The packing profile is the structural keystone on ProductTemplate; Ti-Hi /
    // gross weight / unit count live on the linked PackagingSystem catalog row
    // (inherited per docs/PACKAGING). Pull from the first linked system.
    const firstPackagingSystem = tpl.packagingSystems[0]?.packagingSystem ?? null
    // Slice 5 — per-flavor recipe rows (read-only). Cast-guarded: FlavorRecipe*
    // post-date the generated client until db:push. Empty/error → no per-flavor
    // recipe shown (the flavor still lists its identity + lead).
    const flavorRecipeMap = new Map<string, ReviewDetailFlavorRecipe>()
    try {
      const ingName = (label: string | null | undefined, ing: { name: string; internalName: string | null; labelDeclarationName: string | null }) =>
        (label || ing.labelDeclarationName || ing.internalName || ing.name)
      const fps = await (prisma as unknown as {
        flavorPreset: { findMany: (a: unknown) => Promise<Array<{
          id: string
          recipeSlots: { weightG: unknown; label: string | null; baseIngredient: { name: string; internalName: string | null; labelDeclarationName: string | null }; replacements: { ingredient: { name: string; internalName: string | null; labelDeclarationName: string | null } }[] }[]
          recipeOptionals: { weightG: unknown; calloutText: string | null; ingredient: { name: string; internalName: string | null; labelDeclarationName: string | null } }[]
        }>> }
      }).flavorPreset.findMany({
        where: { productTemplateId: tpl.id },
        select: {
          id: true,
          recipeSlots: {
            orderBy: { displayOrder: 'asc' },
            select: { weightG: true, label: true, baseIngredient: { select: { name: true, internalName: true, labelDeclarationName: true } }, replacements: { orderBy: { displayOrder: 'asc' }, select: { ingredient: { select: { name: true, internalName: true, labelDeclarationName: true } } } } },
          },
          recipeOptionals: { orderBy: { displayOrder: 'asc' }, select: { weightG: true, calloutText: true, ingredient: { select: { name: true, internalName: true, labelDeclarationName: true } } } },
        },
      })
      for (const fp of fps) {
        if (!fp.recipeSlots.length && !fp.recipeOptionals.length) continue
        flavorRecipeMap.set(fp.id, {
          base: fp.recipeSlots.map((s) => ({ name: ingName(s.label, s.baseIngredient), grams: Number(s.weightG) || 0, replacements: s.replacements.map((r) => ingName(null, r.ingredient)) })),
          optionals: fp.recipeOptionals.map((o) => ({ name: ingName(null, o.ingredient), grams: Number(o.weightG) || 0, callout: o.calloutText ?? null })),
        })
      }
    } catch { /* per-flavor recipe schema not migrated yet — skip */ }

    const packingProfile: ReviewDetailPackingProfile | null = tpl.packingProfile
      ? {
          name: tpl.packingProfile.name,
          group: tpl.packingProfile.group ?? null,
          structuralType: tpl.packingProfile.structuralType ?? null,
          merchandisingTag: tpl.packingProfile.merchandisingTag ?? null,
          packStructure: tpl.packingProfile.packStructure ?? null,
          labelColumns: tpl.packingProfile.labelColumns ?? null,
          unitCount: firstPackagingSystem?.unitCount ?? null,
          grossWeightG: firstPackagingSystem?.grossWeightG ?? null,
          casesPerLayer: firstPackagingSystem?.casesPerLayer ?? null,
          layersPerPallet: firstPackagingSystem?.layersPerPallet ?? null,
        }
      : null

    // Substrate / packaging-material declarations — free-text `material` strings
    // across all linked packaging systems (e.g. "PET", "SBS folding carton").
    const packagingMaterials = [
      ...new Set(
        tpl.packagingSystems
          .map((p) => p.packagingSystem.material?.trim())
          .filter((m): m is string => Boolean(m)),
      ),
    ]

    // Resolve admin-curated PNG web badges (CertificateType.thumbnailFileId) → URLs.
    const certBadgeUrls = await resolveCertBadgeUrls(
      tpl.certificates.map((c) => c.instance.certificateType.thumbnailFileId),
    ).catch(() => new Map<string, string>())

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
      optionalIngredients,
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
      packingProfile,
      packagingMaterials,
      finishes,
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
          leadTimeDays: (f as { leadTimeDays?: number | null }).leadTimeDays ?? null,
          recipe: flavorRecipeMap.get(f.id) ?? null,
        }
      }),
      packModel,
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
        iconUrl: c.instance.certificateType.thumbnailFileId
          ? (certBadgeUrls.get(c.instance.certificateType.thumbnailFileId) ?? null)
          : null,
      })),
      manufacturerRefs,
    }

    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: `Could not load review: ${(err as Error).message}` }
  }
}

// =============================================================================
// getProductPassport — the "Digital Product Passport": a document-grade,
// display-only review of EVERYTHING a draft has accumulated, for the builder's
// Review & submit step. It is a SUPERSET of getProductReviewDetail: same
// identity / recipe / allergens / packaging / variants / flavors / pricing /
// certs, PLUS the REAL regulated Facts panel(s) computed server-side into
// serializable PanelData (so the view renders the actual SVG label), die-line
// outline SVG(s), and resolved image URLs (hero / gallery / mockup base).
//
// Panel computation reuses the SAME engine path the marketplace detail uses
// (apps/marketing/src/lib/recipe-detail.ts · composeMarketplaceRows →
// calculateLabel → toPanelData / toSupplementPanelData), so the Passport panel
// can never diverge from the public label. DECLARED panels render verbatim.
// Partner-gated to the owning service; cast-guarded for pending-migration cols.
// =============================================================================

export interface PassportFactsPanel {
  /** PanelData for the FOOD Nutrition Facts / SUPPLEMENT Supplement Facts panel. */
  panel: PanelData
  /** Resolved "Contains" allergen line (FALCPA Big-9), if any. */
  contains: string | null
  /** 21 CFR 101.4 ingredient statement, rendered below the box (food). */
  ingredientStatement: string | null
  /** True when the panel was entered by the manufacturer, not computed. */
  declared: boolean
}
export interface PassportCosmeticFacts {
  ingredients: string
  netContents: string | null
  responsiblePerson: string | null
  adverseEventContact: string | null
}
export interface PassportPetFacts {
  gaRows: Array<{ label: string; value: string }>
  ingredients: string
  adequacyStatement: string | null
  feedingDirections: string | null
}
/** Per-flavor Supplement Facts / Guaranteed Analysis (multi-flavor supplement +
 *  pet). Populated from formulationData.supplementByFlavor / petByFlavor. Empty
 *  for single-flavor / food / cosmetic. Read-only — the Passport Facts card shows
 *  a Base + flavor switcher when non-empty. */
export interface PassportFlavorFacts {
  id: string // FlavorPreset id
  name: string
  swatchHex: string | null
  panel: PanelData | null // SUPPLEMENT
  petFacts: PassportPetFacts | null // PET
}
export interface PassportFormulationIngredient {
  name: string
  amount: string | null // pre-formatted ("250 mg", "12 %", "" )
  note: string | null
}
export interface PassportDieline {
  id: string
  name: string
  outlineSvg: string // raw SVG path string
  widthMm: number
  heightMm: number
  /** Optional flavor this die-line slot belongs to (per-flavor packing types). */
  flavorName: string | null
}
export interface PassportImage {
  url: string
  kind: 'hero' | 'gallery' | 'mockup'
}

export interface ProductPassport extends ReviewDetail {
  // ---- Regulated Facts panel(s) — domain-aware, serializable ----
  /** FOOD / SUPPLEMENT → a PanelData rendered by NutritionFactsSvg / SupplementFactsSvg. */
  factsPanel: PassportFactsPanel | null
  /** COSMETIC → INCI declaration. */
  cosmeticFacts: PassportCosmeticFacts | null
  /** PET_PRODUCT → AAFCO Guaranteed Analysis. */
  petFacts: PassportPetFacts | null
  /** True when this product carries >1 flavor — the view shows the flavor roster
   *  prominently (per-flavor variety columns are an in-builder live view). */
  isMultiFlavor: boolean
  /** FOOD multi-flavor → one serializable Nutrition Facts panel per flavor, fed
   *  straight into LabelViewerModal (`columns`). Each carries the flavor name +
   *  its single-flavor PanelData + resolved "Contains" line. Empty when not
   *  computable (no base panel / non-food). Shape ≡ @ilaunchify/ui VarietyColumn. */
  flavorColumns: Array<{ label: string; data: PanelData; contains?: string }>
  /** SUPPLEMENT / PET multi-flavor → each flavor's own Supplement Facts / GA panel
   *  (from supplementByFlavor / petByFlavor). Empty when none authored. */
  flavorFacts: PassportFlavorFacts[]
  /** Multiunit net-contents statement for the outer carton, when derivable. */
  packNetContents: string | null
  // ---- Formulation ingredient lists (non-food domains) ----
  supplementIngredients: PassportFormulationIngredient[]
  cosmeticIngredients: PassportFormulationIngredient[]
  petIngredients: PassportFormulationIngredient[]
  // ---- Die-lines + imagery ----
  dielines: PassportDieline[]
  images: PassportImage[]
  // ---- Custom meta (admin/importer-added reference key/values) ----
  customMeta: Array<{ label: string; value: string }>
}

type PassportResult = { ok: true; data: ProductPassport } | { ok: false; error: string }

/** Narrow an unknown JSON blob to a PanelData (declared panels). */
function asPanelDataLoose(v: unknown): PanelData | null {
  if (v && typeof v === 'object' && 'format' in v && Array.isArray((v as { rows?: unknown }).rows)) {
    return v as PanelData
  }
  return null
}

// Big-9 allergen codes → display labels (matches recipe-detail.ts).
const PASSPORT_ALLERGEN_DISPLAY: Record<string, string> = {
  milk: 'Milk', eggs: 'Eggs', egg: 'Eggs', fish: 'Fish',
  shellfish: 'Shellfish', crustacean_shellfish: 'Shellfish', crustacean: 'Shellfish',
  tree_nuts: 'Tree Nuts', treenuts: 'Tree Nuts', 'tree-nuts': 'Tree Nuts',
  peanuts: 'Peanuts', peanut: 'Peanuts', wheat: 'Wheat',
  soybeans: 'Soy', soybean: 'Soy', soy: 'Soy', sesame: 'Sesame', coconut: 'Coconut',
}
function passportDisplayAllergens(flags: string[] | null | undefined): string[] {
  const out = new Set<string>()
  for (const f of flags ?? []) {
    const key = String(f).toLowerCase().trim()
    out.add(PASSPORT_ALLERGEN_DISPLAY[key] ?? key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
  }
  return [...out]
}

interface PassportSupplementPayload {
  dietaryIngredients?: Array<{ uid?: string; name?: string; amount?: number; unit?: string; percentDV?: string; blendId?: string; isOther?: boolean; amountLessThan?: boolean; symbol?: string }>
  blends?: Array<{ id?: string; name?: string; total?: number; unit?: string; amountLessThan?: boolean }>
  servingForm?: string
  servingsPerContainer?: number
  nutrition?: SupplementNutrition
  nutritionLessThan?: Record<string, boolean>
  noDvSymbol?: string
  customFootnotes?: Array<{ symbol: string; text: string }>
}
interface PassportCosmeticPayload {
  ingredients?: Array<{ uid?: string; inciName?: string; pct?: number; isColorAdditive?: boolean; isFragrance?: boolean }>
  netContentsQty?: number
  netContentsUnit?: string
  responsiblePerson?: string
  adverseEventContact?: string
}
interface PassportPetPayload {
  ingredients?: Array<{ uid?: string; name?: string; weight?: number }>
  ga?: GuaranteedAnalysis
  species?: PetSpecies
  lifeStage?: LifeStage
  method?: AdequacyMethod
  feedingDirections?: string
}

export async function getProductPassport(draftId: string): Promise<PassportResult> {
  // Lean on the detail loader for the shared half (identity / recipe summary /
  // ingredients / allergens / packaging / variants / flavors / pricing / fees /
  // certs / refs). It is already ownership-checked + try/caught.
  const detail = await getProductReviewDetail(draftId)
  if (!detail.ok) return detail
  const base = detail.data

  try {
    // Second, panel-focused fetch (the detail loader doesn't pull the columns the
    // Facts computation needs: per100g, nutrientSource, declaredPanel, variant
    // serving geometry, replacements, die-line outlines, asset ids).
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: draftId },
      select: {
        name: true,
        labelingType: true,
        nutrientSource: true,
        declaredPanel: true,
        intendedAgeGroup: true,
        allergenCrossContamination: true,
        imageAssetId: true,
        galleryAssetIds: true,
        videoAssetId: true,
        ingredientSlots: {
          orderBy: { displayOrder: 'asc' },
          select: {
            label: true,
            weightG: true,
            baseIngredient: {
              select: { name: true, internalName: true, labelDeclarationName: true, nutritionPer100g: true, densityGPerML: true, allergenFlags: true },
            },
          },
        },
        variants: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { servingSizeG: true, servingsPerContainer: true, servingSizeDesc: true },
        },
      },
    })

    const dom = base.labelingType
    let factsPanel: PassportFactsPanel | null = null
    let cosmeticFacts: PassportCosmeticFacts | null = null
    let petFacts: PassportPetFacts | null = null
    let supplementIngredients: PassportFormulationIngredient[] = []
    let cosmeticIngredients: PassportFormulationIngredient[] = []
    let petIngredients: PassportFormulationIngredient[] = []
    let ingredientStatement: string | null = null

    // ---- FOOD / SUPPLEMENT → PanelData ----
    if (tpl) {
      const declared = tpl.nutrientSource === 'DECLARED'
      if (declared) {
        const panel = asPanelDataLoose(tpl.declaredPanel)
        if (panel) factsPanel = { panel, contains: null, ingredientStatement: null, declared: true }
      } else if (dom === 'FOOD' && tpl.ingredientSlots.length > 0) {
        const variant = tpl.variants[0]
        const servingSizeG = Number(variant?.servingSizeG) || 0
        const servingsPerPackage = Number(variant?.servingsPerContainer) || 1
        if (servingSizeG > 0) {
          const rows = composeMarketplaceRows(
            tpl.ingredientSlots.map((s) => ({
              weightG: Number(s.weightG) || 0,
              base: {
                name: s.baseIngredient.internalName ?? s.baseIngredient.name,
                per100g: (s.baseIngredient.nutritionPer100g ?? {}) as Record<string, number>,
                densityGPerMl: s.baseIngredient.densityGPerML ?? undefined,
              },
            })),
            [],
            {},
          )
          const result = calculateLabel(rows, { basis: 'serving', servingSizeG, servingsPerPackage }, {
            audience: tpl.intendedAgeGroup ?? 'GENERAL',
          })
          const panel = toPanelData(result, { suggestedServing: variant?.servingSizeDesc ?? undefined, showVoluntaryFats: true })
          // Ingredient statement: label-declaration names, descending by weight (21 CFR 101.4).
          const ordered = [...tpl.ingredientSlots]
            .map((s, idx) => ({ s, idx, w: Number(s.weightG) || 0 }))
            .sort((a, b) => b.w - a.w || a.idx - b.idx)
            .map(({ s }) => s.label || s.baseIngredient.labelDeclarationName || s.baseIngredient.internalName || s.baseIngredient.name)
            .filter(Boolean)
          ingredientStatement = ordered.length ? ordered.join(', ') : null
          // "Contains" line from base recipe allergens.
          const contains = composeContainsAllergens(
            tpl.ingredientSlots.map((s, i) => ({ id: `slot-${i}`, allergens: passportDisplayAllergens(s.baseIngredient.allergenFlags) })),
            [],
            {},
          )
          factsPanel = {
            panel,
            contains: contains.length ? `Contains: ${contains.join(', ')}.` : null,
            ingredientStatement,
            declared: false,
          }
        }
      }
    }

    // ---- Non-food domains → formulationData (cast-guarded) ----
    if (dom === 'DIETARY_SUPPLEMENT' || dom === 'COSMETIC' || dom === 'PET_PRODUCT') {
      const fdRow = await (prisma as unknown as {
        productTemplate: { findUnique: (a: unknown) => Promise<{ name: string; formulationData: Record<string, unknown> | null } | null> }
      }).productTemplate
        .findUnique({ where: { id: draftId }, select: { name: true, formulationData: true } })
        .catch(() => null)
      const fd = (fdRow?.formulationData ?? {}) as Record<string, unknown>

      if (dom === 'DIETARY_SUPPLEMENT' && !factsPanel) {
        const p = (fd.supplement ?? {}) as PassportSupplementPayload
        const di = p.dietaryIngredients ?? []
        if (di.length) {
          const dietary: DietaryIngredient[] = di
            .filter((r) => r.name?.trim())
            .map((r, i, arr) => ({
              id: r.uid ?? `di-${i}`,
              name: r.name!.trim(),
              amountPerServing: r.amount ?? 0,
              unit: r.unit ?? '',
              percentDV: r.percentDV?.trim() === '' || r.percentDV == null ? null : Number(r.percentDV),
              blendId: r.blendId || null,
              isOtherIngredient: Boolean(r.isOther),
              sortWeight: arr.length - i,
              amountLessThan: r.amountLessThan,
              symbol: r.symbol?.trim() || undefined,
            }))
          const blends: ProprietaryBlend[] = (p.blends ?? []).map((b, i) => ({
            id: b.id ?? `bl-${i}`,
            name: b.name ?? 'Blend',
            totalAmount: b.total ?? 0,
            unit: b.unit ?? '',
            percentDV: null,
            amountLessThan: b.amountLessThan,
          }))
          const { panel } = toSupplementPanelData(dietary, blends, {
            servingSize: p.servingForm ?? '',
            servingsPerContainer: p.servingsPerContainer ?? 1,
            nutrition: p.nutrition,
            nutritionLessThan: p.nutritionLessThan as Partial<Record<keyof SupplementNutrition, boolean>> | undefined,
            noDvSymbol: p.noDvSymbol,
            customFootnotes: p.customFootnotes,
          })
          factsPanel = { panel, contains: null, ingredientStatement: null, declared: false }
        }
        supplementIngredients = di
          .filter((r) => r.name?.trim())
          .map((r) => ({
            name: r.name!.trim(),
            amount: r.amount != null ? `${r.amountLessThan ? '< ' : ''}${r.amount}${r.unit ? ` ${r.unit}` : ''}` : null,
            note: r.isOther ? 'other ingredient' : r.blendId ? 'in blend' : null,
          }))
      } else if (dom === 'COSMETIC') {
        const p = (fd.cosmetic ?? {}) as PassportCosmeticPayload
        const ings = p.ingredients ?? []
        if (ings.length) {
          const items: CosmeticIngredient[] = ings.map((r, i) => ({
            id: r.uid ?? `ci-${i}`,
            inciName: r.inciName ?? '',
            pct: Number(r.pct) || 0,
            isColorAdditive: Boolean(r.isColorAdditive),
            isFragrance: Boolean(r.isFragrance),
          }))
          const decl = toInciDeclaration(items)
          cosmeticFacts = {
            ingredients: decl.text,
            netContents: Number(p.netContentsQty) > 0 ? `Net contents: ${p.netContentsQty} ${p.netContentsUnit ?? ''}`.trim() : null,
            responsiblePerson: p.responsiblePerson?.trim() || null,
            adverseEventContact: p.adverseEventContact?.trim() || null,
          }
          cosmeticIngredients = ings
            .filter((r) => r.inciName?.trim())
            .map((r) => ({
              name: r.inciName!.trim(),
              amount: r.pct != null ? `${r.pct}%` : null,
              note: r.isColorAdditive ? 'color additive' : r.isFragrance ? 'fragrance' : null,
            }))
        }
      } else if (dom === 'PET_PRODUCT') {
        const p = (fd.pet ?? {}) as PassportPetPayload
        if (p.ga) {
          const gaRows = formatGuaranteedAnalysis(p.ga)
          const ingredients = petIngredientOrder((p.ingredients ?? []).map((r, i) => ({ id: r.uid ?? `pi-${i}`, name: r.name ?? '', weight: Number(r.weight) || 0 }))).join(', ')
          petFacts = {
            gaRows,
            ingredients,
            adequacyStatement: p.species && p.lifeStage && p.method
              ? adequacyStatement(tpl?.name ?? base.name, p.species, p.lifeStage, p.method)
              : null,
            feedingDirections: p.feedingDirections?.trim() || null,
          }
        }
        petIngredients = (p.ingredients ?? [])
          .filter((r) => r.name?.trim())
          .map((r) => ({ name: r.name!.trim(), amount: r.weight != null ? `${r.weight} g` : null, note: null }))
      }
    }

    // ---- Die-line outline SVGs (variant.dieCutTemplateId + per-flavor slots) ----
    const dielines: PassportDieline[] = []
    const seenDieIds = new Set<string>()
    try {
      const looseTpl = await (prisma as unknown as {
        productTemplate: {
          findUnique: (a: unknown) => Promise<{
            variants: Array<{ containerFormat: string; dieCutTemplateId: string | null; dieCutTemplate: { id: string; name: string; outlineSvg: string; widthMm: number; heightMm: number } | null }>
            flavorPresets: Array<{ name: string; dieCutTemplateId?: string | null; dieCutTemplate?: { id: string; name: string; outlineSvg: string; widthMm: number; heightMm: number } | null }>
          } | null>
        }
      }).productTemplate.findUnique({
        where: { id: draftId },
        select: {
          variants: {
            select: {
              containerFormat: true,
              dieCutTemplateId: true,
              dieCutTemplate: { select: { id: true, name: true, outlineSvg: true, widthMm: true, heightMm: true } },
            },
          },
          flavorPresets: {
            orderBy: { sortOrder: 'asc' },
            select: {
              name: true,
              dieCutTemplateId: true,
              dieCutTemplate: { select: { id: true, name: true, outlineSvg: true, widthMm: true, heightMm: true } },
            },
          },
        },
      }).catch(() => null)

      for (const v of looseTpl?.variants ?? []) {
        const d = v.dieCutTemplate
        if (d && d.outlineSvg && !seenDieIds.has(d.id)) {
          seenDieIds.add(d.id)
          dielines.push({ id: d.id, name: d.name, outlineSvg: d.outlineSvg, widthMm: d.widthMm, heightMm: d.heightMm, flavorName: null })
        }
      }
      for (const f of looseTpl?.flavorPresets ?? []) {
        const d = f.dieCutTemplate
        if (d && d.outlineSvg && !seenDieIds.has(d.id)) {
          seenDieIds.add(d.id)
          dielines.push({ id: d.id, name: d.name, outlineSvg: d.outlineSvg, widthMm: d.widthMm, heightMm: d.heightMm, flavorName: f.name })
        }
      }
    } catch {
      // die-line columns are part of a pending migration — degrade to [].
    }

    // ---- Image URLs (hero / gallery / mockup base) ----
    const images: PassportImage[] = []
    const assetIds: string[] = []
    if (tpl?.imageAssetId) assetIds.push(tpl.imageAssetId)
    for (const g of tpl?.galleryAssetIds ?? []) assetIds.push(g)
    if (assetIds.length) {
      const assets = await prisma.asset
        .findMany({ where: { id: { in: assetIds } }, select: { id: true, publicUrl: true } })
        .catch(() => [] as Array<{ id: string; publicUrl: string | null }>)
      const byId = new Map(assets.map((a) => [a.id, a.publicUrl]))
      const heroUrl = tpl?.imageAssetId ? byId.get(tpl.imageAssetId) : null
      if (heroUrl) images.push({ url: heroUrl, kind: 'hero' })
      for (const g of tpl?.galleryAssetIds ?? []) {
        const u = byId.get(g)
        if (u) images.push({ url: u, kind: 'gallery' })
      }
    }
    // Mockup base image (PackagingType-owned) — cast-guarded; first linked system.
    try {
      const mockup = await (prisma as unknown as {
        mockupTemplate?: { findFirst: (a: unknown) => Promise<{ baseImageAssetId: string } | null> }
      }).mockupTemplate?.findFirst({
        where: { packagingType: { variants: { some: { productTemplateId: draftId } } }, status: 'ACTIVE' },
        select: { baseImageAssetId: true },
        orderBy: { displayOrder: 'asc' },
      }).catch(() => null)
      if (mockup?.baseImageAssetId) {
        const a = await prisma.asset.findUnique({ where: { id: mockup.baseImageAssetId }, select: { publicUrl: true } }).catch(() => null)
        if (a?.publicUrl) images.push({ url: a.publicUrl, kind: 'mockup' })
      }
    } catch {
      // mockup model / relation may not be present — skip.
    }

    // ---- Custom meta (importer/admin reference key-values) — cast-guarded ----
    let customMeta: Array<{ label: string; value: string }> = []
    try {
      const metaRow = await prisma.productTemplate
        .findUnique({ where: { id: draftId }, select: { customMeta: true } })
        .catch(() => null)
      // customMeta is [{ key, value }] (some legacy rows may use `label`).
      if (Array.isArray(metaRow?.customMeta)) {
        customMeta = (metaRow!.customMeta as Array<{ key?: unknown; label?: unknown; value?: unknown }>)
          .filter((m) => m && typeof m.value === 'string')
          .map((m) => ({
            label: typeof m.key === 'string' ? m.key : typeof m.label === 'string' ? m.label : 'Field',
            value: m.value as string,
          }))
      }
    } catch {
      // customMeta column not present yet — degrade to [].
    }

    // ---- Per-flavor Nutrition Facts panels (FOOD multi-flavor) ----
    // Each FOOD flavor that carries its OWN recipe (FlavorRecipeSlot) gets a
    // panel computed from THAT recipe — same engine as the base panel above — so
    // the "View all flavor labels" modal shows each flavor's real label, not the
    // base panel repeated. Flavors without a per-flavor recipe fall back to the
    // base panel. Cast-guarded (FlavorRecipe* post-date the client until db:push).
    const flavorPanelMap = new Map<string, { panel: PanelData; contains: string | null }>()
    if (base.labelingType === 'FOOD' && base.flavors.length > 1 && !factsPanel?.declared) {
      try {
        const variant = tpl?.variants[0]
        const servingSizeG = Number(variant?.servingSizeG) || 0
        const servingsPerPackage = Number(variant?.servingsPerContainer) || 1
        if (servingSizeG > 0) {
          const FSEL = { select: { name: true, internalName: true, nutritionPer100g: true, densityGPerML: true, allergenFlags: true } } as const
          const fps = await (prisma as unknown as {
            flavorPreset: { findMany: (a: unknown) => Promise<Array<{
              id: string
              recipeSlots: Array<{ weightG: unknown; baseIngredient: { name: string; internalName: string | null; nutritionPer100g: unknown; densityGPerML: number | null; allergenFlags: string[] | null } }>
            }>> }
          }).flavorPreset.findMany({
            where: { productTemplateId: draftId, status: 'ACTIVE' },
            select: { id: true, recipeSlots: { orderBy: { displayOrder: 'asc' }, select: { weightG: true, baseIngredient: FSEL } } },
          })
          for (const fp of fps) {
            if (fp.recipeSlots.length === 0) continue
            const rows = composeMarketplaceRows(
              fp.recipeSlots.map((s) => ({
                weightG: Number(s.weightG) || 0,
                base: { name: s.baseIngredient.internalName ?? s.baseIngredient.name, per100g: (s.baseIngredient.nutritionPer100g ?? {}) as Record<string, number>, densityGPerMl: s.baseIngredient.densityGPerML ?? undefined },
              })),
              [],
              {},
            )
            const result = calculateLabel(rows, { basis: 'serving', servingSizeG, servingsPerPackage }, { audience: tpl?.intendedAgeGroup ?? 'GENERAL' })
            const panel = toPanelData(result, { suggestedServing: variant?.servingSizeDesc ?? undefined, showVoluntaryFats: true })
            const contains = composeContainsAllergens(
              fp.recipeSlots.map((s, i) => ({ id: `slot-${i}`, allergens: passportDisplayAllergens(s.baseIngredient.allergenFlags) })),
              [],
              {},
            )
            flavorPanelMap.set(fp.id, { panel, contains: contains.length ? `Contains: ${contains.join(', ')}.` : null })
          }
        }
      } catch {
        // Schema not migrated / compute failed — fall back to the base panel below.
      }
    }

    // The Passport's "View all flavor labels" feeds LabelViewerModal a column per
    // flavor — each flavor's own panel when it has a per-flavor recipe, else the
    // base recipe panel.
    const flavorColumns: Array<{ label: string; data: PanelData; contains?: string }> = []
    if (base.labelingType === 'FOOD' && base.flavors.length > 1 && factsPanel?.panel) {
      for (const f of base.flavors) {
        const own = flavorPanelMap.get(f.id)
        const data = own?.panel ?? factsPanel.panel
        const contains = own ? own.contains : factsPanel.contains
        flavorColumns.push({ label: f.name, data, ...(contains ? { contains } : {}) })
      }
    }
    // Per-flavor Supplement Facts / Guaranteed Analysis (multi-flavor supplement +
    // pet). Computed with the SAME engine as the base panel above, keyed by
    // FlavorPreset id from formulationData.supplementByFlavor / petByFlavor.
    const flavorFacts: PassportFlavorFacts[] = []
    if (base.flavors.length > 0 && (dom === 'DIETARY_SUPPLEMENT' || dom === 'PET_PRODUCT')) {
      // Cast-guarded fetch — formulationData isn't on the main detail query.
      const fdRow = await (prisma as unknown as {
        productTemplate: { findUnique: (a: unknown) => Promise<{ formulationData: Record<string, unknown> | null } | null> }
      }).productTemplate.findUnique({ where: { id: draftId }, select: { formulationData: true } }).catch(() => null)
      const fdRoot = (fdRow?.formulationData ?? {}) as { supplementByFlavor?: Record<string, PassportSupplementPayload>; petByFlavor?: Record<string, PassportPetPayload> }
      const supByFlavor = fdRoot.supplementByFlavor ?? {}
      const petByFlavor = fdRoot.petByFlavor ?? {}
      for (const f of base.flavors) {
        if (dom === 'DIETARY_SUPPLEMENT') {
          const p = supByFlavor[f.id]
          const di = p?.dietaryIngredients ?? []
          if (!di.length) continue
          const dietary: DietaryIngredient[] = di.filter((r) => r.name?.trim()).map((r, i, arr) => ({
            id: r.uid ?? `di-${i}`, name: r.name!.trim(), amountPerServing: r.amount ?? 0, unit: r.unit ?? '',
            percentDV: r.percentDV?.trim() === '' || r.percentDV == null ? null : Number(r.percentDV),
            blendId: r.blendId || null, isOtherIngredient: Boolean(r.isOther), sortWeight: arr.length - i,
            amountLessThan: r.amountLessThan, symbol: r.symbol?.trim() || undefined,
          }))
          const blends: ProprietaryBlend[] = (p!.blends ?? []).map((b, i) => ({ id: b.id ?? `bl-${i}`, name: b.name ?? 'Blend', totalAmount: b.total ?? 0, unit: b.unit ?? '', percentDV: null, amountLessThan: b.amountLessThan }))
          const { panel } = toSupplementPanelData(dietary, blends, {
            servingSize: p!.servingForm ?? '', servingsPerContainer: p!.servingsPerContainer ?? 1,
            nutrition: p!.nutrition, nutritionLessThan: p!.nutritionLessThan as Partial<Record<keyof SupplementNutrition, boolean>> | undefined,
            noDvSymbol: p!.noDvSymbol, customFootnotes: p!.customFootnotes,
          })
          flavorFacts.push({ id: f.id, name: f.name, swatchHex: f.swatchHex, panel, petFacts: null })
        } else {
          const p = petByFlavor[f.id]
          if (!p?.ga) continue
          const gaRows = formatGuaranteedAnalysis(p.ga)
          const ingredients = petIngredientOrder((p.ingredients ?? []).map((r, i) => ({ id: r.uid ?? `pi-${i}`, name: r.name ?? '', weight: Number(r.weight) || 0 }))).join(', ')
          flavorFacts.push({
            id: f.id, name: f.name, swatchHex: f.swatchHex, panel: null,
            petFacts: {
              gaRows, ingredients,
              adequacyStatement: p.species && p.lifeStage && p.method ? adequacyStatement(tpl?.name ?? base.name, p.species, p.lifeStage, p.method) : null,
              feedingDirections: p.feedingDirections?.trim() || null,
            },
          })
        }
      }
    }

    // Outer-carton net contents for the aggregate (compare) view, when derivable.
    const firstVariant = base.variants[0] ?? null
    const packNetContents = firstVariant?.netContentDisplay ?? null

    const data: ProductPassport = {
      ...base,
      factsPanel,
      cosmeticFacts,
      petFacts,
      isMultiFlavor: base.flavors.length > 1,
      flavorColumns,
      flavorFacts,
      packNetContents,
      supplementIngredients,
      cosmeticIngredients,
      petIngredients,
      dielines,
      images,
      customMeta,
    }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: `Could not load passport: ${(err as Error).message}` }
  }
}
