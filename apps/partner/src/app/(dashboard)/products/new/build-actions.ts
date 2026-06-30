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
import { uploadFile, getSignedReadUrl, deleteFile } from '@ilaunchify/storage'
import { lookupFeeRate, creatorTierToPlanCode, FEE_EVENTS } from '@ilaunchify/plans'
import { FORMAT_OPTIONS, MANUFACTURING_PROCESS_OPTIONS, ALLERGEN_FREE_OPTIONS, MARKET_FILTER_OPTIONS } from '@ilaunchify/types'

const FALLBACK_FEE_PCT = 15

/** Tier-aware platform-fee percents (production-order subtotal) for the pricing
 *  card's per-subscription-tier columns. Same source of truth as the marketplace. */
export async function getCreatorFeePercents(): Promise<{ maker: number; builder: number; agency: number }> {
  const out = { maker: FALLBACK_FEE_PCT, builder: FALLBACK_FEE_PCT, agency: FALLBACK_FEE_PCT }
  await Promise.all(
    (['maker', 'builder', 'agency'] as const).map(async (t) => {
      const r = await lookupFeeRate(creatorTierToPlanCode(t), FEE_EVENTS.PRODUCTION_ORDER_SUBTOTAL).catch(() => null)
      if (r?.ratePercent != null) out[t] = r.ratePercent
    }),
  )
  return out
}

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
  /** Product domain chosen in the domain selector. Persisted at creation and
   *  validated against the subcategory's category domain. */
  labelingType?: string
}

// ---------------------------------------------------------------------------
// Media — hero + up to 6 gallery images + 1 video (8 total). Uploads to R2 via
// @ilaunchify/storage, creates an Asset, links it on the ProductTemplate.
// galleryAssetIds / videoAssetId are new columns → cast-guarded.
// ---------------------------------------------------------------------------

export type MediaSlot = 'hero' | 'gallery' | 'video'
export interface MediaItem { assetId: string; url: string }
export interface MediaData { hero: MediaItem | null; gallery: MediaItem[]; video: MediaItem | null }

const IMG_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

async function ownsDraft(productTemplateId: string, partnerServiceIds: string[]): Promise<boolean> {
  const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
  if (!tpl) return false
  return !tpl.manufacturerServiceId || partnerServiceIds.includes(tpl.manufacturerServiceId)
}

export async function uploadProductMedia(formData: FormData): Promise<Result<MediaItem>> {
  try {
    const { user, partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const productTemplateId = String(formData.get('productTemplateId') ?? '')
    const slot = (String(formData.get('slot') ?? 'gallery')) as MediaSlot
    const file = formData.get('file')
    if (!productTemplateId) return { ok: false, error: 'Save the draft first.' }
    if (!(await ownsDraft(productTemplateId, partner.services.map((s) => s.id)))) return { ok: false, error: 'Not your product.' }
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No file selected.' }
    const isVideo = slot === 'video'
    if (isVideo ? !file.type.startsWith('video/') : !IMG_MIME.has(file.type)) {
      return { ok: false, error: isVideo ? 'Upload a video file (MP4/WebM).' : 'Upload a PNG, JPEG, WebP, or GIF.' }
    }
    const MAX = isVideo ? 100 * 1024 * 1024 : 15 * 1024 * 1024
    if (file.size > MAX) return { ok: false, error: `File too large (max ${isVideo ? '100' : '15'} MB).` }

    const safe = (file.name || 'file').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 48)
    const key = `products/${productTemplateId}/media/${slot}/${Date.now()}-${safe}`
    await uploadFile({ key, body: Buffer.from(await file.arrayBuffer()), contentType: file.type })

    const asset = await prisma.asset.create({
      data: {
        ownerType: 'PRODUCT', ownerId: productTemplateId,
        type: isVideo ? 'OTHER' : slot === 'hero' ? 'HERO_IMAGE' : 'PRODUCT_IMAGE',
        source: 'USER_UPLOAD', storageKey: key, mimeType: file.type, sizeBytes: file.size,
        isPublic: false, uploadedByUserId: user.id,
      },
      select: { id: true },
    })

    const p = prisma as unknown as { productTemplate: { findUnique: (a: unknown) => Promise<{ galleryAssetIds: string[] } | null>; update: (a: unknown) => Promise<unknown> } }
    if (slot === 'hero') {
      await prisma.productTemplate.update({ where: { id: productTemplateId }, data: { imageAssetId: asset.id } })
    } else if (slot === 'video') {
      await p.productTemplate.update({ where: { id: productTemplateId }, data: { videoAssetId: asset.id } })
    } else {
      const cur = await p.productTemplate.findUnique({ where: { id: productTemplateId }, select: { galleryAssetIds: true } })
      const next = [...(cur?.galleryAssetIds ?? []), asset.id].slice(0, 6)
      await p.productTemplate.update({ where: { id: productTemplateId }, data: { galleryAssetIds: next } })
    }
    await logAuditAs(user, { entityType: 'ProductTemplate', entityId: productTemplateId, action: 'PRODUCT_TEMPLATE_UPDATE', payload: { media: slot } }).catch(() => {})

    return { ok: true, data: { assetId: asset.id, url: await getSignedReadUrl(key) } }
  } catch (err) {
    console.error('[uploadProductMedia] failed:', err)
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }
}

export async function removeProductMedia(productTemplateId: string, slot: MediaSlot, assetId: string): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return { ok: false, error: error ?? 'Partner profile not found.' }
    if (!(await ownsDraft(productTemplateId, partner.services.map((s) => s.id)))) return { ok: false, error: 'Not your product.' }

    const p = prisma as unknown as { productTemplate: { findUnique: (a: unknown) => Promise<{ galleryAssetIds: string[] } | null>; update: (a: unknown) => Promise<unknown> } }
    if (slot === 'hero') await prisma.productTemplate.update({ where: { id: productTemplateId }, data: { imageAssetId: null } })
    else if (slot === 'video') await p.productTemplate.update({ where: { id: productTemplateId }, data: { videoAssetId: null } })
    else {
      const cur = await p.productTemplate.findUnique({ where: { id: productTemplateId }, select: { galleryAssetIds: true } })
      await p.productTemplate.update({ where: { id: productTemplateId }, data: { galleryAssetIds: (cur?.galleryAssetIds ?? []).filter((x) => x !== assetId) } })
    }
    // Best-effort: purge the asset + R2 object.
    const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { storageKey: true } }).catch(() => null)
    if (asset?.storageKey) await deleteFile(asset.storageKey).catch(() => {})
    await prisma.asset.delete({ where: { id: assetId } }).catch(() => {})
    return { ok: true }
  } catch (err) {
    console.error('[removeProductMedia] failed:', err)
    return { ok: false, error: `Could not remove: ${(err as Error).message}` }
  }
}

export async function loadMedia(productTemplateId: string): Promise<MediaData> {
  const empty: MediaData = { hero: null, gallery: [], video: null }
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return empty
    const p = prisma as unknown as { productTemplate: { findUnique: (a: unknown) => Promise<{ manufacturerServiceId: string | null; imageAssetId: string | null; galleryAssetIds: string[]; videoAssetId: string | null } | null> } }
    const tpl = await p.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true, imageAssetId: true, galleryAssetIds: true, videoAssetId: true } })
    if (!tpl) return empty
    if (tpl.manufacturerServiceId && !partner.services.map((s) => s.id).includes(tpl.manufacturerServiceId)) return empty
    const ids = [tpl.imageAssetId, ...(tpl.galleryAssetIds ?? []), tpl.videoAssetId]
    const urls = await resolveCertBadgeUrls(ids).catch(() => new Map<string, string>())
    const item = (id: string | null): MediaItem | null => (id && urls.get(id) ? { assetId: id, url: urls.get(id)! } : null)
    return {
      hero: item(tpl.imageAssetId),
      gallery: (tpl.galleryAssetIds ?? []).map(item).filter((m): m is MediaItem => !!m),
      video: item(tpl.videoAssetId),
    }
  } catch (err) {
    console.error('[loadMedia] failed:', err)
    return empty
  }
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
  // Variety-pack model (docs/VARIETY_PACK_MODEL.md §4-5) — restored on resume.
  minFlavorsPerPack: number | null
  flavorFillRule: 'CREATOR_CHOOSES' | 'EVEN_AUTO' | 'MANUFACTURER_FIXED' | null
  pricingBasis: 'PER_FLAVOR' | 'PER_PACK' | null
  /** Offered pack sizes — the typed-`unitsPerPack` sibling variants (§4.2). */
  packSizes: Array<{ id: string; label: string; unitsPerPack: number; moqPacks: number | null; pricePerPackCents: number | null }>
  nicheIds: string[]
  lifestyleTagIds: string[]
  // §7 marketplace filter attributes (format / process / allergen-free / markets).
  manufacturingFormat: string | null
  manufacturingProcesses: string[]
  allergenFreeClaims: string[]
  marketCodes: string[]
  flavors: Array<{ name: string; soi: string; lines: FlavorExtraLine[]; unitPriceCents: number | null }>
  axes: InitialDraftAxis[]
  // Recipe entry method — restores the chosen mode (Search / AI / Declare) when
  // resuming a draft so the builder reopens on the right surface.
  recipeEntryMode: 'SEARCH_BUILD' | 'AI_PARSER' | 'DECLARED_PANEL' | null
  // Product domain (label regime) — restores the step-3 toggle on resume.
  labelingType: string
  // Nutrition Facts audience (21 CFR 101.9(j)(5)) — restores the age-group selector.
  intendedAgeGroup: string
  // Recipe base slots — restored so editing shows the real recipe (and the
  // recipe-step autosave round-trips instead of wiping it).
  recipeSlots: Array<{ ingId: string; name: string; per100g: Record<string, number>; densityGPerMl: number | null; weightG: number; allergens: string[] }>
  // Production (default variant) + storage/lead (template) — #35 full load-back.
  storageClass: 'AMBIENT' | 'CHILLED' | 'FROZEN' | null
  storageTempMinF: number | null
  storageTempMaxF: number | null
  countryOfOrigin: string | null
  leadTimeRepeatDays: number | null
  leadTimeFirstRunDays: number | null
  manufacturerRefs: Array<{ label: string; value: string }>
  production: {
    fulfillmentMode: 'BULK_PRODUCTION' | 'ON_DEMAND' | 'BOTH' | null
    moqMin: number; orderIncrement: number; monthlyCapacity: number | null
    shelfLifeDays: number | null; lotTracking: boolean; sku: string | null
    netContentValue: number | null; netContentUnit: string | null
  } | null
  packing: {
    innerPacksPerOuter: number; outerPacksPerCase: number
    customerPicksCount: number | null; subscriptionInterval: string | null
    packingConfig: Record<string, unknown> | null
  } | null
  fees: Array<{ label: string; basis: 'PER_UNIT' | 'PER_SKU_ONE_TIME' | 'PER_ORDER'; amountCents: number; waivedAboveQty: number | null; sortOrder: number }>
  changeApprovalRules: Array<{ changeType: string; requiredApprover: string; sortOrder: number }>
  optionRules: Array<{ kind: 'EXCLUDE' | 'REQUIRE'; whenValueId: string; targetValueId: string; message: string | null }>
  sampleOptions: Array<{ kind: 'UNBRANDED' | 'BRANDED'; enabled: boolean; perFlavorCents: number | null; samplerSetCents: number | null; sampleMoq: number; maxUnitsPerFlavor: number | null; leadTimeDays: number; creditTowardFirstOrder: boolean; creditCapCents: number | null; maxPerCreatorPerPeriod: number | null }>
  pricingTiers: Array<{ minQty: number; maxQty: number | null; perUnitCostCents: number; perUnitFloorCents: number; leadTimeDays: number | null; fulfillmentMode: 'BULK_PRODUCTION' | 'ON_DEMAND' }>
}

/** Coerce a nutritionPer100g JSON blob into a plain { key: number } map. Guards
 *  the RSC → client boundary: any Prisma Decimal / stringified numbers inside the
 *  JSON become plain numbers, non-numeric entries are dropped. */
function plainNutrition(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(val)
    if (!Number.isNaN(n)) out[k] = n
  }
  return out
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
      packingProfileId: string | null; maxFlavorsPerPack: number | null; recipeEntryMode: string | null; labelingType: string; intendedAgeGroup: string | null
      minFlavorsPerPack: number | null; flavorFillRule: string | null; pricingBasis: string | null
      manufacturingFormat: string | null; manufacturingProcesses: string[]; allergenFreeClaims: string[]; marketCodes: string[]
      storageClass: string | null; storageTempMinF: number | null; storageTempMaxF: number | null; countryOfOrigin: string | null
      leadTimeRepeatDays: number | null; leadTimeFirstRunDays: number | null
      subcategory: { categoryId: string } | null
      flavorPresets: Array<{ name: string; statementOfIdentity: string | null; extras: unknown; unitPriceCents: number | null }>
      ingredientSlots: Array<{ id: string; baseIngredientId: string; weightG: number | null; baseIngredient: { internalName: string | null; name: string; nutritionPer100g: unknown; densityGPerML: number | null; allergenFlags: string[] } | null }>
      niches: Array<{ nicheId: string }>
      lifestyleTags: Array<{ lifestyleTagId: string }>
      variants: Array<{ fulfillmentMode: string | null; moqMin: number; orderIncrement: number; monthlyCapacity: number | null; shelfLifeDays: number | null; lotTracking: boolean; innerPacksPerOuter: number; outerPacksPerCase: number; customerPicksCount: number | null; subscriptionInterval: string | null; packingConfig: unknown; sku: string | null; netContentValue: unknown; netContentUnit: string | null; unitsPerPack: number | null }>
      // Offered pack sizes — every sibling variant carrying a typed unitsPerPack.
      sizeVariants: Array<{ id: string; containerFormat: string; unitsPerPack: number | null; moqMin: number; pricePerPackCents: number | null }>
      fees: Array<{ label: string; basis: 'PER_UNIT' | 'PER_SKU_ONE_TIME' | 'PER_ORDER'; amountCents: number; waivedAboveQty: number | null; sortOrder: number }>
      changeApprovalRules: Array<{ changeType: string; requiredApprover: string; sortOrder: number }>
      optionRules: Array<{ kind: 'EXCLUDE' | 'REQUIRE'; whenValueId: string; targetValueId: string; message: string | null }>
      sampleOptions: Array<{ kind: 'UNBRANDED' | 'BRANDED'; enabled: boolean; perFlavorCents: number | null; samplerSetCents: number | null; sampleMoq: number; maxUnitsPerFlavor: number | null; leadTimeDays: number; creditTowardFirstOrder: boolean; creditCapCents: number | null; maxPerCreatorPerPeriod: number | null }>
      pricingTiers: Array<{ minQty: number; maxQty: number | null; perUnitCostCents: number; perUnitFloorCents: number; leadTimeDays: number | null; fulfillmentMode: 'BULK_PRODUCTION' | 'ON_DEMAND' }>
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
        recipeEntryMode: true, labelingType: true, intendedAgeGroup: true,
        minFlavorsPerPack: true, flavorFillRule: true, pricingBasis: true,
        manufacturingFormat: true, manufacturingProcesses: true, allergenFreeClaims: true, marketCodes: true,
        storageClass: true, storageTempMinF: true, storageTempMaxF: true, countryOfOrigin: true,
        leadTimeRepeatDays: true, leadTimeFirstRunDays: true,
        subcategory: { select: { categoryId: true } },
        flavorPresets: { orderBy: { sortOrder: 'asc' }, select: { name: true, statementOfIdentity: true, extras: true, unitPriceCents: true } },
        ingredientSlots: { orderBy: { displayOrder: 'asc' }, select: { id: true, baseIngredientId: true, weightG: true, baseIngredient: { select: { internalName: true, name: true, nutritionPer100g: true, densityGPerML: true, allergenFlags: true } } } },
        niches: { select: { nicheId: true } },
        lifestyleTags: { select: { lifestyleTagId: true } },
        // Production spec lives on the legacy DEFAULT variant (no typed unitsPerPack).
        // Filter to it so adding offered-size variants never hijacks the prod read.
        variants: { where: { unitsPerPack: null }, take: 1, orderBy: { createdAt: 'asc' }, select: { fulfillmentMode: true, moqMin: true, orderIncrement: true, monthlyCapacity: true, shelfLifeDays: true, lotTracking: true, innerPacksPerOuter: true, outerPacksPerCase: true, customerPicksCount: true, subscriptionInterval: true, packingConfig: true, sku: true, netContentValue: true, netContentUnit: true, unitsPerPack: true } },
        // Offered pack sizes — typed-unitsPerPack siblings (§4.2).
        sizeVariants: { where: { unitsPerPack: { not: null } }, orderBy: { unitsPerPack: 'asc' }, select: { id: true, containerFormat: true, unitsPerPack: true, moqMin: true, pricePerPackCents: true } },
        fees: { orderBy: { sortOrder: 'asc' }, select: { label: true, basis: true, amountCents: true, waivedAboveQty: true, sortOrder: true } },
        changeApprovalRules: { orderBy: { sortOrder: 'asc' }, select: { changeType: true, requiredApprover: true, sortOrder: true } },
        optionRules: { orderBy: { createdAt: 'asc' }, select: { kind: true, whenValueId: true, targetValueId: true, message: true } },
        sampleOptions: { orderBy: { sortOrder: 'asc' }, select: { kind: true, enabled: true, perFlavorCents: true, samplerSetCents: true, sampleMoq: true, maxUnitsPerFlavor: true, leadTimeDays: true, creditTowardFirstOrder: true, creditCapCents: true, maxPerCreatorPerPeriod: true } },
        pricingTiers: { orderBy: [{ fulfillmentMode: 'asc' }, { sortOrder: 'asc' }], select: { minQty: true, maxQty: true, perUnitCostCents: true, perUnitFloorCents: true, leadTimeDays: true, fulfillmentMode: true } },
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

    // manufacturerRefs ships with a migration → cast-guarded read, fail-safe to [].
    const refsRow = await (
      prisma as unknown as { productTemplate: { findUnique: (a: unknown) => Promise<{ manufacturerRefs: unknown } | null> } }
    ).productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerRefs: true } }).catch(() => null)
    const manufacturerRefs = Array.isArray(refsRow?.manufacturerRefs)
      ? (refsRow!.manufacturerRefs as Array<{ label?: unknown; value?: unknown }>)
          .filter((r) => r && typeof r.value === 'string')
          .map((r) => ({ label: typeof r.label === 'string' ? r.label : '', value: r.value as string }))
      : []

    // Axes bind to the stable baseIngredientId client-side; the DB stores the
    // real slot id. Map it back so the binding re-selects the right base row.
    const slotToIng = new Map(tpl.ingredientSlots.map((s) => [s.id, s.baseIngredientId]))

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
      minFlavorsPerPack: tpl.minFlavorsPerPack ?? null,
      flavorFillRule: (tpl.flavorFillRule as InitialDraft['flavorFillRule']) ?? null,
      pricingBasis: (tpl.pricingBasis as InitialDraft['pricingBasis']) ?? null,
      packSizes: (tpl.sizeVariants ?? [])
        .filter((v) => v.unitsPerPack != null)
        .map((v) => ({
          id: v.id,
          label: v.containerFormat || `${v.unitsPerPack}-pack`,
          unitsPerPack: Number(v.unitsPerPack),
          moqPacks: v.moqMin ?? null,
          pricePerPackCents: v.pricePerPackCents ?? null,
        })),
      recipeEntryMode: (tpl.recipeEntryMode as InitialDraft['recipeEntryMode']) ?? null,
      labelingType: String(tpl.labelingType ?? 'FOOD'),
      intendedAgeGroup: String(tpl.intendedAgeGroup ?? 'GENERAL'),
      nicheIds: tpl.niches.map((n) => n.nicheId),
      lifestyleTagIds: tpl.lifestyleTags.map((l) => l.lifestyleTagId),
      manufacturingFormat: tpl.manufacturingFormat ?? null,
      manufacturingProcesses: tpl.manufacturingProcesses ?? [],
      allergenFreeClaims: tpl.allergenFreeClaims ?? [],
      marketCodes: tpl.marketCodes ?? [],
      countryOfOrigin: tpl.countryOfOrigin ?? null,
      manufacturerRefs,
      flavors: tpl.flavorPresets.map((f) => ({
        name: f.name,
        soi: f.statementOfIdentity ?? '',
        unitPriceCents: f.unitPriceCents ?? null,
        lines: Array.isArray(f.extras)
          ? (f.extras as Array<Record<string, unknown>>)
              .filter((e) => e && e.ingredientId)
              .map((e) => ({ ingredientId: String(e.ingredientId), name: String(e.name ?? ''), qty: Number(e.qty) || 0, unit: String(e.unit ?? 'g') }))
          : [],
      })),
      recipeSlots: tpl.ingredientSlots.map((s) => ({
        ingId: s.baseIngredientId,
        name: s.baseIngredient?.internalName ?? s.baseIngredient?.name ?? '',
        // Prisma Decimal columns (weightG, densityGPerML) must be coerced to plain
        // numbers — they can't cross the RSC → client boundary as Decimal objects.
        per100g: plainNutrition(s.baseIngredient?.nutritionPer100g),
        densityGPerMl: s.baseIngredient?.densityGPerML != null ? Number(s.baseIngredient.densityGPerML) : null,
        allergens: s.baseIngredient?.allergenFlags ?? [],
        weightG: Number(s.weightG ?? 0),
      })),
      axes: (tpl.optionAxes ?? []).map((a) => ({
        key: a.key, label: a.label, editableByCreator: a.editableByCreator, affectsLabel: a.affectsLabel,
        boundSlotId: a.boundSlotId ? (slotToIng.get(a.boundSlotId) ?? null) : null,
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
            sku: tpl.variants[0].sku,
            netContentValue: tpl.variants[0].netContentValue == null ? null : Number(tpl.variants[0].netContentValue),
            netContentUnit: tpl.variants[0].netContentUnit ?? null,
          }
        : null,
      packing: tpl.variants[0]
        ? {
            innerPacksPerOuter: tpl.variants[0].innerPacksPerOuter,
            outerPacksPerCase: tpl.variants[0].outerPacksPerCase,
            customerPicksCount: tpl.variants[0].customerPicksCount,
            subscriptionInterval: tpl.variants[0].subscriptionInterval,
            packingConfig: (tpl.variants[0].packingConfig ?? null) as Record<string, unknown> | null,
          }
        : null,
      fees: (tpl.fees ?? []).map((f) => ({ label: f.label, basis: f.basis, amountCents: f.amountCents, waivedAboveQty: f.waivedAboveQty, sortOrder: f.sortOrder })),
      changeApprovalRules: (tpl.changeApprovalRules ?? []).map((r) => ({ changeType: r.changeType, requiredApprover: r.requiredApprover, sortOrder: r.sortOrder })),
      optionRules: (tpl.optionRules ?? []).map((r) => ({ kind: r.kind, whenValueId: r.whenValueId, targetValueId: r.targetValueId, message: r.message })),
      sampleOptions: (tpl.sampleOptions ?? []).map((s) => ({ kind: s.kind, enabled: s.enabled, perFlavorCents: s.perFlavorCents, samplerSetCents: s.samplerSetCents, sampleMoq: s.sampleMoq, maxUnitsPerFlavor: s.maxUnitsPerFlavor, leadTimeDays: s.leadTimeDays, creditTowardFirstOrder: s.creditTowardFirstOrder, creditCapCents: s.creditCapCents, maxPerCreatorPerPeriod: s.maxPerCreatorPerPeriod })),
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
): Promise<Result<{ id: string; name: string; per100g: Record<string, number>; densityGPerMl: number | null; allergens: string[] }>> {
  try {
    // Live USDA pick (`fdc:<id>`): materialize the FDC food into a real Ingredient
    // row (HYBRID snapshot, upsert by usdaFdcId) and return its REAL id so the
    // recipe slot / flavor extra references a persisted FK, not the synthetic id.
    if (id.startsWith('fdc:')) {
      const fdcId = Number(id.slice(4))
      if (!Number.isFinite(fdcId)) return { ok: false, error: 'Bad ingredient id.' }
      const food = await fetchUsdaFood(fdcId)
      if (!food) {
        // API down/unkeyed but the row may already be mirrored — try that.
        const mirror = await prisma.ingredient.findUnique({ where: { usdaFdcId: String(fdcId) }, select: { id: true, internalName: true, name: true, nutritionPer100g: true, densityGPerML: true, allergenFlags: true } })
        if (!mirror) return { ok: false, error: 'USDA ingredient is temporarily unavailable.' }
        return { ok: true, data: { id: mirror.id, name: mirror.internalName ?? mirror.name, per100g: (mirror.nutritionPer100g ?? {}) as Record<string, number>, densityGPerMl: mirror.densityGPerML, allergens: mirror.allergenFlags ?? [] } }
      }
      const row = await prisma.ingredient.upsert({
        where: { usdaFdcId: String(fdcId) },
        update: {},
        create: {
          name: food.description, internalName: food.description, labelDeclarationName: food.description,
          nutritionPer100g: food.per100g, source: 'USDA', usdaFdcId: String(fdcId), sourceRefId: String(fdcId),
          verificationStatus: 'LIBRARY_PROMOTED', allergens: [], allergenFlags: [],
        },
        select: { id: true, internalName: true, name: true, nutritionPer100g: true, densityGPerML: true, allergenFlags: true },
      })
      return { ok: true, data: { id: row.id, name: row.internalName ?? row.name, per100g: (row.nutritionPer100g ?? {}) as Record<string, number>, densityGPerMl: row.densityGPerML, allergens: row.allergenFlags ?? [] } }
    }

    const ing = await prisma.ingredient.findUnique({
      where: { id },
      select: { internalName: true, name: true, nutritionPer100g: true, densityGPerML: true, allergenFlags: true },
    })
    if (!ing) return { ok: false, error: 'Ingredient not found.' }
    return {
      ok: true,
      data: {
        id,
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

import { fetchUsdaFood } from '../[id]/edit/usda-fdc'

export interface SlotInput { ingredientId: string; weightG: number; displayOrder: number; costPerKgCents?: number | null }

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

    // Best-effort: persist per-slot ingredient cost. The costPerKgCents column is
    // migration-gated, so this stays OUT of the create above (which must never
    // fail) — a separate cast + try/catch that no-ops until the migration lands.
    const withCost = valid.filter((s) => s.costPerKgCents != null)
    if (withCost.length) {
      try {
        const px = prisma as unknown as { templateIngredientSlot: { updateMany: (a: unknown) => Promise<unknown> } }
        for (const s of withCost) {
          await px.templateIngredientSlot.updateMany({
            where: { productTemplateId, baseIngredientId: s.ingredientId },
            data: { costPerKgCents: Math.max(0, Math.round(s.costPerKgCents!)) },
          })
        }
      } catch {
        // Column not migrated yet — costs persist once 20260611000000_add_slot_cost lands.
      }
    }

    return { ok: true }
  } catch (err) {
    console.error('[saveRecipeSlots] failed:', err)
    return { ok: false, error: `Could not save recipe: ${(err as Error).message}` }
  }
}

/** Best-effort per-slot ingredient costs (¢/kg keyed by baseIngredientId). The
 *  column is migration-gated, so this is a separate cast + try/catch that returns
 *  {} until 20260611000000_add_slot_cost lands — never breaks loadDraft/resume. */
export async function loadSlotCosts(productTemplateId: string): Promise<Record<string, number>> {
  try {
    const px = prisma as unknown as {
      templateIngredientSlot: { findMany: (a: unknown) => Promise<Array<{ baseIngredientId: string; costPerKgCents: number | null }>> }
    }
    const rows = await px.templateIngredientSlot.findMany({
      where: { productTemplateId },
      select: { baseIngredientId: true, costPerKgCents: true },
    })
    const out: Record<string, number> = {}
    for (const r of rows) if (r.costPerKgCents != null) out[r.baseIngredientId] = r.costPerKgCents
    return out
  } catch {
    return {}
  }
}

export interface MyRecipe {
  id: string
  name: string
  status: string
  slots: Array<{ ingId: string; name: string; per100g: Record<string, number>; densityGPerMl: number | null; weightG: number }>
}

/** The partner's own product recipes (base ingredient slots), for the "My
 *  recipes" reuse tab — apply one product's formulation onto another. No new
 *  schema: every product already stores its recipe. Excludes the current draft. */
export async function listMyRecipes(excludeTemplateId?: string): Promise<MyRecipe[]> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return []
    const ownIds = partner.services.map((s) => s.id)
    if (ownIds.length === 0) return []

    const rows = await prisma.productTemplate.findMany({
      where: {
        manufacturerServiceId: { in: ownIds },
        ...(excludeTemplateId ? { id: { not: excludeTemplateId } } : {}),
        ingredientSlots: { some: {} },
      },
      orderBy: { updatedAt: 'desc' },
      take: 25,
      select: {
        id: true, name: true, status: true,
        ingredientSlots: {
          orderBy: { displayOrder: 'asc' },
          select: { baseIngredientId: true, weightG: true, baseIngredient: { select: { internalName: true, name: true, nutritionPer100g: true, densityGPerML: true } } },
        },
      },
    })

    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      status: String(t.status),
      slots: t.ingredientSlots.map((s) => ({
        ingId: s.baseIngredientId,
        name: s.baseIngredient?.internalName ?? s.baseIngredient?.name ?? '',
        per100g: (s.baseIngredient?.nutritionPer100g ?? {}) as Record<string, number>,
        densityGPerMl: s.baseIngredient?.densityGPerML ?? null,
        weightG: Number(s.weightG ?? 0),
      })),
    }))
  } catch (err) {
    console.error('[listMyRecipes] failed:', err)
    return []
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

    // Resolve each axis's bound slot. The client binds by the stable
    // baseIngredientId (row uids are ephemeral), so map ingredientId → the real
    // TemplateIngredientSlot.id here. Pass-through any value that's already a
    // slot id (legacy / mixed data).
    const slots = await prisma.templateIngredientSlot.findMany({
      where: { productTemplateId },
      select: { id: true, baseIngredientId: true },
    })
    const slotIds = new Set(slots.map((s) => s.id))
    const ingToSlot = new Map(slots.map((s) => [s.baseIngredientId, s.id]))
    const resolveSlot = (b: string | null | undefined): string | null =>
      !b ? null : slotIds.has(b) ? b : (ingToSlot.get(b) ?? null)

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
          boundSlotId: resolveSlot(a.boundSlotId),
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
  fulfillmentMode: 'BULK_PRODUCTION' | 'ON_DEMAND'
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

    // sortOrder is unique per (template, mode) — index within each mode.
    const modeCount: Record<'BULK_PRODUCTION' | 'ON_DEMAND', number> = { BULK_PRODUCTION: 0, ON_DEMAND: 0 }
    const clean = tiers
      .filter((t) => t.minQty > 0 && t.perUnitCostCents > 0)
      .map((t) => {
        const fulfillmentMode = t.fulfillmentMode === 'ON_DEMAND' ? 'ON_DEMAND' : 'BULK_PRODUCTION'
        return {
          fulfillmentMode,
          minQty: Math.max(1, Math.floor(t.minQty)),
          maxQty: t.maxQty == null ? null : Math.max(t.minQty, Math.floor(t.maxQty)),
          perUnitCostCents: Math.max(0, Math.floor(t.perUnitCostCents)),
          perUnitFloorCents: Math.max(0, Math.floor(t.perUnitFloorCents)),
          leadTimeDays: t.leadTimeDays == null ? null : Math.max(0, Math.floor(t.leadTimeDays)),
          sortOrder: modeCount[fulfillmentMode]++,
        }
      })

    await prisma.$transaction([
      prisma.productTemplatePricingTier.deleteMany({ where: { productTemplateId } }),
      // fulfillmentMode is a new column — cast until the client is regenerated.
      ...clean.map((t) => prisma.productTemplatePricingTier.create({ data: { productTemplateId, ...t } as never })),
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
  /** Declared net content (label principal display panel) — by weight/volume/count. */
  netContentValue?: number | null
  netContentUnit?: string | null
  /** Manufacturer base SKU for the default variant. null/undefined leaves it unchanged. */
  sku?: string | null
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

    const data: Record<string, unknown> = {
      fulfillmentMode: input.fulfillmentMode,
      moqMin: Math.max(1, Math.floor(input.moqMin || 1)),
      orderIncrement: Math.max(1, Math.floor(input.orderIncrement || 1)),
      monthlyCapacity: input.monthlyCapacity == null ? null : Math.max(0, Math.floor(input.monthlyCapacity)),
      shelfLifeDays: input.shelfLifeDays == null ? null : Math.max(1, Math.floor(input.shelfLifeDays)),
      lotTracking: input.lotTracking,
    }
    if (input.sku !== undefined) data.sku = input.sku?.trim() ? input.sku.trim() : null
    if (input.netContentValue !== undefined) data.netContentValue = input.netContentValue == null ? null : input.netContentValue
    if (input.netContentUnit !== undefined) data.netContentUnit = input.netContentUnit?.trim() ? input.netContentUnit.trim() : null
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

export interface PackingInput {
  /** Inner packs per outer / units per bundle (single = packs-per-bundle, pack = units-per-outer). */
  innerPacksPerOuter?: number
  outerPacksPerCase?: number
  /** Pick-N max picks. null clears. */
  customerPicksCount?: number | null
  /** Subscription cadence ("weekly" | "biweekly" | "monthly" | "quarterly"). null clears. */
  subscriptionInterval?: string | null
  /** Free-form per-type extras (unitsPerPack, packType, outerPack, components, rotationSize,
   *  minCommitment, pickMin, …). MERGED into the variant's existing packingConfig so add-on
   *  cards (subscription / pick-N) and the base pack card don't clobber each other. */
  packingConfig?: Record<string, unknown>
}

/** Persist the draft's type-specific packing config onto its default variant (#35).
 *  Only writes the provided keys (the type cards each own a slice); packingConfig is
 *  merged, not replaced. Creates the default variant if none exists. Cast-guarded. */
export async function savePacking(productTemplateId: string, input: PackingInput): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const existing = await (prisma as unknown as {
      productTemplateVariant: { findFirst: (a: unknown) => Promise<{ id: string; packingConfig: unknown } | null> }
    }).productTemplateVariant.findFirst({ where: { productTemplateId }, select: { id: true, packingConfig: true } })

    const data: Record<string, unknown> = {}
    if (input.innerPacksPerOuter != null) data.innerPacksPerOuter = Math.max(1, Math.floor(input.innerPacksPerOuter))
    if (input.outerPacksPerCase != null) data.outerPacksPerCase = Math.max(1, Math.floor(input.outerPacksPerCase))
    if (input.customerPicksCount !== undefined) data.customerPicksCount = input.customerPicksCount == null ? null : Math.max(1, Math.floor(input.customerPicksCount))
    if (input.subscriptionInterval !== undefined) data.subscriptionInterval = input.subscriptionInterval
    if (input.packingConfig) {
      const prev = (existing?.packingConfig ?? {}) as Record<string, unknown>
      data.packingConfig = { ...prev, ...input.packingConfig }
    }
    if (Object.keys(data).length === 0) return { ok: true }

    if (existing) {
      await prisma.productTemplateVariant.update({ where: { id: existing.id }, data: data as never })
    } else {
      await prisma.productTemplateVariant.create({
        data: { productTemplateId, containerFormat: 'Default', servingsPerContainer: 1, servingSizeG: 1, ...data } as never,
      })
    }
    return { ok: true }
  } catch (err) {
    console.error('[savePacking] failed:', err)
    return { ok: false, error: `Could not save packing: ${(err as Error).message}` }
  }
}

// ─── Variety-pack model (docs/VARIETY_PACK_MODEL.md §4-5) ─────────────────────
// The manufacturer authors the pack matrix: pack rules (min flavors + fill rule),
// a pricing basis, and the offered pack SIZES (each a typed-`unitsPerPack`
// ProductTemplateVariant). All Prisma writes touch columns added in step 1 that
// post-date the generated client, so every access is cast-guarded.

export type FlavorFillRuleInput = 'CREATOR_CHOOSES' | 'EVEN_AUTO' | 'MANUFACTURER_FIXED'
export type PricingBasisInput = 'PER_FLAVOR' | 'PER_PACK'

export interface FlavorRulesInput {
  /** Distinct-flavor FLOOR a creator must pick (>= 1). null clears. */
  minFlavorsPerPack?: number | null
  /** Distinct-flavor CAP (mirrors the existing maxFlavorsPerPack write). undefined = leave. */
  maxFlavorsPerPack?: number | null
  /** How a pack's units fill when units > distinct flavors. null clears. */
  flavorFillRule?: FlavorFillRuleInput | null
  /** Per-flavor-summed vs flat per-pack pricing. null clears. */
  pricingBasis?: PricingBasisInput | null
}

/** Persist the pack RULES onto the ProductTemplate (min flavors / fill rule /
 *  pricing basis, plus the existing max-flavors cap). Cast-guarded — these
 *  columns post-date the generated client. Best-effort audit. */
export async function saveFlavorRules(productTemplateId: string, input: FlavorRulesInput): Promise<Result> {
  try {
    const { user, partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const data: Record<string, unknown> = {}
    if (input.minFlavorsPerPack !== undefined) {
      data.minFlavorsPerPack = input.minFlavorsPerPack == null ? null : Math.max(1, Math.floor(input.minFlavorsPerPack))
    }
    if (input.maxFlavorsPerPack !== undefined) {
      data.maxFlavorsPerPack = input.maxFlavorsPerPack == null ? null : Math.max(1, Math.floor(input.maxFlavorsPerPack))
    }
    if (input.flavorFillRule !== undefined) data.flavorFillRule = input.flavorFillRule
    if (input.pricingBasis !== undefined) data.pricingBasis = input.pricingBasis
    if (Object.keys(data).length === 0) return { ok: true }

    await (prisma as unknown as { productTemplate: { update: (a: unknown) => Promise<unknown> } })
      .productTemplate.update({ where: { id: productTemplateId }, data })

    try {
      await logAuditAs(user, {
        entityType: 'ProductTemplate',
        entityId: productTemplateId,
        action: 'PRODUCT_TEMPLATE_PACK_RULES_UPDATE',
        payload: { ...data },
      })
    } catch (auditErr) {
      console.error('[saveFlavorRules] audit log failed (non-fatal):', auditErr)
    }
    return { ok: true }
  } catch (err) {
    console.error('[saveFlavorRules] failed:', err)
    return { ok: false, error: `Could not save pack rules: ${(err as Error).message}` }
  }
}

export interface PackSizeInput {
  /** Existing size-variant id to update; omit / '' to create a new size row. */
  id?: string | null
  /** Display label, e.g. "24-pack". Blank → derived "{units}-pack". */
  label?: string | null
  /** Units one pack of this size holds (required, >= 1). */
  unitsPerPack: number
  /** Minimum order in PACKS (reuses ProductTemplateVariant.moqMin). null = default. */
  moqPacks?: number | null
  /** Flat per-pack price (cents) — only meaningful when pricingBasis = PER_PACK. null clears. */
  pricePerPackCents?: number | null
}

/** Upsert the offered pack SIZES for a template (spec §4.2). Each row is a real
 *  ProductTemplateVariant carrying a typed `unitsPerPack` — these typed-unitsPerPack
 *  variants ARE the offered sizes. Rows the client no longer sends are deleted;
 *  any NON-size variant (the legacy default with unitsPerPack = null, which holds
 *  the production spec) is left intact. Cast-guarded; best-effort audit. */
export async function savePackSizes(productTemplateId: string, rows: PackSizeInput[]): Promise<Result> {
  try {
    const { user, partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const pv = prisma as unknown as {
      productTemplateVariant: {
        findMany: (a: unknown) => Promise<Array<{ id: string; unitsPerPack: number | null }>>
        update: (a: unknown) => Promise<unknown>
        create: (a: unknown) => Promise<{ id: string }>
        deleteMany: (a: unknown) => Promise<unknown>
      }
    }

    // Existing SIZE variants = those carrying a typed unitsPerPack. Legacy default
    // (unitsPerPack === null) stays out of this set entirely.
    const existing = await pv.productTemplateVariant.findMany({
      where: { productTemplateId },
      select: { id: true, unitsPerPack: true },
    })
    const sizeVariantIds = new Set(existing.filter((v) => v.unitsPerPack != null).map((v) => v.id))

    const clean = rows
      .map((r) => ({
        id: r.id?.trim() || null,
        unitsPerPack: Math.max(1, Math.floor(r.unitsPerPack || 1)),
        label: r.label?.trim() || null,
        moqPacks: r.moqPacks == null ? null : Math.max(1, Math.floor(r.moqPacks)),
        pricePerPackCents: r.pricePerPackCents == null ? null : Math.max(0, Math.floor(r.pricePerPackCents)),
      }))
      .filter((r) => r.unitsPerPack >= 1)

    const keptIds = new Set<string>()
    for (const r of clean) {
      const containerFormat = r.label ?? `${r.unitsPerPack}-pack`
      const data: Record<string, unknown> = {
        unitsPerPack: r.unitsPerPack,
        containerFormat,
        // Mirror the offered-size units into the inner-pack count so downstream
        // packing topology (manifest, case math) stays coherent.
        innerPacksPerOuter: r.unitsPerPack,
        pricePerPackCents: r.pricePerPackCents,
      }
      if (r.moqPacks != null) data.moqMin = r.moqPacks

      if (r.id && sizeVariantIds.has(r.id)) {
        await pv.productTemplateVariant.update({ where: { id: r.id }, data })
        keptIds.add(r.id)
      } else {
        const created = await pv.productTemplateVariant.create({
          data: { productTemplateId, servingsPerContainer: 1, servingSizeG: 1, ...data },
        })
        keptIds.add(created.id)
      }
    }

    // Delete size variants the client dropped (never touch the legacy default).
    const toDelete = [...sizeVariantIds].filter((id) => !keptIds.has(id))
    if (toDelete.length) {
      await pv.productTemplateVariant.deleteMany({ where: { id: { in: toDelete }, productTemplateId } })
    }

    try {
      await logAuditAs(user, {
        entityType: 'ProductTemplate',
        entityId: productTemplateId,
        action: 'PRODUCT_TEMPLATE_PACK_SIZES_UPDATE',
        payload: { sizes: clean.length, deleted: toDelete.length },
      })
    } catch (auditErr) {
      console.error('[savePackSizes] audit log failed (non-fatal):', auditErr)
    }
    return { ok: true }
  } catch (err) {
    console.error('[savePackSizes] failed:', err)
    return { ok: false, error: `Could not save pack sizes: ${(err as Error).message}` }
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

export interface SampleOptionInput {
  kind: 'UNBRANDED' | 'BRANDED'
  enabled: boolean
  perFlavorCents: number | null
  samplerSetCents: number | null
  sampleMoq: number
  maxUnitsPerFlavor: number | null
  leadTimeDays: number
  creditTowardFirstOrder: boolean
  creditCapCents: number | null
  maxPerCreatorPerPeriod: number | null
}

/** Replace the draft's sample policy (one row per kind). Partner-set, per product
 *  (Pavel 2026-06-10). Cast-guarded — ProductSampleOption lands on the client after
 *  the sample-policy migration. */
export async function saveSampleOptions(productTemplateId: string, options: SampleOptionInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const nn = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.max(0, Math.floor(v)))
    const clean = options
      .filter((o) => o.kind === 'UNBRANDED' || o.kind === 'BRANDED')
      .map((o, i) => ({
        productTemplateId,
        kind: o.kind,
        enabled: !!o.enabled,
        perFlavorCents: nn(o.perFlavorCents),
        samplerSetCents: nn(o.samplerSetCents),
        sampleMoq: Math.max(1, Math.floor(o.sampleMoq || 1)),
        maxUnitsPerFlavor: o.maxUnitsPerFlavor == null ? null : Math.max(1, Math.floor(o.maxUnitsPerFlavor)),
        leadTimeDays: Math.max(0, Math.floor(o.leadTimeDays || 0)),
        creditTowardFirstOrder: !!o.creditTowardFirstOrder,
        creditCapCents: nn(o.creditCapCents),
        maxPerCreatorPerPeriod: o.maxPerCreatorPerPeriod == null ? null : Math.max(1, Math.floor(o.maxPerCreatorPerPeriod)),
        sortOrder: i,
      }))

    const p = prisma as unknown as { productSampleOption: { deleteMany: (a: unknown) => Promise<unknown>; createMany: (a: unknown) => Promise<unknown> } }
    await p.productSampleOption.deleteMany({ where: { productTemplateId } })
    if (clean.length) await p.productSampleOption.createMany({ data: clean })
    return { ok: true }
  } catch (err) {
    console.error('[saveSampleOptions] failed:', err)
    return { ok: false, error: `Could not save sample policy: ${(err as Error).message}` }
  }
}

/** A flavor-specific overlay ingredient line (FlavorPreset.extras), persisted so
 *  each flavor's Nutrition Facts recompute correctly on resume. */
export interface FlavorExtraLine { ingredientId: string; name: string; qty: number; unit: string }
export interface FlavorInput {
  name: string; statementOfIdentity?: string | null; sortOrder: number; extras?: FlavorExtraLine[]
  /** Absolute per-unit price (cents) — only meaningful when pricingBasis = PER_FLAVOR
   *  (docs/VARIETY_PACK_MODEL.md §5.1). undefined leaves it untouched; null clears. */
  unitPriceCents?: number | null
}

/** Replace the draft's flavor presets (the variety pool). Only named flavors
 *  persist; each becomes a FlavorPreset whose `extras` hold the flavor-only
 *  overlay lines (ingredient + amount). Idempotent: full replace by template. */
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
      .map((f, i) => ({
        name: f.name.trim(),
        soi: f.statementOfIdentity?.trim() || null,
        sortOrder: f.sortOrder ?? i,
        // Per-flavor price (PER_FLAVOR basis). undefined → omit (null in DB);
        // explicit null clears; otherwise floor to non-negative cents.
        unitPriceCents: f.unitPriceCents == null ? null : Math.max(0, Math.floor(f.unitPriceCents)),
        extras: (f.extras ?? [])
          .filter((l) => l.ingredientId && l.qty > 0)
          .map((l) => ({ ingredientId: l.ingredientId, name: l.name, qty: l.qty, unit: l.unit })),
      }))
      .filter((f) => f.name.length > 0)

    // unitPriceCents post-dates the generated client → cast-guard the create.
    const fp = prisma as unknown as {
      flavorPreset: {
        deleteMany: (a: unknown) => unknown
        create: (a: unknown) => unknown
      }
    }
    await prisma.$transaction([
      fp.flavorPreset.deleteMany({ where: { productTemplateId } }),
      ...clean.map((f) =>
        fp.flavorPreset.create({
          data: {
            productTemplateId,
            name: f.name,
            statementOfIdentity: f.soi,
            sortOrder: f.sortOrder,
            unitPriceCents: f.unitPriceCents, // per-flavor price (PER_FLAVOR basis)
            slotResolution: [], // legacy slot overlay — unused by the live model
            extras: f.extras, // flavor-only overlay lines (ingredient + amount)
          },
        }),
      ),
    ] as never)
    return { ok: true }
  } catch (err) {
    console.error('[saveFlavors] failed:', err)
    return { ok: false, error: `Could not save flavors: ${(err as Error).message}` }
  }
}

/** Attached packaging-system ids for a draft (consolidation — Packaging step).
 *  Attach/detach reuse the editor's addPackagingLink / removePackagingLink. */
export async function loadPackaging(productTemplateId: string): Promise<string[]> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return []
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true, packagingSystems: { select: { packagingSystemId: true } } },
    })
    if (!tpl) return []
    if (tpl.manufacturerServiceId && !partner.services.map((s) => s.id).includes(tpl.manufacturerServiceId)) return []
    return tpl.packagingSystems.map((p) => p.packagingSystemId)
  } catch (err) {
    console.error('[loadPackaging] failed:', err)
    return []
  }
}

/**
 * True once the draft has any authored recipe rows (ingredient slots). Drives the
 * lock-after-recipe guard on the Step-2 product-type chooser: changing flavorMode
 * / pack structure after a recipe exists would invalidate it. Callers only ever
 * flip the lock ON (monotonic). Cast-guarded to stay green regardless of the
 * generated client state on a given machine.
 */
export async function hasRecipeRows(productTemplateId: string): Promise<boolean> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return false
    const tpl = await (prisma as unknown as {
      productTemplate: {
        findUnique: (a: unknown) => Promise<{ manufacturerServiceId: string | null; ingredientSlots: Array<{ id: string }> } | null>
      }
    }).productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true, ingredientSlots: { select: { id: true }, take: 1 } },
    })
    if (!tpl) return false
    if (tpl.manufacturerServiceId && !partner.services.map((s) => s.id).includes(tpl.manufacturerServiceId)) return false
    return tpl.ingredientSlots.length > 0
  } catch (err) {
    console.error('[hasRecipeRows] failed:', err)
    return false
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
  subcategoryId?: string // domain-validated against the draft's labelingType
  familyCode?: string | null // base SKU
  description?: string | null // short
  longDescription?: string | null
  countryOfOrigin?: string | null // ISO-3166-1 alpha-2 finished-good country of origin
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
  manufacturerRefs?: Array<{ label: string; value: string }> | null
}

/**
 * Persist the Nutrition Facts audience (21 CFR 101.9(j)(5)) for a FOOD draft.
 * Drives the panel variant (DV table + which %DV columns/rows show). Partner-gated
 * to the owning service + audited. Cast-guarded (column ships with a migration).
 */
export async function setIntendedAgeGroup(
  productTemplateId: string,
  value: 'GENERAL' | 'CHILD_1_3' | 'INFANT_0_12',
): Promise<Result> {
  if (!['GENERAL', 'CHILD_1_3', 'INFANT_0_12'].includes(value)) {
    return { ok: false, error: 'Invalid age group.' }
  }
  try {
    const { user, partner, error } = await requirePartner()
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

    await (prisma as unknown as { productTemplate: { update: (a: unknown) => Promise<unknown> } }).productTemplate.update({
      where: { id: productTemplateId },
      data: { intendedAgeGroup: value },
    })
    try {
      await logAuditAs(user, {
        entityType: 'ProductTemplate',
        entityId: productTemplateId,
        action: 'INTENDED_AGE_GROUP_SET',
        toValue: value,
      })
    } catch (auditErr) {
      console.error('[setIntendedAgeGroup] audit log failed (non-fatal):', auditErr)
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save age group: ${(err as Error).message}` }
  }
}

// §7 marketplace FILTER attributes (format / process / allergen-free / markets).
// Widens Result with `staged` so the card can distinguish a live save from an
// allergen-free change sent for admin re-review on a PUBLISHED template.
type AttrResult = { ok: true; staged?: boolean } | { ok: false; error: string }

export async function setMarketplaceAttributes(
  productTemplateId: string,
  input: {
    manufacturingFormat: string | null
    manufacturingProcesses: string[]
    allergenFreeClaims: string[]
    marketCodes: string[]
  },
): Promise<AttrResult> {
  try {
    const { user, partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    // Status + current allergen claims + pending payload (cast-guarded; these
    // columns ship with a pending migration on the dev machine).
    const tpl = await (prisma as unknown as {
      productTemplate: { findUnique: (a: unknown) => Promise<{
        manufacturerServiceId: string | null
        status: string
        allergenFreeClaims: string[]
        pendingEditPayload: Record<string, unknown> | null
      } | null> }
    }).productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true, status: true, allergenFreeClaims: true, pendingEditPayload: true },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    // Validate against the shared option lists — drop unknowns, dedupe. These are
    // the SAME slugs the marketplace sidebar filters on, so anything off-list
    // would silently never match a filter.
    const fmt = new Set(FORMAT_OPTIONS.map((o) => o.value))
    const prc = new Set(MANUFACTURING_PROCESS_OPTIONS.map((o) => o.value))
    const alg = new Set(ALLERGEN_FREE_OPTIONS.map((o) => o.value))
    const mkt = new Set(MARKET_FILTER_OPTIONS.map((o) => o.value))

    const format = input.manufacturingFormat && fmt.has(input.manufacturingFormat) ? input.manufacturingFormat : null
    const processes = [...new Set(input.manufacturingProcesses)].filter((s) => prc.has(s))
    const allergenFree = [...new Set(input.allergenFreeClaims)].filter((s) => alg.has(s))
    const markets = [...new Set(input.marketCodes)].filter((s) => mkt.has(s))

    const pt = (prisma as unknown as { productTemplate: { update: (a: unknown) => Promise<unknown> } }).productTemplate
    const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')

    // §4 LOCKED policy: DRAFT → all live. PUBLISHED → format/process/markets are
    // low-risk metadata (live), but a CHANGED allergen-free claim is a public
    // regulatory claim → stage to pendingEditPayload + PENDING_EDIT_REVIEW; the
    // live allergenFreeClaims is untouched until admin approves.
    let staged = false
    if (tpl.status === 'DRAFT') {
      await pt.update({
        where: { id: productTemplateId },
        data: { manufacturingFormat: format, manufacturingProcesses: processes, allergenFreeClaims: allergenFree, marketCodes: markets },
      })
    } else {
      await pt.update({
        where: { id: productTemplateId },
        data: { manufacturingFormat: format, manufacturingProcesses: processes, marketCodes: markets },
      })
      if (!sameSet(tpl.allergenFreeClaims ?? [], allergenFree)) {
        await pt.update({
          where: { id: productTemplateId },
          data: {
            pendingEditPayload: { ...(tpl.pendingEditPayload ?? {}), allergenFreeClaims: allergenFree },
            status: 'PENDING_EDIT_REVIEW',
          },
        })
        staged = true
      }
    }

    try {
      await logAuditAs(user, {
        entityType: 'ProductTemplate',
        entityId: productTemplateId,
        action: 'MARKETPLACE_ATTRIBUTES_SET',
        payload: { manufacturingFormat: format, manufacturingProcesses: processes, allergenFreeClaims: allergenFree, marketCodes: markets, stagedForReview: staged },
      })
    } catch (auditErr) {
      console.error('[setMarketplaceAttributes] audit log failed (non-fatal):', auditErr)
    }

    return { ok: true, staged }
  } catch (err) {
    return { ok: false, error: `Could not save attributes: ${(err as Error).message}` }
  }
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
      select: { manufacturerServiceId: true, labelingType: true },
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
    if (patch.subcategoryId !== undefined && patch.subcategoryId) {
      // Re-file under a different subcategory — but only within the same domain.
      const sc = await (prisma as unknown as {
        subcategory: { findUnique: (a: unknown) => Promise<{ id: string; category: { labelingType: string } | null } | null> }
      }).subcategory.findUnique({
        where: { id: patch.subcategoryId },
        select: { id: true, category: { select: { labelingType: true } } },
      })
      if (!sc) return { ok: false, error: 'Subcategory not found.' }
      const catDomain = String(sc.category?.labelingType ?? 'FOOD')
      const draftDomain = String(tpl.labelingType ?? 'FOOD')
      if (catDomain !== draftDomain) {
        return { ok: false, error: `That subcategory belongs to the ${catDomain} domain — it doesn't match this product's domain (${draftDomain}).` }
      }
      data.subcategoryId = patch.subcategoryId
    }
    if (patch.familyCode !== undefined) data.familyCode = patch.familyCode?.trim() || null
    if (patch.description !== undefined) data.description = patch.description?.trim() || null
    if (patch.longDescription !== undefined) data.longDescription = patch.longDescription?.trim() || null
    if (patch.countryOfOrigin !== undefined) data.countryOfOrigin = patch.countryOfOrigin?.trim() || null
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
    if (patch.manufacturerRefs !== undefined) {
      data.manufacturerRefs = (patch.manufacturerRefs ?? [])
        .filter((r) => r && typeof r.value === 'string' && r.value.trim() !== '')
        .slice(0, 8)
        .map((r) => ({ label: (r.label || 'Reference').trim().slice(0, 40), value: r.value.trim().slice(0, 120) }))
    }

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

    // Pull the subcategory + its category's product domain. Cast-guarded because
    // Category.labelingType is added by a pending migration.
    const subcat = await (prisma as unknown as {
      subcategory: { findUnique: (a: unknown) => Promise<{ id: string; category: { labelingType: string } | null } | null> }
    }).subcategory.findUnique({
      where: { id: input.subcategoryId },
      select: { id: true, category: { select: { labelingType: true } } },
    })
    if (!subcat) return { ok: false, error: 'Subcategory not found.' }

    // Enforce: the product domain must match the category's domain. A Supplement
    // can't be filed under a Food category, a Cosmetic can't be filed under Pet, etc.
    const catDomain = String(subcat.category?.labelingType ?? 'FOOD')
    if (input.labelingType && input.labelingType !== catDomain) {
      return { ok: false, error: `That category belongs to the ${catDomain} domain — it doesn't match the selected product domain (${input.labelingType}).` }
    }
    const draftDomain = (input.labelingType ?? catDomain) as 'FOOD' | 'DIETARY_SUPPLEMENT' | 'PET_PRODUCT' | 'OTC' | 'COSMETIC'

    // Unique slug from name + partner suffix.
    const base = slugify(name) || 'product'
    let slug = `${base}-${partner.id.slice(-6)}`
    let n = 0
    while (await prisma.productTemplate.findUnique({ where: { slug }, select: { id: true } })) {
      n += 1
      slug = `${base}-${partner.id.slice(-6)}-${n}`
      if (n > 50) return { ok: false, error: 'Could not generate a unique slug — try a different name.' }
    }

    // Seed template-level operational defaults from the partner's product
    // defaults (presets slice). Only non-null defaults seed; everything else
    // falls through to the schema @default. Variant-level defaults (MOQ,
    // fulfillment, …) apply where the first variant is created. Cast-guarded —
    // PartnerProductDefaults post-dates the generated client until db:push.
    const defaults = await (prisma as unknown as {
      partnerProductDefaults: {
        findUnique: (a: unknown) => Promise<null | {
          applyToNewProducts: boolean
          countryOfOrigin: string | null
          leadTimeRepeatDays: number | null
          leadTimeFirstRunDays: number | null
          storageClass: string | null
          storageTempMinF: number | null
          storageTempMaxF: number | null
          moqMin: number | null
          moqMax: number | null
          orderIncrement: number | null
          monthlyCapacity: number | null
          fulfillmentMode: string | null
          lotTracking: boolean | null
          defaultFacilityId: string | null
        }>
      }
    }).partnerProductDefaults.findUnique({ where: { partnerId: partner.id } }).catch(() => null)

    const seed: Record<string, unknown> = {}
    if (defaults?.applyToNewProducts) {
      if (defaults.countryOfOrigin) seed.countryOfOrigin = defaults.countryOfOrigin
      if (defaults.leadTimeRepeatDays != null) seed.leadTimeRepeatDays = defaults.leadTimeRepeatDays
      if (defaults.leadTimeFirstRunDays != null) seed.leadTimeFirstRunDays = defaults.leadTimeFirstRunDays
      if (defaults.storageClass) seed.storageClass = defaults.storageClass
      if (defaults.storageTempMinF != null) seed.storageTempMinF = defaults.storageTempMinF
      if (defaults.storageTempMaxF != null) seed.storageTempMaxF = defaults.storageTempMaxF
    }

    const created = await (prisma as unknown as {
      productTemplate: { create: (a: unknown) => Promise<{ id: string; slug: string }> }
    }).productTemplate.create({
      data: {
        name,
        slug,
        subcategoryId: input.subcategoryId,
        labelingType: draftDomain,
        manufacturerServiceId: partner.services[0]?.id ?? null,
        status: 'DRAFT',
        ...seed,
      },
      select: { id: true, slug: true },
    })

    // Variant-level defaults → pre-fill step 2 by seeding the default variant so
    // the partner sees MOQ / fulfillment / lot / facility already filled. Best-
    // effort: a stale facility FK (or any hiccup) must NOT fail the draft —
    // saveProduction will create/patch the variant later. Cast-guarded.
    if (defaults?.applyToNewProducts) {
      const vSeed: Record<string, unknown> = {}
      if (defaults.moqMin != null) vSeed.moqMin = defaults.moqMin
      if (defaults.moqMax != null) vSeed.moqMax = defaults.moqMax
      if (defaults.orderIncrement != null) vSeed.orderIncrement = defaults.orderIncrement
      if (defaults.monthlyCapacity != null) vSeed.monthlyCapacity = defaults.monthlyCapacity
      if (defaults.fulfillmentMode) vSeed.fulfillmentMode = defaults.fulfillmentMode
      if (defaults.lotTracking != null) vSeed.lotTracking = defaults.lotTracking
      if (defaults.defaultFacilityId) vSeed.facilityId = defaults.defaultFacilityId
      if (Object.keys(vSeed).length) {
        try {
          await (prisma as unknown as {
            productTemplateVariant: { create: (a: unknown) => Promise<unknown> }
          }).productTemplateVariant.create({
            data: { productTemplateId: created.id, containerFormat: 'Default', servingsPerContainer: 1, servingSizeG: 1, ...vSeed },
          })
        } catch (vErr) {
          console.error('[createDraftShell] variant default seed failed (non-fatal):', vErr)
        }
      }
    }

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

/**
 * Clone an existing ProductTemplate owned by the partner into a brand-new DRAFT
 * ("Clone from existing product"). Deep-copies the template's author-set scalars
 * and every per-template relation, REGENERATING all ids and remapping internal
 * cross-references (slot ids, flavor-preset ids, option-value ids) so the clone
 * carries no dangling references.
 *
 * Correctness rule (docs note + operational-trust philosophy): recreated child
 * rows get NEW ids. Anything that references an old per-template id by value —
 * `ProductOptionAxis.boundSlotId` (→ slot), `FlavorPreset.slotResolution[].slotId`
 * (→ slot), `ProductOptionValue.flavorPresetId` (→ flavor) — is remapped old→new
 * via Maps built right after creating the parents. `ProductOptionRule` endpoints
 * are stored as composite `axisKey:valueLabel` strings (id-churn-safe, see
 * saveOptionRules), so they survive a clone verbatim because keys + labels are
 * copied; a real value-id endpoint (legacy/mixed data) is remapped when known and
 * otherwise the rule is skipped rather than copied broken.
 *
 * Cast-guarded throughout (the Configurator / sample-policy models post-date the
 * generated client on some machines) and wrapped in a single `$transaction` so a
 * partial failure never leaves an orphaned half-cloned template.
 *
 * Relations CLONED: TemplateIngredientSlot, FlavorPreset, ProductTemplateVariant,
 * ProductTemplatePackaging, ProductTemplatePricingTier, ProductTemplateFee,
 * ProductSampleOption, ProductTemplateNiche, ProductTemplateLifestyleTag,
 * ProductOptionAxis (+ values), ProductOptionRule (id-safe rows), and
 * ProductChangeApprovalRule.
 *
 * Relations intentionally NOT cloned (returned in the summary): certificates,
 * notes, review items, spec sheets, phrases, niche/phrase assignment audits,
 * optional ingredients, and any option rule whose endpoints reference unknown
 * raw value-ids that cannot be safely remapped.
 */
export async function cloneDraftFromTemplate(
  sourceTemplateId: string,
): Promise<Result<{ id: string; slug: string }>> {
  // Whole body guarded — a server action must always resolve to a Result.
  try {
    const { user, partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const ownIds = partner.services.map((s) => s.id)

    // ----- Load the FULL source template (scalars + every relation we copy) -----
    // Single cast query so newer columns/relations resolve before the generated
    // client is regenerated on this machine (same pattern loadDraft uses).
    type SrcSlot = { id: string; baseIngredientId: string; weightG: unknown; costPerKgCents: number | null; displayOrder: number; allowReplacement: boolean; label: string | null; description: string | null }
    type SrcFlavor = { id: string; name: string; statementOfIdentity: string | null; swatchHex: string | null; swatchImageFileId: string | null; dielineId: string | null; slotResolution: unknown; extras: unknown; priceDeltaCents: number; status: string; sortOrder: number; nutrientOverrides: unknown }
    type SrcVariant = Record<string, unknown> & { id: string }
    type SrcAxis = { id: string; key: string; label: string; layer: string; editableByCreator: boolean; required: boolean; affectsLabel: boolean; boundSlotId: string | null; sortOrder: number; isActive: boolean; values: SrcValue[] }
    type SrcValue = { id: string; label: string; isDefault: boolean; status: string; leadTimeDeltaDays: number; unitCostDeltaCents: number; moqOverride: number | null; priceDeltaCents: number; flavorPresetId: string | null; substrateId: string | null; packagingTypeId: string | null; overlayOp: string; recipeOverlay: unknown; sortOrder: number }
    type Src = {
      id: string; manufacturerServiceId: string | null; subcategoryId: string; name: string
      // copied scalars
      recipeEntryMode: string | null; nutrientSource: string; declaredPanel: unknown
      description: string | null; longDescription: string | null; priceFloorCents: number; unitCostCents: number
      imageAssetId: string | null; galleryAssetIds: string[]; videoAssetId: string | null; baseNutritionSnapshot: unknown
      finishedProductWeightG: number | null; customMeta: unknown
      allergenCrossContamination: string | null; allergenManualOverrides: unknown
      nutrientOverrides: unknown; ingredientGroups: unknown
      labelingType: string; labelingTypeLocked: boolean; intendedAgeGroup: string; flavorsRunSequentially: boolean
      formulationData: unknown; statementOfIdentity: string | null; familyCode: string | null; productType: string
      packingProfileId: string | null; maxFlavorsPerPack: number | null
      leadTimeRepeatDays: number | null; leadTimeFirstRunDays: number | null
      storageClass: string; storageTempMinF: number | null; storageTempMaxF: number | null
      marketingDetail: unknown
      manufacturingFormat: string | null; manufacturingProcesses: string[]; allergenFreeClaims: string[]; marketCodes: string[]
      phraseFacts: unknown
      // relations
      ingredientSlots: SrcSlot[]
      flavorPresets: SrcFlavor[]
      variants: SrcVariant[]
      packagingSystems: Array<{ packagingSystemId: string; basePriceCents: number; moqOverride: number | null; leadTimeDays: number; pricingTiers: unknown; surfaceOverrides: unknown; coPackerServiceId: string | null }>
      pricingTiers: Array<{ fulfillmentMode: string; sortOrder: number; minQty: number; maxQty: number | null; perUnitCostCents: number; perUnitFloorCents: number; leadTimeDays: number | null; notes: string | null }>
      fees: Array<{ label: string; basis: string; amountCents: number; waivedAboveQty: number | null; sortOrder: number }>
      sampleOptions: Array<{ kind: string; enabled: boolean; perFlavorCents: number | null; samplerSetCents: number | null; sampleMoq: number; maxUnitsPerFlavor: number | null; leadTimeDays: number; creditTowardFirstOrder: boolean; creditCapCents: number | null; maxPerCreatorPerPeriod: number | null; sortOrder: number }>
      niches: Array<{ nicheId: string; isPrimary: boolean }>
      lifestyleTags: Array<{ lifestyleTagId: string; source: string }>
      optionAxes: SrcAxis[]
      optionRules: Array<{ kind: string; whenValueId: string; targetValueId: string; message: string | null }>
      changeApprovalRules: Array<{ changeType: string; requiredApprover: string; sortOrder: number }>
    }

    const src = await (prisma as unknown as {
      productTemplate: { findUnique: (a: unknown) => Promise<Src | null> }
    }).productTemplate.findUnique({
      where: { id: sourceTemplateId },
      select: {
        id: true, manufacturerServiceId: true, subcategoryId: true, name: true,
        recipeEntryMode: true, nutrientSource: true, declaredPanel: true,
        description: true, longDescription: true, priceFloorCents: true, unitCostCents: true,
        imageAssetId: true, galleryAssetIds: true, videoAssetId: true, baseNutritionSnapshot: true,
        finishedProductWeightG: true, customMeta: true,
        allergenCrossContamination: true, allergenManualOverrides: true,
        nutrientOverrides: true, ingredientGroups: true,
        labelingType: true, labelingTypeLocked: true, intendedAgeGroup: true, flavorsRunSequentially: true,
        formulationData: true, statementOfIdentity: true, familyCode: true, productType: true,
        packingProfileId: true, maxFlavorsPerPack: true,
        leadTimeRepeatDays: true, leadTimeFirstRunDays: true,
        storageClass: true, storageTempMinF: true, storageTempMaxF: true,
        marketingDetail: true,
        manufacturingFormat: true, manufacturingProcesses: true, allergenFreeClaims: true, marketCodes: true,
        phraseFacts: true,
        ingredientSlots: { orderBy: { displayOrder: 'asc' }, select: { id: true, baseIngredientId: true, weightG: true, costPerKgCents: true, displayOrder: true, allowReplacement: true, label: true, description: true } },
        flavorPresets: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, statementOfIdentity: true, swatchHex: true, swatchImageFileId: true, dielineId: true, slotResolution: true, extras: true, priceDeltaCents: true, status: true, sortOrder: true, nutrientOverrides: true } },
        variants: { orderBy: { createdAt: 'asc' }, select: { id: true, flavor: true, containerFormat: true, containerSizeG: true, servingsPerContainer: true, servingSizeG: true, servingSizeDesc: true, packingType: true, flavorArrangement: true, innerPacksPerOuter: true, outerPacksPerCase: true, customerPicksCount: true, subscriptionInterval: true, assortmentFlavors: true, packingConfig: true, sku: true, gtin: true, gtinSource: true, moqMin: true, moqMax: true, leadTimeDays: true, unitCostCentsOverride: true, fulfillmentMode: true, monthlyCapacity: true, shelfLifeDays: true, orderIncrement: true, lotTracking: true, facilityId: true, dieCutTemplateId: true, isActive: true, packagingTypeId: true } },
        packagingSystems: { select: { packagingSystemId: true, basePriceCents: true, moqOverride: true, leadTimeDays: true, pricingTiers: true, surfaceOverrides: true, coPackerServiceId: true } },
        pricingTiers: { orderBy: [{ fulfillmentMode: 'asc' }, { sortOrder: 'asc' }], select: { fulfillmentMode: true, sortOrder: true, minQty: true, maxQty: true, perUnitCostCents: true, perUnitFloorCents: true, leadTimeDays: true, notes: true } },
        fees: { orderBy: { sortOrder: 'asc' }, select: { label: true, basis: true, amountCents: true, waivedAboveQty: true, sortOrder: true } },
        sampleOptions: { orderBy: { sortOrder: 'asc' }, select: { kind: true, enabled: true, perFlavorCents: true, samplerSetCents: true, sampleMoq: true, maxUnitsPerFlavor: true, leadTimeDays: true, creditTowardFirstOrder: true, creditCapCents: true, maxPerCreatorPerPeriod: true, sortOrder: true } },
        niches: { select: { nicheId: true, isPrimary: true } },
        lifestyleTags: { select: { lifestyleTagId: true, source: true } },
        optionAxes: { orderBy: { sortOrder: 'asc' }, select: { id: true, key: true, label: true, layer: true, editableByCreator: true, required: true, affectsLabel: true, boundSlotId: true, sortOrder: true, isActive: true, values: { orderBy: { sortOrder: 'asc' }, select: { id: true, label: true, isDefault: true, status: true, leadTimeDeltaDays: true, unitCostDeltaCents: true, moqOverride: true, priceDeltaCents: true, flavorPresetId: true, substrateId: true, packagingTypeId: true, overlayOp: true, recipeOverlay: true, sortOrder: true } } } },
        optionRules: { orderBy: { createdAt: 'asc' }, select: { kind: true, whenValueId: true, targetValueId: true, message: true } },
        changeApprovalRules: { orderBy: { sortOrder: 'asc' }, select: { changeType: true, requiredApprover: true, sortOrder: true } },
      },
    }).catch(() => null)

    if (!src) return { ok: false, error: 'Product not found.' }
    // Ownership — same check loadDraft uses. A null manufacturerServiceId is a
    // legacy/unowned row; only the partner's own services may clone.
    if (!src.manufacturerServiceId || !ownIds.includes(src.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    // ----- Derive the new identity -----
    const copyName = `Copy of ${src.name}`.slice(0, 120)
    const base = slugify(copyName) || 'product'
    let slug = `${base}-${partner.id.slice(-6)}`
    let n = 0
    while (await prisma.productTemplate.findUnique({ where: { slug }, select: { id: true } })) {
      n += 1
      slug = `${base}-${partner.id.slice(-6)}-${n}`
      if (n > 50) return { ok: false, error: 'Could not generate a unique slug — try a different name.' }
    }

    // Pre-generate new ids for the relations whose ids are referenced internally,
    // so the Maps are ready before we write anything. We let Prisma default the
    // ids for relations with no inbound internal reference.
    const newId = () => crypto.randomUUID()
    const slotIdMap = new Map<string, string>() // old TemplateIngredientSlot.id → new
    for (const s of src.ingredientSlots) slotIdMap.set(s.id, newId())
    const flavorIdMap = new Map<string, string>() // old FlavorPreset.id → new
    for (const f of src.flavorPresets) flavorIdMap.set(f.id, newId())
    const valueIdMap = new Map<string, string>() // old ProductOptionValue.id → new
    for (const a of src.optionAxes) for (const v of a.values) valueIdMap.set(v.id, newId())

    const skipped: string[] = []

    // Remap FlavorPreset.slotResolution JSON (`[{ slotId, ... }]`). Live builder
    // writes `[]`, but legacy data may carry slot ids — rewrite them to the new
    // slot ids. If an entry references a slot id we don't recognize, keep the
    // entry's non-id fields but drop the dangling slotId (never emit a bad ref).
    let droppedSlotRefs = 0
    const remapSlotResolution = (raw: unknown): unknown => {
      if (!Array.isArray(raw)) return raw
      return raw.map((entry) => {
        if (entry && typeof entry === 'object' && 'slotId' in entry) {
          const e = entry as Record<string, unknown>
          const old = String(e.slotId ?? '')
          const mapped = slotIdMap.get(old)
          if (!mapped) { droppedSlotRefs += 1; const { slotId: _drop, ...rest } = e; return rest }
          return { ...e, slotId: mapped }
        }
        return entry
      })
    }

    // Build the clone's relation create-payloads (all ids regenerated/remapped).
    const slotCreates = src.ingredientSlots.map((s) => ({
      id: slotIdMap.get(s.id)!,
      baseIngredientId: s.baseIngredientId,
      weightG: s.weightG,
      costPerKgCents: s.costPerKgCents,
      displayOrder: s.displayOrder,
      allowReplacement: s.allowReplacement,
      label: s.label,
      description: s.description,
    }))

    const flavorCreates = src.flavorPresets.map((f) => ({
      id: flavorIdMap.get(f.id)!,
      name: f.name,
      statementOfIdentity: f.statementOfIdentity,
      swatchHex: f.swatchHex,
      swatchImageFileId: f.swatchImageFileId,
      // dielineId is a soft FK to a partner-shared PackagingDieline (a physical
      // artifact, NOT a per-template id) — keep it pointing at the same dieline.
      dielineId: f.dielineId,
      slotResolution: remapSlotResolution(f.slotResolution),
      extras: f.extras ?? undefined,
      priceDeltaCents: f.priceDeltaCents,
      status: f.status,
      sortOrder: f.sortOrder,
      nutrientOverrides: f.nutrientOverrides ?? undefined,
    }))

    // Option axes (+ values). boundSlotId → remapped to the new slot id; an
    // unmappable boundSlotId is nulled (axis kept, binding dropped). Each value's
    // flavorPresetId → remapped; substrateId/packagingTypeId reference shared
    // catalog rows (NOT per-template) → kept verbatim. recipeOverlay holds GLOBAL
    // ingredient ids (toIngredientId/addIngredientId) → no remap needed.
    let droppedAxisBindings = 0
    const axisCreates = src.optionAxes.map((a) => {
      let boundSlotId: string | null = null
      if (a.boundSlotId) {
        const mapped = slotIdMap.get(a.boundSlotId)
        if (mapped) boundSlotId = mapped
        else droppedAxisBindings += 1
      }
      return {
        id: newId(),
        key: a.key,
        label: a.label,
        layer: a.layer,
        editableByCreator: a.editableByCreator,
        required: a.required,
        affectsLabel: a.affectsLabel,
        boundSlotId,
        sortOrder: a.sortOrder,
        isActive: a.isActive,
        values: {
          create: a.values.map((v) => ({
            id: valueIdMap.get(v.id)!,
            label: v.label,
            isDefault: v.isDefault,
            status: v.status,
            leadTimeDeltaDays: v.leadTimeDeltaDays,
            unitCostDeltaCents: v.unitCostDeltaCents,
            moqOverride: v.moqOverride,
            priceDeltaCents: v.priceDeltaCents,
            flavorPresetId: v.flavorPresetId ? (flavorIdMap.get(v.flavorPresetId) ?? null) : null,
            substrateId: v.substrateId,
            packagingTypeId: v.packagingTypeId,
            overlayOp: v.overlayOp,
            recipeOverlay: v.recipeOverlay ?? undefined,
            sortOrder: v.sortOrder,
          })),
        },
      }
    })

    // Option rules. Endpoints are stored as composite `axisKey:valueLabel` strings
    // (saveOptionRules) which survive a clone verbatim (keys + labels are copied).
    // A legacy endpoint that is instead a raw ProductOptionValue.id is remapped
    // when known. If an endpoint LOOKS like a raw value id (no ':' separator) and
    // is NOT in valueIdMap, we cannot safely remap → skip that rule (a correct
    // partial clone beats a dangling reference).
    const knownOldValueIds = new Set(valueIdMap.keys())
    const remapEndpoint = (ep: string): string | null => {
      if (knownOldValueIds.has(ep)) return valueIdMap.get(ep)!
      if (ep.includes(':')) return ep // composite axisKey:valueLabel — copied verbatim
      // No ':' and not a known value id: a bare token (likely a value label or
      // legacy id we can't resolve). Pass composite-safe tokens through; only a
      // genuine-looking orphan id is unmappable.
      return ep
    }
    let skippedRules = 0
    const ruleCreates: Array<{ kind: string; whenValueId: string; targetValueId: string; message: string | null }> = []
    for (const r of src.optionRules) {
      const w = remapEndpoint(r.whenValueId)
      const t = remapEndpoint(r.targetValueId)
      if (w == null || t == null) { skippedRules += 1; continue }
      ruleCreates.push({ kind: r.kind, whenValueId: w, targetValueId: t, message: r.message })
    }
    if (skippedRules > 0) skipped.push(`${skippedRules} option rule(s): endpoint referenced an unmappable option-value id`)
    if (droppedSlotRefs > 0) skipped.push(`${droppedSlotRefs} flavor slotResolution ref(s): pointed at an unknown slot id`)
    if (droppedAxisBindings > 0) skipped.push(`${droppedAxisBindings} option-axis boundSlot binding(s): pointed at an unknown slot id`)

    // ProductTemplateVariant rows — strip the source id; null the GTIN (it is a
    // GLOBAL @unique — copying it verbatim would collide and fail the whole
    // transaction). `sku` is only unique per-template, so it copies safely.
    const variantCreates = src.variants.map((v) => {
      const { id: _drop, gtin: _gtin, ...rest } = v
      return { ...rest, gtin: null, gtinSource: 'USER_PROVIDED' }
    })

    // ----- Create everything in one transaction -----
    // Parent template carries the inline-creatable child relations; the cast-only
    // models (axes, rules, sample options, fees, change rules, niches, tags) are
    // created as follow-up statements inside the SAME $transaction.
    const px = prisma as unknown as {
      $transaction: (ops: unknown[]) => Promise<unknown[]>
      productTemplate: { create: (a: unknown) => Promise<{ id: string; slug: string }> }
      productOptionAxis: { create: (a: unknown) => Promise<unknown> }
      productOptionRule: { createMany: (a: unknown) => Promise<unknown> }
      productSampleOption: { createMany: (a: unknown) => Promise<unknown> }
      productChangeApprovalRule: { createMany: (a: unknown) => Promise<unknown> }
      productTemplateNiche: { createMany: (a: unknown) => Promise<unknown> }
      productTemplateLifestyleTag: { createMany: (a: unknown) => Promise<unknown> }
    }

    const newTplId = newId()
    const ops: unknown[] = []

    // 1) The template + its inline-creatable relations (slots, flavors, variants,
    //    packaging, pricing tiers, fees, axes+values). Force DRAFT; reset all
    //    review/lifecycle state to defaults (omit pendingEditPayload, certs, etc.).
    ops.push(
      px.productTemplate.create({
        data: {
          id: newTplId,
          name: copyName,
          slug,
          status: 'DRAFT',
          subcategoryId: src.subcategoryId,
          manufacturerServiceId: src.manufacturerServiceId,
          // Author-set scalars (everything that isn't identity / lifecycle).
          recipeEntryMode: src.recipeEntryMode ?? undefined,
          nutrientSource: src.nutrientSource,
          declaredPanel: src.declaredPanel ?? undefined,
          description: src.description,
          longDescription: src.longDescription,
          priceFloorCents: src.priceFloorCents,
          unitCostCents: src.unitCostCents,
          imageAssetId: src.imageAssetId,
          galleryAssetIds: src.galleryAssetIds ?? [],
          videoAssetId: src.videoAssetId,
          baseNutritionSnapshot: src.baseNutritionSnapshot ?? undefined,
          finishedProductWeightG: src.finishedProductWeightG,
          customMeta: src.customMeta ?? undefined,
          allergenCrossContamination: src.allergenCrossContamination,
          allergenManualOverrides: src.allergenManualOverrides ?? undefined,
          nutrientOverrides: src.nutrientOverrides ?? undefined,
          ingredientGroups: src.ingredientGroups ?? undefined,
          labelingType: src.labelingType,
          labelingTypeLocked: src.labelingTypeLocked,
          intendedAgeGroup: src.intendedAgeGroup,
          flavorsRunSequentially: src.flavorsRunSequentially,
          formulationData: src.formulationData ?? undefined,
          statementOfIdentity: src.statementOfIdentity,
          familyCode: src.familyCode,
          productType: src.productType,
          packingProfileId: src.packingProfileId,
          maxFlavorsPerPack: src.maxFlavorsPerPack,
          leadTimeRepeatDays: src.leadTimeRepeatDays,
          leadTimeFirstRunDays: src.leadTimeFirstRunDays,
          storageClass: src.storageClass,
          storageTempMinF: src.storageTempMinF,
          storageTempMaxF: src.storageTempMaxF,
          marketingDetail: src.marketingDetail ?? undefined,
          manufacturingFormat: src.manufacturingFormat ?? undefined,
          manufacturingProcesses: src.manufacturingProcesses ?? [],
          allergenFreeClaims: src.allergenFreeClaims ?? [],
          marketCodes: src.marketCodes ?? ['US'],
          phraseFacts: src.phraseFacts ?? undefined,
          // Inline relations with internally-consistent (remapped) ids.
          ingredientSlots: slotCreates.length ? { create: slotCreates } : undefined,
          flavorPresets: flavorCreates.length ? { create: flavorCreates } : undefined,
          variants: variantCreates.length ? { create: variantCreates } : undefined,
          packagingSystems: src.packagingSystems.length ? { create: src.packagingSystems } : undefined,
          pricingTiers: src.pricingTiers.length ? { create: src.pricingTiers } : undefined,
          fees: src.fees.length ? { create: src.fees } : undefined,
        } as never,
        select: { id: true, slug: true },
      }),
    )

    // 2) Option axes (+ nested values) — created per-axis so the cast path matches
    //    saveOptionAxes (createMany can't nest value creates).
    for (const a of axisCreates) {
      ops.push(px.productOptionAxis.create({ data: { productTemplateId: newTplId, ...a } }))
    }
    // 3) Option rules (id-safe rows only).
    if (ruleCreates.length) {
      ops.push(px.productOptionRule.createMany({ data: ruleCreates.map((r) => ({ productTemplateId: newTplId, ...r })) }))
    }
    // 4) Sample options.
    if (src.sampleOptions.length) {
      ops.push(px.productSampleOption.createMany({ data: src.sampleOptions.map((s) => ({ productTemplateId: newTplId, ...s })) }))
    }
    // 5) Change-approval-rule overrides.
    if (src.changeApprovalRules.length) {
      ops.push(px.productChangeApprovalRule.createMany({ data: src.changeApprovalRules.map((r) => ({ productTemplateId: newTplId, ...r })) }))
    }
    // 6) Niche + lifestyle-tag junctions (reference shared taxonomy rows → copied verbatim).
    if (src.niches.length) {
      ops.push(px.productTemplateNiche.createMany({ data: src.niches.map((nrow) => ({ productTemplateId: newTplId, nicheId: nrow.nicheId, isPrimary: nrow.isPrimary })) }))
    }
    if (src.lifestyleTags.length) {
      ops.push(px.productTemplateLifestyleTag.createMany({ data: src.lifestyleTags.map((l) => ({ productTemplateId: newTplId, lifestyleTagId: l.lifestyleTagId, source: l.source })) }))
    }

    const results = await px.$transaction(ops)
    const created = results[0] as { id: string; slug: string }

    // Audit — best-effort (non-fatal), like createDraftShell.
    try {
      await logAuditAs(user, {
        entityType: 'ProductTemplate',
        entityId: created.id,
        action: 'PRODUCT_TEMPLATE_CLONE',
        toValue: 'DRAFT',
        payload: { partnerId: partner.id, sourceTemplateId, name: copyName, skipped },
      })
    } catch (auditErr) {
      console.error('[cloneDraftFromTemplate] audit log failed (non-fatal):', auditErr)
    }

    revalidatePath('/products')
    return { ok: true, data: created }
  } catch (err) {
    console.error('[cloneDraftFromTemplate] failed:', err)
    return { ok: false, error: `Could not clone product: ${(err as Error).message}` }
  }
}
